import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGpx } from '../src/gpx.js';
import { gpxFixture } from './helpers.js';

test('parses distance, duration, date, heart rate and name', () => {
  const r = parseGpx(gpxFixture());
  assert.equal(r.date, '2026-11-25');
  assert.ok(Math.abs(r.km - 2.0) < 0.02, `km ${r.km}`);
  assert.equal(r.durationS, 360);
  assert.equal(r.elapsedS, 360);
  assert.equal(r.avgHr, 150);
  assert.equal(r.name, 'Ochtendloop & zo');
});

test('moving time leaves out a pause, elapsed keeps it', () => {
  const r = parseGpx(gpxFixture({ pauseAt: 30 }));
  // The step across the pause (33 m in 126 s) counts as standing still.
  assert.equal(r.durationS, 354);
  assert.equal(r.elapsedS, 480);
});

test('date uses Belgian local time', () => {
  // 23:30 UTC on 25/11 is already 26/11 in Brussels.
  assert.equal(parseGpx(gpxFixture({ start: '2026-11-25T23:30:00Z' })).date, '2026-11-26');
});

test('rejects files without a track or times', () => {
  assert.throws(() => parseGpx('hallo'), /GPX/);
  assert.throws(() => parseGpx('<gpx><trk></trk></gpx>'), /trkseg/);
  assert.throws(() => parseGpx('<gpx><trk><trkseg><trkpt lat="50" lon="3"/><trkpt lat="50.01" lon="3"/></trkseg></trk></gpx>'), /tijden/);
});
