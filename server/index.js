// Starts the marathon API. Config comes from the environment (systemd EnvironmentFile=/etc/marathon.env):
//   ACCESS_TEAM_DOMAIN, ACCESS_AUD, ALLOWED_EMAIL   Cloudflare Access (required)
//   DRX_API_TOKEN                                   optional, ≥ 32 characters, lets DRX log runs
//   PORT (8788), HOST (127.0.0.1), DATA_DIR (/var/lib/marathon)
//   DEV_BYPASS_AUTH=1                               local development only, never in production

import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { openDb } from './db.js';

const env = process.env;
const port = Number(env.PORT || 8788);
const hostname = env.HOST || '127.0.0.1';
const store = openDb(env.DATA_DIR || '/var/lib/marathon');

if (env.DRX_API_TOKEN && env.DRX_API_TOKEN.length < 32) {
  console.warn('DRX_API_TOKEN is korter dan 32 tekens en wordt genegeerd.');
}
if (env.DEV_BYPASS_AUTH === '1') console.warn('DEV_BYPASS_AUTH staat aan: alleen gebruiken op localhost.');

const server = serve({ fetch: createApp({ store, env }).fetch, port, hostname }, (info) => {
  console.log(`marathon-api luistert op http://${info.address}:${info.port}`);
});

const stop = () => {
  server.close(() => {
    store.close();
    process.exit(0);
  });
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
