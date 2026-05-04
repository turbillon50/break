import pino from 'pino';
import { loadConfig } from '../config.js';

const cfg = loadConfig();

export const logger = pino({
  level: cfg.LOG_LEVEL,
  base: { service: 'break-memory' },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(cfg.NODE_ENV === 'development'
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l' },
        },
      }
    : {}),
});
