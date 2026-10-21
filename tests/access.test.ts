import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/server/app.js";

const config = {
  databaseUrl: process.env.TEST_DATABASE_URL!,
  origin: "http://localhost:3000",
};

test("planner and calendar APIs open directly without passwords or session cookies", async () => {
  const app = await createApp(config);
  try {
    for (const url of [
      "/api/state",
      "/api/week?week=2026-10-19",
      "/api/calendars",
      "/api/appointments?week=2026-10-19",
    ]) {
      const response = await app.inject(url);
      assert.equal(response.statusCode, 200, url);
      assert.equal(response.headers["set-cookie"], undefined);
    }
    const response = await app.inject({
      url: "/api/state",
      headers: { cookie: "session=obsolete; device=obsolete" },
    });
    assert.equal(response.statusCode, 200);
    for (const [method, url] of [
      ["POST", "/api/login"],
      ["POST", "/api/logout"],
      ["POST", "/api/lock"],
      ["POST", "/api/unlock"],
      ["GET", "/api/auth-info"],
      ["POST", "/api/trust-device"],
      ["POST", "/api/revoke-devices"],
    ] as const) {
      assert.equal((await app.inject({ method, url })).statusCode, 404, url);
    }
  } finally {
    await app.close();
  }
});

test("same-origin writes remain available while cross-site writes are rejected", async () => {
  const app = await createApp(config);
  try {
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/export-token",
          headers: { origin: config.origin },
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/export-token",
          headers: { origin: "https://other.example" },
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/export-token",
          headers: { "sec-fetch-site": "cross-site" },
        })
      ).statusCode,
      403,
    );
  } finally {
    await app.close();
  }
});
