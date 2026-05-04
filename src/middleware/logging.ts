import type { MiddlewareHandler } from 'hono';
import { logger } from '../lib/logger.js';

export const requestLogging: MiddlewareHandler = async (c, next) => {
  const started = Date.now();
  await next();
  const duration_ms = Date.now() - started;
  logger.info(
    {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      duration_ms,
    },
    'request',
  );
};
