// GET /api/strava/callback — Strava sends you back here after you approve.
import { requireStravaConfig, exchangeCode, saveTokens } from '../../../lib/strava.js';

export async function onRequestGet({ request, env }) {
  requireStravaConfig(env);
  const url = new URL(request.url);
  const back = (q) => Response.redirect(`${url.origin}/marathon/?strava=${q}`, 302);
  const state = url.searchParams.get('state');
  if (!state || !(await env.MARATHON_KV.get(`strava:state:${state}`))) return back('state');
  await env.MARATHON_KV.delete(`strava:state:${state}`);
  if (url.searchParams.get('error')) return back('denied');
  const scope = url.searchParams.get('scope') || '';
  if (!scope.includes('activity:read')) return back('scope');
  const code = url.searchParams.get('code');
  if (!code) return back('error');
  await saveTokens(env, await exchangeCode(env, code));
  await env.MARATHON_KV.delete('strava:cache');
  return back('connected');
}
