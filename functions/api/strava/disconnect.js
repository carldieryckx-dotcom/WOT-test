// POST /api/strava/disconnect — revoke access and forget the tokens.
import { json } from '../../../lib/access.js';
import { accessToken, clearTokens } from '../../../lib/strava.js';

export async function onRequestPost({ env }) {
  if (!env.MARATHON_KV) return json({ ok: true });
  try {
    const token = await accessToken(env);
    if (token) {
      await fetch('https://www.strava.com/oauth/deauthorize', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ access_token: token }),
      });
    }
  } catch {
    // Forget the tokens locally even if Strava is unreachable.
  }
  await clearTokens(env);
  await env.MARATHON_KV.delete('strava:cache');
  return json({ ok: true });
}
