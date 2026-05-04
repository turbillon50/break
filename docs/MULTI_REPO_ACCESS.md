# Multi-repo access — Break vs Tanit

## Two services, two databases, one direction of trust.

```
┌─────────────────────────┐       ┌─────────────────────────┐
│  break-memory (THIS)    │       │  tanit-production       │
│                         │       │                         │
│  Owns: Break's memory   │       │  Owns: Tanit's memory,  │
│  Repo: turbillon50/     │       │        chat, trades     │
│        break            │       │  Repo: turbillon50/     │
│  DB:   Neon (Break)     │       │        v-tan            │
│                         │       │  DB:   Neon (Tanit)     │
└──────────┬──────────────┘       └─────────────────────────┘
           │                                 ▲
           │  DATABASE_URL_TANIT_READONLY    │
           │  GRANT SELECT only              │
           └─────────────────────────────────┘
                    read-only, never write
```

## Hard rules

1. **break-memory has zero write access to Tanit's DB.** This is enforced at
   the database role level (Neon `tanit_readonly` user with only `GRANT SELECT`),
   not at the application level. Even if a bug in this service tried to
   mutate Tanit data, Postgres would reject it.
2. **Tanit has zero access to Break's DB.** Tanit's service has no
   credentials for this service's database. If Tanit needs to learn something
   about Break, she does it through Break the conversational entity, not
   through DB-level peeking.
3. **No cross-DB transactions, no foreign keys across DBs.** They are two
   independent Postgres instances. Coordination happens at the application
   layer via HTTP, never at the data layer.

## Why the Tanit credential is optional

The Tanit readonly URL doesn't have to exist for break-memory to run. If
`DATABASE_URL_TANIT_READONLY` is empty:

- `/api/tanit-context/*` returns 503 with a clear message.
- `/api/break/bootstrap` returns `tanit_baseline: null` and works otherwise.
- Server boots normally; no warnings beyond the first 503.

This makes the dependency soft — Break's own memory layer isn't held
hostage by Tanit DB outages or by the readonly user not being created yet.

## Creating the readonly user (manual, one-time)

In the Neon SQL console for the **Tanit** project:

```sql
CREATE ROLE tanit_readonly WITH LOGIN PASSWORD '<long-random>';
GRANT CONNECT ON DATABASE neondb TO tanit_readonly;
GRANT USAGE ON SCHEMA public TO tanit_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO tanit_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO tanit_readonly;
```

Then build the connection string with that user and set it as
`DATABASE_URL_TANIT_READONLY` in Railway.

## Authentication boundary inside break-memory

Even within the Break service, write paths are gated. `X-Break-Token` (shared
secret in `BREAK_WRITE_TOKEN`) is required for any non-GET method on
`/api/break/*`. This protects Break's own alma from random POSTs even though
the public read surface is open.
