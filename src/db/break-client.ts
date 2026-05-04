import { neon, type NeonQueryFunction } from '@neondatabase/serverless';
import { loadConfig } from '../config.js';

let cached: NeonQueryFunction<false, false> | null = null;

export function getBreakDb(): NeonQueryFunction<false, false> {
  if (cached) return cached;
  const cfg = loadConfig();
  cached = neon(cfg.DATABASE_URL_BREAK);
  return cached;
}
