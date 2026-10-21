import { DateTime } from "luxon";
import { ZONE, weekOf, type State, type Need, type Shift } from "./schema.js";
const ms = (s: string) => Date.parse(s);
const hour = 3600000;
export const overlaps = (
  a: { start: string; end: string },
  b: { start: string; end: string },
) => ms(a.start) < ms(b.end) && ms(b.start) < ms(a.end);
export function expandNeeds(needs: Need[], week: string) {
  const begin = DateTime.fromISO(week, { zone: ZONE }).startOf("week");
  const result: {
    id: string;
    needId: string;
    label: string;
    start: string;
    end: string;
  }[] = [];
  for (let offset = -1; offset < 7; offset++) {
    const day = begin.plus({ days: offset });
    const date = day.toISODate()!;
    for (const n of needs) {
      if (
        date < n.from ||
        (n.until && date > n.until) ||
        !n.days.includes(day.weekday) ||
        n.exceptions.includes(date)
      )
        continue;
      const start = day.set({
        hour: Math.floor(n.start / 60),
        minute: n.start % 60,
      });
      const end = (n.end <= n.start ? day.plus({ days: 1 }) : day).set({
        hour: Math.floor(n.end / 60),
        minute: n.end % 60,
      });
      if (end <= begin) continue;
      result.push({
        id: `${n.id}:${date}`,
        needId: n.id,
        label: n.label,
        start: start.toISO()!,
        end: end.toISO()!,
      });
    }
  }
  return result;
}
function coveredMs(start: number, end: number, shifts: Shift[]) {
  const spans = shifts
    .filter((s) => s.employeeId)
    .map((s) => [Math.max(start, ms(s.start)), Math.min(end, ms(s.end))])
    .filter(([a, b]) => a < b)
    .sort((a, b) => a[0] - b[0]);
  let total = 0,
    edge = start;
  for (const [a, b] of spans) {
    if (b > edge) {
      total += b - Math.max(a, edge);
      edge = b;
    }
  }
  return total;
}
export function validateState(s: State): string[] {
  const errors: string[] = [];
  for (const [name, list] of [
    ["employees", s.employees],
    ["shifts", s.shifts],
    ["needs", s.needs],
  ] as const) {
    if (new Set(list.map((x) => x.id)).size !== list.length)
      errors.push(`Duplicate ${name} identifiers`);
  }
  if (new Set(s.budgets.map((b) => b.week)).size !== s.budgets.length)
    errors.push("Duplicate weekly budgets");
  for (const shift of s.shifts) {
    const start = ms(shift.start),
      end = ms(shift.end);
    const breaks = [...shift.breaks].sort((a, b) => ms(a.start) - ms(b.start));
    breaks.forEach((b, i) => {
      if (
        ms(b.start) < start ||
        ms(b.end) > end ||
        (i > 0 && overlaps(b, breaks[i - 1]))
      )
        errors.push("Breaks must be inside the shift and must not overlap");
    });
    if (!shift.employeeId) continue;
    const employee = s.employees.find((e) => e.id === shift.employeeId);
    if (!employee) {
      errors.push("Assigned employee does not exist");
      continue;
    }
    if (employee.leave.some((l) => overlaps(l, shift)))
      errors.push(`${employee.name} is on leave during a shift`);
    let cursor = DateTime.fromMillis(start, { zone: ZONE });
    while (cursor.toMillis() < end) {
      const next = Math.min(
        cursor.plus({ days: 1 }).startOf("day").toMillis(),
        end,
      );
      const exceptions =
        employee.availabilityExceptions?.filter(
          (w) => w.date === cursor.toISODate(),
        ) ?? [];
      const windows = (
        exceptions.length
          ? exceptions
          : employee.availability.filter((w) => w.day === cursor.weekday)
      ).map(
        (w) =>
          ({
            start: cursor
              .startOf("day")
              .set({ hour: Math.floor(w.start / 60), minute: w.start % 60 })
              .toISO()!,
            end:
              w.end === 1440
                ? cursor.plus({ days: 1 }).startOf("day").toISO()!
                : cursor
                    .startOf("day")
                    .set({ hour: Math.floor(w.end / 60), minute: w.end % 60 })
                    .toISO()!,
            employeeId: employee.id,
          }) as Shift,
      );
      if (
        coveredMs(cursor.toMillis(), next, windows) <
        next - cursor.toMillis()
      )
        errors.push(`${employee.name} is unavailable during a shift`);
      cursor = DateTime.fromMillis(next, { zone: ZONE });
    }
  }
  const assigned = s.shifts
    .filter((x) => x.employeeId)
    .sort((a, b) => ms(a.start) - ms(b.start));
  for (let i = 0; i < assigned.length; i++)
    for (let j = i + 1; j < assigned.length; j++) {
      const a = assigned[i],
        b = assigned[j];
      if (ms(b.start) >= ms(a.end) + 48 * hour) break;
      if (a.employeeId === b.employeeId) {
        const e = s.employees.find((e) => e.id === a.employeeId);
        if (!e) continue;
        if (overlaps(a, b)) errors.push(`${e.name} is double-booked`);
        else if (ms(b.start) - ms(a.end) < e.minRestHours * hour)
          errors.push(`${e.name} needs ${e.minRestHours} hours of rest`);
      } else if (
        overlaps(a, b) &&
        !a.overlapReason.trim() &&
        !b.overlapReason.trim()
      )
        errors.push("Overlapping assignments need an explicit overlap reason");
    }
  const weeks = new Set(
    s.shifts.flatMap((x) => [
      weekOf(x.start),
      weekOf(DateTime.fromISO(x.end).minus({ milliseconds: 1 }).toISO()!),
    ]),
  );
  for (const week of weeks) {
    const begin = DateTime.fromISO(week, { zone: ZONE }).toMillis(),
      end = DateTime.fromISO(week, { zone: ZONE })
        .plus({ weeks: 1 })
        .toMillis();
    for (const e of s.employees) {
      if (e.maxWeeklyHours === null) continue;
      const worked = assigned
        .filter((x) => x.employeeId === e.id)
        .reduce(
          (sum, x) =>
            sum +
            Math.max(
              0,
              Math.min(ms(x.end), end) - Math.max(ms(x.start), begin),
            ),
          0,
        );
      if (worked > e.maxWeeklyHours * hour)
        errors.push(`${e.name} exceeds their weekly hours limit in ${week}`);
    }
  }
  return [...new Set(errors)];
}
export function evaluateWeek(s: State, week: string) {
  const begin = DateTime.fromISO(week, { zone: ZONE }).startOf("week");
  const end = begin.plus({ weeks: 1 });
  const shifts = s.shifts.filter(
    (x) => ms(x.start) < end.toMillis() && ms(x.end) > begin.toMillis(),
  );
  const assigned = shifts.filter((x) => x.employeeId);
  const budget = s.budgets.find((b) => b.week === begin.toISODate());
  const incomplete = new Set<string>();
  if (!budget)
    incomplete.add("Weekly budget and employer costs have not been set");
  let wagesNumerator = 0n,
    assignedMs = 0;
  for (const shift of assigned) {
    const employee = s.employees.find((e) => e.id === shift.employeeId);
    if (!employee) continue;
    let cursor = Math.max(ms(shift.start), begin.toMillis());
    const stop = Math.min(ms(shift.end), end.toMillis());
    assignedMs += stop - cursor;
    if (shift.kind === "sleeping")
      incomplete.add(
        "Overnight pay treatment needs verification; estimate includes all overnight hours",
      );
    while (cursor < stop) {
      const local = DateTime.fromMillis(cursor, { zone: ZONE });
      const next = Math.min(
        stop,
        local.plus({ days: 1 }).startOf("day").toMillis(),
      );
      const rate = [...employee.rates]
        .sort((a, b) => b.from.localeCompare(a.from))
        .find((r) => r.from <= local.toISODate()!);
      if (!rate) incomplete.add(`Missing rate for ${employee.name}`);
      const unpaid = shift.breaks
        .filter((b) => !b.paid)
        .reduce(
          (sum, b) =>
            sum +
            Math.max(
              0,
              Math.min(ms(b.end), next) - Math.max(ms(b.start), cursor),
            ),
          0,
        );
      if (rate)
        wagesNumerator += BigInt(next - cursor - unpaid) * BigInt(rate.cents);
      cursor = next;
    }
  }
  const wagesCents = Number((wagesNumerator + 1800000n) / 3600000n);
  const percentBasisPoints = Math.round((budget?.employerPercent ?? 0) * 100);
  const employerCents =
    Number((BigInt(wagesCents) * BigInt(percentBasisPoints) + 5000n) / 10000n) +
    (budget?.fixedCents ?? 0);
  const needs = expandNeeds(s.needs, week);
  let uncovered = 0;
  const union: number[][] = [];
  for (const n of [...needs].sort((a, b) => ms(a.start) - ms(b.start))) {
    const a = Math.max(ms(n.start), begin.toMillis()),
      b = Math.min(ms(n.end), end.toMillis());
    const last = union[union.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else union.push([a, b]);
  }
  for (const [a, b] of union) uncovered += b - a - coveredMs(a, b, assigned);
  const gaps = needs.map((n) => {
    const start = Math.max(ms(n.start), begin.toMillis()),
      stop = Math.min(ms(n.end), end.toMillis());
    const missing = Math.max(
      0,
      stop - start - coveredMs(start, stop, assigned),
    );
    return { ...n, uncoveredHours: missing / hour };
  });
  return {
    wagesCents,
    employerCents,
    totalCents: wagesCents + employerCents,
    budgetCents: budget?.cents ?? null,
    remainingCents: budget ? budget.cents - wagesCents - employerCents : null,
    assignedHours: assignedMs / hour,
    uncoveredHours: uncovered / hour,
    gaps,
    incomplete: [...incomplete],
    compliance: "Ontario rules not yet verified" as const,
  };
}
