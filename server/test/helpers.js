import { serve } from '@hono/node-server';
import { createApp } from '../src/app.js';
import { openDb } from '../src/db.js';

export const TOKEN = 'test-token-0123456789abcdef0123456789abcdef';

/** Starts the API on a random loopback port with an in-memory database. */
export async function startServer(env = {}) {
  const store = openDb(':memory:');
  const app = createApp({ store, env: { DEV_BYPASS_AUTH: '1', ALLOWED_EMAIL: 'jij@voorbeeld.be', DRX_API_TOKEN: TOKEN, ...env } });
  const server = await new Promise((resolve) => {
    const s = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' }, () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, opts = {}) => {
    const res = await fetch(base + path, opts);
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  const close = () => new Promise((r) => server.close(() => { store.close(); r(); }));
  return { base, call, close, store };
}

export function gpxFixture({ points = 61, stepS = 6, start = '2026-11-25T06:30:00Z', hr = 150, pauseAt = -1 } = {}) {
  // Runs north along a meridian: 0.0003° lat ≈ 33.4 m per point.
  let t = Date.parse(start);
  let lat = 50.8;
  const pts = [];
  for (let i = 0; i < points; i++) {
    if (i === pauseAt) t += 120_000; // stand still for two minutes
    pts.push(`<trkpt lat="${lat.toFixed(6)}" lon="3.2650"><ele>20</ele><time>${new Date(t).toISOString()}</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>${hr}</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>`);
    lat += 0.0003;
    t += stepS * 1000;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx creator="StravaGPX" version="1.1" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
 <metadata><time>${start}</time></metadata>
 <trk><name>Ochtendloop &amp; zo</name><type>running</type><trkseg>
${pts.join('\n')}
 </trkseg></trk>
</gpx>`;
}
