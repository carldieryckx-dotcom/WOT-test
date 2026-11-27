// GET /api/strava/activities?after=YYYY-MM-DD[&refresh=1] — your runs since a date (cached 10 min).
import { json } from '../../../lib/access.js';
import { requireStravaConfig, accessToken, fetchRuns } from '../../../lib/strava.js';

const CACHE_KEY = 'strava:cache';

export async function onRequestGet({ request, env }) {
  requireStravaConfig(env);
  const url = new URL(request.url);
  const after = url.searchParams.get('after') || '2026-11-23';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(after)) return json({ error: 'after moet JJJJ-MM-DD zijn' }, 400);
  const refresh = url.searchParams.get('refresh') === '1';

  const cached = await env.MARATHON_KV.get(CACHE_KEY, 'json');
  if (cached && cached.after === after && !refresh && Date.now() - cached.at < 600_000) {
    return json({ runs: cached.runs, fetchedAt: cached.at, cached: true });
  }
  // Even a manual refresh is throttled to once a minute to stay inside Strava's rate limits.
  if (cached && cached.after === after && Date.now() - cached.at < 60_000) {
    return json({ runs: cached.runs, fetchedAt: cached.at, cached: true });
  }
  const token = await accessToken(env);
  if (!token) return json({ error: 'Strava is niet gekoppeld', connected: false }, 409);
  const afterEpoch = Math.floor(Date.parse(`${after}T00:00:00Z`) / 1000) - 86400;
  const runs = await fetchRuns(env, token, afterEpoch);
  const at = Date.now();
  await env.MARATHON_KV.put(CACHE_KEY, JSON.stringify({ after, at, runs }));
  return json({ runs, fetchedAt: at, cached: false });
}
