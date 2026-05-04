import { Hono } from 'hono';
import { getBreakDb } from '../db/break-client.js';
import { getTanitDb } from '../db/tanit-readonly-client.js';
import { logger } from '../lib/logger.js';
import { fail, ok } from '../lib/responses.js';
import type {
  DecisionRow,
  IdentityRow,
  LessonRow,
  RelationshipRow,
  SessionSnapshotRow,
  TechnicalNoteRow,
} from '../lib/types.js';

export const bootstrapRouter = new Hono();

interface ManifiestoSection {
  key: string;
  content: string;
  priority: number;
  updated_at: string;
}

interface IdentityCoreItem {
  key: string;
  content: string;
  priority: number;
  updated_at: string;
}

interface RelationshipItem {
  aspect: string;
  content: string;
  updated_at: string;
}

interface LessonItem {
  id: number;
  title: string;
  context: string;
  lesson: string;
  created_at: string;
}

interface DecisionItem {
  id: number;
  decision_date: string;
  title: string;
  decision_text: string;
  rationale: string;
  decided_by: string;
}

interface TechnicalNoteItem {
  id: number;
  category: string;
  title: string;
  content: string;
  updated_at: string;
}

interface SnapshotItem {
  id: number;
  session_date: string;
  summary: string;
  key_events: string | null;
  pending: string | null;
  emotional_notes: string | null;
}

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

bootstrapRouter.get('/', async (c) => {
  const db = getBreakDb();
  const startedAt = Date.now();

  try {
    const manifiestoP = db`
      SELECT key, content, priority, updated_at
      FROM identity
      WHERE key = 'manifiesto'
      LIMIT 1
    ` as unknown as Promise<IdentityRow[]>;

    const identityCoreP = db`
      SELECT key, content, priority, updated_at
      FROM identity
      WHERE priority BETWEEN 1 AND 2
      ORDER BY priority ASC, key ASC
    ` as unknown as Promise<IdentityRow[]>;

    const relationshipsP = db`
      SELECT entity, aspect, content, updated_at
      FROM relationships
      ORDER BY entity ASC, aspect ASC
    ` as unknown as Promise<RelationshipRow[]>;

    const lessonsCriticalP = db`
      SELECT id, title, context, lesson, created_at
      FROM lessons
      WHERE severity = 'critical'
      ORDER BY created_at DESC
    ` as unknown as Promise<LessonRow[]>;

    const lessonsImportantP = db`
      SELECT id, title, context, lesson, created_at
      FROM lessons
      WHERE severity = 'important'
      ORDER BY created_at DESC
      LIMIT 10
    ` as unknown as Promise<LessonRow[]>;

    const decisionsActiveP = db`
      SELECT id, decision_date, title, decision_text, rationale, decided_by
      FROM decisions
      WHERE status = 'active'
      ORDER BY decision_date DESC
      LIMIT 20
    ` as unknown as Promise<DecisionRow[]>;

    const techNotesP = db`
      SELECT id, category, title, content, updated_at
      FROM technical_notes
      WHERE is_active = TRUE
      ORDER BY category ASC, created_at DESC
    ` as unknown as Promise<TechnicalNoteRow[]>;

    const snapshotsP = db`
      SELECT id, session_date, summary, key_events, pending, emotional_notes
      FROM session_snapshots
      ORDER BY session_date DESC, id DESC
      LIMIT 3
    ` as unknown as Promise<SessionSnapshotRow[]>;

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

    // Manifiesto query is the only one whose failure aborts bootstrap.
    let manifiestoRows: IdentityRow[];
    try {
      manifiestoRows = await manifiestoP;
    } catch (err) {
      logger.error({ err: (err as Error).message }, 'manifiesto_query_failed');
      return fail(c, 500, 'BOOTSTRAP_FAILED', 'Manifiesto query failed', {
        reason: (err as Error).message,
      });
    }

    // Other queries are tolerant: failure → empty result, log a warning.
    const settle = async <T>(p: Promise<T>, label: string, fallback: T): Promise<T> => {
      try {
        return await p;
      } catch (err) {
        logger.warn({ err: (err as Error).message, label }, 'bootstrap_partial_failure');
        return fallback;
      }
    };

    const [
      identityCore,
      relationships,
      lessonsCritical,
      lessonsImportant,
      decisionsActive,
      techNotes,
      snapshots,
      statsRows,
      tanitBaseline,
    ] = await Promise.all([
      settle(identityCoreP, 'identity_core', [] as IdentityRow[]),
      settle(relationshipsP, 'relationships', [] as RelationshipRow[]),
      settle(lessonsCriticalP, 'lessons_critical', [] as LessonRow[]),
      settle(lessonsImportantP, 'lessons_important', [] as LessonRow[]),
      settle(decisionsActiveP, 'decisions_active', [] as DecisionRow[]),
      settle(techNotesP, 'technical_notes_active', [] as TechnicalNoteRow[]),
      settle(snapshotsP, 'last_snapshots', [] as SessionSnapshotRow[]),
      settle(statsP, 'stats', [] as Awaited<typeof statsP>),
      tanitBaselineP,
    ]);

    const m = manifiestoRows[0];
    const manifiesto: ManifiestoSection | null = m
      ? { key: m.key, content: m.content, priority: m.priority, updated_at: m.updated_at }
      : null;

    const grouped: Record<string, RelationshipItem[]> = {};
    for (const r of relationships) {
      const list = grouped[r.entity] ?? (grouped[r.entity] = []);
      list.push({ aspect: r.aspect, content: r.content, updated_at: r.updated_at });
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
      manifiesto,
      identity_core: identityCore.map<IdentityCoreItem>((r) => ({
        key: r.key,
        content: r.content,
        priority: r.priority,
        updated_at: r.updated_at,
      })),
      relationships: grouped,
      lessons_critical: lessonsCritical.map<LessonItem>((r) => ({
        id: r.id,
        title: r.title,
        context: r.context,
        lesson: r.lesson,
        created_at: r.created_at,
      })),
      lessons_important: lessonsImportant.map<LessonItem>((r) => ({
        id: r.id,
        title: r.title,
        context: r.context,
        lesson: r.lesson,
        created_at: r.created_at,
      })),
      decisions_active: decisionsActive.map<DecisionItem>((r) => ({
        id: r.id,
        decision_date: r.decision_date,
        title: r.title,
        decision_text: r.decision_text,
        rationale: r.rationale,
        decided_by: r.decided_by,
      })),
      technical_notes_active: techNotes.map<TechnicalNoteItem>((r) => ({
        id: r.id,
        category: r.category,
        title: r.title,
        content: r.content,
        updated_at: r.updated_at,
      })),
      last_snapshots: snapshots.map<SnapshotItem>((r) => ({
        id: r.id,
        session_date: r.session_date,
        summary: r.summary,
        key_events: r.key_events,
        pending: r.pending,
        emotional_notes: r.emotional_notes,
      })),
      tanit_baseline: tanitBaseline,
      stats,
      served_at: new Date().toISOString(),
    };

    logger.info({ duration_ms: Date.now() - startedAt }, 'bootstrap_served');
    return ok(c, payload);
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'bootstrap_unexpected_error');
    return fail(c, 500, 'BOOTSTRAP_FAILED', 'Bootstrap failed unexpectedly');
  }
});
