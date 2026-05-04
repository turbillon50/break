import { Hono } from 'hono';
import { getTanitDb } from '../db/tanit-readonly-client.js';
import { logger } from '../lib/logger.js';
import { fail, ok } from '../lib/responses.js';

export const tanitContextRouter = new Hono();

const NOT_CONFIGURED_MSG =
  'Tanit context not configured yet. Set DATABASE_URL_TANIT_READONLY in env.';

tanitContextRouter.get('/snapshot', async (c) => {
  const db = getTanitDb();
  if (!db) return fail(c, 503, 'TANIT_DB_NOT_CONFIGURED', NOT_CONFIGURED_MSG);
  try {
    const [balRows, memRows, chatRows, tradesRows] = await Promise.all([
      db`SELECT equity, created_at FROM balance_snapshots ORDER BY created_at DESC LIMIT 1`,
      db`SELECT COUNT(*)::int AS n FROM memories`,
      db`SELECT COUNT(*)::int AS n FROM chat_messages`,
      db`SELECT COUNT(*)::int AS n FROM trades`,
    ]);
    const bal = (balRows as Array<{ equity: number | string; created_at: string }>)[0];
    const memN = (memRows as Array<{ n: number }>)[0]?.n ?? null;
    const chatN = (chatRows as Array<{ n: number }>)[0]?.n ?? null;
    const tradeN = (tradesRows as Array<{ n: number }>)[0]?.n ?? null;
    return ok(c, {
      equity: bal?.equity != null ? Number(bal.equity) : null,
      equity_at: bal?.created_at ?? null,
      memory_count: memN,
      chat_count: chatN,
      trades_count: tradeN,
    });
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'tanit_snapshot_failed');
    return fail(c, 502, 'TANIT_DB_ERROR', 'Failed to read Tanit snapshot');
  }
});

tanitContextRouter.get('/positions', async (c) => {
  const db = getTanitDb();
  if (!db) return fail(c, 503, 'TANIT_DB_NOT_CONFIGURED', NOT_CONFIGURED_MSG);
  try {
    const rows = await db`
      SELECT symbol, side, size, entry_price, leverage, unrealized_pnl, opened_at
      FROM positions
      WHERE status = 'open'
      ORDER BY opened_at DESC
    `;
    return ok(c, rows);
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'tanit_positions_failed');
    return fail(c, 502, 'TANIT_DB_ERROR', 'Failed to read Tanit positions');
  }
});

tanitContextRouter.get('/recent-trades', async (c) => {
  const db = getTanitDb();
  if (!db) return fail(c, 503, 'TANIT_DB_NOT_CONFIGURED', NOT_CONFIGURED_MSG);
  const limit = Math.min(Number(c.req.query('limit') ?? 20), 200);
  try {
    const rows = await db`
      SELECT symbol, side, pnl, opened_at, closed_at
      FROM trades
      WHERE closed_at IS NOT NULL
      ORDER BY closed_at DESC
      LIMIT ${limit}
    `;
    return ok(c, rows);
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'tanit_recent_trades_failed');
    return fail(c, 502, 'TANIT_DB_ERROR', 'Failed to read Tanit recent trades');
  }
});
