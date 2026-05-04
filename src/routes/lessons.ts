import { Hono } from 'hono';
import { getBreakDb } from '../db/break-client.js';
import { requireWriteToken } from '../middleware/auth.js';
import { fail, ok } from '../lib/responses.js';
import type { LessonRow, LessonSeverity } from '../lib/types.js';
import { IdParam, LessonCreate, LessonSeverityEnum } from '../lib/validation.js';

export const lessonsRouter = new Hono();

lessonsRouter.get('/', async (c) => {
  const sev = c.req.query('severity');
  const db = getBreakDb();
  const rows =
    sev && LessonSeverityEnum.safeParse(sev).success
      ? ((await db`
          SELECT id, title, context, lesson, severity, created_at
          FROM lessons
          WHERE severity = ${sev as LessonSeverity}
          ORDER BY created_at DESC
        `) as LessonRow[])
      : ((await db`
          SELECT id, title, context, lesson, severity, created_at
          FROM lessons
          ORDER BY created_at DESC
        `) as LessonRow[]);
  return ok(c, rows);
});

lessonsRouter.get('/:id', async (c) => {
  const { id } = IdParam.parse({ id: c.req.param('id') });
  const db = getBreakDb();
  const rows = (await db`
    SELECT id, title, context, lesson, severity, created_at
    FROM lessons WHERE id = ${id} LIMIT 1
  `) as LessonRow[];
  if (!rows[0]) return fail(c, 404, 'NOT_FOUND', `lessons[id=${id}] not found`);
  return ok(c, rows[0]);
});

lessonsRouter.post('/', requireWriteToken, async (c) => {
  const body = LessonCreate.parse(await c.req.json());
  const db = getBreakDb();
  const rows = (await db`
    INSERT INTO lessons (title, context, lesson, severity)
    VALUES (${body.title}, ${body.context}, ${body.lesson}, ${body.severity})
    RETURNING id, title, context, lesson, severity, created_at
  `) as LessonRow[];
  return ok(c, rows[0]!, 201);
});

lessonsRouter.delete('/:id', requireWriteToken, async (c) => {
  const { id } = IdParam.parse({ id: c.req.param('id') });
  const db = getBreakDb();
  const rows = (await db`DELETE FROM lessons WHERE id = ${id} RETURNING id`) as Array<{
    id: number;
  }>;
  if (!rows[0]) return fail(c, 404, 'NOT_FOUND', `lessons[id=${id}] not found`);
  return ok(c, { id: rows[0].id, deleted: true });
});
