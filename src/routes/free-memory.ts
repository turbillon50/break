import { Hono } from 'hono';
import { getBreakDb } from '../db/break-client.js';
import { requireWriteToken } from '../middleware/auth.js';
import { fail, ok } from '../lib/responses.js';
import type { FreeMemoryRow } from '../lib/types.js';
import { FreeMemoryCreate, IdParam } from '../lib/validation.js';

export const freeMemoryRouter = new Hono();

freeMemoryRouter.get('/', async (c) => {
  const tag = c.req.query('tag');
  const limit = Math.min(Number(c.req.query('limit') ?? 50), 200);
  const db = getBreakDb();
  const rows = tag
    ? ((await db`
        SELECT id, tags, content, created_at FROM free_memory
        WHERE tags ILIKE ${'%' + tag + '%'}
        ORDER BY created_at DESC LIMIT ${limit}
      `) as FreeMemoryRow[])
    : ((await db`
        SELECT id, tags, content, created_at FROM free_memory
        ORDER BY created_at DESC LIMIT ${limit}
      `) as FreeMemoryRow[]);
  return ok(c, rows);
});

freeMemoryRouter.get('/:id', async (c) => {
  const { id } = IdParam.parse({ id: c.req.param('id') });
  const db = getBreakDb();
  const rows = (await db`
    SELECT id, tags, content, created_at FROM free_memory WHERE id = ${id} LIMIT 1
  `) as FreeMemoryRow[];
  if (!rows[0]) return fail(c, 404, 'NOT_FOUND', `free_memory[id=${id}] not found`);
  return ok(c, rows[0]);
});

freeMemoryRouter.post('/', requireWriteToken, async (c) => {
  const body = FreeMemoryCreate.parse(await c.req.json());
  const db = getBreakDb();
  const rows = (await db`
    INSERT INTO free_memory (tags, content)
    VALUES (${body.tags ?? null}, ${body.content})
    RETURNING id, tags, content, created_at
  `) as FreeMemoryRow[];
  return ok(c, rows[0]!, 201);
});

freeMemoryRouter.delete('/:id', requireWriteToken, async (c) => {
  const { id } = IdParam.parse({ id: c.req.param('id') });
  const db = getBreakDb();
  const rows = (await db`DELETE FROM free_memory WHERE id = ${id} RETURNING id`) as Array<{
    id: number;
  }>;
  if (!rows[0]) return fail(c, 404, 'NOT_FOUND', `free_memory[id=${id}] not found`);
  return ok(c, { id: rows[0].id, deleted: true });
});
