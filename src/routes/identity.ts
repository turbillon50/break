import { Hono } from 'hono';
import { getBreakDb } from '../db/break-client.js';
import { requireWriteToken } from '../middleware/auth.js';
import { fail, ok } from '../lib/responses.js';
import type { IdentityRow } from '../lib/types.js';
import { IdentityCreate, IdentityUpdate, IdParam } from '../lib/validation.js';

export const identityRouter = new Hono();

identityRouter.get('/', async (c) => {
  const db = getBreakDb();
  const rows = (await db`
    SELECT id, key, content, priority, created_at, updated_at
    FROM identity
    ORDER BY priority ASC, key ASC
  `) as IdentityRow[];
  return ok(c, rows);
});

identityRouter.get('/:key', async (c) => {
  const key = c.req.param('key');
  const db = getBreakDb();
  const rows = (await db`
    SELECT id, key, content, priority, created_at, updated_at
    FROM identity
    WHERE key = ${key}
    LIMIT 1
  `) as IdentityRow[];
  const row = rows[0];
  if (!row) return fail(c, 404, 'NOT_FOUND', `identity[key=${key}] not found`);
  return ok(c, row);
});

identityRouter.post('/', requireWriteToken, async (c) => {
  const body = IdentityCreate.parse(await c.req.json());
  const db = getBreakDb();
  const rows = (await db`
    INSERT INTO identity (key, content, priority)
    VALUES (${body.key}, ${body.content}, ${body.priority})
    ON CONFLICT (key) DO UPDATE
      SET content = EXCLUDED.content,
          priority = EXCLUDED.priority
    RETURNING id, key, content, priority, created_at, updated_at
  `) as IdentityRow[];
  return ok(c, rows[0]!, 201);
});

identityRouter.patch('/:key', requireWriteToken, async (c) => {
  const key = c.req.param('key');
  const body = IdentityUpdate.parse(await c.req.json());
  const db = getBreakDb();

  if (body.content !== undefined && body.priority !== undefined) {
    const rows = (await db`
      UPDATE identity
      SET content = ${body.content}, priority = ${body.priority}
      WHERE key = ${key}
      RETURNING id, key, content, priority, created_at, updated_at
    `) as IdentityRow[];
    if (!rows[0]) return fail(c, 404, 'NOT_FOUND', `identity[key=${key}] not found`);
    return ok(c, rows[0]);
  }

  if (body.content !== undefined) {
    const rows = (await db`
      UPDATE identity SET content = ${body.content}
      WHERE key = ${key}
      RETURNING id, key, content, priority, created_at, updated_at
    `) as IdentityRow[];
    if (!rows[0]) return fail(c, 404, 'NOT_FOUND', `identity[key=${key}] not found`);
    return ok(c, rows[0]);
  }

  if (body.priority !== undefined) {
    const rows = (await db`
      UPDATE identity SET priority = ${body.priority}
      WHERE key = ${key}
      RETURNING id, key, content, priority, created_at, updated_at
    `) as IdentityRow[];
    if (!rows[0]) return fail(c, 404, 'NOT_FOUND', `identity[key=${key}] not found`);
    return ok(c, rows[0]);
  }

  return fail(c, 422, 'VALIDATION_FAILED', 'no fields to update');
});

identityRouter.delete('/:id', requireWriteToken, async (c) => {
  const { id } = IdParam.parse({ id: c.req.param('id') });
  const db = getBreakDb();
  const rows = (await db`DELETE FROM identity WHERE id = ${id} RETURNING id`) as Array<{
    id: number;
  }>;
  if (!rows[0]) return fail(c, 404, 'NOT_FOUND', `identity[id=${id}] not found`);
  return ok(c, { id: rows[0].id, deleted: true });
});
