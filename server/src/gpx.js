// Minimal GPX parser: distance, duration, date (and average heart rate if present).
//
// Works with GPX exports from Strava, Garmin and most watches. Only <trkpt> points
// are used; distance is summed per <trkseg> (no jump between segments).
// Duration is the moving time: stretches slower than 0.5 m/s (standing still) are
// left out, so a stop at a traffic light does not lower the pace. Elapsed time is
// returned as well.

const MOVING_MIN_SPEED = 0.5; // m/s
const R = 6371008.8; // mean Earth radius in metres

function haversine(a, b) {
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLon = (b.lon - a.lon) * toRad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*["']([^"']+)["']`));
  return m ? Number(m[1]) : NaN;
};

const unescapeXml = (s) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
    .trim();

/** Local calendar date (YYYY-MM-DD) of a timestamp in the given IANA time zone. */
export function localDate(ms, timeZone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}

/**
 * Parses GPX text. Returns { date, km, durationS, elapsedS, avgHr, name, points }
 * or throws an Error with status 400.
 */
export function parseGpx(xml, { timeZone = 'Europe/Brussels' } = {}) {
  const fail = (msg) => Object.assign(new Error(msg), { status: 400 });
  if (typeof xml !== 'string' || !/<gpx[\s>]/i.test(xml)) throw fail('Geen geldig GPX-bestand');

  const trk = xml.match(/<trk[\s>][\s\S]*?<name>([\s\S]*?)<\/name>/);
  const meta = xml.match(/<metadata[\s>][\s\S]*?<name>([\s\S]*?)<\/name>/);
  const name = trk ? unescapeXml(trk[1]) : meta ? unescapeXml(meta[1]) : null;

  const segments = xml.split(/<trkseg[\s>]/).slice(1);
  if (!segments.length) throw fail('Het GPX-bestand bevat geen track (trkseg)');

  let distance = 0, moving = 0, points = 0, first = null, last = null;
  let hrSum = 0, hrCount = 0;
  const pointRe = /<trkpt\b([^>]*?)(?:\/>|>([\s\S]*?)<\/trkpt>)/g;

  for (const seg of segments) {
    let prev = null;
    for (const m of seg.split(/<\/trkseg>/)[0].matchAll(pointRe)) {
      const lat = attr(m[1], 'lat');
      const lon = attr(m[1], 'lon');
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
      const body = m[2] || '';
      const tm = body.match(/<time>\s*([^<]+?)\s*<\/time>/);
      const t = tm ? Date.parse(tm[1]) : NaN;
      const hr = body.match(/<(?:\w+:)?hr>\s*(\d+(?:\.\d+)?)\s*<\/(?:\w+:)?hr>/);
      if (hr) {
        const v = Number(hr[1]);
        if (v >= 30 && v <= 250) { hrSum += v; hrCount++; }
      }
      const p = { lat, lon, t };
      points++;
      if (Number.isFinite(t)) {
        if (first === null || t < first) first = t;
        if (last === null || t > last) last = t;
      }
      if (prev) {
        const d = haversine(prev, p);
        distance += d;
        if (Number.isFinite(t) && Number.isFinite(prev.t) && t > prev.t) {
          const dt = (t - prev.t) / 1000;
          if (d / dt >= MOVING_MIN_SPEED) moving += dt;
        }
      }
      prev = p;
    }
  }

  if (points < 2) throw fail('Het GPX-bestand bevat te weinig punten');
  if (first === null || last === null || last <= first) throw fail('Het GPX-bestand bevat geen tijden; geef datum en duur zelf in');
  const elapsedS = Math.round((last - first) / 1000);
  const km = Math.round(distance / 10) / 100;
  if (km <= 0) throw fail('Afstand is 0 km');

  return {
    date: localDate(first, timeZone),
    start: new Date(first).toISOString(),
    km,
    durationS: Math.round(moving) || elapsedS,
    elapsedS,
    avgHr: hrCount ? Math.round(hrSum / hrCount) : null,
    name,
    points,
  };
}
