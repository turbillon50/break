// Vercel serverless entry. All HTTP requests rewrite to /api/index per
// vercel.json, and Hono routes them. The src/index.ts entry stays untouched
// for Railway/local, where @hono/node-server runs a long-lived process.

import { handle } from 'hono/vercel';
import { createApp } from '../src/server.js';

export const config = {
  runtime: 'nodejs',
};

const app = createApp();

export default handle(app);
