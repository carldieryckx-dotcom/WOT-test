// Entry point: starts the marathon API on 127.0.0.1:8788 (behind Caddy).
//
// Configuration comes from the environment (systemd EnvironmentFile=/etc/marathon.env):
//   ACCESS_TEAM_DOMAIN, ACCESS_AUD, ALLOWED_EMAIL   Cloudflare Access (required)
//   DRX_API_TOKEN                                   optional, for imports from the server itself
//   PORT=8788  HOST=127.0.0.1  DATA_DIR=/var/lib/marathon  TIMEZONE=Europe/Brussels
//   FINANCE_FILE=/var/lib/finance/site-finance.json  (read-only, for GET /api/finance)
//   DEV_BYPASS_AUTH=1, SERVE_STATIC=1                only for local development (npm run dev)

import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { openDb } from './db.js';

const port = Number(process.env.PORT || 8788);
const hostname = process.env.HOST || '127.0.0.1';
const dataDir = process.env.DATA_DIR || '/var/lib/marathon';

if (process.env.DEV_BYPASS_AUTH === '1') {
  console.warn('LET OP: DEV_BYPASS_AUTH=1 – alleen voor lokaal testen, nooit in productie.');
}

const store = openDb(dataDir);
const app = createApp({ store });

// Local development only: also serve the static site (in production Caddy does this).
if (process.env.SERVE_STATIC === '1') {
  const root = path.relative(process.cwd(), fileURLToPath(new URL('../../', import.meta.url))) || '.';
  app.get('/', (c) => c.redirect('/marathon/'));
  app.use('/marathon/*', serveStatic({ root }));
  app.get('/finance', (c) => c.redirect('/finance/'));
  app.use('/finance/*', serveStatic({ root }));
  app.use('/fonts/*', serveStatic({ root }));
  console.warn(`Statische bestanden uit ${root} (SERVE_STATIC=1)`);
}
const server = serve({ fetch: app.fetch, port, hostname }, (info) => {
  console.log(`marathon-api luistert op http://${info.address}:${info.port} (data: ${dataDir})`);
});

const stop = () => {
  server.close(() => {
    store.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
