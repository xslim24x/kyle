import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/server/app.js";

test("private data requires login, bad credentials fail, logout revokes the session", async () => {
  const app = await createApp({
    databaseUrl: process.env.TEST_DATABASE_URL!,
    password: "test password long enough",
    origin: "http://localhost:3000",
    secureCookies: false,
  });
  try {
    assert.equal((await app.inject("/api/state")).statusCode, 401);
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/login",
          payload: { password: "wrong" },
        })
      ).statusCode,
      401,
    );
    const login = await app.inject({
      method: "POST",
      url: "/api/login",
      payload: { password: "test password long enough" },
    });
    assert.equal(login.statusCode, 200);
    const cookie = login.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    assert.equal(
      (await app.inject({ url: "/api/state", headers: { cookie } })).statusCode,
      200,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/logout",
          headers: { cookie, origin: "https://evil.example" },
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/logout",
          headers: { cookie },
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (await app.inject({ url: "/api/state", headers: { cookie } })).statusCode,
      401,
    );
    for (let i = 0; i < 10; i++)
      await app.inject({
        method: "POST",
        url: "/api/login",
        payload: { password: "wrong" },
      });
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/login",
          payload: { password: "wrong" },
        })
      ).statusCode,
      429,
    );
  } finally {
    await app.close();
  }
});
