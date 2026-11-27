import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../app.js';
import { openDb } from '../db.js';
import { parseGpx, parseDuration } from '../runs.js';

const TOKEN = 'x'.repeat(40);

function setup(extraEnv = {}) {
  const store = openDb(':memory:');
  const env = { DEV_BYPASS_AUTH: '1', ALLOWED_EMAIL: 'carl@example.com', DRX_API_TOKEN: TOKEN, ...extraEnv };
  const app = createApp({ store, env });
  const call = (path, init = {}, host = 'localhost') => app.request(`http://${host}${path}`, init);
  const json = (method, body, headers = {}) => ({
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  return { app, store, call, json };
}

const gpx = (points, { name = 'Ochtendloop', hr = true } = {}) => `<?xml version="1.0"?>
<gpx version="1.1" creator="test" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
  <trk><name>${name}</name><trkseg>
  ${points.map(([lat, lon, time, h]) => `<trkpt lat="${lat}" lon="${lon}"><time>${time}</time>${hr ? `<extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>${h}</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions>` : ''}</trkpt>`).join('\n  ')}
  </trkseg></trk>
</gpx>`;

// 0.01° latitude ≈ 1.112 km
const sample = gpx([
  [50.80, 3.26, '2026-11-26T23:30:00Z', 140],
  [50.81, 3.26, '2026-11-26T23:36:00Z', 150],
  [50.82, 3.26, '2026-11-26T23:42:00Z', 160],
]);

test('parseDuration accepts seconds and clock formats', () => {
  assert.equal(parseDuration(3600), 3600);
  assert.equal(parseDuration('3600'), 3600);
  assert.equal(parseDuration('1:02:03'), 3723);
  assert.equal(parseDuration('45:30'), 2730);
  assert.ok(Number.isNaN(parseDuration('1:75:00')));
  assert.ok(Number.isNaN(parseDuration('abc')));
});

test('parseGpx reads distance, duration, local date, heart rate and name', () => {
  const r = parseGpx(sample);
  assert.ok(Math.abs(r.km - 2.22) < 0.02, `km was ${r.km}`);
  assert.equal(r.duration, 12 * 60);
  assert.equal(r.date, '2026-11-27', 'start 23:30 UTC is 00:30 in Brussels');
  assert.equal(r.avgHr, 150);
  assert.equal(r.name, 'Ochtendloop');
});

test('parseGpx does not bridge the gap between segments', () => {
  const xml = `<gpx><trk><trkseg>
    <trkpt lat="50.80" lon="3.26"><time>2026-11-27T08:00:00Z</time></trkpt>
    <trkpt lat="50.81" lon="3.26"><time>2026-11-27T08:06:00Z</time></trkpt>
  </trkseg><trkseg>
    <trkpt lat="51.00" lon="3.26"><time>2026-11-27T08:10:00Z</time></trkpt>
    <trkpt lat="51.01" lon="3.26"><time>2026-11-27T08:16:00Z</time></trkpt>
  </trkseg></trk></gpx>`;
  const r = parseGpx(xml);
  assert.ok(Math.abs(r.km - 2.22) < 0.02, `km was ${r.km}`);
});

test('parseGpx rejects files without a track or times', () => {
  assert.throws(() => parseGpx('<html></html>'), /geen GPX/);
  assert.throws(() => parseGpx('<gpx></gpx>'), /minstens twee punten/);
  assert.throws(() => parseGpx('<gpx><trkpt lat="1" lon="1"/><trkpt lat="1.1" lon="1"/></gpx>'), /geen tijden/);
});

test('manual run: add, list, duplicate skipped, delete', async () => {
  const { call, json } = setup();
  let res = await call('/api/runs', json('POST', { date: '2026-11-25', km: 10, duration: '55:00', avgHr: 152, notes: 'rustig' }));
  assert.equal(res.status, 201);
  const { run } = await res.json();
  assert.equal(run.km, 10);
  assert.equal(run.movingTime, 3300);
  assert.equal(run.source, 'manual');

  res = await call('/api/runs', json('POST', { datum: '2026-11-25', afstand: 10.04, duur: 3290 }));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).duplicate, true);

  res = await call('/api/runs?after=2026-11-01');
  assert.equal((await res.json()).runs.length, 1);

  res = await call(`/api/runs/${run.id}`, { method: 'DELETE' });
  assert.equal(res.status, 200);
  res = await call(`/api/runs/${run.id}`, { method: 'DELETE' });
  assert.equal(res.status, 404);
});

test('validation errors are 400 with a message', async () => {
  const { call, json } = setup();
  for (const body of [
    { date: '2026-13-01', km: 5, duration: 1800 },
    { date: '2026-11-25', km: 0, duration: 1800 },
    { date: '2026-11-25', km: 5, duration: 'x' },
    { date: '2026-11-25', km: 30, duration: 1800 },
    { date: '2026-11-25', km: 5, duration: 1800, avgHr: 400 },
  ]) {
    const res = await call('/api/runs', json('POST', body));
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.ok((await res.json()).error);
  }
  const res = await call('/api/runs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{nope' });
  assert.equal(res.status, 400);
});

test('bulk import skips duplicates, also within one request', async () => {
  const { call, json } = setup();
  await call('/api/runs', json('POST', { date: '2026-11-20', km: 8, duration: 2700 }));
  const res = await call('/api/runs/bulk', json('POST', { runs: [
    { date: '2026-11-20', km: 8, duration: 2700 },
    { date: '2026-11-22', km: 12, duration: '1:08:00' },
    { date: '2026-11-22', km: 12.02, duration: '1:08:10' },
  ] }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.added, 1);
  assert.equal(body.skipped, 2);
});

test('bulk import is all-or-nothing on invalid input', async () => {
  const { call, json, store } = setup();
  const res = await call('/api/runs/bulk', json('POST', [{ date: '2026-11-22', km: 12, duration: 4000 }, { date: 'gisteren', km: 5, duration: 1500 }]));
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /^Run 2:/);
  assert.equal(store.listRuns().length, 0);
});

test('GPX upload creates a run', async () => {
  const { call } = setup();
  const form = new FormData();
  form.append('file', new File([sample], 'loop.gpx', { type: 'application/gpx+xml' }));
  form.append('notes', 'met wind');
  const res = await call('/api/runs/gpx', { method: 'POST', body: form });
  assert.equal(res.status, 201);
  const { run } = await res.json();
  assert.equal(run.date, '2026-11-27');
  assert.equal(run.source, 'gpx');
  assert.equal(run.notes, 'met wind');
  assert.equal(run.avgHr, 150);
});

test('DRX token may log and read runs, but nothing else', async () => {
  // No dev bypass: only the token can get in. Host is 127.0.0.1, like a call from the server itself.
  const { call, json } = setup({ DEV_BYPASS_AUTH: undefined, ACCESS_TEAM_DOMAIN: 'x.cloudflareaccess.com', ACCESS_AUD: 'aud' });
  const auth = { authorization: `Bearer ${TOKEN}` };

  let res = await call('/api/runs', json('POST', { date: '2026-11-24', km: 6, duration: 2100 }, auth), '127.0.0.1');
  assert.equal(res.status, 201);
  assert.equal((await res.json()).run.source, 'drx');

  res = await call('/api/runs/bulk', json('POST', { runs: [{ date: '2026-11-24', km: 6, duration: 2100 }] }, auth), '127.0.0.1');
  assert.equal((await res.json()).skipped, 1);

  res = await call('/api/runs', { headers: auth }, '127.0.0.1');
  assert.equal(res.status, 200);

  res = await call('/api/runs/1', { method: 'DELETE', headers: auth }, '127.0.0.1');
  assert.equal(res.status, 403);
  res = await call('/api/settings', { headers: auth }, '127.0.0.1');
  assert.equal(res.status, 403);

  res = await call('/api/runs', { headers: { authorization: `Bearer ${'y'.repeat(40)}` } }, '127.0.0.1');
  assert.equal(res.status, 401);
  res = await call('/api/runs', {}, '127.0.0.1');
  assert.equal(res.status, 401, 'no token and no Access cookie');
});

test('token shorter than 32 characters is never accepted', async () => {
  const short = 'abc';
  const { call } = setup({ DEV_BYPASS_AUTH: undefined, ACCESS_TEAM_DOMAIN: 'x', ACCESS_AUD: 'a', DRX_API_TOKEN: short });
  const res = await call('/api/runs', { headers: { authorization: `Bearer ${short}` } }, '127.0.0.1');
  assert.equal(res.status, 401);
});

test('without Access configuration the API fails closed', async () => {
  const { call } = setup({ DEV_BYPASS_AUTH: undefined, ALLOWED_EMAIL: '' });
  const res = await call('/api/me', {}, 'carldrx.io');
  assert.equal(res.status, 503);
});

test('dev bypass only works on localhost', async () => {
  const { call } = setup({ ACCESS_TEAM_DOMAIN: 'x.cloudflareaccess.com', ACCESS_AUD: 'aud' });
  assert.equal((await call('/api/me')).status, 200);
  assert.equal((await call('/api/me', {}, 'carldrx.io')).status, 401);
});

test('settings round trip and validation', async () => {
  const { call, json } = setup();
  const settings = { goalTime: '3:59:00', runsPerWeek: 4, currentWeeklyKm: 30, currentLongRunKm: 14, peakWeeklyKm: 65, startDate: '2026-11-30' };
  let res = await call('/api/settings', json('PUT', settings));
  assert.equal(res.status, 200);
  res = await call('/api/settings');
  assert.deepEqual((await res.json()).settings, settings);
  res = await call('/api/settings', json('PUT', { ...settings, runsPerWeek: 9 }));
  assert.equal(res.status, 400);
});
