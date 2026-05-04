import { Hono } from 'hono';
import { getBreakDb } from '../db/break-client.js';
import { requireWriteToken } from '../middleware/auth.js';
import { fail, ok } from '../lib/responses.js';
import type { DecisionRow, DecisionStatus } from '../lib/types.js';
import { DecisionCreate, DecisionStatusEnum, DecisionUpdate, IdParam } from '../lib/validation.js';

export const decisionsRouter = new Hono();

decisionsRouter.get('/', async (c) => {
  const status = c.req.query('status');
  const db = getBreakDb();
  const rows =
    status && DecisionStatusEnum.safeParse(status).success
      ? ((await db`
          SELECT id, decision_date, title, decision_text, rationale, decided_by, status, created_at
          FROM decisions
          WHERE status = ${status as DecisionStatus}
          ORDER BY decision_date DESC, id DESC
        `) as DecisionRow[])
      : ((await db`
          SELECT id, decision_date, title, decision_text, rationale, decided_by, status, created_at
          FROM decisions
          ORDER BY decision_date DESC, id DESC
        `) as DecisionRow[]);
  return ok(c, rows);
});

decisionsRouter.get('/:id', async (c) => {
  const { id } = IdParam.parse({ id: c.req.param('id') });
  const db = getBreakDb();
  const rows = (await db`
    SELECT id, decision_date, title, decision_text, rationale, decided_by, status, created_at
    FROM decisions WHERE id = ${id} LIMIT 1
  `) as DecisionRow[];
  if (!rows[0]) return fail(c, 404, 'NOT_FOUND', `decisions[id=${id}] not found`);
  return ok(c, rows[0]);
});

decisionsRouter.post('/', requireWriteToken, async (c) => {
  const body = DecisionCreate.parse(await c.req.json());
  const db = getBreakDb();
  const rows = body.decision_date
    ? ((await db`
        INSERT INTO decisions (title, decision_text, rationale, decided_by, status, decision_date)
        VALUES (${body.title}, ${body.decision_text}, ${body.rationale}, ${body.decided_by}, ${body.status}, ${body.decision_date})
        RETURNING id, decision_date, title, decision_text, rationale, decided_by, status, created_at
      `) as DecisionRow[])
    : ((await db`
        INSERT INTO decisions (title, decision_text, rationale, decided_by, status)
        VALUES (${body.title}, ${body.decision_text}, ${body.rationale}, ${body.decided_by}, ${body.status})
        RETURNING id, decision_date, title, decision_text, rationale, decided_by, status, created_at
      `) as DecisionRow[]);
  return ok(c, rows[0]!, 201);
});

decisionsRouter.patch('/:id', requireWriteToken, async (c) => {
  const { id } = IdParam.parse({ id: c.req.param('id') });
  const body = DecisionUpdate.parse(await c.req.json());
  const db = getBreakDb();
  const rows = (await db`
    UPDATE decisions SET
      status = COALESCE(${body.status ?? null}, status),
      decision_text = COALESCE(${body.decision_text ?? null}, decision_text),
      rationale = COALESCE(${body.rationale ?? null}, rationale)
    WHERE id = ${id}
    RETURNING id, decision_date, title, decision_text, rationale, decided_by, status, created_at
  `) as DecisionRow[];
  if (!rows[0]) return fail(c, 404, 'NOT_FOUND', `decisions[id=${id}] not found`);
  return ok(c, rows[0]);
});

decisionsRouter.delete('/:id', requireWriteToken, async (c) => {
  const { id } = IdParam.parse({ id: c.req.param('id') });
  const db = getBreakDb();
  const rows = (await db`DELETE FROM decisions WHERE id = ${id} RETURNING id`) as Array<{
    id: number;
  }>;
  if (!rows[0]) return fail(c, 404, 'NOT_FOUND', `decisions[id=${id}] not found`);
  return ok(c, { id: rows[0].id, deleted: true });
});
