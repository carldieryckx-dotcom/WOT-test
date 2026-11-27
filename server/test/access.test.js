import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';

const DOMAIN = 'team.cloudflareaccess.com';
const AUD = 'aud-tag-123';
let srv, keys, realFetch;

const b64 = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');
async function jwt(payload, key = keys.privateKey) {
  const head = b64({ alg: 'RS256', kid: 'k1', typ: 'JWT' });
  const body = b64(payload);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${Buffer.from(sig).toString('base64url')}`;
}
const claims = (extra = {}) => ({ iss: `https://${DOMAIN}`, aud: [AUD], email: 'Jij@Voorbeeld.be', exp: Math.floor(Date.now() / 1000) + 600, ...extra });

before(async () => {
  const gen = () => crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  keys = await gen();
  keys.other = await gen();
  const jwk = { ...(await crypto.subtle.exportKey('jwk', keys.publicKey)), kid: 'k1' };
  realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) =>
    String(url) === `https://${DOMAIN}/cdn-cgi/access/certs` ? new Response(JSON.stringify({ keys: [jwk] })) : realFetch(url, opts);
  srv = await startServer({ DEV_BYPASS_AUTH: '', ACCESS_TEAM_DOMAIN: DOMAIN, ACCESS_AUD: AUD });
});
after(async () => {
  await srv.close();
  globalThis.fetch = realFetch;
});

const me = (headers) => srv.call('/api/me', { headers: { 'x-forwarded-for': '203.0.113.9', ...headers } });

test('valid Access token in header or cookie', async () => {
  const t = await jwt(claims());
  assert.equal((await me({ 'cf-access-jwt-assertion': t })).body.email, 'jij@voorbeeld.be');
  assert.equal((await me({ cookie: `foo=1; CF_Authorization=${t}` })).status, 200);
});

test('rejects missing, expired, wrong audience, wrong user or forged tokens', async () => {
  assert.equal((await me({})).status, 401);
  assert.equal((await me({ 'cf-access-jwt-assertion': await jwt(claims({ exp: 1 })) })).status, 401);
  assert.equal((await me({ 'cf-access-jwt-assertion': await jwt(claims({ aud: ['ander'] })) })).status, 401);
  assert.equal((await me({ 'cf-access-jwt-assertion': await jwt(claims({ email: 'iemand@anders.be' })) })).status, 403);
  assert.equal((await me({ 'cf-access-jwt-assertion': await jwt(claims(), keys.other.privateKey) })).status, 401);
});
