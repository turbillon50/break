// Vercel serverless entry on the Node.js runtime. The catch-all route name
// `[[...slug]].ts` makes Vercel send every request that didn't match another
// file here.
//
// hono/vercel's `handle()` returns a Web-Fetch handler — that targets the
// Edge runtime. We're on Node runtime (so we can use node:crypto, pino, etc.),
// so we wrap the Hono app with @hono/node-server's getRequestListener, which
// adapts a fetch handler into a Node (req, res) listener — what Vercel's
// Node runtime actually invokes.

import { getRequestListener } from '@hono/node-server';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from '../src/server.js';

export const config = {
  runtime: 'nodejs',
};

const app = createApp();
const listener = getRequestListener(app.fetch.bind(app));

export default function handler(req: IncomingMessage, res: ServerResponse): void {
  void listener(req, res);
}
