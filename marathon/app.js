import {
  RACE, DEFAULTS, buildPlan, matchRuns, normaliseSettings, daysBetween, fmtPace, fmtDuration, parseDate, TYPE_LABELS,
} from './plan.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const DAYS = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];
const MONTHS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const fmtDay = (s) => { const d = parseDate(s); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; };
const fmtKm = (km) => (Math.round(km * 10) / 10).toLocaleString('nl-BE', { maximumFractionDigits: 1 });
const LOCAL_KEY = 'marathon-settings';

const state = {
  settings: normaliseSettings(DEFAULTS),
  runs: [],
  api: true,
  me: null,
  today: todayStr(),
};

async function api(path, opts = {}) {
  const headers = opts.body instanceof FormData ? {} : { 'content-type': 'application/json' };
  const res = await fetch(path, { credentials: 'same-origin', headers, ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Fout ${res.status}`), { status: res.status, data });
  return data;
}

function banner(text, ok = false) {
  const b = $('banner');
  if (!text) { b.hidden = true; return; }
  b.textContent = text;
  b.className = ok ? 'banner ok' : 'banner';
  b.hidden = false;
}

/* ---------------- Loading ---------------- */
async function loadSettings() {
  let saved = null;
  if (state.api) {
    try {
      saved = (await api('/api/settings')).settings;
    } catch { /* fall back to local copy */ }
  }
  if (!saved) {
    try { saved = JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null'); } catch { saved = null; }
  }
  state.settings = normaliseSettings(saved || DEFAULTS);
}

async function loadMe() {
  try {
    state.me = await api('/api/me');
  } catch (e) {
    state.api = false;
    state.me = null;
  }
}

async function loadRuns() {
  if (!state.api) return;
  try {
    const plan = buildPlan(state.settings);
    const data = await api(`/api/runs?after=${plan.weeks[0].start}`);
    state.runs = data.runs;
    state.fetchedAt = Date.now();
  } catch (e) {
    banner(`Loopjes laden: ${e.message}`);
  }
}

/* ---------------- Rendering ---------------- */
function render() {
  const plan = buildPlan(state.settings);
  const matched = matchRuns(plan, state.runs, state.today);
  renderHero(plan);
  renderEntry();
  renderToday(plan, matched);
  renderStats(plan, matched);
  renderChart(matched);
  renderWeeks(matched);
  renderRuns();
  fillSettings();
}

function renderHero(plan) {
  const raceD = parseDate(RACE.date);
  $('race-date').textContent = `${RACE.name} · zondag ${raceD.getUTCDate()} april ${raceD.getUTCFullYear()}`;
  const left = daysBetween(state.today, RACE.date);
  $('countdown-days').textContent = left >= 0 ? String(left) : '🏁';
  $('goal-line').textContent = `Doel ${plan.settings.goalTime} · marathontempo ${plan.paces.marathon.label} · ${plan.weeks.length} weken schema`;
}

function renderEntry() {
  const status = $('entry-status');
  const disabled = !state.api;
  for (const el of document.querySelectorAll('#run-form input, #run-form button, #gpx-file')) el.disabled = disabled;
  if (!state.api) {
    status.textContent = 'De server is niet bereikbaar. Het schema werkt, maar loopjes toevoegen kan nu niet en instellingen worden enkel in deze browser bewaard.';
    return;
  }
  status.textContent = `${state.runs.length} loopjes sinds de start van het schema`;
}

const STATUS_TEXT = {
  done: '✓ Gedaan',
  partial: '◐ Deels',
  missed: '✕ Gemist',
  extra: '✓ Extra',
  today: '• Vandaag',
  planned: '',
  rest: '',
};

function workoutHtml(d) {
  const km = d.type === 'rest' ? '' : `<div class="km">${fmtKm(d.km)} km${d.pace ? ` · ${esc(d.pace)}` : ''}</div>`;
  return `<h3>${esc(d.title)}</h3>${km}${d.detail ? `<p>${esc(d.detail)}</p>` : ''}`;
}

function renderToday(plan, matched) {
  const days = matched.weeks.flatMap((w) => w.days);
  const body = $('today-body');
  const t = state.today;
  if (t < days[0].date) {
    const first = days.find((d) => d.type !== 'rest');
    body.innerHTML = `<p>Het schema start op maandag ${fmtDay(days[0].date)}.</p><div class="next"><b>Eerste training (${DAYS[first.dow]} ${fmtDay(first.date)}):</b> ${workoutHtml(first)}</div>`;
    return;
  }
  if (t > RACE.date) {
    body.innerHTML = `<h3>Gefinisht? Proficiat! 🏅</h3><p>Rustig herstellen deze week.</p>`;
    return;
  }
  const today = days.find((d) => d.date === t);
  const next = days.find((d) => d.date > t && d.type !== 'rest');
  let html = workoutHtml(today);
  if (today.actualKm > 0) html += `<p class="status st-${today.status}">${STATUS_TEXT[today.status]} — ${fmtKm(today.actualKm)} km gelopen</p>`;
  if (next) html += `<div class="next"><b>Volgende: ${DAYS[next.dow]} ${fmtDay(next.date)}</b> — ${esc(next.title)}, ${fmtKm(next.km)} km</div>`;
  body.innerHTML = html;
}

function renderStats(plan, matched) {
  const runs = state.runs.filter((r) => r.date >= plan.weeks[0].start);
  const total = runs.reduce((a, r) => a + r.km, 0);
  const longest = runs.reduce((a, r) => Math.max(a, r.km), 0);
  const week = matched.weeks.find((w) => w.start <= state.today && w.end >= state.today);
  const compliance = matched.compliance;
  const stat = (v, l) => `<div class="stat"><div class="v">${v}</div><div class="l">${l}</div></div>`;
  $('stats').innerHTML = [
    stat(week ? `${fmtKm(week.actualKm)}<small style="font-size:15px;font-weight:600;color:var(--ink-2)"> / ${fmtKm(week.plannedKm)}</small>` : '–', week ? `km deze week (week ${week.index}, ${week.phaseLabel.toLowerCase()})` : 'km deze week'),
    stat(compliance === null ? '–' : `${Math.round(compliance * 100)}%`, 'trainingen gedaan tot nu'),
    stat(fmtKm(total), 'km gelopen sinds de start'),
    stat(longest ? fmtKm(longest) : '–', 'langste loop (km)'),
  ].join('');
}

function renderChart(matched) {
  const weeks = matched.weeks;
  // Draw at the real pixel width so text stays 11px on every screen.
  const W = Math.max(300, Math.round($('chart').clientWidth || 960));
  const H = W < 560 ? 180 : 220, padL = 30, padR = 4, padT = 10, padB = 24;
  const max = Math.max(10, ...weeks.map((w) => Math.max(w.plannedKm, w.actualKm)));
  const step = [5, 10, 20, 25, 50].find((st) => max / st <= 4) || 50;
  const nice = Math.ceil(max / step) * step;
  const iw = (W - padL - padR) / weeks.length;
  const bw = Math.max(6, iw * 0.62);
  const y = (v) => padT + (H - padT - padB) * (1 - v / nice);
  let svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Geplande en gelopen kilometers per week">`;
  for (let v = 0; v <= nice; v += step) {
    svg += `<line class="grid" x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}"/><text x="${padL - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  }
  const r = 4;
  const barPath = (x, top, w, bottom) => {
    const h = bottom - top;
    if (h <= 0.5) return '';
    const rr = Math.min(r, h, w / 2);
    return `M${x},${bottom}V${top + rr}Q${x},${top} ${x + rr},${top}H${x + w - rr}Q${x + w},${top} ${x + w},${top + rr}V${bottom}Z`;
  };
  weeks.forEach((w, i) => {
    const x = padL + i * iw + (iw - bw) / 2;
    const base = y(0);
    svg += `<path class="bar-plan" d="${barPath(x, y(w.plannedKm), bw, base)}"/>`;
    if (w.actualKm > 0) {
      const inset = bw * 0.22;
      svg += `<path class="bar-done" d="${barPath(x + inset, y(w.actualKm), bw - inset * 2, base)}"/>`;
    }
    const every = iw < 22 ? 4 : 2;
    if (w.index === 1 || (w.index - 1) % every === 0 || i === weeks.length - 1) {
      svg += `<text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle">${w.index}</text>`;
    }
    svg += `<rect class="hit" data-i="${i}" x="${padL + i * iw}" y="${padT}" width="${iw}" height="${H - padT - padB}"/>`;
  });
  const cur = weeks.findIndex((w) => w.start <= state.today && w.end >= state.today);
  if (cur >= 0) {
    const cx = padL + cur * iw + iw / 2;
    svg += `<line class="now" x1="${cx}" x2="${cx}" y1="${padT}" y2="${y(0)}"/>`;
  }
  svg += '</svg>';
  const chart = $('chart');
  chart.innerHTML = svg;
  const tip = $('chart-tip');
  chart.querySelectorAll('.hit').forEach((el) => {
    const w = weeks[Number(el.dataset.i)];
    const show = () => {
      const b = el.getBoundingClientRect();
      tip.innerHTML = `Week ${w.index} (${fmtDay(w.start)}) · ${w.phaseLabel}<br>Gepland ${fmtKm(w.plannedKm)} km · Gelopen ${fmtKm(w.actualKm)} km`;
      tip.style.left = `${b.left + b.width / 2}px`;
      tip.style.top = `${b.top + 8}px`;
      tip.hidden = false;
    };
    el.addEventListener('mouseenter', show);
    el.addEventListener('click', show);
    el.addEventListener('mouseleave', () => { tip.hidden = true; });
  });
}

function renderWeeks(matched) {
  const out = matched.weeks.map((w) => {
    const current = w.start <= state.today && w.end >= state.today;
    const pct = w.plannedKm ? Math.min(100, (w.actualKm / w.plannedKm) * 100) : 0;
    const days = w.days.map((d) => {
      const isToday = d.date === state.today;
      const actual = d.actual.length
        ? `<div class="day-actual">${d.actual.map((r) => `${esc(runName(r))} · ${fmtKm(r.km)} km · ${fmtPace(r.movingTime / Math.max(r.km, 0.01))} /km`).join('<br>')}</div>`
        : '';
      const tag = d.type !== 'rest' && d.title !== TYPE_LABELS[d.type] ? `<span class="tag">${esc(TYPE_LABELS[d.type])}</span>` : '';
      return `<div class="day ${d.type}${isToday ? ' is-today' : ''}">
        <div class="day-date"><b>${DAYS[d.dow]}</b>${fmtDay(d.date)}</div>
        <div><div class="day-title">${esc(d.title)}${tag}</div>${d.detail ? `<div class="day-detail">${esc(d.detail)}${d.pace ? ` · ${esc(d.pace)}` : ''}</div>` : ''}${actual}</div>
        <div class="day-right">${d.km ? `<div class="day-km">${fmtKm(d.km)} km</div>` : ''}<div class="status st-${d.status}">${STATUS_TEXT[d.status]}</div></div>
      </div>`;
    }).join('');
    return `<details class="week${current ? ' current' : ''}" id="week-${w.index}" ${current ? 'open' : ''}>
      <summary>
        <span class="week-num">Week ${w.index}</span>
        <span class="week-meta"><span class="phase phase-${w.phase}">${w.phaseLabel}</span>${fmtDay(w.start)} – ${fmtDay(w.end)}${w.cutback ? ' · herstelweek' : ''}</span>
        <span class="week-km">${fmtKm(w.actualKm)} / ${fmtKm(w.plannedKm)} km<div class="progress" aria-hidden="true"><span style="width:${pct}%"></span></div></span>
      </summary>
      <div class="days">${days}</div>
    </details>`;
  });
  $('weeks').innerHTML = out.join('');
  const hasCurrent = matched.weeks.some((w) => w.start <= state.today && w.end >= state.today);
  if (!hasCurrent && state.today < matched.weeks[0].start) $('week-1').open = true;
  $('jump-today').hidden = !hasCurrent;
}

function runName(r) {
  if (r.name) return r.name;
  return r.source === 'gpx' ? 'GPX-loop' : 'Loopje';
}

function renderRuns() {
  const runs = state.runs.slice(0, 15);
  if (!runs.length) {
    $('runs').innerHTML = `<p class="empty">${state.api ? 'Nog geen loopjes sinds de start van het schema. Voeg er hierboven een toe.' : 'Geen verbinding met de server.'}</p>`;
    return;
  }
  $('runs').innerHTML = `<table class="runs"><thead><tr><th>Datum</th><th>Naam</th><th class="num">Km</th><th class="num">Tempo</th><th class="num hide-sm">Tijd</th><th class="num hide-sm">Hartslag</th><th></th></tr></thead><tbody>${runs
    .map((r) => `<tr><td>${DAYS[(parseDate(r.date).getUTCDay() + 6) % 7]} ${fmtDay(r.date)}</td><td>${esc(runName(r))}${r.notes ? `<span class="run-notes">${esc(r.notes)}</span>` : ''}</td><td class="num">${fmtKm(r.km)}</td><td class="num">${fmtPace(r.movingTime / Math.max(r.km, 0.01))}</td><td class="num hide-sm">${fmtDuration(r.movingTime)}</td><td class="num hide-sm">${r.avgHr ? Math.round(r.avgHr) : '–'}</td><td class="num"><button class="btn-del" data-id="${r.id}" title="Verwijderen" aria-label="Loopje van ${fmtDay(r.date)} verwijderen">✕</button></td></tr>`)
    .join('')}</tbody></table>`;
}

function fillSettings() {
  const f = $('settings-form');
  for (const [k, v] of Object.entries(state.settings)) if (f.elements[k]) f.elements[k].value = v;
}

/* ---------------- Events ---------------- */
$('settings-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const next = normaliseSettings(Object.fromEntries(new FormData(f)));
  state.settings = next;
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  $('settings-msg').textContent = 'Opslaan…';
  let msg = 'Opgeslagen in deze browser.';
  if (state.api) {
    try {
      await api('/api/settings', { method: 'PUT', body: JSON.stringify(next) });
      msg = 'Opgeslagen.';
    } catch (err) {
      msg = `Lokaal opgeslagen (server: ${err.message}).`;
    }
  }
  $('settings-msg').textContent = msg;
  await loadRuns();
  render();
});

async function afterRunChange(msgEl, msg) {
  await loadRuns();
  render();
  $(msgEl).textContent = msg;
}

$('run-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const body = Object.fromEntries(new FormData(f));
  $('run-msg').textContent = 'Opslaan…';
  try {
    const res = await api('/api/runs', { method: 'POST', body: JSON.stringify(body) });
    if (res.created) {
      f.elements.km.value = '';
      f.elements.duration.value = '';
      f.elements.avgHr.value = '';
      f.elements.notes.value = '';
    }
    await afterRunChange('run-msg', res.created ? 'Toegevoegd.' : 'Er staat al een loopje met die datum en afstand; overgeslagen.');
  } catch (err) {
    $('run-msg').textContent = err.message;
  }
});

$('gpx-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const fd = new FormData();
  fd.append('file', file);
  $('gpx-msg').textContent = `${file.name} uploaden…`;
  try {
    const res = await api('/api/runs/gpx', { method: 'POST', body: fd });
    const r = res.run;
    await afterRunChange('gpx-msg', res.created
      ? `Toegevoegd: ${fmtDay(r.date)}, ${fmtKm(r.km)} km in ${fmtDuration(r.movingTime)}.`
      : `Al aanwezig (${fmtDay(r.date)}, ${fmtKm(r.km)} km); overgeslagen.`);
  } catch (err) {
    $('gpx-msg').textContent = err.message;
  } finally {
    e.target.value = '';
  }
});

$('runs').addEventListener('click', async (e) => {
  const btn = e.target.closest('.btn-del');
  if (!btn) return;
  if (!confirm('Dit loopje verwijderen?')) return;
  btn.disabled = true;
  try {
    await api(`/api/runs/${btn.dataset.id}`, { method: 'DELETE' });
  } catch (err) {
    banner(err.message);
  }
  await loadRuns();
  render();
});

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const plan = buildPlan(state.settings);
    renderChart(matchRuns(plan, state.runs, state.today));
  }, 150);
});

$('jump-today').addEventListener('click', () => {
  const el = document.querySelector('.week.current');
  if (el) { el.open = true; el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
});

/* ---------------- Start ---------------- */
(async function start() {
  $('run-form').elements.date.value = state.today;
  render();
  await loadMe();
  await loadSettings();
  await loadRuns();
  render();
  // Refresh "today" around midnight and runs every 15 minutes while the page is open.
  setInterval(async () => {
    state.today = todayStr();
    await loadRuns();
    render();
  }, 15 * 60 * 1000);
})();
