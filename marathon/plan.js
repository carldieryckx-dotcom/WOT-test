// Marathon training plan generator (pure functions, no DOM, no network).
// Builds a periodised plan from the start date to race day:
//   base → build → peak → taper, with a cutback week every 4th week.

export const RACE = {
  name: 'Skylux Marathon Kortrijk',
  date: '2027-04-25',
  distanceKm: 42.195,
};

export const DEFAULTS = {
  startDate: '2026-11-30',
  goalTime: '3:59:00',
  runsPerWeek: 4,
  currentWeeklyKm: 25,
  currentLongRunKm: 12,
  peakWeeklyKm: 60,
};

const DAY = 86400000;
export const parseDate = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
export const fmtDate = (d) => d.toISOString().slice(0, 10);
export const addDays = (s, n) => fmtDate(new Date(parseDate(s).getTime() + n * DAY));
export const daysBetween = (a, b) => Math.round((parseDate(b) - parseDate(a)) / DAY);
/** Monday-based weekday: 0 = Monday … 6 = Sunday */
export const weekday = (s) => (parseDate(s).getUTCDay() + 6) % 7;
export const mondayOf = (s) => addDays(s, -weekday(s));

export function parseTime(t) {
  const parts = String(t).trim().split(':').map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return null;
  while (parts.length < 3) parts.unshift(0);
  const [h, m, s] = parts;
  return h * 3600 + m * 60 + s;
}
export function fmtPace(secPerKm) {
  const s = Math.round(secPerKm);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
export function fmtDuration(sec) {
  const s = Math.round(sec);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}
const round05 = (x) => Math.round(x * 2) / 2;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

/** Training paces in seconds per km, derived from the goal marathon pace. */
export function pacesFor(goalTime) {
  const mp = parseTime(goalTime) / RACE.distanceKm;
  const range = (a, b) => ({ min: mp + a, max: mp + b, label: `${fmtPace(mp + a)}–${fmtPace(mp + b)} /km` });
  return {
    marathon: { min: mp - 3, max: mp + 3, label: `${fmtPace(mp)} /km` },
    easy: range(45, 75),
    long: range(30, 60),
    recovery: range(75, 100),
    tempo: range(-22, -15),
    interval: range(-35, -28),
    mpSeconds: mp,
  };
}

export const TYPE_LABELS = {
  rest: 'Rust',
  easy: 'Rustige duurloop',
  recovery: 'Herstelloop',
  long: 'Lange duurloop',
  fartlek: 'Fartlek / snelheid',
  tempo: 'Tempo / drempel',
  interval: 'Intervallen',
  mp: 'Marathontempo',
  race: 'Wedstrijd',
};

// Quality sessions per phase: [title, work description, approx total km incl. warm-up/cool-down, pace key]
const QUALITY = {
  base: [
    ['Fartlek', '8 × 1′ vlot / 1′ rustig, met 2 km in- en uitlopen', 8, 'tempo'],
    ['Heuvels', '8 × 45″ stevig bergop, rustig terug, met 2 km in- en uitlopen', 8, 'interval'],
    ['Rustig + strides', 'Rustige loop met 6 × 100 m versnellingen op het einde', 7, 'easy'],
    ['Fartlek', '10 × 1′ vlot / 1′ rustig, met 2 km in- en uitlopen', 9, 'tempo'],
  ],
  build: [
    ['Tempo', '3 × 10′ op drempeltempo, 2′ dribbel, met 2 km in- en uitlopen', 11, 'tempo'],
    ['Intervallen', '5 × 1 km op 10K-tempo, 2′ dribbel, met 2,5 km in- en uitlopen', 11, 'interval'],
    ['Tempo', '2 × 15′ op drempeltempo, 3′ dribbel, met 2 km in- en uitlopen', 12, 'tempo'],
    ['Intervallen', '6 × 800 m op 10K-tempo, 90″ dribbel, met 2,5 km in- en uitlopen', 10, 'interval'],
    ['Tempo', '25′ continu op drempeltempo, met 2,5 km in- en uitlopen', 11, 'tempo'],
  ],
  peak: [
    ['Intervallen', '6 × 1 km op 10K-tempo, 2′ dribbel, met 2,5 km in- en uitlopen', 12, 'interval'],
    ['Tempo', '4 × 2 km op drempeltempo, 2′ dribbel, met 2 km in- en uitlopen', 14, 'tempo'],
    ['Intervallen', '3 × 3 km iets sneller dan marathontempo, 3′ dribbel, met 2 km in- en uitlopen', 14, 'tempo'],
  ],
  taper: [
    ['Scherpte', '4 × 1 km op marathontempo, 2′ dribbel, met 2 km in- en uitlopen', 9, 'marathon'],
    ['Scherpte', '3 × 1 km op 10K-tempo, 2′ dribbel, met 2 km in- en uitlopen', 8, 'interval'],
  ],
};

// Which weekday carries which kind of run, by runs per week (0 = Monday).
const LAYOUTS = {
  3: { 1: 'q', 3: 'easy', 6: 'long' },
  4: { 1: 'q', 3: 'q2', 5: 'easy', 6: 'long' },
  5: { 1: 'q', 2: 'easy', 3: 'q2', 5: 'easy', 6: 'long' },
  6: { 0: 'recovery', 1: 'q', 2: 'easy', 3: 'q2', 5: 'easy', 6: 'long' },
};

export function normaliseSettings(input = {}) {
  const s = { ...DEFAULTS, ...input };
  s.runsPerWeek = clamp(Math.round(Number(s.runsPerWeek) || DEFAULTS.runsPerWeek), 3, 6);
  s.currentWeeklyKm = clamp(Number(s.currentWeeklyKm) || DEFAULTS.currentWeeklyKm, 5, 150);
  s.currentLongRunKm = clamp(Number(s.currentLongRunKm) || DEFAULTS.currentLongRunKm, 4, 35);
  s.peakWeeklyKm = clamp(Number(s.peakWeeklyKm) || DEFAULTS.peakWeeklyKm, 25, 160);
  if (s.peakWeeklyKm < s.currentWeeklyKm) s.peakWeeklyKm = s.currentWeeklyKm;
  if (!parseTime(s.goalTime) || parseTime(s.goalTime) < 2 * 3600 || parseTime(s.goalTime) > 7 * 3600) s.goalTime = DEFAULTS.goalTime;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.startDate)) s.startDate = DEFAULTS.startDate;
  return s;
}

function phaseList(n) {
  const taper = 3, peak = n >= 12 ? 3 : 2;
  const rest = n - taper - peak;
  const base = Math.max(1, Math.round(rest * 0.4));
  const build = rest - base;
  return [
    ...Array(base).fill('base'),
    ...Array(build).fill('build'),
    ...Array(peak).fill('peak'),
    ...Array(taper).fill('taper'),
  ];
}

export const PHASE_LABELS = { base: 'Basis', build: 'Opbouw', peak: 'Piek', taper: 'Taper' };

export function buildPlan(rawSettings) {
  const s = normaliseSettings(rawSettings);
  const start = mondayOf(s.startDate);
  const raceMonday = mondayOf(RACE.date);
  const n = clamp(Math.floor(daysBetween(start, raceMonday) / 7) + 1, 6, 40);
  const phases = phaseList(n);
  const paces = pacesFor(s.goalTime);
  const layout = LAYOUTS[s.runsPerWeek];
  const firstPeak = phases.indexOf('peak');

  // --- weekly volume and long-run targets ---
  const volumes = [];
  const longs = [];
  let lastBuildVol = s.currentWeeklyKm;
  let lastLong = s.currentLongRunKm;
  let qCount = { base: 0, build: 0, peak: 0, taper: 0 };

  for (let i = 0; i < n; i++) {
    const phase = phases[i];
    const weeksToRace = n - 1 - i;
    const cutback = (phase === 'base' || phase === 'build') && i % 4 === 3;
    let vol, long;
    if (phase === 'taper') {
      const f = weeksToRace === 2 ? 0.75 : weeksToRace === 1 ? 0.55 : 0.3;
      vol = s.peakWeeklyKm * f;
      long = weeksToRace === 2 ? Math.min(24, lastLong) : weeksToRace === 1 ? Math.min(18, lastLong) : RACE.distanceKm;
    } else if (phase === 'peak') {
      vol = Math.min(s.peakWeeklyKm, lastBuildVol * 1.1);
      lastBuildVol = vol;
      const target = [30, 32, 32][i - firstPeak] ?? 32;
      long = Math.min(target, lastLong + 3);
      lastLong = long;
    } else {
      const progress = firstPeak > 0 ? i / firstPeak : 1;
      const target = s.currentWeeklyKm + (s.peakWeeklyKm - s.currentWeeklyKm) * progress;
      const built = Math.min(target, lastBuildVol * 1.1, s.peakWeeklyKm);
      if (cutback) {
        vol = built * 0.75;
        long = Math.max(8, lastLong * 0.7);
      } else {
        vol = Math.max(built, lastBuildVol);
        lastBuildVol = vol;
        long = Math.min(30, lastLong + (i === 0 ? 1 : 2));
        lastLong = long;
      }
    }
    if (phase !== 'taper' || weeksToRace > 0) long = Math.min(long, Math.max(8, vol * 0.55));
    volumes.push(vol);
    longs.push(long);
  }

  // --- days ---
  const weeks = [];
  for (let i = 0; i < n; i++) {
    const phase = phases[i];
    const weekStart = addDays(start, i * 7);
    const weeksToRace = n - 1 - i;
    const cutback = (phase === 'base' || phase === 'build') && i % 4 === 3;
    const days = [];
    const make = (dow, type, km, title, detail, paceKey) => ({
      date: addDays(weekStart, dow),
      dow,
      type,
      km: type === 'race' ? km : km ? round05(km) : 0,
      title: title || TYPE_LABELS[type],
      detail: detail || '',
      pace: paceKey && paces[paceKey] ? paces[paceKey].label : '',
    });

    if (weeksToRace === 0) {
      // Race week
      for (let d = 0; d < 7; d++) {
        if (d === 1) days.push(make(d, 'mp', 6, 'Kort marathontempo', '1,5 km inlopen, 3 km op marathontempo, 1,5 km uitlopen', 'marathon'));
        else if (d === 2 && s.runsPerWeek >= 5) days.push(make(d, 'easy', 5, null, 'Heel rustig, korte benen', 'easy'));
        else if (d === 3) days.push(make(d, 'easy', 5, 'Rustig + strides', 'Rustige loop met 4 × 100 m versnellingen', 'easy'));
        else if (d === 5 && s.runsPerWeek >= 4) days.push(make(d, 'recovery', 3, 'Shake-out', '20′ heel rustig, startnummer ophalen', 'recovery'));
        else if (d === 6) days.push(make(d, 'race', RACE.distanceKm, RACE.name, `Doel: ${s.goalTime} — start op ${paces.marathon.label}, niet sneller`, 'marathon'));
        else days.push(make(d, 'rest', 0, null, 'Rust, slaap en koolhydraten'));
      }
    } else {
      const qList = QUALITY[phase];
      const q = qList[qCount[phase] % qList.length];
      qCount[phase]++;
      let qKm = cutback ? q[2] * 0.8 : q[2];
      // q2: marathon-pace run in build/peak, otherwise easy
      let mpKm = phase === 'build' ? clamp(6 + Math.floor(i / 2), 6, 12) : phase === 'peak' ? 12 : phase === 'taper' ? 8 : 0;
      const longKm = longs[i];
      const slots = Object.entries(layout).map(([d, kind]) => [Number(d), kind]);
      // Keep the marathon-pace run inside this week's volume budget (easy runs keep at least 5 km)
      const plainEasy = slots.filter(([, k]) => k === 'easy' || k === 'recovery').length;
      if (mpKm && slots.some(([, k]) => k === 'q2')) {
        const budget = volumes[i] - qKm - longKm - plainEasy * 5 - 4;
        mpKm = budget >= 4 ? Math.min(mpKm, Math.floor(budget)) : 0;
      }
      const fixed = [];
      for (const [, kind] of slots) {
        if (kind === 'q') fixed.push(qKm);
        if (kind === 'long') fixed.push(longKm);
        if (kind === 'q2' && mpKm && !cutback) fixed.push(mpKm + 4);
      }
      const easySlots = slots.filter(([, k]) => k === 'easy' || k === 'recovery' || (k === 'q2' && (!mpKm || cutback)));
      const remaining = volumes[i] - fixed.reduce((a, b) => a + b, 0);
      const perEasy = easySlots.length ? clamp(remaining / easySlots.length, 4, 16) : 0;

      for (let d = 0; d < 7; d++) {
        const kind = layout[d];
        if (!kind) { days.push(make(d, 'rest', 0, null, d === 0 ? 'Rust of rustig fietsen / mobiliteit' : 'Rust of kracht/core (20–30′)')); continue; }
        if (kind === 'q') {
          const type = phase === 'base' ? (q[0] === 'Rustig + strides' ? 'easy' : 'fartlek') : q[3] === 'marathon' ? 'mp' : q[3];
          days.push(make(d, type, qKm, q[0], q[1], q[3]));
        } else if (kind === 'long') {
          let detail = 'Gelijkmatig en ontspannen; oefen je voeding (gel/drank) onderweg';
          let title = 'Lange duurloop';
          if (phase === 'peak' && i - firstPeak === 1) {
            title = 'Lange duurloop met MP';
            detail = `Laatste ${Math.round(longKm * 0.35)} km op marathontempo (${paces.marathon.label})`;
          } else if (phase === 'build' && !cutback && i % 2 === 0 && longKm >= 20) {
            title = 'Lange duurloop met MP';
            detail = `Laatste ${Math.round(longKm * 0.25)} km op marathontempo (${paces.marathon.label})`;
          } else if (cutback) {
            detail = 'Herstelweek: korter en rustig';
          }
          days.push(make(d, 'long', longKm, title, detail, 'long'));
        } else if (kind === 'q2' && mpKm && !cutback) {
          days.push(make(d, 'mp', mpKm + 4, 'Marathontempo', `2 km inlopen, ${mpKm} km op marathontempo, 2 km uitlopen`, 'marathon'));
        } else if (kind === 'recovery') {
          days.push(make(d, 'recovery', Math.min(perEasy, 8), null, 'Heel rustig, op gevoel', 'recovery'));
        } else {
          days.push(make(d, 'easy', perEasy, null, 'Comfortabel tempo, je kunt nog praten', 'easy'));
        }
      }
    }
    weeks.push({
      index: i + 1,
      phase,
      phaseLabel: PHASE_LABELS[phase],
      cutback,
      start: weekStart,
      end: addDays(weekStart, 6),
      plannedKm: round05(days.reduce((a, d) => a + d.km, 0)),
      days,
    });
  }
  return { settings: s, race: RACE, paces, weeks };
}

/**
 * Compare the plan with actual runs.
 * runs: [{ id, date: 'YYYY-MM-DD', km, ... }]
 * Returns per-day status and per-week totals.
 */
export function matchRuns(plan, runs, today) {
  const byDate = new Map();
  for (const r of runs) {
    if (!byDate.has(r.date)) byDate.set(r.date, []);
    byDate.get(r.date).push(r);
  }
  let pastPlanned = 0, pastDone = 0;
  const weeks = plan.weeks.map((w) => {
    let actualKm = 0;
    const days = w.days.map((d) => {
      const actual = byDate.get(d.date) || [];
      const km = actual.reduce((a, r) => a + r.km, 0);
      actualKm += km;
      let status;
      if (d.date > today) status = d.type === 'rest' ? 'rest' : 'planned';
      else if (d.type === 'rest') status = km > 0 ? 'extra' : 'rest';
      else if (d.date === today && km === 0) status = 'today';
      else if (km >= d.km * 0.7) status = 'done';
      else if (km > 0) status = 'partial';
      else status = 'missed';
      if (d.type !== 'rest' && d.date <= today && !(d.date === today && km === 0)) {
        pastPlanned++;
        if (status === 'done') pastDone++;
      }
      return { ...d, actual, actualKm: km, status };
    });
    return { ...w, days, actualKm };
  });
  return { weeks, compliance: pastPlanned ? pastDone / pastPlanned : null };
}
