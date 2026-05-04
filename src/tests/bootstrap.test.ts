import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the Break DB client to return predictable empty results so we can
// exercise the bootstrap shape without a real Postgres.
vi.mock('../db/break-client.js', () => {
  type FakeRows = unknown[];
  const empty: FakeRows = [];
  const stats: FakeRows = [
    {
      identity_count: 0,
      relationships_count: 0,
      lessons_count: 0,
      decisions_count: 0,
      technical_notes_count: 0,
      snapshots_count: 0,
      free_memory_count: 0,
      last_updated: null,
    },
  ];
  const fakeDb = (strings: TemplateStringsArray): Promise<FakeRows> => {
    const sql = strings.join('?');
    if (sql.includes('FROM identity') && sql.includes('manifiesto')) return Promise.resolve(empty);
    if (sql.includes('FROM identity') && sql.includes('priority BETWEEN'))
      return Promise.resolve(empty);
    if (sql.includes('FROM relationships')) return Promise.resolve(empty);
    if (sql.includes("severity = 'critical'")) return Promise.resolve(empty);
    if (sql.includes("severity = 'important'")) return Promise.resolve(empty);
    if (sql.includes('FROM decisions')) return Promise.resolve(empty);
    if (sql.includes('FROM technical_notes')) return Promise.resolve(empty);
    if (sql.includes('FROM session_snapshots')) return Promise.resolve(empty);
    if (sql.includes('identity_count')) return Promise.resolve(stats);
    return Promise.resolve(empty);
  };
  return { getBreakDb: () => fakeDb };
});

vi.mock('../db/tanit-readonly-client.js', () => ({
  getTanitDb: () => null,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/break/bootstrap', () => {
  it('returns the full shape with empty arrays on a blank DB', async () => {
    const { createApp } = await import('../server.js');
    const app = createApp();
    const res = await app.request('/api/break/bootstrap');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: true;
      data: {
        manifiesto: unknown;
        identity_core: unknown[];
        relationships: Record<string, unknown[]>;
        lessons_critical: unknown[];
        lessons_important: unknown[];
        decisions_active: unknown[];
        technical_notes_active: unknown[];
        last_snapshots: unknown[];
        tanit_baseline: unknown;
        stats: { identity_count: number };
        served_at: string;
      };
    };
    expect(body.ok).toBe(true);
    expect(body.data.manifiesto).toBeNull();
    expect(Array.isArray(body.data.identity_core)).toBe(true);
    expect(body.data.identity_core.length).toBe(0);
    expect(typeof body.data.relationships).toBe('object');
    expect(Array.isArray(body.data.lessons_critical)).toBe(true);
    expect(Array.isArray(body.data.lessons_important)).toBe(true);
    expect(Array.isArray(body.data.decisions_active)).toBe(true);
    expect(Array.isArray(body.data.technical_notes_active)).toBe(true);
    expect(Array.isArray(body.data.last_snapshots)).toBe(true);
    expect(body.data.tanit_baseline).toBeNull();
    expect(body.data.stats.identity_count).toBe(0);
    expect(typeof body.data.served_at).toBe('string');
  });
});
