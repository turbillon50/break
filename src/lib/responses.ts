import type { Context } from 'hono';
import type { ApiError, ApiSuccess } from './types.js';

export function ok<T>(c: Context, data: T, status: 200 | 201 = 200) {
  const body: ApiSuccess<T> = { ok: true, data };
  return c.json(body, status);
}

export function fail(
  c: Context,
  status: 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500 | 502 | 503,
  code: string,
  message: string,
  details?: Record<string, unknown>,
) {
  const body: ApiError = {
    ok: false,
    error: details ? { code, message, details } : { code, message },
  };
  return c.json(body, status);
}
