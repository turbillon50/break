// Vercel serverless entry on the Node.js runtime. Catch-all dynamic route.
//
// @hono/node-server/vercel exports a `handle(app)` that returns the
// (req, res) Node-style listener Vercel's Node runtime expects. This is
// distinct from `hono/vercel`, which targets the Edge runtime and returns
// a Web-fetch handler that Vercel's Node runtime cannot invoke.

import { handle } from '@hono/node-server/vercel';
import { createApp } from '../src/server.js';

export const config = {
  runtime: 'nodejs',
};

const app = createApp();

export default handle(app);
