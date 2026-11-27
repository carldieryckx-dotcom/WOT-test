// Validation of run input (manual JSON and GPX) and GPX parsing.

export class InputError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

const TZ = 'Europe/Brussels';
const pick = (o, ...keys) => keys.map((k) => o[k]).find((v) => v !== undefined && v !== null && v !== '');

function validDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s && s >= '2020-01-01' && s <= '2100-12-31';
}

/** Seconds from a number of seconds or a "u:mm:ss" / "mm:ss" string. */
export function parseDuration(v) {
  if (typeof v === 'number') return Math.round(v);
  const s = String(v ?? '').trim();
  if (/^\d+$/.test(s)) return Number(s);
  const m = s.match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})$/);
  if (!m) return NaN;
  const [, h = '0', min, sec] = m;
  if (Number(sec) > 59 || (m[1] !== undefined && Number(min) > 59)) return NaN;
  return Number(h) * 3600 + Number(min) * 60 + Number(sec);
}

/**
 * Validates one run. Accepts English or Dutch keys:
 *   date|datum, km|afstand, duration|duur (seconds or "u:mm:ss"), avgHr|hartslag, notes|notities, name|naam
 */
export function validateRun(body, source = 'manual') {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new InputError('Verwacht een JSON-object');
  const date = String(pick(body, 'date', 'datum') ?? '');
  if (!validDate(date)) throw new InputError('date moet een geldige datum JJJJ-MM-DD zijn');

  const km = Math.round(Number(pick(body, 'km', 'afstand')) * 100) / 100;
  if (!Number.isFinite(km) || km < 0.1 || km > 100) throw new InputError('km moet tussen 0,1 en 100 liggen');

  const movingTime = parseDuration(pick(body, 'duration', 'duur'));
  if (!Number.isFinite(movingTime) || movingTime < 60 || movingTime > 24 * 3600) {
    throw new InputError('duration moet tussen 1 minuut en 24 uur liggen (seconden of u:mm:ss)');
  }
  const kmh = km / (movingTime / 3600);
  if (kmh > 25) throw new InputError('Afstand en duur kloppen niet (sneller dan 25 km/u)');

  let avgHr = pick(body, 'avgHr', 'hartslag');
  if (avgHr !== undefined) {
    avgHr = Math.round(Number(avgHr));
    if (!Number.isFinite(avgHr) || avgHr < 30 || avgHr > 250) throw new InputError('avgHr moet tussen 30 en 250 liggen');
  }

  const notes = String(pick(body, 'notes', 'notities') ?? '').trim();
  if (notes.length > 1000) throw new InputError('notes mag maximaal 1000 tekens zijn');
  const name = String(pick(body, 'name', 'naam') ?? '').trim();
  if (name.length > 200) throw new InputError('name mag maximaal 200 tekens zijn');

  return { date, km, movingTime, avgHr: avgHr ?? null, notes, name, source };
}

/* ---------------- GPX ---------------- */

const R = 6371008.8; // mean earth radius in metres
const rad = (d) => (d * Math.PI) / 180;
function haversine(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`));
  return m ? Number(m[1]) : NaN;
};

const localDate = (d) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

const decodeXml = (s) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
    .trim();

/**
 * Distance, duration (first to last timestamp), local start date, average heart rate and
 * name from a GPX file. Throws InputError when the file has no usable track.
 */
function trackPoints(text) {
  const points = [];
  const re = /<trkpt\b([^>]*?)(?:\/>|>([\s\S]*?)<\/trkpt>)/gi;
  let m;
  while ((m = re.exec(text))) {
    const lat = attr(m[1], 'lat');
    const lon = attr(m[1], 'lon');
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const inner = m[2] || '';
    const t = inner.match(/<time>\s*([^<]+?)\s*<\/time>/i);
    const hr = inner.match(/<(?:\w+:)?hr>\s*(\d+(?:\.\d+)?)\s*<\/(?:\w+:)?hr>/i);
    points.push({ lat, lon, time: t ? Date.parse(t[1]) : NaN, hr: hr ? Number(hr[1]) : NaN });
  }
  return points;
}

export function parseGpx(xml) {
  if (!/<gpx[\s>]/i.test(xml)) throw new InputError('Dit is geen GPX-bestand');
  // Distance per track segment, so a pause between segments does not add a straight line.
  const segTexts = xml.match(/<trkseg\b[\s\S]*?<\/trkseg>/gi) || [xml];
  const segments = segTexts.map(trackPoints);
  const points = segments.flat();
  if (points.length < 2) throw new InputError('Het GPX-bestand bevat geen track met minstens twee punten');

  let metres = 0;
  for (const seg of segments) {
    for (let i = 1; i < seg.length; i++) metres += haversine(seg[i - 1], seg[i]);
  }

  const times = points.map((p) => p.time).filter(Number.isFinite);
  if (times.length < 2) throw new InputError('Het GPX-bestand bevat geen tijden; vul de run handmatig in');
  const start = Math.min(...times);
  const end = Math.max(...times);

  const hrs = points.map((p) => p.hr).filter((v) => Number.isFinite(v) && v > 0);
  const nameMatch = xml.match(/<trk>[\s\S]*?<name>([\s\S]*?)<\/name>/i) || xml.match(/<name>([\s\S]*?)<\/name>/i);

  return {
    date: localDate(new Date(start)),
    km: Math.round(metres / 10) / 100,
    duration: Math.round((end - start) / 1000),
    avgHr: hrs.length ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : undefined,
    name: nameMatch ? decodeXml(nameMatch[1]).slice(0, 200) : '',
  };
}
