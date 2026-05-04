import { describe, expect, it } from 'vitest';
import { createApp } from '../server.js';

describe('write auth on POST /api/break/identity', () => {
  it('rejects missing token with 401', async () => {
    const app = createApp();
    const res = await app.request('/api/break/identity', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: 'foo', content: 'bar', priority: 5 }),
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { ok: false; error: { code: string } };
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('AUTH_MISSING_TOKEN');
  });

  it('rejects wrong token with 401', async () => {
    const app = createApp();
    const res = await app.request('/api/break/identity', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-break-token': 'wrong-token-value-x-x-x-x' },
      body: JSON.stringify({ key: 'foo', content: 'bar', priority: 5 }),
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { ok: false; error: { code: string } };
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('AUTH_INVALID_TOKEN');
  });

  it('GET /api/break/identity does NOT require token (public read)', async () => {
    // We can't fully assert 200 because there's no real DB; just assert it
    // doesn't 401. With a fake URL, the Neon client throws on connect, which
    // surfaces as 500 via errorHandler — that proves auth let it through.
    const app = createApp();
    const res = await app.request('/api/break/identity');
    expect(res.status).not.toBe(401);
  });
});
