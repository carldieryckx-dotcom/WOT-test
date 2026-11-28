// GET /api/finance – only with a valid Cloudflare Access login.
// Uses the fictitious fixture test/fixtures/finance-sample.json (VERZONNEN TESTDATA).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer, TOKEN } from './helpers.js';

const FIXTURE = fileURLToPath(new URL('./fixtures/finance-sample.json', import.meta.url));
const DOMAIN = 'team.cloudflareaccess.com';
const AUD = 'aud-tag-123';
let srv, keys, realFetch, dir, file, logs, realError;

const b64 = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');
async function jwt(payload, key = keys.privateKey) {
  const head = b64({ alg: 'RS256', kid: 'k1', typ: 'JWT' });
  const body = b64(payload);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${Buffer.from(sig).toString('base64url')}`;
}
const claims = (extra = {}) => ({ iss: `https://${DOMAIN}`, aud: [AUD], email: 'jij@voorbeeld.be', exp: Math.floor(Date.now() / 1000) + 600, ...extra });

before(async () => {
  const gen = () => crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  keys = await gen();
  keys.other = await gen();
  const jwk = { ...(await crypto.subtle.exportKey('jwk', keys.publicKey)), kid: 'k1' };
  realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) =>
    String(url) === `https://${DOMAIN}/cdn-cgi/access/certs` ? new Response(JSON.stringify({ keys: [jwk] })) : realFetch(url, opts);
  dir = await mkdtemp(path.join(tmpdir(), 'finance-test-'));
  file = path.join(dir, 'site-finance.json');
  await writeFile(file, await readFile(FIXTURE));
  srv = await startServer({ DEV_BYPASS_AUTH: '', ACCESS_TEAM_DOMAIN: DOMAIN, ACCESS_AUD: AUD, FINANCE_FILE: file });
  realError = console.error;
  logs = [];
  console.error = (...a) => logs.push(a.map(String).join(' '));
});
after(async () => {
  console.error = realError;
  await srv.close();
  globalThis.fetch = realFetch;
  await rm(dir, { recursive: true, force: true });
});

const viaCaddy = { 'x-forwarded-for': '203.0.113.9' };
async function get(headers = {}) {
  const res = await fetch(`${srv.base}/api/finance`, { headers: { ...viaCaddy, ...headers } });
  return { status: res.status, headers: res.headers, text: await res.text() };
}
const login = async (extra) => ({ 'cf-access-jwt-assertion': await jwt(claims(extra)) });

test('fixture is clearly marked as fictitious', async () => {
  const data = JSON.parse(await readFile(FIXTURE, 'utf8'));
  assert.equal(data._fixture, 'VERZONNEN TESTDATA');
  for (const m of data.months) assert.equal(Math.round((m.income - m.spending) * 100), Math.round(m.net * 100));
});

test('refused without (valid) login', async () => {
  const none = await get();
  assert.equal(none.status, 401);
  assert.doesNotMatch(none.text, /VERZONNEN|Testwerkgever/);
  assert.equal((await get(await login({ email: 'iemand@anders.be' }))).status, 403);
  assert.equal((await get(await login({ exp: 1 }))).status, 401);
  assert.equal((await get({ 'cf-access-jwt-assertion': await jwt(claims(), keys.other.privateKey) })).status, 401);
});

test('DRX bearer token is not accepted, not even from localhost', async () => {
  const res = await fetch(`${srv.base}/api/finance`, { headers: { authorization: `Bearer ${TOKEN}` } });
  assert.equal(res.status, 403);
  assert.doesNotMatch(await res.text(), /VERZONNEN/);
});

test('with login: file contents and private headers', async () => {
  const r = await get(await login());
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /application\/json/);
  assert.equal(r.headers.get('cache-control'), 'private, no-store');
  assert.equal(r.headers.get('x-robots-tag'), 'noindex');
  const data = JSON.parse(r.text);
  assert.equal(data._fixture, 'VERZONNEN TESTDATA');
  assert.ok(data.months.length > 0);
  // Cookie login works too.
  const t = await jwt(claims());
  assert.equal((await get({ cookie: `CF_Authorization=${t}` })).status, 200);
});

test('file is re-read on every request (no caching)', async () => {
  const original = await readFile(file, 'utf8');
  await writeFile(file, JSON.stringify({ _fixture: 'VERZONNEN TESTDATA', updated: '2026-01-01T00:00:00Z', period: {}, months: [] }));
  const r = await get(await login());
  assert.equal(JSON.parse(r.text).updated, '2026-01-01T00:00:00Z');
  await writeFile(file, original);
  assert.equal(JSON.parse((await get(await login())).text).updated, JSON.parse(original).updated);
});

test('invalid JSON: 502 without leaking contents', async () => {
  const original = await readFile(file, 'utf8');
  await writeFile(file, '{"geheim": "Testwerkgever 1234", kapot');
  logs.length = 0;
  const r = await get(await login());
  assert.equal(r.status, 502);
  assert.equal(r.headers.get('cache-control'), 'private, no-store');
  assert.doesNotMatch(r.text, /geheim|Testwerkgever|1234/);
  assert.doesNotMatch(logs.join('\n'), /geheim|Testwerkgever|1234/);
  await writeFile(file, original);
});

test('missing file: 404 with a Dutch message', async () => {
  await rm(file);
  const r = await get(await login());
  assert.equal(r.status, 404);
  assert.match(JSON.parse(r.text).error, /Nog geen financiële gegevens/);
  // Missing file still requires a login first.
  assert.equal((await get()).status, 401);
});
