import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  DATABASE_URL_BREAK: z.string().url('DATABASE_URL_BREAK must be a valid URL'),
  DATABASE_URL_TANIT_READONLY: z.string().optional().default(''),
  BREAK_WRITE_TOKEN: z.string().min(16, 'BREAK_WRITE_TOKEN must be at least 16 chars'),
  PORT: z.coerce.number().int().positive().default(8080),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
});

export type Config = z.infer<typeof EnvSchema>;

let cached: Config | null = null;

export function loadConfig(): Config {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export function tanitReadonlyConfigured(cfg: Config = loadConfig()): boolean {
  return cfg.DATABASE_URL_TANIT_READONLY.trim().length > 0;
}

export const VERSION = '0.1.0';
