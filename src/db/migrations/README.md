# Migrations

Future schema changes go here as numbered SQL files:

- `001_add_xxx.sql`
- `002_drop_yyy.sql`
- ...

## Conventions

- Each file is **idempotent** (`IF NOT EXISTS`, `IF EXISTS`, `OR REPLACE`).
- Each file is **forward-only** — no automatic rollback. If something needs
  reverting, write a new migration that does the reverse.
- Apply with: `psql "$DATABASE_URL_BREAK" -f src/db/migrations/00X_xxx.sql`

## When to migrate vs edit `schema.sql`

- **Pre-launch (no production data):** edit `schema.sql` directly and re-run
  the seed.
- **Post-launch:** never edit `schema.sql` for breaking changes. Add a numbered
  migration. Update `schema.sql` to reflect the cumulative state so a fresh
  install gets the right shape in one shot.

## Search migration (deferred)

When `identity.content + relationships.content + lessons.lesson + ...`
crosses ~10K rows or `/api/break/search` latency exceeds 200ms, migrate to
`pg_trgm` + GIN:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_identity_content_trgm ON identity USING GIN (content gin_trgm_ops);
-- etc
```

Don't add this prematurely. ILIKE on a small table is fine.
