// GET /api/strava/connect — start the Strava OAuth flow.
import { requireStravaConfig } from '../../../lib/strava.js';

export async function onRequestGet({ request, env }) {
  requireStravaConfig(env);
  const state = crypto.randomUUID();
  await env.MARATHON_KV.put(`strava:state:${state}`, '1', { expirationTtl: 600 });
  const origin = new URL(request.url).origin;
  const url = new URL('https://www.strava.com/oauth/authorize');
  url.search = new URLSearchParams({
    client_id: env.STRAVA_CLIENT_ID,
    response_type: 'code',
    redirect_uri: `${origin}/api/strava/callback`,
    approval_prompt: 'auto',
    scope: 'read,activity:read_all',
    state,
  });
  return Response.redirect(url.toString(), 302);
}
