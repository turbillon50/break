import type { ErrorHandler } from 'hono';
import { ZodError } from 'zod';
import { logger } from '../lib/logger.js';
import { fail } from '../lib/responses.js';

export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof ZodError) {
    return fail(c, 422, 'VALIDATION_FAILED', 'Request payload failed validation', {
      issues: err.issues,
    });
  }
  logger.error({ err: { message: err.message, stack: err.stack } }, 'unhandled error');
  return fail(c, 500, 'INTERNAL_ERROR', 'Internal server error');
};
