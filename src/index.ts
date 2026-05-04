import { serve } from '@hono/node-server';
import { loadConfig, VERSION } from './config.js';
import { logger } from './lib/logger.js';
import { createApp } from './server.js';

function main(): void {
  const cfg = loadConfig();
  const app = createApp();

  const server = serve({ fetch: app.fetch, port: cfg.PORT, hostname: '0.0.0.0' }, (info) => {
    logger.info(
      { port: info.port, env: cfg.NODE_ENV, version: VERSION },
      'break-memory listening',
    );
  });

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'shutting down');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main();
