// Strava API helpers for Pages Functions.
//
// Environment:
//   STRAVA_CLIENT_ID      from https://www.strava.com/settings/api
//   STRAVA_CLIENT_SECRET  (set as an encrypted secret)
//   MARATHON_KV           KV namespace binding (tokens, settings, cache)

const TOKENS_KEY = 'strava:tokens';
const RUN_TYPES = new Set(['Run', 'TrailRun', 'VirtualRun']);

export function requireStravaConfig(env) {
  if (!env.STRAVA_CLIENT_ID || !env.STRAVA_CLIENT_SECRET) throw new Error('STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET ontbreken');
  if (!env.MARATHON_KV) throw new Error('KV-binding MARATHON_KV ontbreekt');
}

export async function loadTokens(env) {
  return env.MARATHON_KV.get(TOKENS_KEY, 'json');
}

export async function saveTokens(env, data) {
  const tokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at,
    athlete: data.athlete
      ? { id: data.athlete.id, firstname: data.athlete.firstname, lastname: data.athlete.lastname, profile: data.athlete.profile_medium }
      : undefined,
  };
  const previous = await loadTokens(env);
  if (!tokens.athlete && previous?.athlete) tokens.athlete = previous.athlete;
  await env.MARATHON_KV.put(TOKENS_KEY, JSON.stringify(tokens));
  return tokens;
}

export async function clearTokens(env) {
  await env.MARATHON_KV.delete(TOKENS_KEY);
}

async function tokenRequest(env, params) {
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.STRAVA_CLIENT_ID, client_secret: env.STRAVA_CLIENT_SECRET, ...params }),
  });
  if (!res.ok) throw new Error(`Strava token-fout ${res.status}`);
  return res.json();
}

export const exchangeCode = (env, code) => tokenRequest(env, { code, grant_type: 'authorization_code' });

/** A valid access token, refreshed when needed; null when Strava is not connected. */
export async function accessToken(env) {
  const tokens = await loadTokens(env);
  if (!tokens) return null;
  if (tokens.expires_at - 120 > Date.now() / 1000) return tokens.access_token;
  const fresh = await tokenRequest(env, { grant_type: 'refresh_token', refresh_token: tokens.refresh_token });
  const saved = await saveTokens(env, fresh);
  return saved.access_token;
}

/** All runs since `afterEpoch` (seconds), compacted to what the dashboard needs. */
export async function fetchRuns(env, token, afterEpoch) {
  const runs = [];
  for (let page = 1; page <= 10; page++) {
    const url = `https://www.strava.com/api/v3/athlete/activities?after=${afterEpoch}&per_page=200&page=${page}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 429) throw Object.assign(new Error('Strava-limiet bereikt, probeer het over een kwartier opnieuw'), { status: 429 });
    if (!res.ok) throw Object.assign(new Error(`Strava-fout ${res.status}`), { status: 502 });
    const list = await res.json();
    for (const a of list) {
      if (!RUN_TYPES.has(a.sport_type) && a.type !== 'Run') continue;
      runs.push({
        id: a.id,
        name: a.name,
        date: String(a.start_date_local).slice(0, 10),
        start: a.start_date_local,
        km: Math.round(a.distance / 10) / 100,
        movingTime: a.moving_time,
        elevation: a.total_elevation_gain,
        avgHr: a.average_heartrate ?? null,
        type: a.sport_type || a.type,
      });
    }
    if (list.length < 200) break;
  }
  runs.sort((a, b) => (a.start < b.start ? 1 : -1));
  return runs;
}
