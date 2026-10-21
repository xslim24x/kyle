import { useEffect, useState } from "react";
import { api, send } from "./api";
import { Field, Form, text } from "./components";
export function CalendarSettings({
  week,
  onChange,
}: {
  week: string;
  onChange: () => Promise<void>;
}) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [google, setGoogle] = useState<{ id: string; name: string }[]>([]),
    [exportUrl, setExportUrl] = useState("");
  const load = async () => setData(await api("/calendars"));
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, []);
  async function action(work: () => Promise<any>) {
    try {
      setError("");
      await work();
      await onChange();
      await load();
    } catch (e) {
      setError((e as Error).message);
      await load();
    }
  }
  if (!data) return <p role="status">Loading calendars…</p>;
  return (
    <section className="content-panel">
      <div className="section-title">
        <h2>Your calendars</h2>
        <button
          disabled={!data.googleConfigured}
          onClick={() =>
            void action(async () => {
              const { url } = await api("/google/connect");
              window.location.assign(url);
            })
          }
        >
          {data.googleConnected ? "Reconnect Google" : "Connect Google"}
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!data.configured && (
        <p className="planning-note">
          Calendar connections need CALENDAR_ENCRYPTION_KEY in the server
          configuration.
        </p>
      )}
      {!data.googleConfigured && (
        <p className="hint">
          Google OAuth credentials are not configured. Subscription feeds can
          still be used when encryption is configured.
        </p>
      )}
      <p className="hint">
        Refresh to retrieve appointments around the selected week ({week}).
        Imports are read-only. Uncheck a calendar to hide it.
      </p>
      {data.calendars.map((c: any) => (
        <div className="list-row" key={c.id}>
          <label className="check grow">
            <input
              type="checkbox"
              checked={c.enabled}
              onChange={(v) =>
                void action(() =>
                  api(
                    `/calendars/${c.id}`,
                    send("PATCH", { enabled: v.target.checked }),
                  ),
                )
              }
            />
            <span>
              <strong>{c.name}</strong>
              <small className="block">
                {c.last_sync
                  ? `Last refreshed ${new Date(c.last_sync).toLocaleString()}`
                  : "Not refreshed yet"}
              </small>
              {c.error && <small className="error block">{c.error}</small>}
            </span>
          </label>
          <button
            onClick={() =>
              void action(() =>
                api(`/calendars/${c.id}/sync`, send("POST", { week })),
              )
            }
          >
            Refresh
          </button>
          <button
            className="danger"
            onClick={() => {
              if (confirm("Remove this calendar and its cached appointments?"))
                void action(() =>
                  api(`/calendars/${c.id}`, { method: "DELETE" }),
                );
            }}
          >
            Remove
          </button>
        </div>
      ))}
      <h3>Add subscription feed</h3>
      <Form
        onSubmit={async (f) => {
          const result = await api(
            "/calendars",
            send("POST", {
              name: text(f, "name"),
              url: text(f, "url"),
              color: text(f, "color"),
            }),
          );
          await load();
          await action(() =>
            api(`/calendars/${result.id}/sync`, send("POST", { week })),
          );
        }}
      >
        <div className="row">
          <Field label="Calendar name">
            <input name="name" required maxLength={100} />
          </Field>
          <Field label="Colour">
            <input name="color" type="color" defaultValue="#876340" />
          </Field>
        </div>
        <Field label="Private HTTPS iCalendar subscription URL">
          <input
            name="url"
            type="url"
            required
            placeholder="https://…"
            autoComplete="off"
          />
        </Field>
        <button type="submit" disabled={!data.configured}>
          Add calendar
        </button>
      </Form>
      {data.googleConnected && (
        <>
          <h3>Google calendars</h3>
          <button
            onClick={() =>
              void action(async () => setGoogle(await api("/google/list")))
            }
          >
            Choose Google calendars
          </button>
          {google.map((c) => (
            <div className="list-row" key={c.id}>
              <span>{c.name}</span>
              <button
                onClick={() =>
                  void action(async () => {
                    const result = await api(
                      "/calendars",
                      send("POST", {
                        name: c.name,
                        color: "#876340",
                        googleCalendarId: c.id,
                      }),
                    );
                    await api(
                      `/calendars/${result.id}/sync`,
                      send("POST", { week }),
                    );
                  })
                }
              >
                Add to planner
              </button>
            </div>
          ))}
          <button
            onClick={() =>
              void action(() => api("/google/connection", { method: "DELETE" }))
            }
          >
            Disconnect Google
          </button>
        </>
      )}
      <hr />
      <h3>Published shift subscription</h3>
      <p className="hint">
        Exports published shifts only. Anyone with the private URL can read it.
        Generating a new URL revokes the previous one.
      </p>
      <div className="row">
        <button
          onClick={() =>
            void action(async () =>
              setExportUrl((await api("/export-token", send("POST", {}))).url),
            )
          }
        >
          Generate private URL
        </button>
        <button
          onClick={() =>
            void action(async () => {
              await api("/export-token", { method: "DELETE" });
              setExportUrl("");
            })
          }
        >
          Revoke export access
        </button>
      </div>
      {exportUrl && (
        <Field label="Private shift subscription URL">
          <input
            readOnly
            value={exportUrl}
            onFocus={(e) => e.target.select()}
          />
        </Field>
      )}
    </section>
  );
}
