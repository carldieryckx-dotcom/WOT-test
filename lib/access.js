// Cloudflare Access verification for the marathon API (Node 22, server/).
//
// Cloudflare Access sits in front of /marathon and /api and only lets the owner in.
// As a second line of defence every request is checked here as well: the signed
// Access JWT must be valid for this application (AUD), unexpired, and belong to
// ALLOWED_EMAIL. Without a valid token nothing is served (fail closed).
//
// Environment variables (process.env, on the server via /etc/marathon.env):
//   ACCESS_TEAM_DOMAIN  e.g. "jouwteam.cloudflareaccess.com"
//   ACCESS_AUD          Application Audience (AUD) tag of the Access application
//   ALLOWED_EMAIL       the only e-mail address that may use the app
//   DEV_BYPASS_AUTH     "1" only for local development (never in production)

export class AuthError extends Error {
  constructor(message, status = 401) {
    super(message);
    this.status = status;
  }
}

let certCache = { domain: null, keys: null, at: 0 };

function b64urlToBytes(s) {
  return new Uint8Array(Buffer.from(s, 'base64url'));
}
const decodeJson = (part) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));

async function accessKeys(domain, force = false) {
  const fresh = Date.now() - certCache.at < 3600_000;
  if (!force && certCache.domain === domain && certCache.keys && fresh) return certCache.keys;
  let res;
  try {
    res = await fetch(`https://${domain}/cdn-cgi/access/certs`, { signal: AbortSignal.timeout(5000) });
  } catch {
    throw new AuthError('Kon de Access-sleutels niet ophalen', 503);
  }
  if (!res.ok) throw new AuthError('Kon de Access-sleutels niet ophalen', 503);
  const { keys } = await res.json();
  certCache = { domain, keys, at: Date.now() };
  return keys;
}

function tokenFrom(request) {
  const header = request.headers.get('Cf-Access-Jwt-Assertion');
  if (header) return header;
  const cookie = request.headers.get('Cookie') || '';
  const m = cookie.match(/(?:^|;\s*)CF_Authorization=([^;]+)/);
  return m ? m[1] : null;
}

/**
 * Returns { email } for the verified owner, or throws AuthError.
 *
 * `request` is a standard Web Request (Hono: c.req.raw).
 * `opts.directLocal` must be true only when the TCP connection comes straight from
 * the loopback interface *without* passing through Caddy; DEV_BYPASS_AUTH is ignored otherwise.
 */
export async function verifyAccess(request, env = process.env, opts = {}) {
  if (env.DEV_BYPASS_AUTH === '1' && opts.directLocal) {
    const host = new URL(request.url).hostname;
    if (host === 'localhost' || host === '127.0.0.1') return { email: env.ALLOWED_EMAIL || 'dev@localhost', dev: true };
  }
  const domain = String(env.ACCESS_TEAM_DOMAIN || '').replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const aud = env.ACCESS_AUD;
  const allowed = String(env.ALLOWED_EMAIL || '').trim().toLowerCase();
  if (!domain || !aud || !allowed) throw new AuthError('Afscherming is nog niet geconfigureerd (ACCESS_TEAM_DOMAIN, ACCESS_AUD, ALLOWED_EMAIL)', 503);

  const token = tokenFrom(request);
  if (!token) throw new AuthError('Niet aangemeld', 401);
  const parts = token.split('.');
  if (parts.length !== 3) throw new AuthError('Ongeldig token', 401);
  let header, payload;
  try {
    header = decodeJson(parts[0]);
    payload = decodeJson(parts[1]);
  } catch {
    throw new AuthError('Ongeldig token', 401);
  }
  if (header.alg !== 'RS256') throw new AuthError('Ongeldig token', 401);

  let keys = await accessKeys(domain);
  let jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) {
    keys = await accessKeys(domain, true);
    jwk = keys.find((k) => k.kid === header.kid);
  }
  if (!jwk) throw new AuthError('Onbekende sleutel', 401);

  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    b64urlToBytes(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  );
  if (!valid) throw new AuthError('Ongeldige handtekening', 401);

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp < now) throw new AuthError('Sessie verlopen', 401);
  if (typeof payload.nbf === 'number' && payload.nbf > now + 60) throw new AuthError('Token nog niet geldig', 401);
  if (payload.iss !== `https://${domain}`) throw new AuthError('Verkeerde uitgever', 401);
  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!auds.includes(aud)) throw new AuthError('Verkeerde applicatie', 401);
  const email = String(payload.email || '').toLowerCase();
  if (email !== allowed) throw new AuthError('Geen toegang', 403);
  return { email };
}
