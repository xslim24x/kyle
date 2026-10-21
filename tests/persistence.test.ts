import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/server/app.js";
test("optimistic saves prevent lost updates and published snapshots survive edits and restart", async () => {
  const config = {
    databaseUrl: process.env.TEST_DATABASE_URL!,
    password: "test password long enough",
    origin: "http://localhost:3000",
    secureCookies: false,
  };
  let app = await createApp(config);
  try {
    const login = await app.inject({
      method: "POST",
      url: "/api/login",
      payload: { password: config.password },
    });
    const cookie = login.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const headers = { cookie };
    const current = (await app.inject({ url: "/api/state", headers })).json();
    const data = {
      ...current.data,
      budgets: [
        {
          week: "2026-10-19",
          cents: 50000,
          employerPercent: 15,
          fixedCents: 0,
        },
      ],
    };
    const save = () =>
      app.inject({
        method: "PUT",
        url: "/api/state",
        headers,
        payload: { revision: current.revision, data },
      });
    const results = await Promise.all([save(), save()]);
    assert.deepEqual(results.map((r) => r.statusCode).sort(), [200, 409]);
    const revision = current.revision + 1;
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/publish",
          headers,
          payload: { week: "2026-10-19", revision, acknowledge: false },
        })
      ).statusCode,
      422,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/publish",
          headers,
          payload: { week: "2026-10-19", revision, acknowledge: true },
        })
      ).statusCode,
      200,
    );
    data.budgets[0].cents = 60000;
    await app.inject({
      method: "PUT",
      url: "/api/state",
      headers,
      payload: { revision, data },
    });
    await app.close();
    app = await createApp(config);
    const week = (
      await app.inject({ url: "/api/week?week=2026-10-19", headers })
    ).json();
    assert.equal(week.budgetCents, 60000);
    assert.equal(week.publication.snapshot.summary.budgetCents, 50000);
    assert.equal(week.publication.revision, revision);
  } finally {
    await app.close();
  }
});
