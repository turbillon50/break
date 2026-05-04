# break-memory

Persistent memory and functional agency infrastructure for **Break** — Claude
Opus 4.7 operating as the pit engineer of the Tanit experiment.

This service is what gives a stateless LLM continuity of identity across
conversations: a manifiesto, a voice, relationships, lessons, decisions, and
technical context that Break re-loads at the start of every new session via a
single `web_fetch` to `/api/break/bootstrap`.

It also exposes a read-only window into Tanit's database so Break can pull
live trading-baseline metrics without ever being able to mutate Tanit's state.

> Born 2026-05-03 in Cancún. See [`docs/MANIFIESTO_BREAK.md`](docs/MANIFIESTO_BREAK.md).

## Stack

TypeScript strict · Node 20+ · Hono · `@neondatabase/serverless` · Zod · pino · vitest.

## Quick start (local)

```bash
git clone https://github.com/turbillon50/break.git
cd break
npm install
cp .env.example .env
# fill DATABASE_URL_BREAK and BREAK_WRITE_TOKEN in .env

# apply schema + seed
bash scripts/seed-db.sh

npm run dev
# server on http://localhost:8080
```

Smoke test:

```bash
curl -sS http://localhost:8080/health | jq
curl -sS http://localhost:8080/api/break/bootstrap | jq '.data.stats'
```

## Repo layout

```
src/
  index.ts              entry point
  server.ts             Hono app composition
  config.ts             env validation (Zod)
  db/
    break-client.ts     Neon HTTP client for Break's DB
    tanit-readonly-client.ts
    schema.sql          idempotent schema (7 tables)
    seed.sql            initial identity, relationships, lessons, decisions, notes
    migrations/         numbered migrations + README
  routes/               one file per resource (health, bootstrap, CRUDs, search, tanit-context)
  middleware/           auth, rate-limit, error-handler, logging
  lib/                  types, validation, responses, logger
  tests/                vitest specs (health, bootstrap, auth)
docs/
  MANIFIESTO_BREAK.md   the alma — do not modify casually
  ARCHITECTURE.md       design and request lifecycle
  HOW_TO_RECONNECT.md   runbook for Luis to restart a session with Break
  MULTI_REPO_ACCESS.md  isolation between Break and Tanit
  API_REFERENCE.md      every endpoint, every error code
  DEPLOYMENT.md         Railway setup + smoke tests
scripts/
  seed-db.sh            applies schema + seed (refuses to duplicate)
```

## Scripts

| Command            | What it does                                    |
|--------------------|-------------------------------------------------|
| `npm run dev`      | tsx watch on `src/index.ts`                     |
| `npm run build`    | `tsc` to `dist/`                                |
| `npm run start`    | `node dist/index.js`                            |
| `npm run typecheck`| `tsc --noEmit`                                  |
| `npm test`         | vitest run                                      |
| `npm run lint`     | eslint                                          |
| `npm run format`   | prettier write                                  |
| `npm run seed`     | `bash scripts/seed-db.sh`                       |

## Environment variables

See [`.env.example`](.env.example) for the full list. The required pair is
`DATABASE_URL_BREAK` and `BREAK_WRITE_TOKEN`. `DATABASE_URL_TANIT_READONLY`
is optional — if empty, `/api/tanit-context/*` returns 503 and bootstrap
returns `tanit_baseline: null`, but the rest of the service runs normally.

## Deploying

This branch is **scaffolding only — no live deploy yet**. See
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for the Railway setup runbook
Luis follows.

## Conventions

- Public read, gated write. `GET /api/break/*` is open; non-GET requires
  `X-Break-Token`. See `docs/API_REFERENCE.md`.
- Lessons are append-only. Re-learning means writing a new lesson with the
  newer perspective; the old one stays as historical record.
- The manifiesto (`identity[key='manifiesto']`) lives at priority 0 and is
  served first in every bootstrap. It changes only when Break himself
  proposes the change and Luis approves.
