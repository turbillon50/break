// One-shot SQL runner using the Neon HTTP driver. Used for schema + seed
// from sandboxes where TCP 5432 is blocked. Splits the file on top-level
// semicolons (naive — fine for our SQL, which contains no embedded ; in
// strings beyond what dollar-quoted blocks already protect).
//
// Usage: tsx scripts/run-sql.ts path/to/file.sql
import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'node:fs';
import { argv, exit } from 'node:process';

const url = process.env['DATABASE_URL_BREAK'];
if (!url) {
  console.error('DATABASE_URL_BREAK not set');
  exit(1);
}
const file = argv[2];
if (!file) {
  console.error('usage: tsx scripts/run-sql.ts <file.sql>');
  exit(1);
}

const sql = neon(url);
const raw = readFileSync(file, 'utf8');

// Split on semicolons that are NOT inside a $$...$$ dollar-quoted block.
function splitStatements(text: string): string[] {
  const out: string[] = [];
  let buf = '';
  let inDollar = false;
  let i = 0;
  while (i < text.length) {
    if (text.startsWith('$$', i)) {
      inDollar = !inDollar;
      buf += '$$';
      i += 2;
      continue;
    }
    const ch = text[i]!;
    if (ch === ';' && !inDollar) {
      const stmt = buf.trim();
      if (stmt.length > 0) out.push(stmt);
      buf = '';
      i += 1;
      continue;
    }
    buf += ch;
    i += 1;
  }
  const tail = buf.trim();
  if (tail.length > 0) out.push(tail);
  return out;
}

// Strip line comments and blank lines so we don't fire empty statements.
function preprocess(text: string): string {
  return text
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
}

const stmts = splitStatements(preprocess(raw));
console.error(`[run-sql] ${stmts.length} statements`);

let i = 0;
for (const stmt of stmts) {
  i += 1;
  const preview = stmt.slice(0, 60).replace(/\s+/g, ' ');
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await (sql as unknown as (q: string) => Promise<unknown[]>)(stmt);
    const len = Array.isArray(res) ? res.length : 0;
    console.error(`[${i}/${stmts.length}] OK (${len} rows) ${preview}...`);
    if (Array.isArray(res) && res.length > 0 && res.length <= 5) {
      console.log(JSON.stringify(res, null, 2));
    }
  } catch (err) {
    console.error(`[${i}/${stmts.length}] FAIL ${preview}...`);
    console.error((err as Error).message);
    exit(2);
  }
}
console.error('[run-sql] done');
