import { neon, type NeonQueryFunction } from '@neondatabase/serverless';
import { loadConfig, tanitReadonlyConfigured } from '../config.js';

let cached: NeonQueryFunction<false, false> | null = null;

export function getTanitDb(): NeonQueryFunction<false, false> | null {
  if (cached) return cached;
  const cfg = loadConfig();
  if (!tanitReadonlyConfigured(cfg)) return null;
  cached = neon(cfg.DATABASE_URL_TANIT_READONLY);
  return cached;
}
