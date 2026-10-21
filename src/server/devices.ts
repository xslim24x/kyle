import { migrate } from "./db.js";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import { digest, token, hashPassword, verifyPassword } from "./auth.js";
export async function registerDevices(
  app: FastifyInstance,
  pool: Pool,
  secure: boolean,
  privateMode: boolean,
) {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS trusted_devices(token_hash text PRIMARY KEY,pin_hash text NOT NULL,expires timestamptz NOT NULL,attempts integer NOT NULL DEFAULT 0,locked_until timestamptz);`,
  );
  const cookieOptions = {
    httpOnly: true,
    sameSite: "strict" as const,
    secure,
    path: "/",
  };
  async function openSession(reply: FastifyReply) {
    const raw = token();
    await pool.query(
      "INSERT INTO sessions VALUES($1,now()+interval '12 hours')",
      [digest(raw)],
    );
    reply.setCookie("session", raw, { ...cookieOptions, maxAge: 43200 });
  }
  app.get("/api/auth-info", async (req) => {
    const { rowCount } = await pool.query(
      "SELECT 1 FROM trusted_devices WHERE token_hash=$1 AND expires>now()",
      [digest(req.cookies.device ?? "")],
    );
    return { trusted: !!rowCount, privateMode };
  });
  app.post(
    "/api/trust-device",
    { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } },
    async (req, reply) => {
      const { password, pin } = z
        .object({
          password: z.string().max(256),
          pin: z.string().regex(/^\d{6,12}$/),
        })
        .parse(req.body);
      const { rows } = await pool.query(
        "SELECT password_hash FROM owner WHERE id=1",
      );
      if (!verifyPassword(password, rows[0].password_hash))
        return reply.code(401).send({ error: "Incorrect password" });
      const raw = token();
      await pool.query(
        "DELETE FROM trusted_devices WHERE token_hash=$1 OR expires<now()",
        [digest(req.cookies.device ?? "")],
      );
      await pool.query(
        "INSERT INTO trusted_devices(token_hash,pin_hash,expires) VALUES($1,$2,now()+interval '30 days')",
        [digest(raw), hashPassword(pin)],
      );
      reply.setCookie("device", raw, { ...cookieOptions, maxAge: 30 * 86400 });
      return { ok: true };
    },
  );
  app.post("/api/lock", async (req, reply) => {
    await pool.query("DELETE FROM sessions WHERE token_hash=$1", [
      digest(req.cookies.session ?? ""),
    ]);
    reply.clearCookie("session", { path: "/" });
    return { ok: true };
  });
  app.post(
    "/api/unlock",
    { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } },
    async (req, reply) => {
      const { pin } = z
        .object({ pin: z.string().regex(/^\d{6,12}$/) })
        .parse(req.body);
      const client = await pool.connect();
      let valid = false;
      try {
        await client.query("BEGIN");
        const { rows } = await client.query(
          "SELECT * FROM trusted_devices WHERE token_hash=$1 AND expires>now() FOR UPDATE",
          [digest(req.cookies.device ?? "")],
        );
        const device = rows[0];
        if (
          device &&
          (!device.locked_until ||
            new Date(device.locked_until).getTime() < Date.now())
        ) {
          valid = verifyPassword(pin, device.pin_hash);
          if (valid)
            await client.query(
              "UPDATE trusted_devices SET attempts=0,locked_until=NULL WHERE token_hash=$1",
              [device.token_hash],
            );
          else {
            const attempts = device.locked_until ? 1 : device.attempts + 1;
            await client.query(
              "UPDATE trusted_devices SET attempts=$2,locked_until=CASE WHEN $2>=5 THEN now()+interval '15 minutes' ELSE NULL END WHERE token_hash=$1",
              [device.token_hash, attempts],
            );
          }
        }
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
      if (!valid)
        return reply.code(401).send({
          error:
            "PIN unlock unavailable. Use your password or try again later.",
        });
      await openSession(reply);
      return { ok: true };
    },
  );
  app.post("/api/revoke-devices", async (_req, reply) => {
    await pool.query("DELETE FROM trusted_devices");
    reply.clearCookie("device", { path: "/" });
    return { ok: true };
  });
}
