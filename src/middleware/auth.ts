import { timingSafeEqual } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';
import { loadConfig } from '../config.js';
import { fail } from '../lib/responses.js';

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export const requireWriteToken: MiddlewareHandler = async (c, next) => {
  const cfg = loadConfig();
  const presented = c.req.header('x-break-token') ?? '';
  if (!presented) {
    return fail(c, 401, 'AUTH_MISSING_TOKEN', 'X-Break-Token header is required');
  }
  if (!safeEqual(presented, cfg.BREAK_WRITE_TOKEN)) {
    return fail(c, 401, 'AUTH_INVALID_TOKEN', 'X-Break-Token does not match');
  }
  await next();
};
