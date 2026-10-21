import { createApp } from "./app.js";
const origin = process.env.APP_ORIGIN ?? "http://localhost:5173";
const app = await createApp({
  databaseUrl:
    process.env.DATABASE_URL ?? "postgres://postgres@127.0.0.1:55432/kyle",
  encryptionKey: process.env.CALENDAR_ENCRYPTION_KEY,
  googleId: process.env.GOOGLE_CLIENT_ID,
  googleSecret: process.env.GOOGLE_CLIENT_SECRET,
  origin,
});
await app.listen({ host: "0.0.0.0", port: Number(process.env.PORT ?? 3000) });
console.log("Kyle server listening");
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    await app.close();
    process.exit(0);
  });
