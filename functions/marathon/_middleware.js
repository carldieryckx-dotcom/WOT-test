// Guards every request under /marathon (including the static files).
import { verifyAccess } from '../../lib/access.js';

export async function onRequest({ request, env, next }) {
  try {
    await verifyAccess(request, env);
  } catch (e) {
    const status = e.status || 401;
    return new Response(
      `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Geen toegang</title>` +
        `<body style="font-family:system-ui;padding:40px;max-width:520px;margin:auto"><h1>Geen toegang</h1><p>Deze pagina is privé.</p>` +
        `<p style="color:#777;font-size:14px">${status === 503 ? 'De afscherming is nog niet ingesteld.' : 'Meld je aan via Cloudflare Access.'}</p></body>`,
      { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } },
    );
  }
  const res = await next();
  const out = new Response(res.body, res);
  out.headers.set('cache-control', 'private, no-store');
  out.headers.set('x-robots-tag', 'noindex');
  return out;
}
