// HTTP API for the marathon app. Caddy forwards /api* to this service on 127.0.0.1.
//
//   GET    /api/me                  who is signed in
//   GET    /api/settings            plan settings
//   PUT    /api/settings
//   GET    /api/runs?after=DATE     logged runs, newest first
//   POST   /api/runs                one run (JSON)
//   POST   /api/runs/bulk           several runs (JSON), duplicates skipped
//   POST   /api/runs/gpx            GPX upload (multipart, field "file")
//   DELETE /api/runs/:id
//   GET    /healthz                 liveness, no auth (not proxied by Caddy)
//
// Every /api request needs a valid Cloudflare Access token for ALLOWED_EMAIL (lib/access.js),
// or, for the run routes DRX uses, "Authorization: Bearer <DRX_API_TOKEN>".

import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { timingSafeEqual } from 'node:crypto';
import { verifyAccess, AuthError } from '../lib/access.js';
import { validateRun, parseGpx, InputError } from './runs.js';

const SETTINGS_KEY = 'settings';
const NUMBER_FIELDS = { runsPerWeek: [3, 6], currentWeeklyKm: [5, 150], currentLongRunKm: [4, 35], peakWeeklyKm: [25, 160] };
const MAX_BULK = 500;
const MAX_GPX_BYTES = 10 * 1024 * 1024;

// Routes a DRX token may call. Settings and deleting stay with Carl.
const TOKEN_ROUTES = new Set(['GET /api/runs', 'POST /api/runs', 'POST /api/runs/bulk', 'POST /api/runs/gpx']);

function tokenMatches(given, expected) {
  if (!expected || expected.length < 32) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const noStore = { 'cache-control': 'no-store' };

export function createApp({ store, env = process.env }) {
  const app = new Hono();

  app.get('/healthz', (c) => c.json({ ok: true }));

  app.onError((err, c) => {
    if (err instanceof InputError || err instanceof AuthError) return c.json({ error: err.message }, err.status, noStore);
    console.error(err);
    return c.json({ error: 'Serverfout' }, 500, noStore);
  });

  app.use('/api/*', async (c, next) => {
    const auth = c.req.header('authorization') || '';
    if (/^bearer\s/i.test(auth)) {
      if (!tokenMatches(auth.replace(/^bearer\s+/i, '').trim(), env.DRX_API_TOKEN)) {
        return c.json({ error: 'Ongeldig token' }, 401, noStore);
      }
      const route = `${c.req.method} ${c.req.path.replace(/\/+$/, '')}`;
      if (!TOKEN_ROUTES.has(route)) return c.json({ error: 'Dit token mag deze route niet gebruiken' }, 403, noStore);
      c.set('user', { email: null, via: 'token' });
    } else {
      c.set('user', { ...(await verifyAccess(c.req.raw, env)), via: 'access' });
    }
    await next();
    c.header('cache-control', 'no-store');
  });

  const readJson = async (c) => {
    try {
      return await c.req.json();
    } catch {
      throw new InputError('Ongeldige JSON');
    }
  };
  const jsonLimit = bodyLimit({ maxSize: 1024 * 1024, onError: (c) => c.json({ error: 'Te groot (max. 1 MB)' }, 413) });

  /* ---------------- Me & settings ---------------- */
  app.get('/api/me', (c) => c.json({ email: c.get('user').email, drxToken: Boolean(env.DRX_API_TOKEN) }));

  app.get('/api/settings', (c) => c.json({ settings: store.getJson(SETTINGS_KEY) }));

  app.put('/api/settings', jsonLimit, async (c) => {
    const body = await readJson(c);
    const clean = {};
    for (const [k, [min, max]] of Object.entries(NUMBER_FIELDS)) {
      const v = Number(body[k]);
      if (!Number.isFinite(v) || v < min || v > max) throw new InputError(`${k} moet tussen ${min} en ${max} liggen`);
      clean[k] = v;
    }
    if (!/^\d{1,2}:\d{2}(:\d{2})?$/.test(String(body.goalTime))) throw new InputError('goalTime moet u:mm:ss zijn');
    clean.goalTime = String(body.goalTime);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.startDate))) throw new InputError('startDate moet JJJJ-MM-DD zijn');
    clean.startDate = String(body.startDate);
    store.setJson(SETTINGS_KEY, clean);
    return c.json({ settings: clean });
  });

  /* ---------------- Runs ---------------- */
  app.get('/api/runs', (c) => {
    const after = c.req.query('after') || '0000-00-00';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(after)) throw new InputError('after moet JJJJ-MM-DD zijn');
    return c.json({ runs: store.listRuns(after) });
  });

  app.post('/api/runs', jsonLimit, async (c) => {
    const source = c.get('user').via === 'token' ? 'drx' : 'manual';
    const { run, duplicate } = store.addRun(validateRun(await readJson(c), source));
    return c.json({ run, duplicate }, duplicate ? 200 : 201);
  });

  app.post('/api/runs/bulk', jsonLimit, async (c) => {
    const body = await readJson(c);
    const list = Array.isArray(body) ? body : body?.runs;
    if (!Array.isArray(list) || !list.length) throw new InputError('Verwacht { "runs": [ … ] } met minstens één run');
    if (list.length > MAX_BULK) throw new InputError(`Maximaal ${MAX_BULK} runs per verzoek`);
    const source = c.get('user').via === 'token' ? 'drx' : 'manual';
    const valid = list.map((r, i) => {
      try {
        return validateRun(r, source);
      } catch (e) {
        throw new InputError(`Run ${i + 1}: ${e.message}`);
      }
    });
    const { added, skipped } = store.addRuns(valid);
    return c.json({ added: added.length, skipped: skipped.length, runs: added, duplicates: skipped });
  });

  app.post(
    '/api/runs/gpx',
    bodyLimit({ maxSize: MAX_GPX_BYTES + 64 * 1024, onError: (c) => c.json({ error: 'Bestand te groot (max. 10 MB)' }, 413) }),
    async (c) => {
      let form;
      try {
        form = await c.req.parseBody();
      } catch {
        throw new InputError('Verwacht een multipart-upload met het veld "file"');
      }
      const file = form.file;
      if (!file || typeof file === 'string') throw new InputError('Voeg een GPX-bestand toe in het veld "file"');
      if (file.size > MAX_GPX_BYTES) throw new InputError('Bestand te groot (max. 10 MB)');
      const parsed = parseGpx(await file.text());
      const source = c.get('user').via === 'token' ? 'drx-gpx' : 'gpx';
      const input = { ...parsed };
      if (typeof form.notes === 'string' && form.notes.trim()) input.notes = form.notes;
      if (typeof form.name === 'string' && form.name.trim()) input.name = form.name;
      if (typeof form.avgHr === 'string' && form.avgHr.trim()) input.avgHr = form.avgHr;
      const { run, duplicate } = store.addRun(validateRun(input, source));
      return c.json({ run, duplicate }, duplicate ? 200 : 201);
    },
  );

  app.delete('/api/runs/:id', (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id) || id < 1) throw new InputError('Ongeldig id');
    if (!store.deleteRun(id)) return c.json({ error: 'Run niet gevonden' }, 404);
    return c.json({ deleted: id });
  });

  app.notFound((c) => c.json({ error: 'Niet gevonden' }, 404));
  return app;
}
