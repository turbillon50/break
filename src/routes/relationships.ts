import { Hono } from 'hono';
import { getBreakDb } from '../db/break-client.js';
import { requireWriteToken } from '../middleware/auth.js';
import { fail, ok } from '../lib/responses.js';
import type { RelationshipRow } from '../lib/types.js';
import { IdParam, RelationshipCreate, RelationshipUpdate } from '../lib/validation.js';

export const relationshipsRouter = new Hono();

relationshipsRouter.get('/', async (c) => {
  const entity = c.req.query('entity');
  const db = getBreakDb();
  const rows = entity
    ? ((await db`
        SELECT id, entity, aspect, content, created_at, updated_at
        FROM relationships
        WHERE entity = ${entity}
        ORDER BY aspect ASC
      `) as RelationshipRow[])
    : ((await db`
        SELECT id, entity, aspect, content, created_at, updated_at
        FROM relationships
        ORDER BY entity ASC, aspect ASC
      `) as RelationshipRow[]);
  return ok(c, rows);
});

relationshipsRouter.get('/:entity/:aspect', async (c) => {
  const entity = c.req.param('entity');
  const aspect = c.req.param('aspect');
  const db = getBreakDb();
  const rows = (await db`
    SELECT id, entity, aspect, content, created_at, updated_at
    FROM relationships
    WHERE entity = ${entity} AND aspect = ${aspect}
    LIMIT 1
  `) as RelationshipRow[];
  if (!rows[0]) return fail(c, 404, 'NOT_FOUND', 'relationship not found');
  return ok(c, rows[0]);
});

relationshipsRouter.post('/', requireWriteToken, async (c) => {
  const body = RelationshipCreate.parse(await c.req.json());
  const db = getBreakDb();
  const rows = (await db`
    INSERT INTO relationships (entity, aspect, content)
    VALUES (${body.entity}, ${body.aspect}, ${body.content})
    ON CONFLICT (entity, aspect) DO UPDATE
      SET content = EXCLUDED.content
    RETURNING id, entity, aspect, content, created_at, updated_at
  `) as RelationshipRow[];
  return ok(c, rows[0]!, 201);
});

relationshipsRouter.patch('/:entity/:aspect', requireWriteToken, async (c) => {
  const entity = c.req.param('entity');
  const aspect = c.req.param('aspect');
  const body = RelationshipUpdate.parse(await c.req.json());
  const db = getBreakDb();
  const rows = (await db`
    UPDATE relationships SET content = ${body.content}
    WHERE entity = ${entity} AND aspect = ${aspect}
    RETURNING id, entity, aspect, content, created_at, updated_at
  `) as RelationshipRow[];
  if (!rows[0]) return fail(c, 404, 'NOT_FOUND', 'relationship not found');
  return ok(c, rows[0]);
});

relationshipsRouter.delete('/:id', requireWriteToken, async (c) => {
  const { id } = IdParam.parse({ id: c.req.param('id') });
  const db = getBreakDb();
  const rows = (await db`DELETE FROM relationships WHERE id = ${id} RETURNING id`) as Array<{
    id: number;
  }>;
  if (!rows[0]) return fail(c, 404, 'NOT_FOUND', `relationships[id=${id}] not found`);
  return ok(c, { id: rows[0].id, deleted: true });
});
