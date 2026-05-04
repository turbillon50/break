import type { MiddlewareHandler } from 'hono';
import { fail } from '../lib/responses.js';

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
let lastSweepAt = 0;
const SWEEP_INTERVAL_MS = 60_000;

export interface RateLimitOptions {
  windowMs: number;
  max: number;
}

function clientKey(c: Parameters<MiddlewareHandler>[0]): string {
  const fwd = c.req.header('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim();
  const real = c.req.header('x-real-ip');
  if (real) return real;
  return 'unknown';
}

// Inline sweep instead of setInterval — setInterval can keep serverless
// functions alive past return even with .unref(), causing timeouts.
function sweepIfDue(now: number): void {
  if (now - lastSweepAt < SWEEP_INTERVAL_MS) return;
  lastSweepAt = now;
  for (const [k, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(k);
  }
}

export function rateLimit(opts: RateLimitOptions): MiddlewareHandler {
  return async (c, next) => {
    const now = Date.now();
    sweepIfDue(now);
    const key = `${c.req.method}:${c.req.path}:${clientKey(c)}`;
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
      await next();
      return;
    }

    if (bucket.count >= opts.max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      c.header('Retry-After', String(retryAfter));
      return fail(c, 429, 'RATE_LIMITED', 'Too many requests', {
        retry_after_seconds: retryAfter,
      });
    }

    bucket.count += 1;
    await next();
  };
}
