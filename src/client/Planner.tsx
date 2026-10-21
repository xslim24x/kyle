import { useRef, useEffect } from "react";
import FullCalendar, { type CalendarRef } from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import interactionPlugin from "@fullcalendar/react/interaction";
import classicTheme from "@fullcalendar/react/themes/classic";
import "@fullcalendar/react/skeleton.css";
import "@fullcalendar/react/themes/classic/theme.css";
import "@fullcalendar/react/themes/classic/palette.css";
import { ZONE, type State, type Shift } from "../shared/schema";
import { expandNeeds } from "../shared/planning";
export interface Appointment {
  id: string;
  calendarId: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  color: string;
}
export function Planner({
  state,
  week,
  onShift,
  onRange,
  save,
  appointments,
}: {
  state: State;
  week: string;
  onShift: (s: Shift) => void;
  onRange: (start: string, end: string) => void;
  save: (s: State) => Promise<void>;
  appointments: Appointment[];
}) {
  const ref = useRef<CalendarRef>(null);
  useEffect(() => {
    ref.current?.getApi().gotoDate(week);
  }, [week]);
  const events = [
    ...state.shifts.map((s) => ({
      id: s.id,
      title:
        state.employees.find((e) => e.id === s.employeeId)?.name ??
        "Unassigned",
      start: s.start,
      end: s.end,
      color:
        state.employees.find((e) => e.id === s.employeeId)?.color ?? "#9a6623",
      extendedProps: { type: "shift", sleeping: s.kind === "sleeping" },
    })),
    ...expandNeeds(state.needs, week).map((n) => ({
      id: n.id,
      title: n.label,
      start: n.start,
      end: n.end,
      display: "background",
      color: "#bdd9cb",
      editable: false,
      extendedProps: { type: "need" },
    })),
    ...appointments.map((a) => ({
      ...a,
      id: `appointment:${a.id}`,
      color: a.color,
      editable: false,
      extendedProps: { type: "appointment" },
    })),
  ];
  async function change(info: any) {
    const shift = state.shifts.find((s) => s.id === info.event.id);
    if (!shift) return;
    const start = info.event.start.toISOString(),
      end = info.event.end.toISOString();
    const delta = Date.parse(start) - Date.parse(shift.start);
    try {
      await save({
        ...state,
        shifts: state.shifts.map((s) =>
          s.id === shift.id
            ? {
                ...s,
                start,
                end,
                breaks: s.breaks.map((b) => ({
                  ...b,
                  start: new Date(Date.parse(b.start) + delta).toISOString(),
                  end: new Date(Date.parse(b.end) + delta).toISOString(),
                })),
              }
            : s,
        ),
      });
    } catch (e) {
      info.revert();
      alert((e as Error).message);
    }
  }
  return (
    <div className="calendar-wrap">
      <FullCalendar
        class="fc"
        toolbarClass="fc-toolbar"
        buttonClass="fc-button"
        dayHeaderInnerClass="fc-col-header-cell-cushion"
        slotLaneClass="fc-timegrid-slot"
        columnEventClass="fc-timegrid-event"
        ref={ref}
        plugins={[timeGridPlugin, interactionPlugin, classicTheme]}
        initialView="timeGridWeek"
        initialDate={week}
        timeZone={ZONE}
        firstDay={1}
        headerToolbar={{
          left: "",
          center: "",
          right: "timeGridWeek,timeGridDay",
        }}
        height="auto"
        allDaySlot
        slotMinTime="00:00:00"
        slotMaxTime="24:00:00"
        slotDuration="01:00:00"
        scrollTime="07:00:00"
        nowIndicator
        selectable
        editable
        eventResizableFromStart
        events={events}
        select={(i) => onRange(i.startStr, i.endStr)}
        eventClick={(i) => {
          const s = state.shifts.find((s) => s.id === i.event.id);
          if (s) onShift(s);
          else if (i.event.extendedProps.type === "appointment")
            alert(
              `${i.event.title}\n${i.event.start?.toLocaleString("en-CA", { timeZone: ZONE })}\nRead-only appointment`,
            );
        }}
        eventDrop={change}
        eventResize={change}
        eventContent={(i) => (
          <div className="event-content">
            <small>{i.timeText}</small>
            <strong>
              {i.event.extendedProps.type === "appointment" ? "◈ " : ""}
              {i.event.title}
            </strong>
            {i.event.extendedProps.sleeping && (
              <small>Sleeping / on-call</small>
            )}
          </div>
        )}
      />
    </div>
  );
}
