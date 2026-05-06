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
  severity: string;
  created_at: string;
}

interface DecisionItem {
  id: number;
  decision_date: string;
  title: string;
  decision_text: string;
  rationale: string;
  decided_by: string;
  status: string;
}

interface TechnicalNoteItem {
  id: number;
  category: string;
  title: string;
  content: string;
  is_active: boolean;
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

interface FreeMemoryItem {
  id: number;
  tags: string | null;
  content: string;
  created_at: string;
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
    // Manifiesto separately so it's the only critical query.
    const manifiestoP = db`
      SELECT key, content, priority, updated_at
      FROM identity
      WHERE key = 'manifiesto'
      LIMIT 1
    ` as unknown as Promise<IdentityRow[]>;

    // Everything else is "TODO" — no severity / status / is_active filters,
    // no LIMIT clauses. Break gets the full DB on every cold start.
    const identityCoreP = db`
      SELECT key, content, priority, updated_at
      FROM identity
      WHERE key <> 'manifiesto'
      ORDER BY priority ASC, key ASC
    ` as unknown as Promise<IdentityRow[]>;

    const relationshipsP = db`
      SELECT entity, aspect, content, updated_at
      FROM relationships
      ORDER BY entity ASC, aspect ASC
    ` as unknown as Promise<RelationshipRow[]>;

    const lessonsAllP = db`
      SELECT id, title, context, lesson, severity, created_at
      FROM lessons
      ORDER BY
        CASE severity
          WHEN 'critical' THEN 0
          WHEN 'important' THEN 1
          WHEN 'note' THEN 2
          ELSE 3
        END,
        created_at DESC
    ` as unknown as Promise<LessonRow[]>;

    const decisionsAllP = db`
      SELECT id, decision_date, title, decision_text, rationale, decided_by, status
      FROM decisions
      ORDER BY
        CASE status
          WHEN 'active' THEN 0
          WHEN 'superseded' THEN 1
          WHEN 'reverted' THEN 2
          ELSE 3
        END,
        decision_date DESC
    ` as unknown as Promise<DecisionRow[]>;

    const techNotesAllP = db`
      SELECT id, category, title, content, is_active, updated_at
      FROM technical_notes
      ORDER BY is_active DESC, category ASC, created_at DESC
    ` as unknown as Promise<TechnicalNoteRow[]>;

    const snapshotsAllP = db`
      SELECT id, session_date, summary, key_events, pending, emotional_notes
      FROM session_snapshots
      ORDER BY session_date DESC, id DESC
    ` as unknown as Promise<SessionSnapshotRow[]>;

    const freeMemoryAllP = db`
      SELECT id, tags, content, created_at
      FROM free_memory
      ORDER BY created_at DESC
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
      logger.error({ err: (err as Error).message }, 'manifiesto_query_failed');
      return fail(c, 500, 'BOOTSTRAP_FAILED', 'Manifiesto query failed', {
        reason: (err as Error).message,
      });
    }

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
      lessonsAll,
      decisionsAll,
      techNotesAll,
      snapshotsAll,
      freeMemoryAll,
      statsRows,
      tanitBaseline,
    ] = await Promise.all([
      settle(identityCoreP, 'identity_core', [] as IdentityRow[]),
      settle(relationshipsP, 'relationships', [] as RelationshipRow[]),
      settle(lessonsAllP, 'lessons_all', [] as LessonRow[]),
      settle(decisionsAllP, 'decisions_all', [] as DecisionRow[]),
      settle(techNotesAllP, 'technical_notes_all', [] as TechnicalNoteRow[]),
      settle(snapshotsAllP, 'snapshots_all', [] as SessionSnapshotRow[]),
      settle(freeMemoryAllP, 'free_memory_all', [] as FreeMemoryRow[]),
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

    // Buckets kept for backwards compatibility with the existing frontend
    // (lessons_critical / lessons_important / decisions_active / etc.) —
    // they all source from the same all-rows queries above, no extra DB hits.
    const lessonsByName = (sev: string): LessonItem[] =>
      lessonsAll
        .filter((r) => r.severity === sev)
        .map<LessonItem>((r) => ({
          id: r.id,
          title: r.title,
          context: r.context,
          lesson: r.lesson,
          severity: r.severity,
          created_at: r.created_at,
        }));

    const decisionsByStatus = (st: string): DecisionItem[] =>
      decisionsAll
        .filter((r) => r.status === st)
        .map<DecisionItem>((r) => ({
          id: r.id,
          decision_date: r.decision_date,
          title: r.title,
          decision_text: r.decision_text,
          rationale: r.rationale,
          decided_by: r.decided_by,
          status: r.status,
        }));

    const techNotesByActive = (active: boolean): TechnicalNoteItem[] =>
      techNotesAll
        .filter((r) => r.is_active === active)
        .map<TechnicalNoteItem>((r) => ({
          id: r.id,
          category: r.category,
          title: r.title,
          content: r.content,
          is_active: r.is_active,
          updated_at: r.updated_at,
        }));

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
      // Identity: all rows except manifiesto (manifiesto sits at top level).
      identity_core: identityCore.map<IdentityCoreItem>((r) => ({
        key: r.key,
        content: r.content,
        priority: r.priority,
        updated_at: r.updated_at,
      })),
      relationships: grouped,
      // Backwards-compat buckets — same data, sliced by category.
      lessons_critical: lessonsByName('critical'),
      lessons_important: lessonsByName('important'),
      lessons_notes: lessonsByName('note'),
      lessons_all: lessonsAll.map<LessonItem>((r) => ({
        id: r.id,
        title: r.title,
        context: r.context,
        lesson: r.lesson,
        severity: r.severity,
        created_at: r.created_at,
      })),
      decisions_active: decisionsByStatus('active'),
      decisions_superseded: decisionsByStatus('superseded'),
      decisions_reverted: decisionsByStatus('reverted'),
      decisions_all: decisionsAll.map<DecisionItem>((r) => ({
        id: r.id,
        decision_date: r.decision_date,
        title: r.title,
        decision_text: r.decision_text,
        rationale: r.rationale,
        decided_by: r.decided_by,
        status: r.status,
      })),
      technical_notes_active: techNotesByActive(true),
      technical_notes_archived: techNotesByActive(false),
      technical_notes_all: techNotesAll.map<TechnicalNoteItem>((r) => ({
        id: r.id,
        category: r.category,
        title: r.title,
        content: r.content,
        is_active: r.is_active,
        updated_at: r.updated_at,
      })),
      // last_snapshots kept as alias of snapshots_all for old clients that
      // expected a small array; both now contain every snapshot.
      last_snapshots: snapshotsAll.map<SnapshotItem>((r) => ({
        id: r.id,
        session_date: r.session_date,
        summary: r.summary,
        key_events: r.key_events,
        pending: r.pending,
        emotional_notes: r.emotional_notes,
      })),
      snapshots_all: snapshotsAll.map<SnapshotItem>((r) => ({
        id: r.id,
        session_date: r.session_date,
        summary: r.summary,
        key_events: r.key_events,
        pending: r.pending,
        emotional_notes: r.emotional_notes,
      })),
      free_memory: freeMemoryAll.map<FreeMemoryItem>((r) => ({
        id: r.id,
        tags: r.tags,
        content: r.content,
        created_at: r.created_at,
      })),
      tanit_baseline: tanitBaseline,
      stats,
      served_at: new Date().toISOString(),
    };

    logger.info(
      {
        duration_ms: Date.now() - startedAt,
        identity: identityCore.length,
        lessons: lessonsAll.length,
        decisions: decisionsAll.length,
        notes: techNotesAll.length,
        snapshots: snapshotsAll.length,
        free_memory: freeMemoryAll.length,
      },
      'bootstrap_served',
    );
    return ok(c, payload);
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'bootstrap_unexpected_error');
    return fail(c, 500, 'BOOTSTRAP_FAILED', 'Bootstrap failed unexpectedly');
  }
});
