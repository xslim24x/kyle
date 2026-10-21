import pg from "pg";
import { emptyState } from "../shared/schema.js";
export async function migrate(pool: pg.Pool, sql: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(705911)");
    await client.query(sql);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
export async function openDatabase(url: string) {
  const pool = new pg.Pool({ connectionString: url, max: 5 });
  await migrate(
    pool,
    `CREATE TABLE IF NOT EXISTS app_state (id integer PRIMARY KEY CHECK(id=1), revision integer NOT NULL DEFAULT 0, data jsonb NOT NULL);
 CREATE TABLE IF NOT EXISTS publications (week date PRIMARY KEY, revision integer NOT NULL, snapshot jsonb NOT NULL, published_at timestamptz NOT NULL DEFAULT now());`,
  );
  await pool.query(
    "INSERT INTO app_state(id,data) VALUES(1,$1) ON CONFLICT DO NOTHING",
    [emptyState],
  );
  return pool;
}
