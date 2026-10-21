import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import { stateSchema, weekOf, type State } from "../shared/schema.js";
import { evaluateWeek, validateState } from "../shared/planning.js";
export async function registerPlanner(app: FastifyInstance, pool: Pool) {
  app.get("/api/state", async () => {
    const { rows } = await pool.query(
      "SELECT revision,data FROM app_state WHERE id=1",
    );
    return rows[0];
  });
  app.put("/api/state", async (req, reply) => {
    const body = z
      .object({ revision: z.number().int().min(0), data: stateSchema })
      .parse(req.body);
    const errors = validateState(body.data);
    if (errors.length)
      return reply.code(422).send({ error: errors.join("; ") });
    const { rows } = await pool.query(
      "UPDATE app_state SET data=$1,revision=revision+1 WHERE id=1 AND revision=$2 RETURNING revision,data",
      [body.data, body.revision],
    );
    if (!rows.length)
      return reply.code(409).send({
        error: "Another window changed the schedule. Reload before saving.",
      });
    return rows[0];
  });
  app.get("/api/week", async (req) => {
    const { week } = z.object({ week: z.string().date() }).parse(req.query);
    const { rows } = await pool.query(
      "SELECT revision,data FROM app_state WHERE id=1",
    );
    const publication = await pool.query(
      "SELECT revision,published_at,snapshot FROM publications WHERE week=$1",
      [weekOf(week)],
    );
    return {
      ...evaluateWeek(rows[0].data, weekOf(week)),
      publication: publication.rows[0] ?? null,
      revision: rows[0].revision,
    };
  });
  app.post("/api/publish", async (req, reply) => {
    const { week, revision, acknowledge } = z
      .object({
        week: z.string().date(),
        revision: z.number().int(),
        acknowledge: z.boolean(),
      })
      .parse(req.body);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        "SELECT revision,data FROM app_state WHERE id=1 FOR UPDATE",
      );
      if (rows[0].revision !== revision) {
        await client.query("ROLLBACK");
        return reply
          .code(409)
          .send({ error: "Schedule changed. Reload before publishing." });
      }
      const data = rows[0].data as State;
      const summary = evaluateWeek(data, weekOf(week));
      const errors = validateState(data);
      if (errors.length) {
        await client.query("ROLLBACK");
        return reply.code(422).send({ error: errors.join("; ") });
      }
      if (!acknowledge) {
        await client.query("ROLLBACK");
        return reply.code(422).send({
          error:
            "Acknowledge the planning estimate, unresolved Ontario checks, coverage gaps, and any budget shortfall before publication.",
        });
      }
      await client.query(
        "INSERT INTO publications(week,revision,snapshot) VALUES($1,$2,$3) ON CONFLICT(week) DO UPDATE SET revision=excluded.revision,snapshot=excluded.snapshot,published_at=now()",
        [weekOf(week), revision, { data, summary }],
      );
      await client.query("COMMIT");
      return { ok: true };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });
}
