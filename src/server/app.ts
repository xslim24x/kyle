import Fastify from "fastify";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import staticFiles from "@fastify/static";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { z } from "zod";
import { openDatabase } from "./db.js";
import { registerCalendars } from "./calendars.js";
import { registerPlanner } from "./planner.js";
export interface Config {
  databaseUrl: string;
  origin: string;
  encryptionKey?: string;
  googleId?: string;
  googleSecret?: string;
}
export async function createApp(config: Config) {
  const pool = await openDatabase(config.databaseUrl);
  const app = Fastify({ logger: false, bodyLimit: 2 * 1024 * 1024 });
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
        upgradeInsecureRequests: config.origin.startsWith("https://")
          ? []
          : null,
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
