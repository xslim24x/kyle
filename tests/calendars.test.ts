import { test } from "node:test";
import assert from "node:assert/strict";
import {
  publicAddress,
  parseCalendar,
  fetchCalendar,
} from "../src/server/calendar-source.js";
test("private, loopback and link-local calendar addresses are rejected", async () => {
  for (const ip of [
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "192.168.1.1",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
  ])
    assert.equal(publicAddress(ip), false);
  assert.equal(publicAddress("8.8.8.8"), true);
  await assert.rejects(() => fetchCalendar("https://127.0.0.1/calendar"));
  await assert.rejects(() => fetchCalendar("http://example.com/calendar"));
});
test("calendar recurrence, cancelled exceptions and all-day dates are respected", () => {
  const raw = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    "UID:recurring",
    "DTSTART:20261019T130000Z",
    "DTEND:20261019T140000Z",
    "RRULE:FREQ=DAILY;COUNT=3",
    "SUMMARY:Appointment",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:recurring",
    "RECURRENCE-ID:20261020T130000Z",
    "DTSTART:20261020T130000Z",
    "DTEND:20261020T140000Z",
    "STATUS:CANCELLED",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:all-day",
    "DTSTART;VALUE=DATE:20261022",
    "DTEND;VALUE=DATE:20261023",
    "SUMMARY:All day",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const events = parseCalendar(raw, "2026-10-19", "2026-10-26");
  assert.equal(events.length, 3);
  assert.equal(events.filter((e) => e.title === "Appointment").length, 2);
  assert.ok(events.some((e) => e.allDay && e.start === "2026-10-22"));
});

test("a recurrence moved into the selected week remains visible even when its original date is later", () => {
  const raw = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    "UID:moved",
    "DTSTART:20261019T130000Z",
    "DTEND:20261019T140000Z",
    "RRULE:FREQ=WEEKLY;COUNT=3",
    "SUMMARY:Weekly support appointment",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:moved",
    "RECURRENCE-ID:20261102T130000Z",
    "DTSTART:20261021T130000Z",
    "DTEND:20261021T140000Z",
    "SUMMARY:Moved appointment",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const events = parseCalendar(raw, "2026-10-19", "2026-10-26");
  assert.equal(events.length, 2);
  assert.ok(events.some((e) => e.title === "Moved appointment"));
});

test("IANA timezones work when a feed omits VTIMEZONE", () => {
  const raw = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    "UID:west-coast",
    "DTSTART;TZID=America/Vancouver:20261020T090000",
    "DTEND;TZID=America/Vancouver:20261020T100000",
    "SUMMARY:Remote appointment",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const events = parseCalendar(raw, "2026-10-19", "2026-10-26");
  assert.equal(Date.parse(events[0].start), Date.parse("2026-10-20T16:00:00Z"));
});
