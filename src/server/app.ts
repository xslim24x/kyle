import Fastify from "fastify";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import staticFiles from "@fastify/static";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { z } from "zod";
import { openDatabase } from "./db.js";
import { registerDevices } from "./devices.js";
import { registerCalendars } from "./calendars.js";
import { registerPlanner } from "./planner.js";
import { digest, hashPassword, token, verifyPassword } from "./auth.js";
export interface Config {
  databaseUrl: string;
  password?: string;
  origin: string;
  secureCookies: boolean;
  encryptionKey?: string;
  googleId?: string;
  googleSecret?: string;
  privateMode?: boolean;
}
export async function createApp(config: Config) {
  const pool = await openDatabase(config.databaseUrl);
  const owner = await pool.query("SELECT id FROM owner WHERE id=1");
  if (!owner.rowCount) {
    if (!config.password || config.password.length < 12) {
      await pool.end();
      throw new Error(
        "Set APP_PASSWORD to at least 12 characters for first startup.",
      );
    }
    await pool.query("INSERT INTO owner VALUES(1,$1) ON CONFLICT DO NOTHING", [
      hashPassword(config.password),
    ]);
  }
  const app = Fastify({ logger: false, bodyLimit: 2 * 1024 * 1024 });
  await app.register(cookie);
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'"],
        imgSrc: ["'self'", "data:"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: config.secureCookies ? [] : null,
      },
    },
  });
  await app.register(rateLimit, { global: false });
  app.addHook("onClose", async () => {
    await pool.end();
  });
  app.addHook("onRequest", async (req, reply) => {
    if (!req.url.startsWith("/api/")) return;
    reply.header("Cache-Control", "no-store");
    if (!["GET", "HEAD"].includes(req.method)) {
      if (req.headers.origin && req.headers.origin !== config.origin)
        return reply.code(403).send({ error: "Origin not allowed" });
      if (req.headers["sec-fetch-site"] === "cross-site")
        return reply.code(403).send({ error: "Cross-site request blocked" });
    }
    if (
      [
        "/api/login",
        "/api/health",
        "/api/google/callback",
        "/api/unlock",
        "/api/auth-info",
      ].includes(req.url.split("?")[0])
    )
      return;
    if (config.privateMode) return;
    const result = await pool.query(
      "SELECT 1 FROM sessions WHERE token_hash=$1 AND expires>now()",
      [digest(req.cookies.session ?? "")],
    );
    if (!result.rowCount)
      return reply.code(401).send({ error: "Please sign in" });
  });
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof z.ZodError)
      return reply.code(400).send({
        error: err.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      });
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    reply.code(status).send({
      error: status === 500 ? "Server request failed" : (err as Error).message,
    });
  });
  app.get("/api/health", async () => {
    await pool.query("SELECT 1");
    return { ok: true };
  });
  app.post(
    "/api/login",
    { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (req, reply) => {
      const { password } = z
        .object({ password: z.string().max(256) })
        .parse(req.body);
      const { rows } = await pool.query(
        "SELECT password_hash FROM owner WHERE id=1",
      );
      if (!verifyPassword(password, rows[0].password_hash))
        return reply.code(401).send({ error: "Incorrect password" });
      const session = token();
      await pool.query("DELETE FROM sessions WHERE expires<=now()");
      await pool.query(
        "INSERT INTO sessions VALUES($1,now()+interval '12 hours')",
        [digest(session)],
      );
      reply.setCookie("session", session, {
        httpOnly: true,
        sameSite: "strict",
        secure: config.secureCookies,
        path: "/",
        maxAge: 43200,
      });
      return { ok: true };
    },
  );
  app.post("/api/logout", async (req, reply) => {
    await pool.query("DELETE FROM sessions WHERE token_hash=$1", [
      digest(req.cookies.session ?? ""),
    ]);
    await pool.query("DELETE FROM trusted_devices WHERE token_hash=$1", [
      digest(req.cookies.device ?? ""),
    ]);
    reply.clearCookie("session", { path: "/" });
    reply.clearCookie("device", { path: "/" });
    return { ok: true };
  });
  await registerDevices(app, pool, config.secureCookies, !!config.privateMode);
  await registerPlanner(app, pool);
  await registerCalendars(app, pool, config);
  if (existsSync(resolve("dist/index.html"))) {
    await app.register(staticFiles, { root: resolve("dist") });
    app.setNotFoundHandler((req, reply) =>
      req.url.startsWith("/api/")
        ? reply.code(404).send({ error: "Not found" })
        : reply.sendFile("index.html"),
    );
  }
  return app;
}
