import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateWeek, validateState } from "../src/shared/planning.js";
import {
  emptyState,
  type State,
  type Shift,
  type Employee,
} from "../src/shared/schema.js";
const employee: Employee = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Alex",
  color: "#24675c",
  active: true,
  rates: [{ from: "2026-01-01", cents: 2500 }],
  availability: [1, 2, 3, 4, 5, 6, 7].map((day) => ({
    day,
    start: 0,
    end: 1440,
  })),
  leave: [],
  maxWeeklyHours: null,
  minRestHours: 0,
  preferences: "",
};
const shift: Shift = {
  id: "22222222-2222-4222-8222-222222222222",
  start: "2026-10-20T09:00:00-04:00",
  end: "2026-10-20T17:00:00-04:00",
  employeeId: employee.id,
  kind: "day",
  note: "",
  overlapReason: "",
  breaks: [],
};
const state = (): State =>
  structuredClone({
    ...emptyState,
    employees: [employee],
    shifts: [shift],
    budgets: [
      {
        week: "2026-10-19",
        cents: 100000,
        employerPercent: 15,
        fixedCents: 1000,
      },
    ],
  });
test("weekly cost includes wages and employer costs without spending unused budget", () => {
  const r = evaluateWeek(state(), "2026-10-19");
  assert.equal(r.wagesCents, 20000);
  assert.equal(r.employerCents, 4000);
  assert.equal(r.remainingCents, 76000);
});
test("deleting an assignment leaves coverage unmet", () => {
  const s = state();
  s.needs = [
    {
      id: "33333333-3333-4333-8333-333333333333",
      label: "Support",
      from: "2026-10-19",
      until: null,
      days: [2],
      start: 540,
      end: 1020,
      exceptions: [],
    },
  ];
  assert.equal(evaluateWeek(s, "2026-10-19").uncoveredHours, 0);
  s.shifts[0].employeeId = null;
  assert.equal(evaluateWeek(s, "2026-10-19").uncoveredHours, 8);
});
test("same-employee double bookings cannot be overridden", () => {
  const s = state();
  s.shifts.push({
    ...shift,
    id: "44444444-4444-4444-8444-444444444444",
    overlapReason: "Exception",
  });
  assert.ok(validateState(s).some((x) => x.includes("double-booked")));
});
test("daylight-saving overnight uses elapsed hours, but pay completeness stays unresolved", () => {
  const s = state();
  s.shifts = [
    {
      ...shift,
      kind: "sleeping",
      start: "2026-11-01T00:00:00-04:00",
      end: "2026-11-01T08:00:00-05:00",
    },
  ];
  const r = evaluateWeek(s, "2026-10-26");
  assert.equal(r.assignedHours, 9);
  assert.equal(r.wagesCents, 22500);
  assert.ok(r.incomplete.some((x) => x.includes("Overnight")));
});
test("Sunday overnight is apportioned across workweeks", () => {
  const s = state();
  s.shifts = [
    {
      ...shift,
      start: "2026-10-25T22:00:00-04:00",
      end: "2026-10-26T06:00:00-04:00",
    },
  ];
  assert.equal(evaluateWeek(s, "2026-10-19").wagesCents, 5000);
  assert.equal(evaluateWeek(s, "2026-10-26").wagesCents, 15000);
});
test("availability and rest restrictions apply across the visible week", () => {
  const s = state();
  s.employees[0].leave = [{ start: shift.start, end: shift.end }];
  assert.ok(validateState(s).some((x) => x.includes("leave")));
  s.employees[0].leave = [];
  s.employees[0].minRestHours = 8;
  s.shifts.push({
    ...shift,
    id: "44444444-4444-4444-8444-444444444444",
    start: "2026-10-20T20:00:00-04:00",
    end: "2026-10-20T23:00:00-04:00",
  });
  assert.ok(validateState(s).some((x) => x.includes("rest")));
});
test("effective-dated rates preserve previous week estimates", () => {
  const s = state();
  s.employees[0].rates.push({ from: "2026-10-26", cents: 3000 });
  assert.equal(evaluateWeek(s, "2026-10-19").wagesCents, 20000);
});
test("overlapping needs require one staff member and do not double-count uncovered hours", () => {
  const s = state();
  s.shifts = [];
  s.needs = [
    {
      id: "33333333-3333-4333-8333-333333333333",
      label: "Morning",
      from: "2026-10-19",
      until: null,
      days: [2],
      start: 540,
      end: 780,
      exceptions: [],
    },
    {
      id: "55555555-5555-4555-8555-555555555555",
      label: "Outing",
      from: "2026-10-19",
      until: null,
      days: [2],
      start: 660,
      end: 900,
      exceptions: [],
    },
  ];
  assert.equal(evaluateWeek(s, "2026-10-19").uncoveredHours, 6);
});
test("date-specific availability replaces recurring windows and leave still blocks it", () => {
  const s = state();
  s.employees[0].availability = [];
  assert.ok(validateState(s).some((x) => x.includes("unavailable")));
  s.employees[0].availabilityExceptions = [
    { date: "2026-10-20", start: 540, end: 1020 },
  ];
  assert.deepEqual(validateState(s), []);
  s.employees[0].leave = [{ start: shift.start, end: shift.end }];
  assert.ok(validateState(s).some((x) => x.includes("leave")));
});
test("multiple unpaid breaks reduce the estimate while overlapping breaks are rejected", () => {
  const s = state();
  s.shifts[0].breaks = [
    {
      start: "2026-10-20T12:00:00-04:00",
      end: "2026-10-20T12:30:00-04:00",
      paid: false,
    },
    {
      start: "2026-10-20T15:00:00-04:00",
      end: "2026-10-20T15:30:00-04:00",
      paid: false,
    },
  ];
  assert.equal(evaluateWeek(s, "2026-10-19").wagesCents, 17500);
  s.shifts[0].breaks.push(s.shifts[0].breaks[0]);
  assert.ok(validateState(s).some((x) => x.includes("Breaks")));
});
