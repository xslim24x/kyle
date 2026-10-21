import { openDatabase } from "../src/server/db.js";
import { hashPassword } from "../src/server/auth.js";
const password = process.env.NEW_APP_PASSWORD;
if (!password || password.length < 12)
  throw new Error(
    "Supply NEW_APP_PASSWORD with at least 12 characters through the environment.",
  );
const pool = await openDatabase(process.env.DATABASE_URL!);
const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query("UPDATE owner SET password_hash=$1 WHERE id=1", [
    hashPassword(password),
  ]);
  await client.query("DELETE FROM sessions");
  await client.query("DELETE FROM trusted_devices");
  await client.query("COMMIT");
  console.log("Password changed; all sessions revoked.");
} catch (e) {
  await client.query("ROLLBACK");
  throw e;
} finally {
  client.release();
  await pool.end();
}
