import { DateTime } from "luxon";
import { useState } from "react";
import {
  ZONE,
  type State,
  type Shift,
  type Employee,
  type Need,
} from "../shared/schema";
import { Field, Modal, Form, text, num } from "./components";
export const local = (s: string) =>
  DateTime.fromISO(s, { zone: ZONE }).toFormat("yyyy-MM-dd'T'HH:mm");
const instant = (s: string) => {
  const d = DateTime.fromISO(s, { zone: ZONE });
  if (!d.isValid) throw new Error("Enter a valid date and time");
  return d.toISO()!;
};
const minutes = (s: string) => {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
};
const clock = (n: number) =>
  `${String(Math.floor(n / 60) % 24).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
interface Props {
  state: State;
  save: (data: State) => Promise<void>;
  close: () => void;
}
export function ShiftEditor({
  state,
  save,
  close,
  shift,
}: { shift: Shift } & Props) {
  const [breaks, setBreaks] = useState(shift.breaks);
  const existing = state.shifts.some((s) => s.id === shift.id);
  async function remove() {
    await save({
      ...state,
      shifts: state.shifts.filter((s) => s.id !== shift.id),
    });
    close();
  }
  return (
    <Modal title={existing ? "Edit shift" : "New shift"} onClose={close}>
      <Form
        onSubmit={async (f) => {
          const start = instant(text(f, "start")),
            end = instant(text(f, "end"));
          const s: Shift = {
            ...shift,
            start,
            end,
            employeeId: text(f, "employeeId") || null,
            kind: text(f, "kind") as Shift["kind"],
            note: text(f, "note"),
            overlapReason: text(f, "overlapReason"),
            breaks,
          };
          await save({
            ...state,
            shifts: [...state.shifts.filter((x) => x.id !== s.id), s],
          });
          close();
        }}
      >
        <div className="row">
          <Field label="Starts · Toronto">
            <input
              name="start"
              type="datetime-local"
              defaultValue={local(shift.start)}
              required
            />
          </Field>
          <Field label="Ends · Toronto">
            <input
              name="end"
              type="datetime-local"
              defaultValue={local(shift.end)}
              required
            />
          </Field>
        </div>
        <Field label="Support staff">
          <select name="employeeId" defaultValue={shift.employeeId ?? ""}>
            <option value="">Unassigned</option>
            {state.employees
              .filter((e) => e.active || e.id === shift.employeeId)
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Shift type">
          <select name="kind" defaultValue={shift.kind}>
            <option value="day">Regular support</option>
            <option value="sleeping">Sleeping / on-call overnight</option>
          </select>
        </Field>
        <p className="hint">
          Overnight estimates include all hours until pay treatment is verified.
        </p>
        <details>
          <summary>Break, overlap exception & notes</summary>
          {breaks.map((b, i) => (
            <div key={i}>
              <div className="row">
                <Field label="Break starts">
                  <input
                    type="datetime-local"
                    required
                    value={local(b.start)}
                    onChange={(v) => {
                      if (v.target.value)
                        setBreaks(
                          breaks.map((x, j) =>
                            j === i
                              ? { ...x, start: instant(v.target.value) }
                              : x,
                          ),
                        );
                    }}
                  />
                </Field>
                <Field label="Break ends">
                  <input
                    type="datetime-local"
                    required
                    value={local(b.end)}
                    onChange={(v) => {
                      if (v.target.value)
                        setBreaks(
                          breaks.map((x, j) =>
                            j === i
                              ? { ...x, end: instant(v.target.value) }
                              : x,
                          ),
                        );
                    }}
                  />
                </Field>
              </div>
              <Field label="Break pay">
                <select
                  value={b.paid ? "paid" : "unpaid"}
                  onChange={(v) =>
                    setBreaks(
                      breaks.map((x, j) =>
                        j === i ? { ...x, paid: v.target.value === "paid" } : x,
                      ),
                    )
                  }
                >
                  <option value="paid">Paid</option>
                  <option value="unpaid">
                    Unpaid — confirm applicable treatment
                  </option>
                </select>
              </Field>
              <button
                type="button"
                onClick={() => setBreaks(breaks.filter((_, j) => j !== i))}
              >
                Remove break
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              setBreaks([
                ...breaks,
                {
                  start: shift.start,
                  end: DateTime.fromISO(shift.start)
                    .plus({ minutes: 30 })
                    .toISO()!,
                  paid: true,
                },
              ])
            }
          >
            + Add break
          </button>
          <Field label="Overlap exception reason">
            <input
              name="overlapReason"
              defaultValue={shift.overlapReason}
              maxLength={500}
            />
          </Field>
          <Field label="Notes">
            <textarea name="note" defaultValue={shift.note} maxLength={1000} />
          </Field>
        </details>
        <div className="actions">
          {existing && (
            <button
              type="button"
              className="danger"
              onClick={() => {
                if (confirm("Delete this shift? Coverage needs will remain."))
                  void remove().catch((e) => alert(e.message));
              }}
            >
              Delete shift
            </button>
          )}
          <button type="submit" className="primary">
            Save shift
          </button>
        </div>
      </Form>
    </Modal>
  );
}
export function EmployeeEditor({
  employee: e,
  state,
  save,
  close,
}: { employee: Employee } & Props) {
  const [rates, setRates] = useState(e.rates);
  const [availability, setAvailability] = useState(e.availability);
  const [leave, setLeave] = useState(e.leave);
  const [exceptions, setExceptions] = useState(e.availabilityExceptions ?? []);
  return (
    <Modal
      title={
        state.employees.some((x) => x.id === e.id)
          ? "Edit support staff"
          : "Add support staff"
      }
      onClose={close}
    >
      <Form
        onSubmit={async (f) => {
          const employee: Employee = {
            ...e,
            name: text(f, "name"),
            color: text(f, "color"),
            active: f.has("active"),
            rates,
            availability,
            availabilityExceptions: exceptions,
            leave,
            maxWeeklyHours: text(f, "maxHours") ? num(f, "maxHours") : null,
            minRestHours: num(f, "rest"),
            preferences: text(f, "preferences"),
          };
          await save({
            ...state,
            employees: [
              ...state.employees.filter((x) => x.id !== e.id),
              employee,
            ],
          });
          close();
        }}
      >
        <div className="row">
          <Field label="Name">
            <input name="name" defaultValue={e.name} required maxLength={100} />
          </Field>
          <Field label="Calendar colour">
            <input name="color" type="color" defaultValue={e.color} />
          </Field>
        </div>
        <label className="check">
          <input name="active" type="checkbox" defaultChecked={e.active} />
          Active employee
        </label>
        <h3>Hourly rates</h3>
        <p className="hint">
          Add a future effective date to preserve earlier rates.
        </p>
        {rates.map((r, i) => (
          <div className="row" key={i}>
            <Field label="Effective from">
              <input
                type="date"
                required
                value={r.from}
                onChange={(v) =>
                  setRates(
                    rates.map((x, j) =>
                      j === i ? { ...x, from: v.target.value } : x,
                    ),
                  )
                }
              />
            </Field>
            <Field label="CAD per hour">
              <input
                type="number"
                min="0"
                step="0.01"
                required
                value={r.cents / 100}
                onChange={(v) =>
                  setRates(
                    rates.map((x, j) =>
                      j === i
                        ? {
                            ...x,
                            cents: Math.round(Number(v.target.value) * 100),
                          }
                        : x,
                    ),
                  )
                }
              />
            </Field>
            <button
              type="button"
              aria-label={`Remove rate ${i + 1}`}
              onClick={() => setRates(rates.filter((_, j) => i !== j))}
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            setRates([
              ...rates,
              { from: DateTime.now().setZone(ZONE).toISODate()!, cents: 0 },
            ])
          }
        >
          + Add rate
        </button>
        <h3>Recurring availability</h3>
        <p className="hint">
          Use separate windows on each day for overnight availability.
        </p>
        {availability.map((a, i) => (
          <div className="row compact" key={i}>
            <Field label="Day">
              <select
                value={a.day}
                onChange={(v) =>
                  setAvailability(
                    availability.map((x, j) =>
                      j === i ? { ...x, day: Number(v.target.value) } : x,
                    ),
                  )
                }
              >
                {days.map((d, j) => (
                  <option key={d} value={j + 1}>
                    {d}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="From">
              <input
                type="time"
                required
                value={clock(a.start)}
                onChange={(v) =>
                  setAvailability(
                    availability.map((x, j) =>
                      j === i ? { ...x, start: minutes(v.target.value) } : x,
                    ),
                  )
                }
              />
            </Field>
            <Field label="Until (00:00 = midnight)">
              <input
                type="time"
                required
                value={clock(a.end)}
                onChange={(v) =>
                  setAvailability(
                    availability.map((x, j) =>
                      j === i
                        ? { ...x, end: minutes(v.target.value) || 1440 }
                        : x,
                    ),
                  )
                }
              />
            </Field>
            <button
              type="button"
              aria-label={`Remove availability ${i + 1}`}
              onClick={() =>
                setAvailability(availability.filter((_, j) => j !== i))
              }
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            setAvailability([...availability, { day: 1, start: 0, end: 1440 }])
          }
        >
          + Add availability
        </button>
        <h3>Date-specific availability</h3>
        <p className="hint">
          These windows replace recurring availability on their date. Leave
          still blocks assignments.
        </p>
        {exceptions.map((a, i) => (
          <div className="row" key={i}>
            <Field label="Exception date">
              <input
                type="date"
                value={a.date}
                required
                onChange={(v) =>
                  setExceptions(
                    exceptions.map((x, j) =>
                      j === i ? { ...x, date: v.target.value } : x,
                    ),
                  )
                }
              />
            </Field>
            <Field label="Available from">
              <input
                type="time"
                value={clock(a.start)}
                required
                onChange={(v) =>
                  setExceptions(
                    exceptions.map((x, j) =>
                      j === i ? { ...x, start: minutes(v.target.value) } : x,
                    ),
                  )
                }
              />
            </Field>
            <Field label="Available until (00:00 = midnight)">
              <input
                type="time"
                value={clock(a.end)}
                required
                onChange={(v) =>
                  setExceptions(
                    exceptions.map((x, j) =>
                      j === i
                        ? { ...x, end: minutes(v.target.value) || 1440 }
                        : x,
                    ),
                  )
                }
              />
            </Field>
            <button
              type="button"
              aria-label={`Remove date exception ${i + 1}`}
              onClick={() =>
                setExceptions(exceptions.filter((_, j) => j !== i))
              }
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            setExceptions([
              ...exceptions,
              {
                date: DateTime.now().setZone(ZONE).toISODate()!,
                start: 0,
                end: 1440,
              },
            ])
          }
        >
          + Add date exception
        </button>
        <h3>Leave & unavailable exceptions</h3>
        {leave.map((l, i) => (
          <div className="row" key={i}>
            <Field label="From">
              <input
                type="datetime-local"
                required
                value={local(l.start)}
                onChange={(v) => {
                  if (v.target.value)
                    setLeave(
                      leave.map((x, j) =>
                        j === i ? { ...x, start: instant(v.target.value) } : x,
                      ),
                    );
                }}
              />
            </Field>
            <Field label="Until">
              <input
                type="datetime-local"
                required
                value={local(l.end)}
                onChange={(v) => {
                  if (v.target.value)
                    setLeave(
                      leave.map((x, j) =>
                        j === i ? { ...x, end: instant(v.target.value) } : x,
                      ),
                    );
                }}
              />
            </Field>
            <button
              type="button"
              aria-label={`Remove leave ${i + 1}`}
              onClick={() => setLeave(leave.filter((_, j) => j !== i))}
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            setLeave([
              ...leave,
              {
                start: DateTime.now().toISO()!,
                end: DateTime.now().plus({ days: 1 }).toISO()!,
              },
            ])
          }
        >
          + Add leave
        </button>
        <h3>Personal restrictions</h3>
        <p className="hint">
          These are employee-specific limits, not verified Ontario legal limits.
        </p>
        <div className="row">
          <Field label="Maximum weekly hours (optional)">
            <input
              name="maxHours"
              type="number"
              min="1"
              max="168"
              defaultValue={e.maxWeeklyHours ?? ""}
            />
          </Field>
          <Field label="Minimum rest hours">
            <input
              name="rest"
              type="number"
              min="0"
              max="48"
              step="0.5"
              defaultValue={e.minRestHours}
            />
          </Field>
        </div>
        <Field label="Preferences">
          <textarea
            name="preferences"
            defaultValue={e.preferences}
            maxLength={1000}
          />
        </Field>
        <div className="actions">
          <button type="submit" className="primary">
            Save employee
          </button>
        </div>
      </Form>
    </Modal>
  );
}
export function NeedEditor({
  need: n,
  state,
  save,
  close,
}: { need: Need } & Props) {
  return (
    <Modal title="Coverage need" onClose={close}>
      <Form
        onSubmit={async (f) => {
          const need: Need = {
            ...n,
            label: text(f, "label"),
            from: text(f, "from"),
            until: text(f, "until") || null,
            days: f.getAll("days").map(Number),
            start: minutes(text(f, "start")),
            end: minutes(text(f, "end")),
            exceptions: text(f, "exceptions")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          };
          await save({
            ...state,
            needs: [...state.needs.filter((x) => x.id !== n.id), need],
          });
          close();
        }}
      >
        <Field label="Label">
          <input name="label" defaultValue={n.label} required maxLength={100} />
        </Field>
        <div className="row">
          <Field label="From date">
            <input name="from" type="date" defaultValue={n.from} required />
          </Field>
          <Field label="Until date (optional)">
            <input name="until" type="date" defaultValue={n.until ?? ""} />
          </Field>
        </div>
        <fieldset>
          <legend>Repeat on</legend>
          <div className="days">
            {days.map((d, i) => (
              <label key={d}>
                <input
                  type="checkbox"
                  name="days"
                  value={i + 1}
                  defaultChecked={n.days.includes(i + 1)}
                />
                {d}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="row">
          <Field label="Starts">
            <input
              type="time"
              name="start"
              defaultValue={clock(n.start)}
              required
            />
          </Field>
          <Field label="Ends">
            <input
              type="time"
              name="end"
              defaultValue={clock(n.end)}
              required
            />
          </Field>
        </div>
        <p className="hint">
          An end time at or before the start continues into the next day. Equal
          times mean 24 hours.
        </p>
        <Field label="Skip dates (YYYY-MM-DD, comma-separated)">
          <input name="exceptions" defaultValue={n.exceptions.join(", ")} />
        </Field>
        <div className="actions">
          {state.needs.some((x) => x.id === n.id) && (
            <button
              type="button"
              className="danger"
              onClick={() => {
                if (confirm("Remove this recurring coverage need?"))
                  void save({
                    ...state,
                    needs: state.needs.filter((x) => x.id !== n.id),
                  })
                    .then(close)
                    .catch((e) => alert(e.message));
              }}
            >
              Delete need
            </button>
          )}
          <button className="primary" type="submit">
            Save coverage need
          </button>
        </div>
      </Form>
    </Modal>
  );
}
