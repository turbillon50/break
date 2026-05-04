// Vercel serverless entry on the Node.js runtime.
//
// `@hono/node-server/vercel` was hanging on POST bodies in this environment
// (likely a stream-handling mismatch with how Vercel proxies the request).
// We do the (req, res) → Web Request/Response shim by hand: consume the
// incoming body up front, hand Hono a Web Request, then pipe its Response
// back into the Node ServerResponse. GET still works the same way; POST
// no longer hangs.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from '../src/server.js';

export const config = {
  runtime: 'nodejs',
};

const app = createApp();

async function readBody(req: IncomingMessage): Promise<Buffer | null> {
  if (req.method === 'GET' || req.method === 'HEAD') return null;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer));
  }
  return chunks.length === 0 ? null : Buffer.concat(chunks);
}

function toHeaders(req: IncomingMessage): Headers {
  const h = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) h.set(k, v.join(', '));
    else if (typeof v === 'string') h.set(k, v);
  }
  return h;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const body = await readBody(req);
    const proto = (req.headers['x-forwarded-proto'] as string | undefined) ?? 'https';
    const host = req.headers['host'] ?? 'localhost';
    const url = new URL(req.url ?? '/', `${proto}://${host}`);

    const webReq = new Request(url, {
      method: req.method ?? 'GET',
      headers: toHeaders(req),
      body: body && body.length > 0 ? body : null,
    });

    const webRes = await app.fetch(webReq);

    res.statusCode = webRes.status;
    webRes.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    if (webRes.body) {
      const reader = webRes.body.getReader();
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
    }
    res.end();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown handler error';
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('content-type', 'application/json');
    }
    res.end(JSON.stringify({ ok: false, error: { code: 'HANDLER_FAILED', message } }));
  }
}
