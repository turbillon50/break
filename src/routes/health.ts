import { Hono } from 'hono';
import { VERSION } from '../config.js';
import { ok } from '../lib/responses.js';

export const healthRouter = new Hono();

healthRouter.get('/', (c) => {
  return ok(c, {
    ok: true,
    ts: new Date().toISOString(),
    version: VERSION,
  });
});
