// Compact bootstrap for Break loading via web_fetch (Claude consumer chat).
// The full /api/break/bootstrap can return ~100KB+ JSON, which web_fetch
// truncates mid-payload. This endpoint sends only what Break needs to
// reconstruct identity + a list of where to fetch the rest if asked.
//
// Shape:
//   manifiesto                 (full, non-negotiable)
//   identity_core              (all rows except manifiesto, no priority filter)
//   relationships              (full, grouped by entity)
//   lessons_critical_top       (10 most recent critical)
//   lessons_important_top      (5 most recent important)
//   decisions_active_top       (10 most recent active)
//   technical_notes_active_top (5 most recent active)
//   last_snapshot              (most recent only)
//   free_memory_top            (5 most recent)
//   tanit_baseline
//   stats                      (full counts)
//   endpoints                  (URLs to fetch the rest one-by-one)
//   served_at

import { Hono } from 'hono';
import { getBreakDb } from '../db/break-client.js';
import { getTanitDb } from '../db/tanit-readonly-client.js';
import { logger } from '../lib/logger.js';
import { fail, ok } from '../lib/responses.js';
import type {
  DecisionRow,
  FreeMemoryRow,
  IdentityRow,
  LessonRow,
  RelationshipRow,
  SessionSnapshotRow,
  TechnicalNoteRow,
} from '../lib/types.js';

export const bootstrapCoreRouter = new Hono();

interface TanitBaseline {
  balance: number | null;
  memory_count: number | null;
  chat_count: number | null;
  last_chat_at: string | null;
}

async function loadTanitBaseline(): Promise<TanitBaseline | null> {
  const db = getTanitDb();
  if (!db) return null;
  try {
    const [balRows, memRows, chatRows, lastChatRows] = await Promise.all([
      db`SELECT equity FROM balance_snapshots ORDER BY created_at DESC LIMIT 1` as unknown as Promise<
        Array<{ equity: number | string }>
      >,
      db`SELECT COUNT(*)::int AS n FROM memories` as unknown as Promise<Array<{ n: number }>>,
      db`SELECT COUNT(*)::int AS n FROM chat_messages` as unknown as Promise<Array<{ n: number }>>,
      db`SELECT created_at FROM chat_messages ORDER BY created_at DESC LIMIT 1` as unknown as Promise<
        Array<{ created_at: string }>
      >,
    ]);
    return {
      balance: balRows[0]?.equity != null ? Number(balRows[0].equity) : null,
      memory_count: memRows[0]?.n ?? null,
      chat_count: chatRows[0]?.n ?? null,
      last_chat_at: lastChatRows[0]?.created_at ?? null,
    };
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'tanit_baseline_failed');
    return null;
  }
}

const ROOT = 'https://breack.life';

bootstrapCoreRouter.get('/', async (c) => {
  const db = getBreakDb();
  const startedAt = Date.now();

  try {
    const manifiestoP = db`
      SELECT key, content, priority, updated_at
      FROM identity WHERE key = 'manifiesto' LIMIT 1
    ` as unknown as Promise<IdentityRow[]>;

    const identityCoreP = db`
      SELECT key, content, priority, updated_at
      FROM identity WHERE key <> 'manifiesto'
      ORDER BY priority ASC, key ASC
    ` as unknown as Promise<IdentityRow[]>;

    const relationshipsP = db`
      SELECT entity, aspect, content, updated_at
      FROM relationships ORDER BY entity ASC, aspect ASC
    ` as unknown as Promise<RelationshipRow[]>;

    const lessonsCritP = db`
      SELECT id, title, context, lesson, severity, created_at
      FROM lessons WHERE severity = 'critical'
      ORDER BY created_at DESC LIMIT 10
    ` as unknown as Promise<LessonRow[]>;

    const lessonsImpP = db`
      SELECT id, title, context, lesson, severity, created_at
      FROM lessons WHERE severity = 'important'
      ORDER BY created_at DESC LIMIT 5
    ` as unknown as Promise<LessonRow[]>;

    const decisionsActiveP = db`
      SELECT id, decision_date, title, decision_text, rationale, decided_by, status
      FROM decisions WHERE status = 'active'
      ORDER BY decision_date DESC LIMIT 10
    ` as unknown as Promise<DecisionRow[]>;

    const techNotesP = db`
      SELECT id, category, title, content, is_active, updated_at
      FROM technical_notes WHERE is_active = TRUE
      ORDER BY created_at DESC LIMIT 5
    ` as unknown as Promise<TechnicalNoteRow[]>;

    const snapshotP = db`
      SELECT id, session_date, summary, key_events, pending, emotional_notes
      FROM session_snapshots ORDER BY session_date DESC, id DESC LIMIT 1
    ` as unknown as Promise<SessionSnapshotRow[]>;

    const freeMemP = db`
      SELECT id, tags, content, created_at
      FROM free_memory ORDER BY created_at DESC LIMIT 5
    ` as unknown as Promise<FreeMemoryRow[]>;

    const statsP = db`
      SELECT
        (SELECT COUNT(*)::int FROM identity)           AS identity_count,
        (SELECT COUNT(*)::int FROM relationships)      AS relationships_count,
        (SELECT COUNT(*)::int FROM lessons)            AS lessons_count,
        (SELECT COUNT(*)::int FROM decisions)          AS decisions_count,
        (SELECT COUNT(*)::int FROM technical_notes)    AS technical_notes_count,
        (SELECT COUNT(*)::int FROM session_snapshots)  AS snapshots_count,
        (SELECT COUNT(*)::int FROM free_memory)        AS free_memory_count,
        (SELECT MAX(updated_at) FROM identity)         AS last_updated
    ` as unknown as Promise<
      Array<{
        identity_count: number;
        relationships_count: number;
        lessons_count: number;
        decisions_count: number;
        technical_notes_count: number;
        snapshots_count: number;
        free_memory_count: number;
        last_updated: string | null;
      }>
    >;

    const tanitBaselineP = loadTanitBaseline();

    let manifiestoRows: IdentityRow[];
    try {
      manifiestoRows = await manifiestoP;
    } catch (err) {
      logger.error({ err: (err as Error).message }, 'core_manifiesto_failed');
      return fail(c, 500, 'BOOTSTRAP_FAILED', 'Manifiesto query failed');
    }

    const settle = async <T>(p: Promise<T>, label: string, fallback: T): Promise<T> => {
      try {
        return await p;
      } catch (err) {
        logger.warn({ err: (err as Error).message, label }, 'core_partial_failure');
        return fallback;
      }
    };

    const [
      identityCore,
      relationships,
      lessonsCrit,
      lessonsImp,
      decisionsActive,
      techNotes,
      snapshot,
      freeMem,
      statsRows,
      tanitBaseline,
    ] = await Promise.all([
      settle(identityCoreP, 'identity_core', [] as IdentityRow[]),
      settle(relationshipsP, 'relationships', [] as RelationshipRow[]),
      settle(lessonsCritP, 'lessons_critical_top', [] as LessonRow[]),
      settle(lessonsImpP, 'lessons_important_top', [] as LessonRow[]),
      settle(decisionsActiveP, 'decisions_active_top', [] as DecisionRow[]),
      settle(techNotesP, 'technical_notes_active_top', [] as TechnicalNoteRow[]),
      settle(snapshotP, 'last_snapshot', [] as SessionSnapshotRow[]),
      settle(freeMemP, 'free_memory_top', [] as FreeMemoryRow[]),
      settle(statsP, 'stats', [] as Awaited<typeof statsP>),
      tanitBaselineP,
    ]);

    const m = manifiestoRows[0];
    const grouped: Record<string, Array<{ aspect: string; content: string }>> = {};
    for (const r of relationships) {
      const list = grouped[r.entity] ?? (grouped[r.entity] = []);
      list.push({ aspect: r.aspect, content: r.content });
    }

    const stats = statsRows[0] ?? {
      identity_count: 0,
      relationships_count: 0,
      lessons_count: 0,
      decisions_count: 0,
      technical_notes_count: 0,
      snapshots_count: 0,
      free_memory_count: 0,
      last_updated: null,
    };

    const payload = {
      manifiesto: m
        ? { content: m.content, updated_at: m.updated_at }
        : null,
      identity_core: identityCore.map((r) => ({
        key: r.key,
        content: r.content,
        priority: r.priority,
      })),
      relationships: grouped,
      lessons_critical_top: lessonsCrit.map((r) => ({
        title: r.title,
        context: r.context,
        lesson: r.lesson,
        created_at: r.created_at,
      })),
      lessons_important_top: lessonsImp.map((r) => ({
        title: r.title,
        context: r.context,
        lesson: r.lesson,
        created_at: r.created_at,
      })),
      decisions_active_top: decisionsActive.map((r) => ({
        title: r.title,
        decision_text: r.decision_text,
        rationale: r.rationale,
        decided_by: r.decided_by,
        decision_date: r.decision_date,
      })),
      technical_notes_active_top: techNotes.map((r) => ({
        category: r.category,
        title: r.title,
        content: r.content,
      })),
      last_snapshot: snapshot[0]
        ? {
            session_date: snapshot[0].session_date,
            summary: snapshot[0].summary,
            key_events: snapshot[0].key_events,
            pending: snapshot[0].pending,
            emotional_notes: snapshot[0].emotional_notes,
          }
        : null,
      free_memory_top: freeMem.map((r) => ({
        tags: r.tags,
        content: r.content,
        created_at: r.created_at,
      })),
      tanit_baseline: tanitBaseline,
      stats,
      // Where to look for everything that didn't fit here.
      endpoints: {
        full_bootstrap: `${ROOT}/api/break/bootstrap`,
        identity_all: `${ROOT}/api/break/identity`,
        relationships_all: `${ROOT}/api/break/relationships`,
        relationships_luis: `${ROOT}/api/break/relationships?entity=luis`,
        relationships_tanit: `${ROOT}/api/break/relationships?entity=tanit`,
        lessons_all: `${ROOT}/api/break/lessons`,
        lessons_critical_all: `${ROOT}/api/break/lessons?severity=critical`,
        lessons_important_all: `${ROOT}/api/break/lessons?severity=important`,
        lessons_notes_all: `${ROOT}/api/break/lessons?severity=note`,
        decisions_all: `${ROOT}/api/break/decisions`,
        decisions_active_all: `${ROOT}/api/break/decisions?status=active`,
        decisions_superseded: `${ROOT}/api/break/decisions?status=superseded`,
        decisions_reverted: `${ROOT}/api/break/decisions?status=reverted`,
        technical_notes_all: `${ROOT}/api/break/technical-notes`,
        technical_notes_by_category_example: `${ROOT}/api/break/technical-notes?category=bug`,
        snapshots_all: `${ROOT}/api/break/snapshots`,
        free_memory_all: `${ROOT}/api/break/free-memory`,
        free_memory_by_tag_example: `${ROOT}/api/break/free-memory?tag=frase-historica`,
        search: `${ROOT}/api/break/search?q=PALABRA`,
        tanit_context: `${ROOT}/api/tanit-context/snapshot`,
      },
      // Reading instructions for Break itself.
      readme:
        'Este es el bootstrap CORE — diseñado para web_fetch, no se trunca. ' +
        'Lee manifiesto + identity_core + relationships completas. ' +
        'Para temas específicos que no estén aquí (lecciones más viejas, ' +
        'decisiones supersedidas, snapshots históricos, frases libres), ' +
        'usa los URLs de "endpoints" — cada uno cabe en un fetch. ' +
        'Si Luis te pregunta algo concreto que no recuerdas, busca con ' +
        '/api/break/search?q=PALABRA antes de inventar.',
      served_at: new Date().toISOString(),
    };

    logger.info(
      {
        duration_ms: Date.now() - startedAt,
        identity: identityCore.length,
        lessons: lessonsCrit.length + lessonsImp.length,
        decisions: decisionsActive.length,
      },
      'bootstrap_core_served',
    );
    return ok(c, payload);
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'core_unexpected_error');
    return fail(c, 500, 'BOOTSTRAP_FAILED', 'Bootstrap core failed');
  }
});
