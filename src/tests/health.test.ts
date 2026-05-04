import { describe, expect, it } from 'vitest';
import { createApp } from '../server.js';

describe('GET /health', () => {
  it('returns 200 with ok=true, ts, version', async () => {
    const app = createApp();
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; data: { ok: boolean; ts: string; version: string } };
    expect(body.ok).toBe(true);
    expect(body.data.ok).toBe(true);
    expect(typeof body.data.ts).toBe('string');
    expect(new Date(body.data.ts).toString()).not.toBe('Invalid Date');
    expect(body.data.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
