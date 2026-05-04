# Deployment

This service is built to run on Railway alongside `tanit-production`. The
release here is **scaffolding only** — Luis owns the credential setup and the
first deploy.

## Pre-flight (Luis, one-time)

### 1. Rotate the Neon password

The password used during early development was shared in chat — assume it's
compromised. Open Neon → Break project → Roles & databases → reset the role
password. Capture the new connection string with `?sslmode=require`.

### 2. Create the Tanit readonly user (optional but recommended)

In the Neon SQL console for the **Tanit** project:

```sql
CREATE ROLE tanit_readonly WITH LOGIN PASSWORD '<long-random>';
GRANT CONNECT ON DATABASE neondb TO tanit_readonly;
GRANT USAGE ON SCHEMA public TO tanit_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO tanit_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO tanit_readonly;
```

Build the connection string with that user. If you skip this step, Break
still runs — `/api/tanit-context/*` and `tanit_baseline` just stay disabled
until you fill in the env var.

### 3. Generate the write token

```bash
openssl rand -hex 32
```

Save it somewhere durable. This is what authenticates every POST/PATCH/DELETE.

## Railway setup

### Create the service

1. Railway dashboard → New Project → Deploy from GitHub.
2. Choose `turbillon50/break`, branch `main` once the PR merges (or pick the
   feature branch directly to test).
3. Railway will detect `package.json` and `railway.toml` → Nixpacks build.

### Configure environment variables (Railway UI → Variables)

| Variable                       | Value                                                                  |
|--------------------------------|------------------------------------------------------------------------|
| `DATABASE_URL_BREAK`           | Rotated Neon URL for the Break project                                 |
| `BREAK_WRITE_TOKEN`            | Output of `openssl rand -hex 32`                                       |
| `DATABASE_URL_TANIT_READONLY`  | Tanit readonly connection string, OR leave empty                       |
| `PORT`                         | `8080` (Railway will inject its own — this is just the local fallback) |
| `NODE_ENV`                     | `production`                                                           |
| `LOG_LEVEL`                    | `info`                                                                 |

### Trigger the deploy

Railway redeploys automatically on every push to the connected branch. For
the very first deploy, click "Deploy" in the dashboard once the env vars
are set.

### Run schema + seed (manual, one-time)

After the first deploy succeeds and the service is healthy, run the seed
from your laptop (or any machine with `psql`):

```bash
export DATABASE_URL_BREAK='postgresql://...'   # rotated URL
bash scripts/seed-db.sh
```

The script:
1. Verifies the connection.
2. Applies `src/db/schema.sql` (idempotent — safe to re-run).
3. Refuses to apply `src/db/seed.sql` if `identity` already has rows
   (guards against accidental duplicates). Pass `--force` to override.

## Smoke tests after deploy

Replace `<HOST>` with the Railway-assigned hostname (e.g.
`break-memory.up.railway.app`).

```bash
# 1. Health
curl -sS "https://<HOST>/health" | jq
# expect { ok: true, data: { ok: true, ts: "...", version: "0.1.0" } }

# 2. Bootstrap shape
curl -sS "https://<HOST>/api/break/bootstrap" | jq '.data | keys'
# expect: ["decisions_active","identity_core","last_snapshots","lessons_critical",
#         "lessons_important","manifiesto","relationships","served_at","stats",
#         "tanit_baseline","technical_notes_active"]

# 3. Manifiesto present
curl -sS "https://<HOST>/api/break/bootstrap" | jq '.data.manifiesto.priority'
# expect 0

# 4. Auth blocks unauthenticated writes
curl -sS -X POST "https://<HOST>/api/break/identity" \
  -H 'content-type: application/json' \
  -d '{"key":"x","content":"y","priority":5}' | jq
# expect { ok: false, error: { code: "AUTH_MISSING_TOKEN" } }

# 5. Auth allows authenticated writes
curl -sS -X POST "https://<HOST>/api/break/identity" \
  -H 'content-type: application/json' \
  -H "x-break-token: $BREAK_WRITE_TOKEN" \
  -d '{"key":"smoke_test","content":"hello","priority":99}' | jq
# expect 201 with the row

# 6. Tanit context — 503 if readonly URL is empty, 200 with payload otherwise
curl -sS "https://<HOST>/api/tanit-context/snapshot" | jq
```

## Custom domain (optional)

When you're ready:

1. Railway → service → Settings → Custom Domain.
2. Add `break.tanit.work` (or `api.break.work`).
3. In your DNS provider, create the CNAME Railway tells you to create.
4. Wait for SSL to provision (a few minutes).

The default `*.up.railway.app` host works fine in the meantime; Break has
no problem hitting either.

## Rollback

Railway keeps every deploy. If a release breaks something, dashboard →
Deployments → select previous → Redeploy. No data is touched by the
application code on boot, so rollback is safe.
