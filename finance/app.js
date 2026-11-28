// Financieel overzicht. Pure JS + SVG, geen externe requests behalve /api/finance.
// Schema: zie FINANCE.md. Alle tekst uit de data gaat via esc() de DOM in.

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const TZ = 'Europe/Brussels';
const PAGE = 50;
const NW_PARTS = [
  ['spaar', 'Spaarrekening', 'var(--s-spending)'],
  ['aandelen', 'Aandelen', 'var(--s-3)'],
  ['bolero', 'Bolero', 'var(--s-4)'],
];

const eur = new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR' });
const eur0 = new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const pct = new Intl.NumberFormat('nl-BE', { style: 'percent', maximumFractionDigits: 1 });
const fmtEur = (v) => eur.format(num(v));
const fmtShort = (v) => {
  const a = Math.abs(v);
  if (a >= 1e6) return `€ ${(v / 1e6).toLocaleString('nl-BE', { maximumFractionDigits: 1 })} mln`;
  if (a >= 1e4) return `€ ${(v / 1e3).toLocaleString('nl-BE', { maximumFractionDigits: 0 })}k`;
  return eur0.format(v);
};

// 'YYYY-MM' / 'YYYY-MM-DD' -> leesbare tekst. Kalenderdatums zonder tijdzoneverschuiving.
const ymd = (s) => {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(String(s || ''));
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +(m[3] || 1), 12)) : null;
};
const fmtMonth = (s, style = 'long') => {
  const d = ymd(s);
  return d ? d.toLocaleDateString('nl-BE', { month: style, year: 'numeric', timeZone: 'UTC' }) : String(s ?? '');
};
const fmtMonthShort = (s) => {
  const d = ymd(s);
  return d ? d.toLocaleDateString('nl-BE', { month: 'short', timeZone: 'UTC' }).replace('.', '') : String(s);
};
const fmtDate = (s) => {
  const d = ymd(s);
  return d ? d.toLocaleDateString('nl-BE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : String(s ?? '');
};
// Vandaag in Brussel als 'YYYY-MM-DD'.
const today = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const currentMonth = today.slice(0, 7);

const state = {
  data: null,
  months: [],
  month: null,
  catSort: { key: 'amount', dir: 'desc' },
  shown: PAGE,
};

/* ---------------- Laden ---------------- */
function showError(text) {
  const b = $('banner');
  b.textContent = text;
  b.hidden = false;
  $('updated').textContent = 'Geen gegevens';
}

async function load() {
  let res;
  try {
    res = await fetch('/api/finance', { credentials: 'same-origin', cache: 'no-store', headers: { accept: 'application/json' } });
  } catch {
    showError('Geen verbinding met de server. Controleer je internetverbinding en herlaad de pagina.');
    return;
  }
  if (res.status === 401 || res.status === 403) {
    showError('Je bent niet (meer) aangemeld of hebt geen toegang. Herlaad de pagina om opnieuw in te loggen.');
    return;
  }
  if (res.status === 404) {
    showError('Er zijn nog geen financiële gegevens beschikbaar.');
    return;
  }
  if (!res.ok) {
    showError(`De gegevens konden niet geladen worden (fout ${res.status}). Probeer het later opnieuw.`);
    return;
  }
  let data;
  try {
    data = await res.json();
  } catch {
    // Bv. een loginpagina van Cloudflare Access na een verlopen sessie.
    showError('Onverwacht antwoord van de server. Je sessie is mogelijk verlopen: herlaad de pagina.');
    return;
  }
  if (!data || !Array.isArray(data.months)) {
    showError('De gegevens hebben een onverwacht formaat.');
    return;
  }
  init(data);
}

function init(data) {
  state.data = data;
  state.months = data.months
    .filter((m) => m && /^\d{4}-\d{2}$/.test(String(m.month)))
    .map((m) => ({
      month: m.month,
      income: num(m.income),
      spending: num(m.spending),
      net: m.net == null ? num(m.income) - num(m.spending) : num(m.net),
      byCategory: { income: m.byCategory?.income || {}, spending: m.byCategory?.spending || {} },
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
  state.tx = (Array.isArray(data.transactions) ? data.transactions : []).filter(Boolean);

  const upd = data.updated ? new Date(data.updated) : null;
  $('updated').textContent = upd && !isNaN(upd)
    ? `Laatst bijgewerkt: ${upd.toLocaleString('nl-BE', { timeZone: TZ, dateStyle: 'long', timeStyle: 'short' })}`
    : 'Laatst bijgewerkt: onbekend';
  if (data.period?.from && data.period?.to) $('period').textContent = `Periode ${fmtDate(data.period.from)} – ${fmtDate(data.period.to)}`;

  $('content').hidden = false;
  if (!state.months.length) {
    showError('Er zijn nog geen maanden in de gegevens.');
    $('kpis').innerHTML = '';
  }
  state.month = state.months.at(-1)?.month || null;

  const sel = $('month');
  sel.innerHTML = state.months.slice().reverse()
    .map((m) => `<option value="${esc(m.month)}">${esc(fmtMonth(m.month))}${m.month === currentMonth ? ' ◷ (lopend)' : ''}</option>`).join('');
  sel.disabled = !state.months.length;
  sel.value = state.month || '';
  sel.addEventListener('change', () => selectMonth(sel.value));

  setupFilters();
  document.querySelectorAll('[data-sort]').forEach((b) => b.addEventListener('click', () => {
    const key = b.dataset.sort;
    if (state.catSort.key === key) state.catSort.dir = state.catSort.dir === 'asc' ? 'desc' : 'asc';
    else state.catSort = { key, dir: key === 'name' ? 'asc' : 'desc' };
    renderCategories();
  }));

  renderMonth();
  renderPayments();
  renderSubscriptions();
  renderNetworth();
  let t;
  window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => { renderBars(); renderNetworth(); }, 150); });
}

function selectMonth(m) {
  state.month = m;
  $('month').value = m;
  const f = $('tx-filters');
  f.month.value = m;
  state.shown = PAGE;
  renderMonth();
}

function renderMonth() {
  renderKpis();
  renderBars();
  renderCategories();
  renderTransactions();
}

/* ---------------- KPI's ---------------- */
function renderKpis() {
  const i = state.months.findIndex((m) => m.month === state.month);
  const m = state.months[i];
  if (!m) { $('kpis').innerHTML = ''; return; }
  const prev = state.months[i - 1];
  const rate = m.income > 0 ? pct.format(m.net / m.income) : '–';
  const diff = (key) => {
    if (!prev) return '';
    const d = m[key] - prev[key];
    return `${d >= 0 ? '+' : '−'}${fmtEur(Math.abs(d))} t.o.v. ${esc(fmtMonthShort(prev.month))}`;
  };
  const open = m.month === currentMonth ? '<div class="d">Lopende maand, nog niet afgesloten</div>' : '';
  $('kpis').innerHTML = [
    ['Inkomsten', fmtEur(m.income), diff('income')],
    ['Uitgaven', fmtEur(m.spending), diff('spending')],
    ['Netto', `<span class="${m.net < 0 ? 'neg' : ''}">${fmtEur(m.net)}</span>`, diff('net')],
    ['Spaarquote', rate, m.income > 0 ? 'netto / inkomsten' : 'geen inkomsten deze maand'],
  ].map(([l, v, d]) => `<div class="stat"><div class="l">${l}</div><div class="v">${v}</div>${d ? `<div class="d">${d}</div>` : ''}${l === 'Inkomsten' ? open : ''}</div>`).join('');
}

/* ---------------- Grafiekhulp ---------------- */
function niceTicks(max, min = 0, count = 4) {
  const span = max - min || 1;
  const raw = span / count;
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * p).find((s) => s >= raw);
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}
// Staaf met afgeronde bovenkant (4px), vast op de basislijn.
const barPath = (x, y, w, base) => {
  const h = base - y;
  if (h <= 0) return '';
  const r = Math.min(4, w / 2, h);
  return `M${x},${base}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${base}Z`;
};
function tipAt(el, html) {
  const tip = $('tip');
  const b = el.getBoundingClientRect();
  tip.innerHTML = html;
  tip.style.left = `${Math.min(Math.max(b.left + b.width / 2, 90), window.innerWidth - 90)}px`;
  tip.style.top = `${b.top + 8}px`;
  tip.hidden = false;
}
const hideTip = () => { $('tip').hidden = true; };
const chartWidth = (el) => Math.max(300, Math.round(el.clientWidth || 600));

/* ---------------- Staafgrafiek ---------------- */
function renderBars() {
  const el = $('bars');
  const ms = state.months;
  if (!ms.length) { el.innerHTML = '<p class="empty">Geen maanden.</p>'; $('bars-table').innerHTML = ''; return; }
  const W = chartWidth(el), H = 240, padL = 56, padR = 8, padT = 10, padB = 26;
  const max = Math.max(1, ...ms.flatMap((m) => [m.income, m.spending]));
  const ticks = niceTicks(max);
  const top = ticks.at(-1);
  const y = (v) => padT + (H - padT - padB) * (1 - v / top);
  const iw = (W - padL - padR) / ms.length;
  const bw = Math.max(3, Math.min(22, (iw - 10) / 2));
  const every = Math.ceil(ms.length / Math.floor((W - padL) / 48));
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Inkomsten en uitgaven per maand">`;
  ticks.forEach((v) => {
    svg += `<line class="grid" x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}"/><text x="${padL - 6}" y="${y(v) + 4}" text-anchor="end">${esc(fmtShort(v))}</text>`;
  });
  ms.forEach((m, i) => {
    const x0 = padL + i * iw;
    const cx = x0 + iw / 2;
    if (m.month === state.month) svg += `<rect class="sel" x="${x0}" y="${padT}" width="${iw}" height="${H - padT - padB}" rx="6"/>`;
    svg += `<path class="bar-income" d="${barPath(cx - bw - 1, y(m.income), bw, y(0))}"/>`;
    svg += `<path class="bar-spending" d="${barPath(cx + 1, y(m.spending), bw, y(0))}"/>`;
    if (i % every === 0 || i === ms.length - 1) {
      svg += `<text x="${cx}" y="${H - 8}" text-anchor="middle">${esc(fmtMonthShort(m.month))}${m.month.slice(5) === '01' || i === 0 ? ` ’${m.month.slice(2, 4)}` : ''}${m.month === currentMonth ? ' ◷' : ''}</text>`;
    }
    svg += `<rect class="hit" data-i="${i}" x="${x0}" y="${padT}" width="${iw}" height="${H - padT - padB}"><title>${esc(fmtMonth(m.month))}</title></rect>`;
  });
  svg += `<line class="zero" x1="${padL}" x2="${W - padR}" y1="${y(0)}" y2="${y(0)}"/></svg>`;
  el.innerHTML = svg;
  el.querySelectorAll('.hit').forEach((r) => {
    const m = ms[+r.dataset.i];
    r.addEventListener('mouseenter', () => tipAt(r, `<b>${esc(fmtMonth(m.month))}</b>${m.month === currentMonth ? ' (lopend)' : ''}<br>Inkomsten ${fmtEur(m.income)} · Uitgaven ${fmtEur(m.spending)}<br>Netto ${fmtEur(m.net)}`));
    r.addEventListener('mouseleave', hideTip);
    r.addEventListener('click', () => { hideTip(); selectMonth(m.month); });
  });
  $('bars-table').innerHTML = `<table class="tbl"><thead><tr><th>Maand</th><th class="num">Inkomsten</th><th class="num">Uitgaven</th><th class="num">Netto</th></tr></thead><tbody>${
    ms.slice().reverse().map((m) => `<tr><td>${esc(fmtMonth(m.month))}</td><td class="num">${fmtEur(m.income)}</td><td class="num">${fmtEur(m.spending)}</td><td class="num">${fmtEur(m.net)}</td></tr>`).join('')
  }</tbody></table>`;
}

/* ---------------- Categorieën ---------------- */
function renderCategories() {
  const m = state.months.find((x) => x.month === state.month);
  const rows = Object.entries(m?.byCategory.spending || {}).map(([name, v]) => ({ name, v: num(v) })).filter((r) => r.v);
  const { key, dir } = state.catSort;
  const sign = dir === 'asc' ? 1 : -1;
  rows.sort((a, b) => sign * (key === 'name' ? a.name.localeCompare(b.name, 'nl') : a.v - b.v));
  document.querySelectorAll('[data-sort]').forEach((b) => {
    const on = b.dataset.sort === key;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', String(on));
    b.textContent = `${b.dataset.sort === 'name' ? 'Naam' : 'Bedrag'}${on ? (dir === 'asc' ? ' ↑' : ' ↓') : ''}`;
  });
  if (!rows.length) { $('cats').innerHTML = '<p class="empty">Geen uitgaven per categorie voor deze maand.</p>'; return; }
  const total = rows.reduce((s, r) => s + r.v, 0);
  $('cats').innerHTML = `<table class="tbl"><thead><tr><th>Categorie</th><th class="num">Bedrag</th><th class="num">Aandeel</th></tr></thead><tbody>${
    rows.map((r) => `<tr><td>${esc(r.name)}<span class="share" aria-hidden="true"><span style="width:${(100 * r.v / total).toFixed(1)}%"></span></span></td><td class="num">${fmtEur(r.v)}</td><td class="num">${pct.format(r.v / total)}</td></tr>`).join('')
  }</tbody><tfoot><tr><td>Totaal</td><td class="num">${fmtEur(total)}</td><td class="num">${pct.format(1)}</td></tr></tfoot></table>`;
}

/* ---------------- Transacties ---------------- */
function setupFilters() {
  const f = $('tx-filters');
  f.addEventListener('submit', (e) => e.preventDefault());
  const uniq = (key) => [...new Set(state.tx.map((t) => t[key]).filter(Boolean).map(String))].sort((a, b) => a.localeCompare(b, 'nl'));
  const months = [...new Set([...state.months.map((m) => m.month), ...state.tx.map((t) => t.month || String(t.date || '').slice(0, 7))])]
    .filter(Boolean).sort().reverse();
  f.month.innerHTML = `<option value="">Alle maanden</option>${months.map((m) => `<option value="${esc(m)}">${esc(fmtMonth(m))}</option>`).join('')}`;
  f.category.innerHTML = `<option value="">Alle categorieën</option>${uniq('category').map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}`;
  f.account.innerHTML = `<option value="">Alle rekeningen</option>${uniq('account').map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}`;
  f.month.value = state.month || '';
  f.addEventListener('input', () => { state.shown = PAGE; renderTransactions(); });
  $('tx-more').addEventListener('click', () => { state.shown += PAGE; renderTransactions(); });
}

function renderTransactions() {
  const f = $('tx-filters');
  const month = f.month.value, cat = f.category.value, acc = f.account.value;
  const q = f.q.value.trim().toLocaleLowerCase('nl');
  const showExcl = f.excluded.checked;
  const rows = state.tx.filter((t) => {
    if (!showExcl && t.type === 'excluded') return false;
    if (month && (t.month || String(t.date || '').slice(0, 7)) !== month) return false;
    if (cat && t.category !== cat) return false;
    if (acc && t.account !== acc) return false;
    if (q && !`${t.counterparty || ''} ${t.category || ''}`.toLocaleLowerCase('nl').includes(q)) return false;
    return true;
  }).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  // Totaal: uitgesloten rijen tellen nooit mee.
  const counted = rows.filter((t) => t.type !== 'excluded');
  const total = counted.reduce((s, t) => s + num(t.amount), 0);
  const nExcl = rows.length - counted.length;
  $('tx-count').textContent = `${rows.length} ${rows.length === 1 ? 'rij' : 'rijen'}`;
  if (!rows.length) {
    $('tx').innerHTML = '<p class="empty">Geen transacties voor deze filters.</p>';
    $('tx-more').hidden = true;
    return;
  }
  const page = rows.slice(0, state.shown);
  $('tx').innerHTML = `<table class="tbl"><thead><tr><th>Datum</th><th>Tegenpartij</th><th class="hide-sm">Categorie</th><th class="hide-sm">Rekening</th><th class="num">Bedrag</th></tr></thead><tbody>${
    page.map((t) => {
      const ex = t.type === 'excluded';
      const a = num(t.amount);
      return `<tr class="${ex ? 'excluded' : ''}"><td class="date">${esc(fmtDate(t.date))}</td><td>${esc(t.counterparty || '–')}<span class="sub-line">${ex ? '<span class="tag">uitgesloten</span> ' : ''}<span class="show-sm">${esc(t.category || '')}</span></span></td><td class="hide-sm">${esc(t.category || '–')}</td><td class="hide-sm">${esc(t.account || '–')}</td><td class="num ${!ex && a > 0 ? 'pos' : ''}">${fmtEur(a)}</td></tr>`;
    }).join('')
  }</tbody><tfoot><tr><td colspan="2">Totaal${nExcl ? ` <span class="muted">(zonder ${nExcl} uitgesloten)</span>` : ''}</td><td class="hide-sm"></td><td class="hide-sm"></td><td class="num">${fmtEur(total)}</td></tr></tfoot></table>`;
  const left = rows.length - page.length;
  $('tx-more').hidden = left <= 0;
  $('tx-more').textContent = `Meer tonen (${left} resterend)`;
}

/* ---------------- Betalingen ---------------- */
function renderPayments() {
  const list = (Array.isArray(state.data.payments) ? state.data.payments : []).filter(Boolean);
  const byDue = (a, b) => String(a.due || '9999').localeCompare(String(b.due || '9999'));
  const open = list.filter((p) => p.status === 'open').sort(byDue);
  const unknown = list.filter((p) => p.status === 'onbekend').sort(byDue);
  const paid = list.filter((p) => p.status === 'betaald').sort((a, b) => byDue(b, a)).slice(0, 5);
  const row = (p, mark) => {
    const late = mark && p.due && p.due < today;
    return `<tr class="${late ? 'overdue' : ''}"><td>${esc(p.title || p.payee || '–')}${p.payee && p.title ? `<span class="sub-line">${esc(p.payee)}</span>` : ''}</td><td>${p.due ? esc(fmtDate(p.due)) : '–'}${late ? ' <span class="tag bad">achterstallig</span>' : ''}</td><td class="num">${fmtEur(p.amount)}</td></tr>`;
  };
  const table = (rows, mark) => `<table class="tbl"><thead><tr><th>Wat</th><th>Vervaldag</th><th class="num">Bedrag</th></tr></thead><tbody>${rows.map((p) => row(p, mark)).join('')}</tbody></table>`;
  let html = open.length
    ? `${table(open, true)}<div class="totals"><span>Totaal open: <b>${fmtEur(open.reduce((s, p) => s + num(p.amount), 0))}</b></span></div>`
    : '<p class="empty">Geen open betalingen.</p>';
  if (unknown.length) html += `<p class="sub-head">Status onbekend</p>${table(unknown, false)}`;
  if (paid.length) html += `<p class="sub-head">Recent betaald</p>${table(paid, false)}`;
  $('payments').innerHTML = html;
}

/* ---------------- Abonnementen ---------------- */
const PER_MONTH = {
  wekelijks: 52 / 12, tweewekelijks: 26 / 12, maandelijks: 1, tweemaandelijks: 1 / 2,
  driemaandelijks: 1 / 3, kwartaal: 1 / 3, trimestrieel: 1 / 3, halfjaarlijks: 1 / 6, jaarlijks: 1 / 12,
};
function renderSubscriptions() {
  const list = (Array.isArray(state.data.subscriptions) ? state.data.subscriptions : []).filter(Boolean);
  if (!list.length) { $('subs').innerHTML = '<p class="empty">Geen abonnementen gevonden.</p>'; return; }
  const rows = list.map((s) => {
    const f = PER_MONTH[String(s.interval || '').toLowerCase()];
    return { ...s, amount: Math.abs(num(s.amount)), monthly: f == null ? null : Math.abs(num(s.amount)) * f };
  }).sort((a, b) => (b.monthly ?? -1) - (a.monthly ?? -1));
  const perMonth = rows.reduce((s, r) => s + (r.monthly ?? 0), 0);
  const unknown = rows.filter((r) => r.monthly == null).length;
  $('subs').innerHTML = `<table class="tbl"><thead><tr><th>Naam</th><th class="num">Bedrag</th><th class="num">Per maand</th></tr></thead><tbody>${
    rows.map((s) => `<tr><td>${esc(s.name || '–')}<span class="sub-line">${esc([s.category, s.lastSeen ? `laatst ${fmtDate(s.lastSeen)}` : ''].filter(Boolean).join(' · '))}</span></td><td class="num">${fmtEur(s.amount)}<span class="sub-line">${esc(s.interval || '?')}</span></td><td class="num">${s.monthly == null ? '–' : fmtEur(s.monthly)}</td></tr>`).join('')
  }</tbody></table><div class="totals"><span>Per maand: <b>${fmtEur(perMonth)}</b></span><span>Per jaar: <b>${fmtEur(perMonth * 12)}</b></span></div>${
    unknown ? `<p class="note">${unknown} abonnement${unknown > 1 ? 'en' : ''} met onbekend interval niet meegeteld.</p>` : ''}`;
}

/* ---------------- Nettovermogen ---------------- */
function renderNetworth() {
  const el = $('networth');
  const nw = (Array.isArray(state.data.networth) ? state.data.networth : [])
    .filter((p) => p && p.month && Number.isFinite(Number(p.total)))
    .sort((a, b) => String(a.month).localeCompare(String(b.month)));
  if (!nw.length) {
    el.innerHTML = '<p class="empty">Geen gegevens over het vermogen.</p>';
    $('nw-legend').innerHTML = ''; $('nw-table').innerHTML = ''; $('nw-note').hidden = true;
    return;
  }
  const parts = NW_PARTS.filter(([k]) => nw.some((p) => Number.isFinite(Number(p.parts?.[k]))));
  const W = chartWidth(el), H = 260, padL = 60, padR = 12, padT = 12, padB = 26;
  const vals = nw.flatMap((p) => [num(p.total), ...parts.map(([k]) => num(p.parts?.[k]))]);
  const ticks = niceTicks(Math.max(1, ...vals), Math.min(0, ...vals));
  const lo = ticks[0], hi = ticks.at(-1);
  const y = (v) => padT + (H - padT - padB) * (1 - (v - lo) / (hi - lo || 1));
  const step = nw.length > 1 ? (W - padL - padR) / (nw.length - 1) : 0;
  const x = (i) => (nw.length > 1 ? padL + i * step : (padL + W - padR) / 2);
  const every = Math.ceil(nw.length / Math.floor((W - padL) / 48));
  const anyEst = nw.some((p) => p.estimated);

  // Lijn per segment: gestippeld als een van beide punten geschat is.
  const line = (get, cls, color) => {
    let s = '';
    for (let i = 0; i < nw.length - 1; i++) {
      const a = get(nw[i]), b = get(nw[i + 1]);
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      const est = nw[i].estimated || nw[i + 1].estimated;
      s += `<path class="line ${cls}${est ? ' est' : ''}"${color ? ` style="stroke:${color}"` : ''} d="M${x(i)},${y(a)}L${x(i + 1)},${y(b)}"/>`;
    }
    return s;
  };
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Nettovermogen per maand">`;
  ticks.forEach((v) => {
    svg += `<line class="${v === 0 ? 'zero' : 'grid'}" x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}"/><text x="${padL - 6}" y="${y(v) + 4}" text-anchor="end">${esc(fmtShort(v))}</text>`;
  });
  nw.forEach((p, i) => {
    if (i % every === 0 || i === nw.length - 1) {
      svg += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(fmtMonthShort(p.month))}${String(p.month).slice(5) === '01' || i === 0 ? ` ’${String(p.month).slice(2, 4)}` : ''}</text>`;
    }
  });
  parts.forEach(([k, , color]) => { svg += line((p) => (p.parts && p.parts[k] != null ? num(p.parts[k]) : NaN), 'part', color); });
  svg += line((p) => num(p.total), 'total');
  svg += '<line class="cross" id="nw-cross" y1="0" y2="0" x1="0" x2="0" visibility="hidden"/>';
  nw.forEach((p, i) => {
    svg += `<circle class="dot${p.estimated ? ' open' : ''}" cx="${x(i)}" cy="${y(num(p.total))}" r="${nw.length > 40 ? 3 : 4.5}"/>`;
  });
  const hw = nw.length > 1 ? step : W - padL - padR;
  nw.forEach((p, i) => {
    svg += `<rect class="hit" data-i="${i}" x="${Math.max(padL - 4, x(i) - hw / 2)}" y="${padT}" width="${hw}" height="${H - padT - padB}"/>`;
  });
  svg += '</svg>';
  el.innerHTML = svg;

  const cross = el.querySelector('#nw-cross');
  el.querySelectorAll('.hit').forEach((r) => {
    const i = +r.dataset.i, p = nw[i];
    r.addEventListener('mouseenter', () => {
      cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i));
      cross.setAttribute('y1', padT); cross.setAttribute('y2', H - padB);
      cross.setAttribute('visibility', 'visible');
      const lines = parts.filter(([k]) => p.parts?.[k] != null).map(([k, label]) => `${label} ${fmtEur(p.parts[k])}`);
      tipAt(r, `<b>${esc(fmtMonth(p.month))}</b>${p.estimated ? ' (geschat)' : ''}<br>Totaal ${fmtEur(p.total)}${lines.length ? `<br>${lines.join(' · ')}` : ''}`);
    });
    r.addEventListener('mouseleave', () => { cross.setAttribute('visibility', 'hidden'); hideTip(); });
  });

  $('nw-legend').innerHTML = [`<span><i class="sw sw-line" style="background:var(--s-income)"></i>Totaal</span>`,
    ...parts.map(([, label, color]) => `<span><i class="sw sw-line" style="background:${color};opacity:.6"></i>${label}</span>`)].join('');
  $('nw-note').hidden = !anyEst;
  $('nw-note').textContent = 'Open bolletjes en stippellijn: geschat vermogen, teruggerekend. Het totaal bevat ook de zichtrekeningen en is dus meer dan de som van de onderdelen.';
  $('nw-table').innerHTML = `<table class="tbl"><thead><tr><th>Maand</th><th class="num">Totaal</th>${parts.map(([, l]) => `<th class="num hide-sm">${l}</th>`).join('')}</tr></thead><tbody>${
    nw.slice().reverse().map((p) => `<tr><td>${esc(fmtMonth(p.month))}${p.estimated ? ' <span class="tag">geschat</span>' : ''}</td><td class="num">${fmtEur(p.total)}</td>${parts.map(([k]) => `<td class="num hide-sm">${p.parts?.[k] == null ? '–' : fmtEur(p.parts[k])}</td>`).join('')}</tr>`).join('')
  }</tbody></table>`;
}

load();
