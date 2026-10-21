import { migrate } from "./db.js";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import {
  randomUUID,
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import { z } from "zod";
import { DateTime } from "luxon";
import { fetchCalendar, parseCalendar } from "./calendar-source.js";
import { digest, token } from "./tokens.js";
import { ZONE, type State } from "../shared/schema.js";
interface Options {
  origin: string;
  encryptionKey?: string;
  googleId?: string;
  googleSecret?: string;
}
export async function registerCalendars(
  app: FastifyInstance,
  pool: Pool,
  options: Options,
) {
  await migrate(
    pool,
    `CREATE TABLE IF NOT EXISTS calendars(id uuid PRIMARY KEY,name text NOT NULL,color text NOT NULL,enabled boolean NOT NULL DEFAULT true,secret text NOT NULL,cache text,last_sync timestamptz,error text);
 CREATE TABLE IF NOT EXISTS calendar_export(id integer PRIMARY KEY CHECK(id=1),token_hash text NOT NULL);
 CREATE TABLE IF NOT EXISTS oauth_pending(state_hash text PRIMARY KEY,verifier text NOT NULL,expires timestamptz NOT NULL);
 CREATE TABLE IF NOT EXISTS google_connection(id integer PRIMARY KEY CHECK(id=1),secret text NOT NULL);`,
  );
  const key =
    options.encryptionKey && /^[a-fA-F0-9]{64}$/.test(options.encryptionKey)
      ? Buffer.from(options.encryptionKey, "hex")
      : null;
  function encrypt(value: string) {
    if (!key)
      throw new Error(
        "Configure CALENDAR_ENCRYPTION_KEY before adding calendars",
      );
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64");
  }
  function decrypt(value: string) {
    if (!key) throw new Error("Calendar encryption key is unavailable");
    const b = Buffer.from(value, "base64");
    const c = createDecipheriv("aes-256-gcm", key, b.subarray(0, 12));
    c.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([c.update(b.subarray(28)), c.final()]).toString(
      "utf8",
    );
  }
  const callback = `${options.origin}/api/google/callback`;
  async function googleToken() {
    const { rows } = await pool.query(
      "SELECT secret FROM google_connection WHERE id=1",
    );
    if (!rows.length) throw new Error("Connect Google first");
    const refresh = decrypt(rows[0].secret);
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      body: new URLSearchParams({
        client_id: options.googleId!,
        client_secret: options.googleSecret!,
        refresh_token: refresh,
        grant_type: "refresh_token",
      }),
      signal: AbortSignal.timeout(10000),
    });
    const data = (await response.json()) as any;
    if (!response.ok || !data.access_token)
      throw new Error("Reconnect Google Calendar");
    return data.access_token as string;
  }
  app.get("/api/calendars", async () => {
    const result = await pool.query(
      "SELECT id,name,color,enabled,last_sync,error FROM calendars ORDER BY name",
    );
    return {
      calendars: result.rows,
      configured: !!key,
      googleConfigured: !!key && !!options.googleId && !!options.googleSecret,
      googleConnected: !!(await pool.query("SELECT 1 FROM google_connection"))
        .rowCount,
    };
  });
  app.post("/api/calendars", async (req, reply) => {
    if (!key)
      return reply.code(503).send({
        error: "Set CALENDAR_ENCRYPTION_KEY in the server environment first",
      });
    const body = z
      .object({
        name: z.string().trim().min(1).max(100),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        url: z.string().url().max(4096).optional(),
        googleCalendarId: z.string().max(1024).optional(),
      })
      .parse(req.body);
    if (!body.url && !body.googleCalendarId)
      return reply.code(400).send({ error: "Choose a calendar source" });
    if (body.url) {
      const url = new URL(body.url);
      if (url.protocol !== "https:")
        return reply.code(400).send({ error: "Use an HTTPS subscription URL" });
    }
    const id = randomUUID();
    await pool.query(
      "INSERT INTO calendars(id,name,color,secret) VALUES($1,$2,$3,$4)",
      [
        id,
        body.name,
        body.color,
        encrypt(
          JSON.stringify(
            body.googleCalendarId
              ? { googleCalendarId: body.googleCalendarId }
              : { url: body.url },
          ),
        ),
      ],
    );
    return { id };
  });
  app.patch("/api/calendars/:id", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body);
    await pool.query("UPDATE calendars SET enabled=$1 WHERE id=$2", [
      enabled,
      id,
    ]);
    return { ok: true };
  });
  app.delete("/api/calendars/:id", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await pool.query("DELETE FROM calendars WHERE id=$1", [id]);
    return { ok: true };
  });
  app.post(
    "/api/calendars/:id/sync",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const { week } = z.object({ week: z.string().date() }).parse(req.body);
      const { rows } = await pool.query(
        "SELECT secret FROM calendars WHERE id=$1",
        [id],
      );
      if (!rows.length)
        return reply.code(404).send({ error: "Calendar not found" });
      try {
        const source = JSON.parse(decrypt(rows[0].secret));
        let cache: string;
        if (source.url) {
          cache = await fetchCalendar(source.url);
          parseCalendar(
            cache,
            week,
            DateTime.fromISO(week).plus({ weeks: 1 }).toISODate()!,
          );
        } else {
          const access = await googleToken();
          const events: any[] = [];
          let page = "";
          let pages = 0;
          do {
            const query = new URLSearchParams({
              timeMin: DateTime.fromISO(week, { zone: ZONE })
                .minus({ weeks: 4 })
                .toISO()!,
              timeMax: DateTime.fromISO(week, { zone: ZONE })
                .plus({ weeks: 12 })
                .toISO()!,
              singleEvents: "true",
              maxResults: "2500",
              ...(page ? { pageToken: page } : {}),
            });
            const response = await fetch(
              `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(source.googleCalendarId)}/events?${query}`,
              {
                headers: { Authorization: `Bearer ${access}` },
                signal: AbortSignal.timeout(10000),
              },
            );
            const data = (await response.json()) as any;
            if (!response.ok) throw new Error("Google sync failed");
            events.push(
              ...(data.items ?? [])
                .filter((e: any) => e.status !== "cancelled")
                .map((e: any) => ({
                  id: e.id,
                  title: e.summary ?? "Appointment",
                  start: e.start.dateTime ?? e.start.date,
                  end: e.end.dateTime ?? e.end.date,
                  allDay: !!e.start.date,
                })),
            );
            page = data.nextPageToken ?? "";
            if (++pages >= 20 && page)
              throw new Error("Too many Google events");
          } while (page);
          cache = JSON.stringify({
            google: true,
            events,
            from: DateTime.fromISO(week).minus({ weeks: 4 }).toISODate(),
            until: DateTime.fromISO(week).plus({ weeks: 12 }).toISODate(),
          });
        }
        await pool.query(
          "UPDATE calendars SET cache=$1,last_sync=now(),error=NULL WHERE id=$2",
          [cache, id],
        );
        return { ok: true };
      } catch {
        await pool.query("UPDATE calendars SET error=$1 WHERE id=$2", [
          "Refresh failed. Previous appointments retained. Check source access and reconnect if needed.",
          id,
        ]);
        return reply.code(502).send({
          error:
            "Calendar refresh failed; previous events were retained. Check the URL, access, or Google connection.",
        });
      }
    },
  );
  app.get("/api/appointments", async (req) => {
    const { week } = z.object({ week: z.string().date() }).parse(req.query);
    const end = DateTime.fromISO(week).plus({ weeks: 1 }).toISODate()!;
    const { rows } = await pool.query(
      "SELECT * FROM calendars WHERE enabled=true AND cache IS NOT NULL",
    );
    const events: any[] = [];
    for (const row of rows) {
      try {
        let parsed;
        if (row.cache.startsWith("{")) {
          const cache = JSON.parse(row.cache);
          if (week < cache.from || end > cache.until) {
            await pool.query("UPDATE calendars SET error=$1 WHERE id=$2", [
              "Selected week is outside the cached range. Refresh this calendar.",
              row.id,
            ]);
            continue;
          }
          parsed = cache.events;
        } else parsed = parseCalendar(row.cache, week, end);
        events.push(
          ...parsed.map((e: any) => ({
            ...e,
            id: `${row.id}:${e.id}`,
            calendarId: row.id,
            color: row.color,
          })),
        );
      } catch {
        await pool.query("UPDATE calendars SET error=$1 WHERE id=$2", [
          "Calendar could not be expanded for this week. Refresh or review the source.",
          row.id,
        ]);
      }
    }
    return events;
  });
  app.post("/api/export-token", async () => {
    const raw = token();
    await pool.query(
      "INSERT INTO calendar_export VALUES(1,$1) ON CONFLICT(id) DO UPDATE SET token_hash=excluded.token_hash",
      [digest(raw)],
    );
    return { url: `${options.origin}/calendar/${raw}.ics` };
  });
  app.delete("/api/export-token", async () => {
    await pool.query("DELETE FROM calendar_export");
    return { ok: true };
  });
  app.get("/calendar/:token.ics", async (req, reply) => {
    const params = z
      .object({ token: z.string().regex(/^[a-f0-9]{64}$/) })
      .parse(req.params);
    const result = await pool.query(
      "SELECT 1 FROM calendar_export WHERE token_hash=$1",
      [digest(params.token)],
    );
    if (!result.rowCount) return reply.code(404).send("Not found");
    // Export only deliberately published weeks, never private drafts.
    const { rows } = await pool.query(
      "SELECT to_char(week,'YYYY-MM-DD') AS week,snapshot FROM publications ORDER BY week",
    );
    const escape = (s: string) =>
      s
        .replace(/\\/g, "\\\\")
        .replace(/\r?\n/g, "\\n")
        .replace(/,/g, "\\,")
        .replace(/;/g, "\\;");
    const timestamp = (s: string) =>
      DateTime.fromISO(s).toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'");
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Kyle//Support schedule//EN",
      "CALSCALE:GREGORIAN",
    ];
    for (const row of rows) {
      const state = row.snapshot.data as State;
      const a = DateTime.fromISO(row.week, { zone: ZONE }),
        b = a.plus({ weeks: 1 });
      for (const s of state.shifts.filter(
        (s) =>
          s.employeeId &&
          Date.parse(s.start) < b.toMillis() &&
          Date.parse(s.end) > a.toMillis(),
      )) {
        const st = DateTime.fromMillis(
            Math.max(Date.parse(s.start), a.toMillis()),
          ).toISO()!,
          en = DateTime.fromMillis(
            Math.min(Date.parse(s.end), b.toMillis()),
          ).toISO()!;
        lines.push(
          "BEGIN:VEVENT",
          `UID:${s.id}-${row.week}@kyle`,
          `DTSTAMP:${timestamp(new Date().toISOString())}`,
          `DTSTART:${timestamp(st)}`,
          `DTEND:${timestamp(en)}`,
          `SUMMARY:${escape(state.employees.find((e) => e.id === s.employeeId)?.name ?? "Support staff")} — Support shift`,
          "END:VEVENT",
        );
      }
    }
    lines.push("END:VCALENDAR");
    return reply
      .header("Cache-Control", "no-store")
      .type("text/calendar; charset=utf-8")
      .send(lines.join("\r\n"));
  });
  app.get("/api/google/connect", async (_req, reply) => {
    if (!key || !options.googleId || !options.googleSecret)
      return reply.code(503).send({
        error: "Configure Google OAuth credentials and CALENDAR_ENCRYPTION_KEY",
      });
    const state = token(),
      verifier = token();
    await pool.query("DELETE FROM oauth_pending WHERE expires<now()");
    await pool.query(
      "INSERT INTO oauth_pending VALUES($1,$2,now()+interval '10 minutes')",
      [digest(state), encrypt(verifier)],
    );
    const challenge = Buffer.from(digest(verifier), "hex").toString(
      "base64url",
    );
    return {
      url: `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({ client_id: options.googleId, redirect_uri: callback, response_type: "code", scope: "https://www.googleapis.com/auth/calendar.readonly", access_type: "offline", prompt: "consent", state, code_challenge: challenge, code_challenge_method: "S256" })}`,
    };
  });
  app.get("/api/google/callback", async (req, reply) => {
    const { state, code } = z
      .object({ state: z.string(), code: z.string() })
      .parse(req.query);
    const { rows } = await pool.query(
      "DELETE FROM oauth_pending WHERE state_hash=$1 AND expires>now() RETURNING verifier",
      [digest(state)],
    );
    if (!rows.length)
      return reply.code(400).send({
        error: "Authorization expired or invalid. Start again from Calendars.",
      });
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      body: new URLSearchParams({
        client_id: options.googleId!,
        client_secret: options.googleSecret!,
        code,
        redirect_uri: callback,
        grant_type: "authorization_code",
        code_verifier: decrypt(rows[0].verifier),
      }),
      signal: AbortSignal.timeout(10000),
    });
    const data = (await response.json()) as any;
    if (!response.ok || !data.refresh_token)
      return reply.code(400).send({
        error: "Google connection failed. Grant offline access and retry.",
      });
    await pool.query(
      "INSERT INTO google_connection VALUES(1,$1) ON CONFLICT(id) DO UPDATE SET secret=excluded.secret",
      [encrypt(data.refresh_token)],
    );
    return reply.redirect("/");
  });
  app.get("/api/google/list", async () => {
    const access = await googleToken();
    const calendars: any[] = [];
    let page = "";
    let pages = 0;
    do {
      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/users/me/calendarList?${new URLSearchParams({ maxResults: "250", ...(page ? { pageToken: page } : {}) })}`,
        {
          headers: { Authorization: `Bearer ${access}` },
          signal: AbortSignal.timeout(10000),
        },
      );
      const data = (await response.json()) as any;
      if (!response.ok) throw new Error("Google calendars unavailable");
      calendars.push(
        ...(data.items ?? []).map((c: any) => ({ id: c.id, name: c.summary })),
      );
      page = data.nextPageToken ?? "";
      if (++pages >= 20 && page) throw new Error("Too many calendars");
    } while (page);
    return calendars;
  });
  app.delete("/api/google/connection", async () => {
    await pool.query("DELETE FROM google_connection");
    return { ok: true };
  });
}
