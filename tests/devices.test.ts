import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/server/app.js";
test("PIN unlock requires a trusted device, locking revokes the session, and devices can be revoked", async () => {
  const app = await createApp({
    databaseUrl: process.env.TEST_DATABASE_URL!,
    password: "test password long enough",
    origin: "http://localhost:3000",
    secureCookies: false,
  });
  const cookies = (r: any) =>
    r.cookies.map((c: any) => `${c.name}=${c.value}`).join("; ");
  try {
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/unlock",
          payload: { pin: "123456" },
        })
      ).statusCode,
      401,
    );
    const login = await app.inject({
      method: "POST",
      url: "/api/login",
      payload: { password: "test password long enough" },
    });
    const session = cookies(login);
    const trust = await app.inject({
      method: "POST",
      url: "/api/trust-device",
      headers: { cookie: session },
      payload: { password: "test password long enough", pin: "123456" },
    });
    assert.equal(trust.statusCode, 200);
    const device = cookies(trust);
    await app.inject({
      method: "POST",
      url: "/api/lock",
      headers: { cookie: session },
    });
    assert.equal(
      (await app.inject({ url: "/api/state", headers: { cookie: session } }))
        .statusCode,
      401,
    );
    const unlock = await app.inject({
      method: "POST",
      url: "/api/unlock",
      headers: { cookie: device },
      payload: { pin: "123456" },
    });
    assert.equal(unlock.statusCode, 200);
    await app.inject({
      method: "POST",
      url: "/api/revoke-devices",
      headers: { cookie: cookies(unlock) },
    });
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/unlock",
          headers: { cookie: device },
          payload: { pin: "123456" },
        })
      ).statusCode,
      401,
    );
  } finally {
    await app.close();
  }
});
