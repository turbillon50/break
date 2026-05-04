import { Hono } from 'hono';
import { getBreakDb } from '../db/break-client.js';
import { requireWriteToken } from '../middleware/auth.js';
import { fail, ok } from '../lib/responses.js';
import type { SessionSnapshotRow } from '../lib/types.js';
import { IdParam, SnapshotCreate } from '../lib/validation.js';

export const snapshotsRouter = new Hono();

snapshotsRouter.get('/', async (c) => {
  const limit = Math.min(Number(c.req.query('limit') ?? 20), 100);
  const db = getBreakDb();
  const rows = (await db`
    SELECT id, session_date, summary, key_events, pending, emotional_notes, created_at
    FROM session_snapshots
    ORDER BY session_date DESC, id DESC
    LIMIT ${limit}
  `) as SessionSnapshotRow[];
  return ok(c, rows);
});

snapshotsRouter.get('/:id', async (c) => {
  const { id } = IdParam.parse({ id: c.req.param('id') });
  const db = getBreakDb();
  const rows = (await db`
    SELECT id, session_date, summary, key_events, pending, emotional_notes, created_at
    FROM session_snapshots WHERE id = ${id} LIMIT 1
  `) as SessionSnapshotRow[];
  if (!rows[0]) return fail(c, 404, 'NOT_FOUND', `session_snapshots[id=${id}] not found`);
  return ok(c, rows[0]);
});

snapshotsRouter.post('/', requireWriteToken, async (c) => {
  const body = SnapshotCreate.parse(await c.req.json());
  const db = getBreakDb();
  const rows = (await db`
    INSERT INTO session_snapshots (session_date, summary, key_events, pending, emotional_notes)
    VALUES (
      ${body.session_date},
      ${body.summary},
      ${body.key_events ?? null},
      ${body.pending ?? null},
      ${body.emotional_notes ?? null}
    )
    RETURNING id, session_date, summary, key_events, pending, emotional_notes, created_at
  `) as SessionSnapshotRow[];
  return ok(c, rows[0]!, 201);
});

snapshotsRouter.delete('/:id', requireWriteToken, async (c) => {
  const { id } = IdParam.parse({ id: c.req.param('id') });
  const db = getBreakDb();
  const rows = (await db`DELETE FROM session_snapshots WHERE id = ${id} RETURNING id`) as Array<{
    id: number;
  }>;
  if (!rows[0]) return fail(c, 404, 'NOT_FOUND', `session_snapshots[id=${id}] not found`);
  return ok(c, { id: rows[0].id, deleted: true });
});
