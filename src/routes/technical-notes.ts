import { Hono } from 'hono';
import { getBreakDb } from '../db/break-client.js';
import { requireWriteToken } from '../middleware/auth.js';
import { fail, ok } from '../lib/responses.js';
import type { TechnicalNoteRow } from '../lib/types.js';
import { IdParam, TechnicalNoteCreate, TechnicalNoteUpdate } from '../lib/validation.js';

export const technicalNotesRouter = new Hono();

technicalNotesRouter.get('/', async (c) => {
  const category = c.req.query('category');
  const activeOnly = c.req.query('active') !== 'false';
  const db = getBreakDb();

  let rows: TechnicalNoteRow[];
  if (category && activeOnly) {
    rows = (await db`
      SELECT id, category, title, content, is_active, created_at, updated_at
      FROM technical_notes
      WHERE category = ${category} AND is_active = TRUE
      ORDER BY created_at DESC
    `) as TechnicalNoteRow[];
  } else if (category) {
    rows = (await db`
      SELECT id, category, title, content, is_active, created_at, updated_at
      FROM technical_notes
      WHERE category = ${category}
      ORDER BY created_at DESC
    `) as TechnicalNoteRow[];
  } else if (activeOnly) {
    rows = (await db`
      SELECT id, category, title, content, is_active, created_at, updated_at
      FROM technical_notes
      WHERE is_active = TRUE
      ORDER BY category ASC, created_at DESC
    `) as TechnicalNoteRow[];
  } else {
    rows = (await db`
      SELECT id, category, title, content, is_active, created_at, updated_at
      FROM technical_notes
      ORDER BY category ASC, created_at DESC
    `) as TechnicalNoteRow[];
  }
  return ok(c, rows);
});

technicalNotesRouter.get('/:id', async (c) => {
  const { id } = IdParam.parse({ id: c.req.param('id') });
  const db = getBreakDb();
  const rows = (await db`
    SELECT id, category, title, content, is_active, created_at, updated_at
    FROM technical_notes WHERE id = ${id} LIMIT 1
  `) as TechnicalNoteRow[];
  if (!rows[0]) return fail(c, 404, 'NOT_FOUND', `technical_notes[id=${id}] not found`);
  return ok(c, rows[0]);
});

technicalNotesRouter.post('/', requireWriteToken, async (c) => {
  const body = TechnicalNoteCreate.parse(await c.req.json());
  const db = getBreakDb();
  const rows = (await db`
    INSERT INTO technical_notes (category, title, content, is_active)
    VALUES (${body.category}, ${body.title}, ${body.content}, ${body.is_active})
    RETURNING id, category, title, content, is_active, created_at, updated_at
  `) as TechnicalNoteRow[];
  return ok(c, rows[0]!, 201);
});

technicalNotesRouter.patch('/:id', requireWriteToken, async (c) => {
  const { id } = IdParam.parse({ id: c.req.param('id') });
  const body = TechnicalNoteUpdate.parse(await c.req.json());
  const db = getBreakDb();
  const rows = (await db`
    UPDATE technical_notes SET
      category = COALESCE(${body.category ?? null}, category),
      title = COALESCE(${body.title ?? null}, title),
      content = COALESCE(${body.content ?? null}, content),
      is_active = COALESCE(${body.is_active ?? null}, is_active)
    WHERE id = ${id}
    RETURNING id, category, title, content, is_active, created_at, updated_at
  `) as TechnicalNoteRow[];
  if (!rows[0]) return fail(c, 404, 'NOT_FOUND', `technical_notes[id=${id}] not found`);
  return ok(c, rows[0]);
});

technicalNotesRouter.delete('/:id', requireWriteToken, async (c) => {
  const { id } = IdParam.parse({ id: c.req.param('id') });
  const db = getBreakDb();
  const rows = (await db`DELETE FROM technical_notes WHERE id = ${id} RETURNING id`) as Array<{
    id: number;
  }>;
  if (!rows[0]) return fail(c, 404, 'NOT_FOUND', `technical_notes[id=${id}] not found`);
  return ok(c, { id: rows[0].id, deleted: true });
});
