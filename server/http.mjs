// ─── Utilidades HTTP compartidas por las funciones de /api ──────────────────
// Formato Web estándar (Request/Response): corre igual en Cloudflare Pages
// Functions y en Node, que es donde se prueban.

// no-store va aquí y no en public/_headers: en Cloudflare, _headers solo
// aplica a archivos estáticos, nunca a respuestas de Functions.
const NO_STORE = { 'Cache-Control': 'no-store' };

export function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...NO_STORE, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export function empty(status) {
  return new Response(null, { status, headers: NO_STORE });
}

export function redirect(site, path) {
  return new Response(null, { status: 302, headers: { ...NO_STORE, Location: `${site}${path}` } });
}

// sendBeacon entrega el cuerpo como Blob/texto, sin Content-Type JSON; por eso
// se lee como texto y se parsea a mano. Todo lo que no sea un objeto JSON se
// trata como vacío: la validación de cada endpoint responde el 400.
export async function readJson(request) {
  let text = '';
  try { text = await request.text(); } catch { return {}; }
  if (!text) return {};
  try {
    const v = JSON.parse(text);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

export function siteUrl(env) {
  return (env.PUBLIC_SITE_URL || 'https://www.ajlnutricion.com').replace(/\/$/, '');
}

// En Cloudflare la IP real viene en CF-Connecting-IP; x-forwarded-for queda
// como respaldo para desarrollo local.
export function clientIp(request) {
  return request.headers.get('CF-Connecting-IP')
    || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || null;
}
