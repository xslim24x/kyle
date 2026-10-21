import { useEffect, useState, useRef } from "react";
import { DateTime } from "luxon";
import { api, send } from "./api";
import { Field, Form, Modal, money, num } from "./components";
import { ShiftEditor, EmployeeEditor, NeedEditor } from "./editors";
import { Planner, type Appointment } from "./Planner";
import { AccessSettings } from "./AccessSettings";
import { CalendarSettings } from "./CalendarSettings";
import { evaluateWeek } from "../shared/planning";
import {
  ZONE,
  weekOf,
  type State,
  type Shift,
  type Employee,
  type Need,
} from "../shared/schema";
type Editor =
  | { type: "shift"; value: Shift }
  | { type: "employee"; value: Employee }
  | { type: "need"; value: Need }
  | { type: "budget" }
  | { type: "publish" }
  | null;
export default function App() {
  const weekRequest = useRef(0);
  const [authInfo, setAuthInfo] = useState({
    trusted: false,
    privateMode: false,
  });
  const [usePin, setUsePin] = useState(false);
  const [session, setSession] = useState<"loading" | "locked" | "open">(
    "loading",
  );
  const [record, setRecord] = useState<{
    revision: number;
    data: State;
  } | null>(null);
  const [week, setWeek] = useState(weekOf());
  const [tab, setTab] = useState("Planner");
  const [editor, setEditor] = useState<Editor>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [publication, setPublication] = useState<any>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  async function load() {
    try {
      setAuthInfo(await api("/auth-info"));
      setRecord(await api("/state"));
      setSession("open");
      setError("");
    } catch (e) {
      setSession("locked");
      setError(
        (e as Error).message === "Please sign in" ? "" : (e as Error).message,
      );
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function refreshWeek() {
    const request = ++weekRequest.current;
    try {
      const data = await api(`/week?week=${week}`);
      const c = await api(`/appointments?week=${week}`);
      if (request === weekRequest.current) {
        setPublication(data.publication);
        setAppointments(c);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    if (session === "open") void refreshWeek();
  }, [week, record?.revision, session]);
  async function save(data: State) {
    if (!record) return;
    setBusy(true);
    try {
      setRecord(
        await api("/state", send("PUT", { revision: record.revision, data })),
      );
      setError("");
    } finally {
      setBusy(false);
    }
  }
  function newShift(start?: string, end?: string) {
    setEditor({
      type: "shift",
      value: {
        id: crypto.randomUUID(),
        start:
          start ??
          DateTime.fromISO(week, { zone: ZONE }).set({ hour: 9 }).toISO()!,
        end:
          end ??
          DateTime.fromISO(week, { zone: ZONE }).set({ hour: 17 }).toISO()!,
        employeeId: null,
        kind: "day",
        note: "",
        overlapReason: "",
        breaks: [],
      },
    });
  }
  if (session === "loading")
    return (
      <main className="loading" role="status">
        Opening your planner…
      </main>
    );
  if (session === "locked")
    return (
      <main className="login">
        <div className="brand-mark">k</div>
        <h1>Your week, supported.</h1>
        <p>Sign in to your Kyle workspace.</p>
        <Form
          onSubmit={async (f) => {
            await api(
              usePin ? "/unlock" : "/login",
              send(
                "POST",
                usePin
                  ? { pin: String(f.get("password")) }
                  : { password: String(f.get("password")) },
              ),
            );
            await load();
          }}
        >
          <Field label={usePin ? "PIN" : "Password"}>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              autoFocus
            />
          </Field>
          <button className="primary" type="submit">
            Open planner →
          </button>
        </Form>
        {error && <p role="alert">{error}</p>}
        {authInfo.trusted && (
          <button onClick={() => setUsePin(!usePin)}>
            {usePin ? "Use password" : "Unlock with PIN"}
          </button>
        )}
        <small>Private staff scheduling · Kyle</small>
      </main>
    );
  if (!record) return null;
  const state = record.data;
  const summary = evaluateWeek(state, week);
  const close = () => setEditor(null);
  const start = DateTime.fromISO(week, { zone: ZONE });
  const props = { state, save, close };
  return (
    <div className="app">
      <aside className="sidebar">
        <a href="#" className="brand" onClick={() => setTab("Planner")}>
          <span className="brand-mark">k</span>kyle
          <span className="brand-dot">.</span>
        </a>
        <div className="workspace-label">YOUR WORKSPACE</div>
        <nav aria-label="Main navigation">
          {[
            "Planner",
            "Support staff",
            "Coverage needs",
            "Calendars",
            "Access",
          ].map((item, i) => (
            <button
              className={tab === item ? "selected" : ""}
              key={item}
              onClick={() => setTab(item)}
            >
              <span aria-hidden>{["▦", "♧", "◷", "◈", "⌑"][i]}</span>
              {item}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="status-dot" /> Single-employer workspace
          <p>Ontario · {ZONE}</p>
          {!authInfo.privateMode && (
            <button
              onClick={async () => {
                await api("/lock", send("POST", {}));
                setUsePin(false);
                await load();
              }}
            >
              Lock workspace
            </button>
          )}
          <button
            onClick={async () => {
              await api("/logout", send("POST", {}));
              setRecord(null);
              setSession("locked");
              setAuthInfo({ trusted: false, privateMode: false });
              setUsePin(false);
            }}
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <span>
            Workspace <span className="breadcrumb">/ {tab}</span>
          </span>
          <div className="mobile-controls">
            <button
              onClick={async () => {
                await api("/lock", send("POST", {}));
                setUsePin(false);
                await load();
              }}
            >
              Lock
            </button>
          </div>
          <span className="account">
            Individual employer <span className="avatar">K</span>
          </span>
        </header>
        <section className="page-heading">
          <div>
            <p className="eyebrow">MAKE ROOM FOR WHAT MATTERS</p>
            <h1>{tab === "Planner" ? "A clearer week ahead." : tab}</h1>
            <p className="subtitle">
              {tab === "Planner"
                ? "Your support, appointments, and weekly funding — together."
                : tab === "Support staff"
                  ? "Availability, rates, and preferences for your team."
                  : tab === "Coverage needs"
                    ? "Define the support you need, before assigning a person."
                    : tab === "Access"
                      ? "Control access to your private workspace."
                      : "Bring the individual’s appointments into the weekly picture."}
            </p>
          </div>
          {tab === "Planner" && (
            <button className="primary" onClick={() => newShift()}>
              + Add shift
            </button>
          )}
        </section>
        {error && (
          <div className="banner error" role="alert">
            {error} <button onClick={() => void load()}>Reload</button>
          </div>
        )}
        {busy && (
          <div className="saving" role="status">
            Saving…
          </div>
        )}
        {tab === "Planner" && (
          <>
            <section className="metrics" aria-label="Weekly funding">
              <div>
                <span>Weekly funding</span>
                <strong>{money(summary.budgetCents)}</strong>
                <button
                  className="text-button"
                  onClick={() => setEditor({ type: "budget" })}
                >
                  Edit budget ↗
                </button>
              </div>
              <div>
                <span>Scheduled estimate</span>
                <strong>{money(summary.totalCents)}</strong>
                <small>
                  {money(summary.wagesCents)} wages +{" "}
                  {money(summary.employerCents)} employer costs
                </small>
              </div>
              <div
                className={
                  summary.remainingCents !== null && summary.remainingCents < 0
                    ? "negative"
                    : ""
                }
              >
                <span>Remaining funding</span>
                <strong>{money(summary.remainingCents)}</strong>
                <small>No automatic carryover</small>
              </div>
              <div>
                <span>Coverage to fill</span>
                <strong>
                  {summary.uncoveredHours.toFixed(1)} <em>hours</em>
                </strong>
                <small>
                  {summary.assignedHours.toFixed(1)} staff hours assigned
                </small>
              </div>
            </section>
            <div className="planning-note">
              <span>ⓘ</span>
              <div>
                <strong>
                  Planning estimates · Ontario rules await verification
                </strong>
                <p>
                  {summary.incomplete.length
                    ? summary.incomplete.join(". ")
                    : "Holiday pay and overtime are not included in the base-rate estimate. Verify applicable rules before relying on costs."}
                </p>
              </div>
            </div>
            <section className="planner-panel">
              <div className="planner-toolbar">
                <div className="week-nav">
                  <button
                    aria-label="Previous week"
                    onClick={() =>
                      setWeek(start.minus({ weeks: 1 }).toISODate()!)
                    }
                  >
                    ‹
                  </button>
                  <button
                    aria-label="Next week"
                    onClick={() =>
                      setWeek(start.plus({ weeks: 1 }).toISODate()!)
                    }
                  >
                    ›
                  </button>
                  <h2>
                    {start.toFormat("MMM d")} –{" "}
                    {start.plus({ days: 6 }).toFormat("MMM d, yyyy")}
                  </h2>
                  <button onClick={() => setWeek(weekOf())}>Today</button>
                </div>
                <div>
                  <span className="badge">
                    {publication
                      ? publication.revision === record.revision
                        ? "Published"
                        : "Unpublished changes"
                      : "Draft"}
                  </span>
                  <button onClick={() => setEditor({ type: "publish" })}>
                    Publish week
                  </button>
                </div>
              </div>
              <div className="legend">
                <span>
                  <i className="legend-shift" />
                  Staff shifts
                </span>
                <span>
                  <i className="legend-need" />
                  Coverage needs
                </span>
                <span>◈ Appointments</span>
                <small>Toronto time · select an interval to add a shift</small>
              </div>
              <Planner
                state={state}
                week={week}
                onShift={(value) => setEditor({ type: "shift", value })}
                onRange={newShift}
                save={save}
                appointments={appointments}
              />
            </section>
            <section className="below-panel">
              <h2>This week’s shifts</h2>
              {state.shifts
                .filter(
                  (s) =>
                    Date.parse(s.start) < start.plus({ weeks: 1 }).toMillis() &&
                    Date.parse(s.end) > start.toMillis(),
                )
                .sort((a, b) => a.start.localeCompare(b.start))
                .map((s) => (
                  <div className="list-row" key={s.id}>
                    <div>
                      <strong>
                        {state.employees.find((e) => e.id === s.employeeId)
                          ?.name ?? "Unassigned"}
                      </strong>
                      <p>
                        {DateTime.fromISO(s.start, { zone: ZONE }).toFormat(
                          "ccc HH:mm",
                        )}{" "}
                        –{" "}
                        {DateTime.fromISO(s.end, { zone: ZONE }).toFormat(
                          "ccc HH:mm",
                        )}{" "}
                        ·{" "}
                        {s.kind === "sleeping"
                          ? "Sleeping / on-call"
                          : "Regular support"}
                      </p>
                    </div>
                    <button
                      onClick={() => setEditor({ type: "shift", value: s })}
                    >
                      Edit shift
                    </button>
                  </div>
                ))}
            </section>
            {summary.gaps.some((g) => g.uncoveredHours > 0) && (
              <section className="below-panel">
                <h2>Needs your attention</h2>
                {summary.gaps
                  .filter((g) => g.uncoveredHours > 0)
                  .map((g) => (
                    <div className="list-row" key={g.id}>
                      <div>
                        <strong>{g.label}</strong>
                        <p>
                          {DateTime.fromISO(g.start, { zone: ZONE }).toFormat(
                            "ccc, MMM d · HH:mm",
                          )}{" "}
                          · {g.uncoveredHours.toFixed(1)} hours uncovered
                        </p>
                      </div>
                      <button onClick={() => newShift(g.start, g.end)}>
                        Create shift
                      </button>
                    </div>
                  ))}
              </section>
            )}
          </>
        )}
        {tab === "Support staff" && (
          <section className="content-panel">
            <div className="section-title">
              <h2>{state.employees.length} support staff</h2>
              <button
                className="primary"
                onClick={() =>
                  setEditor({
                    type: "employee",
                    value: {
                      id: crypto.randomUUID(),
                      name: "",
                      active: true,
                      color: "#28695e",
                      rates: [],
                      availability: [1, 2, 3, 4, 5, 6, 7].map((day) => ({
                        day,
                        start: 0,
                        end: 1440,
                      })),
                      leave: [],
                      maxWeeklyHours: null,
                      minRestHours: 0,
                      preferences: "",
                    },
                  })
                }
              >
                + Add staff
              </button>
            </div>
            {!state.employees.length && (
              <div className="empty">
                <h3>Build your support team</h3>
                <p>
                  Add an employee, their rates, and when they are available.
                </p>
              </div>
            )}
            {state.employees.map((e) => (
              <div className="list-row" key={e.id}>
                <span
                  className="avatar"
                  style={{ background: e.color, color: "white" }}
                >
                  {e.name[0]}
                </span>
                <div className="grow">
                  <strong>{e.name}</strong>
                  <p>
                    Support staff · {e.active ? "Active" : "Archived"} ·{" "}
                    {e.availability.length} availability windows
                  </p>
                  {e.preferences && <small>{e.preferences}</small>}
                </div>
                <button
                  onClick={() => setEditor({ type: "employee", value: e })}
                >
                  Edit employee
                </button>
              </div>
            ))}
          </section>
        )}
        {tab === "Coverage needs" && (
          <section className="content-panel">
            <div className="section-title">
              <h2>Recurring support</h2>
              <button
                className="primary"
                onClick={() =>
                  setEditor({
                    type: "need",
                    value: {
                      id: crypto.randomUUID(),
                      label: "Support",
                      from: week,
                      until: null,
                      days: [1, 2, 3, 4, 5],
                      start: 540,
                      end: 1020,
                      exceptions: [],
                    },
                  })
                }
              >
                + Add need
              </button>
            </div>
            {!state.needs.length && (
              <div className="empty">
                <h3>Start with the support you need</h3>
                <p>
                  Recurring needs stay visible even when a shift is unassigned.
                </p>
              </div>
            )}
            {state.needs.map((n) => (
              <div className="list-row" key={n.id}>
                <div>
                  <strong>{n.label}</strong>
                  <p>
                    {n.days
                      .map(
                        (d) =>
                          ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][
                            d - 1
                          ],
                      )
                      .join(", ")}{" "}
                    · from {n.from}
                  </p>
                </div>
                <button onClick={() => setEditor({ type: "need", value: n })}>
                  Edit need
                </button>
              </div>
            ))}
          </section>
        )}
        {tab === "Access" && <AccessSettings />}
        {tab === "Calendars" && (
          <CalendarSettings week={week} onChange={refreshWeek} />
        )}
        <footer>
          Built around your week. <span>CAD · America/Toronto</span>
        </footer>
      </main>
      {editor?.type === "shift" && (
        <ShiftEditor {...props} shift={editor.value} />
      )}{" "}
      {editor?.type === "employee" && (
        <EmployeeEditor {...props} employee={editor.value} />
      )}{" "}
      {editor?.type === "need" && <NeedEditor {...props} need={editor.value} />}
      {editor?.type === "budget" && (
        <Modal title={`Budget · week of ${week}`} onClose={close}>
          <Form
            onSubmit={async (f) => {
              const budget = {
                week,
                cents: Math.round(num(f, "amount") * 100),
                employerPercent: num(f, "percent"),
                fixedCents: Math.round(num(f, "fixed") * 100),
              };
              await save({
                ...state,
                budgets: [
                  ...state.budgets.filter((b) => b.week !== week),
                  budget,
                ],
              });
              close();
            }}
          >
            <Field label="Weekly funding (CAD)">
              <input
                name="amount"
                type="number"
                min="0"
                step="0.01"
                required
                defaultValue={(summary.budgetCents ?? 0) / 100}
              />
            </Field>
            <Field label="Employer cost (% of estimated wages)">
              <input
                name="percent"
                type="number"
                min="0"
                max="100"
                step="0.01"
                required
                defaultValue={
                  state.budgets.find((b) => b.week === week)?.employerPercent ??
                  0
                }
              />
            </Field>
            <Field label="Fixed employer costs for this week (CAD)">
              <input
                name="fixed"
                type="number"
                min="0"
                step="0.01"
                required
                defaultValue={
                  (state.budgets.find((b) => b.week === week)?.fixedCents ??
                    0) / 100
                }
              />
            </Field>
            <p className="hint">
              Applies only to this week. Fixed costs are charged once for the
              week; percentages apply to estimated wages. No carryover.
            </p>
            <button type="submit" className="primary">
              Save weekly budget
            </button>
          </Form>
        </Modal>
      )}
      {editor?.type === "publish" && (
        <Modal title="Publish this week" onClose={close}>
          <Form
            onSubmit={async (f) => {
              await api(
                "/publish",
                send("POST", {
                  week,
                  revision: record.revision,
                  acknowledge: f.has("acknowledge"),
                }),
              );
              await refreshWeek();
              close();
            }}
          >
            <p>Save a snapshot of this schedule and its cost inputs.</p>
            <p>
              <strong>
                {summary.uncoveredHours.toFixed(1)} hours uncovered
              </strong>{" "}
              · {money(summary.remainingCents)} remaining
            </p>
            <p className="hint">
              This is a planning estimate. Ontario checks, overtime, holiday
              pay, and overnight pay treatment are not verified. Publication
              does not certify compliance.
            </p>
            <label className="check">
              <input name="acknowledge" type="checkbox" required />I acknowledge
              incomplete estimates, coverage gaps, and any budget shortfall.
            </label>
            <button className="primary" type="submit">
              Publish schedule
            </button>
          </Form>
        </Modal>
      )}
    </div>
  );
}
