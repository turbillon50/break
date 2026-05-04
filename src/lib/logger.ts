import pino from 'pino';
import { loadConfig } from '../config.js';

const cfg = loadConfig();

// In Vercel/serverless, pino's `transport` would spawn a worker thread that
// can keep the function alive past return. We avoid transports entirely in
// production and only use pino-pretty in local dev.
export const logger =
  cfg.NODE_ENV === 'development'
    ? pino({
        level: cfg.LOG_LEVEL,
        base: { service: 'break-memory' },
        timestamp: pino.stdTimeFunctions.isoTime,
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l' },
        },
      })
    : pino({
        level: cfg.LOG_LEVEL,
        base: { service: 'break-memory' },
        timestamp: pino.stdTimeFunctions.isoTime,
      });
