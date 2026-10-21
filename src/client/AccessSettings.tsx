import { useState } from "react";
import { api, send } from "./api";
import { Field, Form, text } from "./components";
export function AccessSettings() {
  const [message, setMessage] = useState("");
  return (
    <section className="content-panel">
      <h2>Trusted-device PIN</h2>
      <p>
        Use a 6–12 digit PIN to unlock this browser for 30 days. Your password
        is still required on new devices.
      </p>
      <Form
        onSubmit={async (f) => {
          await api(
            "/trust-device",
            send("POST", {
              password: text(f, "password"),
              pin: text(f, "pin"),
            }),
          );
          setMessage(
            "This browser is trusted for 30 days. Use Lock workspace when stepping away.",
          );
        }}
      >
        <Field label="Current password">
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </Field>
        <Field label="New PIN">
          <input
            name="pin"
            type="password"
            inputMode="numeric"
            pattern="[0-9]{6,12}"
            minLength={6}
            maxLength={12}
            autoComplete="new-password"
            required
          />
        </Field>
        <button className="primary" type="submit">
          Trust this browser
        </button>
      </Form>
      <p role="status">{message}</p>
      <h3>Revoke trusted devices</h3>
      <p className="hint">
        Require the password for future unlocks on every device. Existing
        signed-in sessions last up to 12 hours.
      </p>
      <button
        onClick={async () => {
          try {
            await api("/revoke-devices", send("POST", {}));
            setMessage("All trusted devices revoked.");
          } catch (e) {
            setMessage((e as Error).message);
          }
        }}
      >
        Revoke all trusted devices
      </button>
    </section>
  );
}
