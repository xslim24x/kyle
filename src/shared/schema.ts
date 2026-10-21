import { z } from "zod";
import { DateTime } from "luxon";
export const ZONE = "America/Toronto";
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => DateTime.fromISO(v).isValid, "Invalid date");
const instant = z.string().datetime({ offset: true });
const id = z.string().uuid();
const money = z.number().int().min(0).max(100000000);
const interval = { start: instant, end: instant };
const validInterval = (v: { start: string; end: string }) =>
  Date.parse(v.end) > Date.parse(v.start);
const window = z
  .object({
    day: z.number().int().min(1).max(7),
    start: z.number().int().min(0).max(1439),
    end: z.number().int().min(1).max(1440),
  })
  .refine((v) => v.end > v.start);
export const employeeSchema = z
  .object({
    id,
    name: z.string().trim().min(1).max(100),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    active: z.boolean(),
    rates: z.array(z.object({ from: date, cents: money })).max(100),
    availability: z.array(window).max(100),
    availabilityExceptions: z
      .array(
        z
          .object({
            date,
            start: z.number().int().min(0).max(1439),
            end: z.number().int().min(1).max(1440),
          })
          .refine((v) => v.end > v.start),
      )
      .max(500)
      .optional(),
    leave: z.array(z.object(interval).refine(validInterval)).max(500),
    maxWeeklyHours: z.number().min(1).max(168).nullable(),
    minRestHours: z.number().min(0).max(48),
    preferences: z.string().max(1000),
  })
  .refine(
    (e) => new Set(e.rates.map((r) => r.from)).size === e.rates.length,
    "Rate dates must be unique",
  );
export const shiftSchema = z
  .object({
    id,
    ...interval,
    employeeId: id.nullable(),
    kind: z.enum(["day", "sleeping"]),
    note: z.string().max(1000),
    overlapReason: z.string().max(500),
    breaks: z
      .array(z.object({ ...interval, paid: z.boolean() }).refine(validInterval))
      .max(20),
  })
  .refine(validInterval)
  .refine(
    (s) => Date.parse(s.end) - Date.parse(s.start) <= 48 * 3600000,
    "Split shifts longer than 48 hours",
  );
export const needSchema = z
  .object({
    id,
    label: z.string().trim().min(1).max(100),
    from: date,
    until: date.nullable(),
    days: z.array(z.number().int().min(1).max(7)).min(1).max(7),
    start: z.number().int().min(0).max(1439),
    end: z.number().int().min(0).max(1439),
    exceptions: z.array(date).max(500),
  })
  .refine((n) => !n.until || n.until >= n.from);
export const budgetSchema = z.object({
  week: date.refine(
    (v) => DateTime.fromISO(v).weekday === 1,
    "Week must start Monday",
  ),
  cents: money,
  employerPercent: z.number().min(0).max(100),
  fixedCents: money,
});
export const stateSchema = z.object({
  employees: z.array(employeeSchema).max(200),
  shifts: z.array(shiftSchema).max(10000),
  needs: z.array(needSchema).max(500),
  budgets: z.array(budgetSchema).max(1000),
});
export type Employee = z.infer<typeof employeeSchema>;
export type Shift = z.infer<typeof shiftSchema>;
export type Need = z.infer<typeof needSchema>;
export type Budget = z.infer<typeof budgetSchema>;
export type State = z.infer<typeof stateSchema>;
export const emptyState: State = {
  employees: [],
  shifts: [],
  needs: [],
  budgets: [],
};
export const weekOf = (iso?: string) =>
  DateTime.fromISO(iso ?? DateTime.now().setZone(ZONE).toISODate()!, {
    zone: ZONE,
  })
    .startOf("week")
    .toISODate()!;
