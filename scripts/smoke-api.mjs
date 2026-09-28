// Smoke no destructivo del sitio y de /api.
// Uso: node scripts/smoke-api.mjs https://www.ajlnutricion.com
// Sigue a mano las redirecciones de barra final (301/308) y se detiene en la
// primera que no lo sea, para poder comparar 302 y 404 entre Vercel y Cloudflare.

const BASE = (process.argv[2] || '').replace(/\/$/, '');
if (!BASE) { console.error('Falta la URL base'); process.exit(2); }

async function hop(path, init = {}) {
  let url = BASE + path;
  for (let i = 0; i < 5; i++) {
    const r = await fetch(url, { ...init, redirect: 'manual' });
    if (r.status !== 301 && r.status !== 308) return r;
    url = new URL(r.headers.get('Location'), url).toString();
  }
  throw new Error(`Demasiadas redirecciones en ${path}`);
}

const checks = [];
const check = (nombre, fn) => checks.push([nombre, fn]);
const postJson = (body) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body });

check('home 200', async () => (await hop('/')).status === 200);
check('checkout con y sin barra 200', async () =>
  (await hop('/checkout/basico')).status === 200 && (await hop('/checkout/basico/')).status === 200);
check('privacidad 200', async () => (await hop('/privacidad/')).status === 200);
check('reclamaciones 200', async () => (await hop('/reclamaciones/')).status === 200);
check('newsletter/baja 200', async () => (await hop('/newsletter/baja/')).status === 200);
check('404 real', async () => (await hop('/no-existe-smoke/')).status === 404);

for (const p of ['/api/conversion', '/api/conversion/', '/api/reclamaciones', '/api/newsletter']) {
  check(`GET ${p} → 405 JSON`, async () => {
    const r = await hop(p);
    return r.status === 405 && (r.headers.get('content-type') || '').includes('application/json');
  });
}
check('no-store en /api', async () => (await hop('/api/conversion')).headers.get('cache-control') === 'no-store');
check('conversion: evento inválido → 400', async () =>
  (await hop('/api/conversion', postJson('{"evento":"smoke"}'))).status === 400);
check('reclamaciones: cuerpo inválido → 400', async () =>
  (await hop('/api/reclamaciones', postJson('no es json'))).status === 400);
check('newsletter: email inválido → 400', async () =>
  (await hop('/api/newsletter', postJson('{"email":"x","consent":true}'))).status === 400);
check('confirm sin token → 302 invalido', async () => {
  const r = await hop('/api/newsletter-confirm');
  return r.status === 302 && r.headers.get('location').endsWith('/newsletter/gracias/?estado=invalido');
});
check('baja con token falso consulta Supabase → 302 invalido', async () => {
  const r = await hop('/api/newsletter-unsubscribe?token=smoke-no-existe');
  return r.status === 302 && r.headers.get('location').endsWith('/newsletter/baja/?estado=invalido');
});

let fallas = 0;
for (const [nombre, fn] of checks) {
  let ok = false;
  try { ok = await fn(); } catch (e) { console.error(e.message); }
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${nombre}`);
  if (!ok) fallas++;
}
console.log(`\n${checks.length - fallas}/${checks.length} OK contra ${BASE}`);
process.exit(fallas ? 1 : 0);
