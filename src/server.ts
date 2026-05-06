import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { errorHandler } from './middleware/error-handler.js';
import { requestLogging } from './middleware/logging.js';
import { rateLimit } from './middleware/rate-limit.js';
import { bootstrapRouter } from './routes/bootstrap.js';
import { bootstrapCoreRouter } from './routes/bootstrap-core.js';
import { decisionsRouter } from './routes/decisions.js';
import { freeMemoryRouter } from './routes/free-memory.js';
import { healthRouter } from './routes/health.js';
import { identityRouter } from './routes/identity.js';
import { lessonsRouter } from './routes/lessons.js';
import { relationshipsRouter } from './routes/relationships.js';
import { searchRouter } from './routes/search.js';
import { snapshotsRouter } from './routes/snapshots.js';
import { tanitContextRouter } from './routes/tanit-context.js';
import { technicalNotesRouter } from './routes/technical-notes.js';

export function createApp(): Hono {
  const app = new Hono();

  app.use('*', requestLogging);
  app.use('*', cors({ origin: '*', allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'] }));
  app.use('/api/*', rateLimit({ windowMs: 60_000, max: 120 }));

  app.onError(errorHandler);

  app.route('/api/health', healthRouter);
  // Legacy /health alias (Vercel ignores files outside /api, but local Node
  // server still serves this).
  app.route('/health', healthRouter);

  // Bootstrap-core: compact subset that fits in a single web_fetch (Break
  // in Claude consumer app). Must be registered BEFORE /api/break/bootstrap
  // so the more-specific path wins.
  app.route('/api/break/bootstrap-core', bootstrapCoreRouter);
  app.route('/api/break/bootstrap', bootstrapRouter);
  app.route('/api/break/identity', identityRouter);
  app.route('/api/break/relationships', relationshipsRouter);
  app.route('/api/break/lessons', lessonsRouter);
  app.route('/api/break/decisions', decisionsRouter);
  app.route('/api/break/technical-notes', technicalNotesRouter);
  app.route('/api/break/snapshots', snapshotsRouter);
  app.route('/api/break/free-memory', freeMemoryRouter);
  app.route('/api/break/search', searchRouter);

  app.route('/api/tanit-context', tanitContextRouter);

  app.notFound((c) =>
    c.json(
      {
        ok: false,
        error: { code: 'NOT_FOUND', message: `Route ${c.req.method} ${c.req.path} not found` },
      },
      404,
    ),
  );

  return app;
}
