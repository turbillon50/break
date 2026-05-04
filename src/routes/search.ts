import { Hono } from 'hono';
import { getBreakDb } from '../db/break-client.js';
import { ok } from '../lib/responses.js';
import { SearchQuery } from '../lib/validation.js';

export const searchRouter = new Hono();

interface Hit {
  table: string;
  id: number;
  title: string;
  excerpt: string;
}

searchRouter.get('/', async (c) => {
  const { q, limit } = SearchQuery.parse({
    q: c.req.query('q'),
    limit: c.req.query('limit'),
  });
  const db = getBreakDb();
  const pattern = `%${q}%`;

  const [identityHits, relHits, lessonsHits, decisionsHits, notesHits, freeHits] =
    await Promise.all([
      db`
        SELECT 'identity' AS table, id, key AS title,
               LEFT(content, 240) AS excerpt
        FROM identity
        WHERE key ILIKE ${pattern} OR content ILIKE ${pattern}
        ORDER BY priority ASC LIMIT ${limit}
      `,
      db`
        SELECT 'relationships' AS table, id,
               (entity || '/' || aspect) AS title,
               LEFT(content, 240) AS excerpt
        FROM relationships
        WHERE entity ILIKE ${pattern} OR aspect ILIKE ${pattern} OR content ILIKE ${pattern}
        ORDER BY entity, aspect LIMIT ${limit}
      `,
      db`
        SELECT 'lessons' AS table, id, title,
               LEFT(lesson, 240) AS excerpt
        FROM lessons
        WHERE title ILIKE ${pattern} OR context ILIKE ${pattern} OR lesson ILIKE ${pattern}
        ORDER BY created_at DESC LIMIT ${limit}
      `,
      db`
        SELECT 'decisions' AS table, id, title,
               LEFT(decision_text, 240) AS excerpt
        FROM decisions
        WHERE title ILIKE ${pattern} OR decision_text ILIKE ${pattern} OR rationale ILIKE ${pattern}
        ORDER BY decision_date DESC LIMIT ${limit}
      `,
      db`
        SELECT 'technical_notes' AS table, id, title,
               LEFT(content, 240) AS excerpt
        FROM technical_notes
        WHERE title ILIKE ${pattern} OR content ILIKE ${pattern} OR category ILIKE ${pattern}
        ORDER BY created_at DESC LIMIT ${limit}
      `,
      db`
        SELECT 'free_memory' AS table, id,
               COALESCE(tags, '(no tags)') AS title,
               LEFT(content, 240) AS excerpt
        FROM free_memory
        WHERE content ILIKE ${pattern} OR tags ILIKE ${pattern}
        ORDER BY created_at DESC LIMIT ${limit}
      `,
    ]);

  const all = [
    ...(identityHits as Hit[]),
    ...(relHits as Hit[]),
    ...(lessonsHits as Hit[]),
    ...(decisionsHits as Hit[]),
    ...(notesHits as Hit[]),
    ...(freeHits as Hit[]),
  ];

  return ok(c, { query: q, count: all.length, hits: all });
});
