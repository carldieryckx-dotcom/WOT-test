// GET/PUT /api/settings — the plan settings, stored in KV so they follow you across devices.
import { json } from '../../lib/access.js';

const KEY = 'settings';
const NUMBER_FIELDS = { runsPerWeek: [3, 6], currentWeeklyKm: [5, 150], currentLongRunKm: [4, 35], peakWeeklyKm: [25, 160] };

export async function onRequestGet({ env }) {
  if (!env.MARATHON_KV) return json({ settings: null });
  return json({ settings: await env.MARATHON_KV.get(KEY, 'json') });
}

export async function onRequestPut({ request, env }) {
  if (!env.MARATHON_KV) return json({ error: 'KV-binding MARATHON_KV ontbreekt' }, 503);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Ongeldige JSON' }, 400);
  }
  const clean = {};
  for (const [k, [min, max]] of Object.entries(NUMBER_FIELDS)) {
    const v = Number(body[k]);
    if (!Number.isFinite(v) || v < min || v > max) return json({ error: `${k} moet tussen ${min} en ${max} liggen` }, 400);
    clean[k] = v;
  }
  if (!/^\d{1,2}:\d{2}(:\d{2})?$/.test(String(body.goalTime))) return json({ error: 'goalTime moet u:mm:ss zijn' }, 400);
  clean.goalTime = String(body.goalTime);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.startDate))) return json({ error: 'startDate moet JJJJ-MM-DD zijn' }, 400);
  clean.startDate = String(body.startDate);
  await env.MARATHON_KV.put(KEY, JSON.stringify(clean));
  return json({ settings: clean });
}
