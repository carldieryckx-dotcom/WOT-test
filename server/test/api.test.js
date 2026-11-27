import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, gpxFixture, TOKEN } from './helpers.js';

let srv;
before(async () => { srv = await startServer(); });
after(async () => { await srv.close(); });

const json = (method, body, headers = {}) => ({ method, headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

test('me and settings', async () => {
  const me = await srv.call('/api/me');
  assert.equal(me.status, 200);
  assert.equal(me.body.email, 'jij@voorbeeld.be');
  assert.deepEqual((await srv.call('/api/settings')).body, { settings: null });
  const s = { goalTime: '3:59:00', runsPerWeek: 4, currentWeeklyKm: 25, currentLongRunKm: 12, peakWeeklyKm: 55, startDate: '2026-11-23' };
  assert.equal((await srv.call('/api/settings', json('PUT', s))).status, 200);
  assert.deepEqual((await srv.call('/api/settings')).body.settings, s);
  assert.equal((await srv.call('/api/settings', json('PUT', { ...s, runsPerWeek: 9 }))).status, 400);
});

test('manual run: create, duplicate skipped, validation', async () => {
  const run = { date: '2026-11-24', km: 8.04, duration: '45:30', avgHr: 141, notes: 'Rustig' };
  const a = await srv.call('/api/runs', json('POST', run));
  assert.equal(a.status, 201);
  assert.equal(a.body.created, true);
  assert.equal(a.body.run.movingTime, 2730);
  assert.equal(a.body.run.source, 'manual');
  const b = await srv.call('/api/runs', json('POST', { ...run, notes: 'nogmaals' }));
  assert.equal(b.status, 200);
  assert.equal(b.body.skipped, true);
  assert.equal(b.body.run.id, a.body.run.id);
  assert.equal((await srv.call('/api/runs', json('POST', { ...run, date: '24/11/2026' }))).status, 400);
  assert.equal((await srv.call('/api/runs', json('POST', { ...run, km: -1 }))).status, 400);
  assert.equal((await srv.call('/api/runs', json('POST', { ...run, duration: 'snel' }))).status, 400);
});

test('bulk: creates, skips duplicates (also within the batch), reports invalid', async () => {
  const r = await srv.call('/api/runs/bulk', json('POST', [
    { date: '2026-11-24', km: 8.04, duration: 2730 },
    { date: '2026-11-26', km: '10,5', duration: '1:02:03' },
    { date: '2026-11-26', km: 10.5, duration: 3700 },
    { date: 'gisteren', km: 5, duration: 1800 },
  ]));
  assert.equal(r.status, 200);
  assert.deepEqual([r.body.created, r.body.skipped, r.body.invalid], [1, 2, 1]);
  assert.deepEqual(r.body.results.map((x) => x.status), ['skipped', 'created', 'skipped', 'invalid']);
  assert.equal(r.body.results[1].run.movingTime, 3723);
});

test('list with after filter, delete', async () => {
  const all = (await srv.call('/api/runs')).body.runs;
  assert.deepEqual(all.map((r) => r.date), ['2026-11-26', '2026-11-24']);
  assert.equal((await srv.call('/api/runs?after=2026-11-25')).body.runs.length, 1);
  assert.equal((await srv.call('/api/runs?after=morgen')).status, 400);
  const id = all[0].id;
  assert.equal((await srv.call(`/api/runs/${id}`, { method: 'DELETE' })).status, 200);
  assert.equal((await srv.call(`/api/runs/${id}`, { method: 'DELETE' })).status, 404);
});

test('gpx upload: parsed on the server, duplicate skipped', async () => {
  const send = (xml, extra = {}) => {
    const fd = new FormData();
    fd.append('file', new Blob([xml], { type: 'application/gpx+xml' }), 'loop.gpx');
    for (const [k, v] of Object.entries(extra)) fd.append(k, v);
    return srv.call('/api/runs/gpx', { method: 'POST', body: fd });
  };
  const a = await send(gpxFixture(), { notes: 'Via GPX' });
  assert.equal(a.status, 201, JSON.stringify(a.body));
  assert.equal(a.body.run.date, '2026-11-25');
  assert.equal(a.body.run.source, 'gpx');
  assert.equal(a.body.run.avgHr, 150);
  assert.equal(a.body.run.notes, 'Via GPX');
  assert.equal(a.body.run.name, 'Ochtendloop & zo');
  assert.equal((await send(gpxFixture())).body.skipped, true);
  assert.equal((await send('geen gpx')).status, 400);
  assert.equal((await srv.call('/api/runs/gpx', json('POST', {}))).status, 400);
});

test('gpx upload over 10 MB is refused', async () => {
  const fd = new FormData();
  fd.append('file', new Blob(['x'.repeat(11 * 1024 * 1024)]), 'groot.gpx');
  assert.equal((await srv.call('/api/runs/gpx', { method: 'POST', body: fd })).status, 413);
});

test('cross-site writes are refused', async () => {
  const r = await srv.call('/api/runs', json('POST', { date: '2026-11-27', km: 5, duration: 1800 }, { origin: 'https://evil.example' }));
  assert.equal(r.status, 403);
});

test('DRX token: works on import routes from 127.0.0.1, nowhere else', async () => {
  const auth = { authorization: `Bearer ${TOKEN}` };
  const a = await srv.call('/api/runs', json('POST', { date: '2026-11-27', km: 6, duration: 2100 }, auth));
  assert.equal(a.status, 201);
  assert.equal(a.body.run.source, 'drx');
  const b = await srv.call('/api/runs/bulk', json('POST', { runs: [{ date: '2026-11-27', km: 6, duration: 2100 }] }, auth));
  assert.equal(b.body.skipped, 1);
  assert.equal((await srv.call('/api/runs', { headers: auth })).status, 403);
  assert.equal((await srv.call('/api/runs/1', { method: 'DELETE', headers: auth })).status, 403);
  assert.equal((await srv.call('/api/runs', json('POST', { date: '2026-11-28', km: 6, duration: 2100 }, { authorization: 'Bearer fout' }))).status, 401);
  // Through Caddy (X-Forwarded-For present) the token is refused.
  const viaProxy = await srv.call('/api/runs', json('POST', { date: '2026-11-28', km: 6, duration: 2100 }, { ...auth, 'x-forwarded-for': '203.0.113.9' }));
  assert.equal(viaProxy.status, 403);
});

test('fail closed without Access configuration', async () => {
  const prod = await startServer({ DEV_BYPASS_AUTH: '' , ALLOWED_EMAIL: '' });
  try {
    assert.equal((await prod.call('/api/me')).status, 503);
    assert.equal((await prod.call('/api/runs')).status, 503);
    assert.equal((await prod.call('/api/auth-check')).status, 503);
  } finally {
    await prod.close();
  }
});

test('dev bypass is ignored for proxied requests', async () => {
  const prod = await startServer({ ACCESS_TEAM_DOMAIN: 'x.cloudflareaccess.com', ACCESS_AUD: 'aud' });
  try {
    assert.equal((await prod.call('/api/me', { headers: { 'x-forwarded-for': '203.0.113.9' } })).status, 401);
    assert.equal((await prod.call('/api/auth-check')).status, 204);
  } finally {
    await prod.close();
  }
});

test('token routes return 503 when DRX_API_TOKEN is not set', async () => {
  const s = await startServer({ DRX_API_TOKEN: '' });
  try {
    assert.equal((await s.call('/api/runs', json('POST', { date: '2026-11-27', km: 5, duration: 1800 }, { authorization: 'Bearer iets' }))).status, 503);
  } finally {
    await s.close();
  }
});
