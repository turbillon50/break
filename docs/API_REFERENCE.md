# API Reference

All responses follow:

```json
{ "ok": true,  "data": <payload> }
{ "ok": false, "error": { "code": "STRING", "message": "...", "details": {} } }
```

Auth: writes (`POST | PATCH | DELETE`) on `/api/break/*` require header
`X-Break-Token: <BREAK_WRITE_TOKEN>`. Reads are public.

---

## Health

### `GET /health`

```json
{ "ok": true, "data": { "ok": true, "ts": "2026-05-04T03:00:00.000Z", "version": "0.1.0" } }
```

---

## Bootstrap

### `GET /api/break/bootstrap`

Single document with the full identity payload. See `ARCHITECTURE.md` for the
full shape. Public, no token required. Target latency < 500 ms.

---

## Identity

### `GET /api/break/identity`
Returns all identity rows ordered by `priority ASC, key ASC`.

### `GET /api/break/identity/:key`
Returns one row. 404 if not found.

### `POST /api/break/identity` (auth)
Body: `{ key: string(1-60), content: string, priority?: number=5 }`.
Upserts on `key`. Returns 201 with the row.

### `PATCH /api/break/identity/:key` (auth)
Body: `{ content?: string, priority?: number }` (at least one).
Returns 200 with the row, 404 if not found.

### `DELETE /api/break/identity/:id` (auth)
Returns `{ id, deleted: true }`, 404 if not found.

---

## Relationships

### `GET /api/break/relationships?entity=luis`
Returns all rows, optionally filtered by `entity`.

### `GET /api/break/relationships/:entity/:aspect`
Returns one row. 404 if not found.

### `POST /api/break/relationships` (auth)
Body: `{ entity, aspect, content }`. Upserts on `(entity, aspect)`. 201.

### `PATCH /api/break/relationships/:entity/:aspect` (auth)
Body: `{ content }`. 200 / 404.

### `DELETE /api/break/relationships/:id` (auth)

---

## Lessons

### `GET /api/break/lessons?severity=critical`
Returns all lessons; optional severity filter (`critical|important|note`).

### `GET /api/break/lessons/:id`

### `POST /api/break/lessons` (auth)
Body: `{ title, context, lesson, severity }`. 201.

### `DELETE /api/break/lessons/:id` (auth)

(Lessons are append-only by design — no PATCH. Re-learning means writing a
new lesson that supersedes the old one.)

---

## Decisions

### `GET /api/break/decisions?status=active`
Optional status filter (`active|superseded|reverted`).

### `GET /api/break/decisions/:id`

### `POST /api/break/decisions` (auth)
Body: `{ title, decision_text, rationale, decided_by, status?, decision_date? }`.

### `PATCH /api/break/decisions/:id` (auth)
Body: any subset of `{ status, decision_text, rationale }`.

### `DELETE /api/break/decisions/:id` (auth)

---

## Technical notes

### `GET /api/break/technical-notes?category=bug&active=true`
Defaults to `active=true`. Pass `active=false` to include archived rows.

### `GET /api/break/technical-notes/:id`

### `POST /api/break/technical-notes` (auth)
Body: `{ category, title, content, is_active?=true }`.

### `PATCH /api/break/technical-notes/:id` (auth)
Body: any subset of `{ category, title, content, is_active }`.

### `DELETE /api/break/technical-notes/:id` (auth)

---

## Session snapshots

### `GET /api/break/snapshots?limit=20`

### `GET /api/break/snapshots/:id`

### `POST /api/break/snapshots` (auth)
Body: `{ session_date(YYYY-MM-DD), summary, key_events?, pending?, emotional_notes? }`.

### `DELETE /api/break/snapshots/:id` (auth)

---

## Free memory

### `GET /api/break/free-memory?tag=foo&limit=50`

### `GET /api/break/free-memory/:id`

### `POST /api/break/free-memory` (auth)
Body: `{ content, tags? }` (`tags` is a CSV string).

### `DELETE /api/break/free-memory/:id` (auth)

---

## Search

### `GET /api/break/search?q=&limit=20`
ILIKE across identity, relationships, lessons, decisions, technical_notes,
free_memory. Returns flat list of `{table, id, title, excerpt}` hits.

`q` must be at least 2 characters. `limit` per-table, max 100.

---

## Tanit context (read-only)

All return 503 `TANIT_DB_NOT_CONFIGURED` when the readonly URL is empty.

### `GET /api/tanit-context/snapshot`
`{ equity, equity_at, memory_count, chat_count, trades_count }`.

### `GET /api/tanit-context/positions`
Open positions: `{ symbol, side, size, entry_price, leverage, unrealized_pnl, opened_at }`.

### `GET /api/tanit-context/recent-trades?limit=20`
Closed trades: `{ symbol, side, pnl, opened_at, closed_at }`.

---

## Error codes

| Code                       | HTTP | Meaning                                        |
|---------------------------|------|------------------------------------------------|
| `AUTH_MISSING_TOKEN`       | 401  | `X-Break-Token` header absent on a write       |
| `AUTH_INVALID_TOKEN`       | 401  | Token did not match                            |
| `VALIDATION_FAILED`        | 422  | Zod schema rejected the payload                |
| `NOT_FOUND`                | 404  | Resource (or route) does not exist             |
| `RATE_LIMITED`             | 429  | More than 120 reqs/min on `/api/*` per IP      |
| `BOOTSTRAP_FAILED`         | 500  | Manifiesto query failed                        |
| `INTERNAL_ERROR`           | 500  | Unhandled exception                            |
| `TANIT_DB_NOT_CONFIGURED`  | 503  | `DATABASE_URL_TANIT_READONLY` is empty         |
| `TANIT_DB_ERROR`           | 502  | Tanit readonly query threw                     |
