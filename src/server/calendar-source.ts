import https from "node:https";
import { lookup } from "node:dns/promises";
import ipaddr from "ipaddr.js";
import ICAL from "ical.js";
import { DateTime } from "luxon";
import { ZONE } from "../shared/schema.js";
export function publicAddress(address: string) {
  const ip = ipaddr.process(address);
  return ip.range() === "unicast";
}
export async function fetchCalendar(
  raw: string,
  redirects = 0,
): Promise<string> {
  const url = new URL(raw);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  )
    throw new Error(
      "Use an HTTPS calendar URL without embedded login credentials",
    );
  const addresses = await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
    throw new Error("Calendar destination must be a public internet address");
  return new Promise((resolve, reject) => {
    const pinned = addresses[0];
    const request = https.get(
      url,
      {
        lookup: ((_host: any, options: any, cb: any) =>
          options.all
            ? cb(null, [pinned])
            : cb(null, pinned.address, pinned.family)) as any,
        headers: { Accept: "text/calendar" },
        timeout: 10000,
      },
      (response) => {
        if (
          response.statusCode &&
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          response.headers.location
        ) {
          response.resume();
          if (redirects >= 3)
            return reject(new Error("Too many calendar redirects"));
          fetchCalendar(
            new URL(response.headers.location, url).href,
            redirects + 1,
          ).then(resolve, reject);
          return;
        }
        if (response.statusCode !== 200) {
          response.resume();
          reject(
            new Error("Calendar provider did not return a usable response"),
          );
          return;
        }
        let size = 0;
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => {
          size += chunk.length;
          if (size > 2 * 1024 * 1024) {
            request.destroy();
            reject(new Error("Calendar exceeds 2 MB limit"));
          } else chunks.push(chunk);
        });
        response.on("end", () =>
          resolve(Buffer.concat(chunks).toString("utf8")),
        );
        response.on("error", reject);
      },
    );
    request.on("timeout", () =>
      request.destroy(new Error("Calendar request timed out")),
    );
    request.on("error", reject);
  });
}
function dateValue(t: ICAL.Time, fallbackZone = ZONE) {
  if (t.isDate) return t.toString();
  if (t.zone.tzid === "floating") {
    const value = DateTime.fromISO(t.toString(), { zone: fallbackZone });
    if (!value.isValid) throw new Error("Unsupported appointment timezone");
    return value.toISO()!;
  }
  return t.toJSDate().toISOString();
}
function eventZone(event: ICAL.Event) {
  const tzid = event.component
    .getFirstProperty("dtstart")
    ?.getParameter("tzid");
  return typeof tzid === "string" ? tzid : ZONE;
}
export function parseCalendar(raw: string, start: string, end: string) {
  const component = new ICAL.Component(ICAL.parse(raw));
  if (component.name !== "vcalendar")
    throw new Error("Expected an iCalendar document");
  // ICAL resolves embedded VTIMEZONE definitions through the component tree.
  // Avoid global registration so separate feeds cannot overwrite each other's zones.
  const components = component.getAllSubcomponents("vevent");
  const results = new Map<
    string,
    { id: string; title: string; start: string; end: string; allDay: boolean }
  >();
  const low = DateTime.fromISO(start, { zone: ZONE }).toMillis();
  const high = DateTime.fromISO(end, { zone: ZONE }).toMillis();
  let iterations = 0;
  for (const c of components) {
    if (
      c.hasProperty("recurrence-id") &&
      components.some(
        (parent) =>
          !parent.hasProperty("recurrence-id") &&
          parent.getFirstPropertyValue("uid") ===
            c.getFirstPropertyValue("uid"),
      )
    )
      continue;
    const exceptions = components.filter(
      (x) =>
        x.hasProperty("recurrence-id") &&
        x.getFirstPropertyValue("uid") === c.getFirstPropertyValue("uid"),
    );
    const event = new ICAL.Event(c, { exceptions });
    if (c.getFirstPropertyValue("status") === "CANCELLED") continue;
    const add = (
      st: ICAL.Time,
      en: ICAL.Time,
      item: ICAL.Event,
      occurrenceId: string,
    ) => {
      if (item.component.getFirstPropertyValue("status") === "CANCELLED")
        return;
      const a = dateValue(st, eventZone(item));
      const b = dateValue(en, eventZone(item));
      if (
        DateTime.fromISO(a, { zone: ZONE }).toMillis() < high &&
        DateTime.fromISO(b, { zone: ZONE }).toMillis() > low
      ) {
        const id = `${event.uid}:${occurrenceId}`;
        results.set(id, {
          id,
          title: item.summary || "Appointment",
          start: a,
          end: b,
          allDay: st.isDate,
        });
        if (results.size > 20000)
          throw new Error("Calendar contains too many appointments");
      }
    };
    if (!event.isRecurring()) {
      add(event.startDate, event.endDate, event, event.startDate.toString());
      continue;
    }
    const iterator = event.iterator();
    let next: ICAL.Time | null;
    while ((next = iterator.next())) {
      if (++iterations > 50000)
        throw new Error("Calendar recurrence exceeds expansion limit");
      if (
        DateTime.fromISO(dateValue(next, eventZone(event)), {
          zone: ZONE,
        }).toMillis() >= high
      )
        break;
      const occurrence = event.getOccurrenceDetails(next);
      add(
        occurrence.startDate,
        occurrence.endDate,
        occurrence.item,
        next.toString(),
      );
    }
    // A detached occurrence may move from a future recurrence into this week.
    for (const exception of exceptions) {
      const item = new ICAL.Event(exception);
      add(item.startDate, item.endDate, item, item.recurrenceId.toString());
    }
  }
  return [...results.values()];
}
