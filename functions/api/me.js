// GET /api/me — who is signed in and whether Strava is connected.
import { json } from '../../lib/access.js';
import { loadTokens } from '../../lib/strava.js';

export async function onRequestGet({ env, data }) {
  const configured = Boolean(env.STRAVA_CLIENT_ID && env.STRAVA_CLIENT_SECRET && env.MARATHON_KV);
  const tokens = env.MARATHON_KV ? await loadTokens(env) : null;
  return json({
    email: data.user.email,
    strava: { configured, connected: Boolean(tokens), athlete: tokens?.athlete ?? null },
  });
}
