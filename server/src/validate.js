// Input validation for runs and settings.

export class InputError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDate(s) {
  if (!DATE_RE.test(String(s))) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/**
 * Duration in seconds from:
 *   a number (seconds), "3600", "1:02:03" (u:mm:ss), "58:30" (mm:ss).
 */
export function parseDuration(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v) : NaN;
  const s = String(v ?? '').trim();
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(Number(s));
  const m = s.match(/^(?:(\d{1,2}):)?(\d{1,3}):(\d{2})$/);
  if (!m) return NaN;
  const [, h, min, sec] = m;
  if (Number(sec) >= 60 || (h !== undefined && Number(min) >= 60)) return NaN;
  return Number(h || 0) * 3600 + Number(min) * 60 + Number(sec);
}

const text = (v, max) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (s.length > max) throw new InputError(`Tekst is te lang (max ${max} tekens)`);
  return s;
};

/**
 * Validates one run. Accepted fields:
 *   date (YYYY-MM-DD) · km (or distanceKm) · duration (s, "u:mm:ss", "mm:ss") or durationSec
 *   avgHr (optional) · notes (optional) · name (optional)
 * Returns { date, km, durationS, avgHr, notes, name }.
 */
export function validateRun(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new InputError('Verwacht een JSON-object');
  const date = String(body.date ?? '').trim();
  if (!isDate(date)) throw new InputError('date moet JJJJ-MM-DD zijn');

  const kmRaw = body.km ?? body.distanceKm;
  const km = typeof kmRaw === 'string' ? Number(kmRaw.replace(',', '.')) : Number(kmRaw);
  if (kmRaw === undefined || kmRaw === '' || !Number.isFinite(km) || km <= 0 || km > 300) throw new InputError('km moet een getal tussen 0 en 300 zijn');

  const durationS = parseDuration(body.duration ?? body.durationSec);
  if (!Number.isFinite(durationS) || durationS <= 0 || durationS > 48 * 3600) throw new InputError('duration moet in seconden of als u:mm:ss (max 48 u)');

  let avgHr = null;
  if (body.avgHr !== undefined && body.avgHr !== null && body.avgHr !== '') {
    avgHr = Math.round(Number(body.avgHr));
    if (!Number.isFinite(avgHr) || avgHr < 30 || avgHr > 250) throw new InputError('avgHr moet tussen 30 en 250 liggen');
  }
  return {
    date,
    km: Math.round(km * 100) / 100,
    durationS,
    avgHr,
    notes: text(body.notes, 2000),
    name: text(body.name, 200),
  };
}

const NUMBER_FIELDS = { runsPerWeek: [3, 6], currentWeeklyKm: [5, 150], currentLongRunKm: [4, 35], peakWeeklyKm: [25, 160] };

export function validateSettings(body) {
  if (!body || typeof body !== 'object') throw new InputError('Ongeldige JSON');
  const clean = {};
  for (const [k, [min, max]] of Object.entries(NUMBER_FIELDS)) {
    const v = Number(body[k]);
    if (!Number.isFinite(v) || v < min || v > max) throw new InputError(`${k} moet tussen ${min} en ${max} liggen`);
    clean[k] = v;
  }
  if (!/^\d{1,2}:\d{2}(:\d{2})?$/.test(String(body.goalTime))) throw new InputError('goalTime moet u:mm:ss zijn');
  clean.goalTime = String(body.goalTime);
  if (!isDate(String(body.startDate))) throw new InputError('startDate moet JJJJ-MM-DD zijn');
  clean.startDate = String(body.startDate);
  return clean;
}
