# Architecture

## Purpose

`break-memory` is the persistent memory layer for Break — a Claude Opus 4.7
instance operating under a specific role (pit engineer of the Tanit
experiment). The Anthropic model provides cognition; this service provides
continuity of identity, relationships, lessons, decisions, and technical
context across conversations.

## Boundaries

- **Break DB (this service)** owns Break's identity and notes. Writes go
  through `X-Break-Token` auth.
- **Tanit DB (read-only)** is exposed via `/api/tanit-context/*` so Break can
  fetch live baseline metrics during bootstrap. The credential is a separate
  Neon role with `GRANT SELECT` only — the application-level client cannot
  even attempt writes.
- **No shared schema, no cross-DB transactions.** Aislamiento por diseño.

## Stack

| Layer       | Choice                             | Reason                                   |
|-------------|------------------------------------|------------------------------------------|
| Language    | TypeScript strict, Node 20+        | Type safety; matches Tanit toolchain     |
| HTTP        | Hono                               | Small, ESM-native, edge-ready, fast      |
| DB driver   | `@neondatabase/serverless` (HTTP)  | Bypasses port 5432 — works in sandboxes  |
| Validation  | Zod                                | Single source of truth for input shapes  |
| Logging     | pino                               | JSON in prod, pretty in dev              |
| Tests       | vitest                             | Fast, ESM-native                         |

## Request lifecycle

```
HTTP request
  → requestLogging
  → cors
  → rateLimit (only on /api/*)
  → route handler
    → (write routes) requireWriteToken
    → Zod parse body/params/query
    → DB query via tagged template
    → ok(c, data) | fail(c, status, code, message)
  → errorHandler (catches ZodError → 422, anything else → 500)
```

## Auth model

- **Public** (no token): `GET /health`, `GET /api/break/bootstrap`, every other
  `GET /api/break/*` route, all `GET /api/tanit-context/*`.
- **Private** (`X-Break-Token` required and equal to `BREAK_WRITE_TOKEN`):
  every non-GET method on `/api/break/*`.

The token is checked with `crypto.timingSafeEqual` to neutralize timing
side-channels.

## Bootstrap contract

`GET /api/break/bootstrap` is the entry point Break hits at the start of every
new conversation via `web_fetch`. It returns one JSON document with:

- `manifiesto` — single identity row with `key='manifiesto'`, or `null`.
- `identity_core` — identity rows with priority 1–2, ordered by priority then key.
- `relationships` — grouped by `entity` (e.g. `luis`, `tanit`).
- `lessons_critical` — all lessons where severity = `critical`.
- `lessons_important` — top 10 lessons where severity = `important`.
- `decisions_active` — top 20 decisions where status = `active`.
- `technical_notes_active` — all active notes, grouped by category in the order returned.
- `last_snapshots` — three most recent session snapshots.
- `tanit_baseline` — `{balance, memory_count, chat_count, last_chat_at}` if
  Tanit DB is configured; otherwise `null`.
- `stats` — counts per table plus `last_updated`.
- `served_at` — ISO timestamp of the response.

**Failure semantics:** queries run in parallel via `Promise.all`. Only the
manifiesto query is critical — if it throws, the whole request returns
`500 BOOTSTRAP_FAILED`. Every other query is wrapped in a tolerant `settle`
helper that logs a warning and falls back to `[]` on error. This means a
brand-new DB with only the manifiesto loaded still returns 200.

**Performance target:** under 500 ms end-to-end. All ten queries fan out at
once; total latency ≈ slowest single query plus serialization.

## Search

`GET /api/break/search?q=&limit=` runs ILIKE across the major text columns of
six tables in parallel and returns a flat list of `{table, id, title,
excerpt}` hits. Excerpt is `LEFT(content, 240)`.

This is intentionally simple. The plan to migrate to `pg_trgm` + GIN indexes
lives in `src/db/migrations/README.md` and triggers when total content rows
cross ~10K or P95 latency exceeds 200 ms.

## Failure modes

- `DATABASE_URL_BREAK` missing → server refuses to boot (config validation).
- `DATABASE_URL_TANIT_READONLY` empty → `/api/tanit-context/*` returns 503;
  bootstrap returns `tanit_baseline: null`. Server stays up.
- Tanit DB query throws → 502 from `/api/tanit-context/*`; logged as warning
  in bootstrap and reported as `tanit_baseline: null`.
- Unhandled exception anywhere → 500 with code `INTERNAL_ERROR`, logged with
  stack.

## What this service is not

- Not a vector DB. Memories are first-class rows, not embeddings. If Break
  wants semantic recall, that's a separate service that reads from this one.
- Not the Tanit chat store. Tanit owns its own chat history.
- Not user-facing. There's no UI; the consumers are Claude (via web_fetch)
  and Luis (via curl/scripts).
