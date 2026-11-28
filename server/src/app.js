// The marathon API as a Hono app. See MARATHON.md for the contract.
//
//   GET    /api/me
//   GET    /api/settings          PUT /api/settings
//   GET    /api/runs[?after=YYYY-MM-DD]
//   POST   /api/runs              one run (JSON)                       – also with DRX_API_TOKEN
//   POST   /api/runs/bulk         several runs (JSON array)            – also with DRX_API_TOKEN
//   POST   /api/runs/gpx          multipart upload, field "file" (≤10 MB)
//   DELETE /api/runs/:id
//   GET    /api/auth-check        204 when signed in (for Caddy forward_auth on /marathon)
//   GET    /api/finance           contents of FINANCE_FILE (Access login only, see FINANCE.md)

import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { createHash, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { verifyAccess, AuthError } from '../../lib/access.js';
import { validateRun, validateSettings, isDate, InputError } from './validate.js';
import { parseGpx } from './gpx.js';

export const DEFAULT_FINANCE_FILE = '/var/lib/finance/site-finance.json';
export const MAX_GPX_BYTES = 10 * 1024 * 1024;
const MAX_JSON_BYTES = 2 * 1024 * 1024;
const MAX_BULK = 1000;
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const PROXY_HEADERS = ['x-forwarded-for', 'x-forwarded-host', 'x-real-ip', 'forwarded', 'cf-connecting-ip', 'via'];
// Routes DRX may call with the bearer token (from the server itself only).
const DRX_ROUTES = new Set(['POST /api/runs', 'POST /api/runs/bulk']);

/**
 * True only for a connection made straight to the service over loopback
 * (e.g. `curl http://127.0.0.1:8788/...` on the server), never for traffic
 * proxied by Caddy: Caddy always adds X-Forwarded-For.
 */
function isDirectLocal(c) {
  const addr = c.env?.incoming?.socket?.remoteAddress;
  if (!addr || !LOOPBACK.has(addr)) return false;
  return PROXY_HEADERS.every((h) => !c.req.header(h));
}

const sha256 = (s) => createHash('sha256').update(String(s)).digest();
const sameToken = (a, b) => timingSafeEqual(sha256(a), sha256(b));

function bearer(c) {
  const h = c.req.header('authorization') || '';
  const m = h.match(/^Bearer\s+(\S+)$/i);
  return m ? m[1] : null;
}

export function createApp({ store, env = process.env }) {
  const app = new Hono();
  const timeZone = env.TIMEZONE || 'Europe/Brussels';

  app.onError((err, c) => {
    const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
    if (status === 500) console.error(err);
    return c.json({ error: status === 500 ? 'Serverfout' : err.message }, status);
  });
  app.notFound((c) => c.json({ error: 'Niet gevonden' }, 404));

  // Body size limit (also for chunked uploads): 10 MB for GPX, 2 MB for JSON.
  const tooBig = (mb) => (c) => c.json({ error: `Bestand of verzoek te groot (max ${mb} MB)` }, 413);
  const gpxLimit = bodyLimit({ maxSize: MAX_GPX_BYTES + 64 * 1024, onError: tooBig(10) });
  const jsonLimit = bodyLimit({ maxSize: MAX_JSON_BYTES, onError: tooBig(2) });
  app.use('/api/*', (c, next) => (c.req.path === '/api/runs/gpx' ? gpxLimit : jsonLimit)(c, next));

  // Headers and authentication for every /api request.
  app.use('/api/*', async (c, next) => {
    c.header('cache-control', 'no-store');
    c.header('x-robots-tag', 'noindex');
    c.header('x-content-type-options', 'nosniff');

    const token = bearer(c);
    if (token) {
      // DRX: token from /etc/marathon.env, only for the import routes and only from the server itself.
      const expected = String(env.DRX_API_TOKEN || '');
      if (expected.length < 32) throw new AuthError('DRX_API_TOKEN is niet ingesteld (min. 32 tekens)', 503);
      if (!DRX_ROUTES.has(`${c.req.method} ${c.req.path}`)) throw new AuthError('Token niet toegestaan voor deze route', 403);
      if (!isDirectLocal(c)) throw new AuthError('Token enkel geldig vanaf de server zelf (127.0.0.1)', 403);
      if (!sameToken(token, expected)) throw new AuthError('Ongeldig token', 401);
      c.set('user', { email: 'drx', drx: true });
    } else {
      const user = await verifyAccess(c.req.raw, env, { directLocal: isDirectLocal(c) });
      // Cookie-based login: refuse cross-site writes.
      if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
        const origin = c.req.header('origin');
        if (origin && origin !== 'null' && new URL(origin).host !== new URL(c.req.url).host) {
          throw new AuthError('Verzoek van een andere site geweigerd', 403);
        }
      }
      c.set('user', user);
    }
    await next();
  });

  const readJson = async (c) => {
    try {
      return await c.req.json();
    } catch {
      throw new InputError('Ongeldige JSON');
    }
  };
  const result = ({ run, created }) => ({ run, created, skipped: !created });

  app.get('/api/auth-check', (c) => c.body(null, 204));

  // Private finance overview (FINANCE.md). The file is maintained by DRX outside the repo
  // and re-read on every request. Never log or echo its contents.
  app.get('/api/finance', async (c) => {
    c.header('cache-control', 'private, no-store');
    const file = env.FINANCE_FILE || DEFAULT_FINANCE_FILE;
    let text;
    try {
      text = await readFile(file, 'utf8');
    } catch (e) {
      if (e && (e.code === 'ENOENT' || e.code === 'ENOTDIR')) {
        return c.json({ error: 'Nog geen financiële gegevens beschikbaar' }, 404);
      }
      console.error(`finance: bestand niet leesbaar (${e?.code || 'onbekende fout'})`);
      return c.json({ error: 'Financiële gegevens konden niet gelezen worden' }, 500);
    }
    try {
      JSON.parse(text);
    } catch {
      // Deliberately without the parser message: it can quote part of the file.
      console.error('finance: bestand is geen geldige JSON');
      return c.json({ error: 'Financiële gegevens zijn ongeldig' }, 502);
    }
    return c.body(text, 200, { 'content-type': 'application/json; charset=utf-8' });
  });

  app.get('/api/me', (c) => {
    const u = c.get('user');
    return c.json({ email: u.email, dev: Boolean(u.dev), runs: { count: store.listRuns().length } });
  });

  app.get('/api/settings', (c) => c.json({ settings: store.getJson('settings') }));
  app.put('/api/settings', async (c) => {
    const clean = validateSettings(await readJson(c));
    store.putJson('settings', clean);
    return c.json({ settings: clean });
  });

  app.get('/api/runs', (c) => {
    const after = c.req.query('after');
    if (after && !isDate(after)) throw new InputError('after moet JJJJ-MM-DD zijn');
    return c.json({ runs: store.listRuns(after || undefined) });
  });

  app.post('/api/runs', async (c) => {
    const run = validateRun(await readJson(c));
    const out = store.addRun({ ...run, source: c.get('user').drx ? 'drx' : 'manual' });
    return c.json(result(out), out.created ? 201 : 200);
  });

  app.post('/api/runs/bulk', async (c) => {
    const body = await readJson(c);
    const list = Array.isArray(body) ? body : body?.runs;
    if (!Array.isArray(list) || !list.length) throw new InputError('Verwacht een JSON-array met runs (of { "runs": [...] })');
    if (list.length > MAX_BULK) throw new InputError(`Maximaal ${MAX_BULK} runs per verzoek`);
    const source = c.get('user').drx ? 'drx' : 'bulk';
    const results = [];
    const valid = [];
    list.forEach((item, index) => {
      try {
        valid.push({ index, run: { ...validateRun(item), source } });
      } catch (e) {
        if (!(e instanceof InputError)) throw e;
        results[index] = { index, status: 'invalid', error: e.message };
      }
    });
    store.addRuns(valid.map((v) => v.run)).forEach((out, i) => {
      const { index } = valid[i];
      results[index] = { index, status: out.created ? 'created' : 'skipped', run: out.run };
    });
    const count = (s) => results.filter((r) => r.status === s).length;
    const summary = { created: count('created'), skipped: count('skipped'), invalid: count('invalid'), results };
    return c.json(summary, valid.length ? 200 : 400);
  });

  app.post('/api/runs/gpx', async (c) => {
    let form;
    try {
      form = await c.req.parseBody();
    } catch {
      throw new InputError('Verwacht multipart/form-data met een veld "file"');
    }
    const file = form.file;
    if (!file || typeof file === 'string') throw new InputError('Veld "file" met een GPX-bestand ontbreekt');
    if (file.size > MAX_GPX_BYTES) return c.json({ error: 'GPX-bestand te groot (max 10 MB)' }, 413);
    const gpx = parseGpx(await file.text(), { timeZone });
    const field = (k) => (typeof form[k] === 'string' && form[k].trim() ? form[k] : undefined);
    const run = validateRun({
      date: gpx.date,
      km: gpx.km,
      duration: gpx.durationS,
      avgHr: field('avgHr') ?? gpx.avgHr,
      notes: field('notes'),
      name: field('name') ?? gpx.name ?? undefined,
    });
    const out = store.addRun({ ...run, source: 'gpx' });
    const { points, elapsedS, start } = gpx;
    return c.json({ ...result(out), gpx: { date: gpx.date, start, km: gpx.km, durationS: gpx.durationS, elapsedS, avgHr: gpx.avgHr, points } }, out.created ? 201 : 200);
  });

  app.delete('/api/runs/:id', (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id) || id <= 0) throw new InputError('Ongeldig id');
    if (!store.deleteRun(id)) return c.json({ error: 'Run niet gevonden' }, 404);
    return c.json({ ok: true });
  });

  return app;
}
