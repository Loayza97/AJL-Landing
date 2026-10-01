# Migración de Vercel a Cloudflare Pages · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Servir `www.ajlnutricion.com` desde Cloudflare Pages con las 5 funciones de `/api` portadas, sin caída, sin tocar el correo, y con la política de privacidad nombrando a Cloudflare.

**Architecture:** Astro sigue generando `dist/` estático. Cada función de `api/*.mjs` pasa a un *handler* puro en `server/handlers/*.mjs` (recibe `Request`, `env` y dependencias inyectadas, devuelve `Response`), envuelto por un archivo de ruta mínimo en `functions/api/*.js`. Supabase y Resend se crean por request desde `env`. El DNS se queda en Namecheap: solo cambia el CNAME de `www` y el apex pasa a un URL Redirect.

**Tech Stack:** Astro 4, Cloudflare Pages + Pages Functions (Workers runtime, `nodejs_compat`), `@supabase/supabase-js` 2, Resend por `fetch`, `node:test` para pruebas, `wrangler` para desarrollo local.

**Spec:** `docs/superpowers/specs/2026-09-28-migracion-cloudflare-design.md`

## Global Constraints

- Rutas públicas idénticas: `/api/conversion`, `/api/newsletter`, `/api/newsletter-confirm`, `/api/newsletter-unsubscribe`, `/api/reclamaciones`.
- Tablas de Supabase y lógica de cada función sin cambios de comportamiento; solo cambia el adaptador HTTP.
- 7 variables de entorno, en **Production y Preview** de Pages: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `RESEND_API_KEY`, `FROM_EMAIL`, `NOTIFICATION_EMAIL`, `NEWSLETTER_FROM`, `PUBLIC_SITE_URL`. Las llaves se marcan como secretas.
- DNS en Namecheap; los registros MX de ImprovMX, los de Resend y el TXT de Google no se tocan.
- `Cache-Control: no-store` en toda respuesta de `/api/*`. Va en el código (`server/http.mjs`), no en `public/_headers`: en Cloudflare, `_headers` solo aplica a archivos estáticos, no a respuestas de Functions. Es una desviación deliberada del spec, que proponía `_headers`.
- Política de privacidad: Vercel Inc. → Cloudflare, Inc., versión 1.3, publicada en el mismo deploy del corte.
- Vercel queda encendido al menos 7 días tras el corte (hasta el 2026-10-05 como mínimo); recién ahí se borran `api/`, `vercel.json` y el proyecto de Vercel.
- Cuenta de Cloudflare con `ajlnutricion@gmail.com` y 2FA.
- Commits en la rama `migracion-cloudflare`; a `main` solo en el corte (Task 7). Push a `main` publica en producción.
- Prosa de cara al usuario sin rayas como inciso.

## Línea base medida en producción (Vercel, 2026-09-28)

| Petición | Respuesta hoy |
|---|---|
| `GET /checkout/basico` | 308 → `/checkout/basico/` |
| `GET /api/conversion` | 308 → `/api/conversion/` |
| `GET /api/conversion/` | 405, `cache-control: no-store` |
| `GET /api/newsletter-unsubscribe/?token=nope` | 302 → `/newsletter/baja/?estado=invalido` |
| `GET /no-existe/` | 404 |
| `GET https://ajlnutricion.com/` | 307 → `https://www.ajlnutricion.com/` |

Vercel añade barra final también a `/api/*`; los clientes (`fetch` y enlaces de correo) llaman sin barra y siguen el 308 (que conserva método y cuerpo). En Cloudflare ambas formas deben responder lo mismo tras seguir redirecciones.

## Review Focus

1. **`sendBeacon` manda el cuerpo como `Blob`/texto**, no como JSON parseado: `/api/conversion` debe leer el cuerpo como texto y parsearlo, y un cuerpo inválido debe dar 400, nunca 500. (Task 2, test «cuerpo como texto».)
2. **Cuerpo que no es JSON** en `/api/reclamaciones` y `/api/newsletter`: 400 con `{ ok:false, error }`, no una excepción. (Tasks 3 y 4.)
3. **Barra final y método equivocado**: `/api/x` y `/api/x/` responden igual; `GET` a un endpoint POST da 405 JSON. (Smoke de Task 1, corrido en Tasks 2 a 7.)
4. **Variables de Preview distintas de Production**: una variable que falte en un entorno solo aparece al usar ese entorno. El smoke llama `newsletter-unsubscribe` con un token falso, que obliga a consultar Supabase, y se corre en preview y en producción. (Tasks 5 y 7.)
5. **El reclamo de prueba consume correlativo**: `generar_correlativo()` usa `MAX(...)+1`; la fila de prueba se borra solo si sigue siendo la última, o queda marcada como prueba. (Task 5, paso de limpieza.)

---

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `wrangler.toml` | Config de Pages: salida `dist`, fecha y flags de compatibilidad |
| `server/http.mjs` | Respuestas JSON/vacías/redirect, lectura tolerante de JSON, URL del sitio, IP del cliente |
| `server/tokens.mjs` | Token aleatorio base64url y código de cupón, con Web Crypto |
| `server/deps.mjs` | Crea cliente Supabase y `sendEmail` desde `env` |
| `server/handlers/conversion.mjs` | Lógica de `/api/conversion` |
| `server/handlers/reclamaciones.mjs` | Lógica de `/api/reclamaciones` |
| `server/handlers/newsletter.mjs` | Lógica de alta, confirmación y baja del newsletter |
| `server/**/*.test.mjs` | Pruebas `node:test` |
| `functions/api/*.js` | Rutas de Pages: 3 líneas cada una, llaman al handler |
| `scripts/smoke-api.mjs` | Smoke no destructivo contra cualquier URL base |

---

### Task 1: Base de Cloudflare, utilidades compartidas y smoke

**Files:**
- Create: `wrangler.toml`, `server/http.mjs`, `server/tokens.mjs`, `server/deps.mjs`, `server/http.test.mjs`, `server/tokens.test.mjs`, `scripts/smoke-api.mjs`
- Modify: `package.json`, `.gitignore`

**Interfaces:**
- Produces:
  - `json(status: number, body: object): Response`
  - `empty(status: number): Response`
  - `redirect(site: string, path: string): Response` (302)
  - `readJson(request: Request): Promise<object>` (siempre objeto; `{}` si vacío, inválido o no-objeto)
  - `siteUrl(env): string` (sin barra final; default `https://www.ajlnutricion.com`)
  - `clientIp(request: Request): string | null`
  - `randomToken(nBytes = 24): string` (base64url sin relleno)
  - `couponCode(): string` (`AJL-` + 6 caracteres del alfabeto sin ambiguos)
  - `makeDeps(env): { db: SupabaseClient, sendEmail({ from, to, subject, html }): Promise<boolean> }`

- [ ] **Step 1: Crear rama**

```bash
cd ~/ajl/ajl-landing-companero
git checkout -b migracion-cloudflare
```

- [ ] **Step 2: Escribir las pruebas que fallan**

`server/http.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { json, empty, redirect, readJson, siteUrl, clientIp } from './http.mjs';

const post = (body, type = 'application/json') =>
  new Request('https://x.test/api', { method: 'POST', headers: { 'Content-Type': type }, body });

test('json pone status, content-type y no-store', async () => {
  const r = json(400, { ok: false });
  assert.equal(r.status, 400);
  assert.match(r.headers.get('Content-Type'), /application\/json/);
  assert.equal(r.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await r.json(), { ok: false });
});

test('empty no lleva cuerpo', async () => {
  const r = empty(204);
  assert.equal(r.status, 204);
  assert.equal(await r.text(), '');
});

test('redirect arma Location con el sitio', () => {
  const r = redirect('https://www.ajlnutricion.com', '/newsletter/baja/?estado=ok');
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('Location'), 'https://www.ajlnutricion.com/newsletter/baja/?estado=ok');
});

test('readJson parsea JSON aunque venga como text/plain (sendBeacon)', async () => {
  assert.deepEqual(await readJson(post('{"a":1}', 'text/plain')), { a: 1 });
});

test('readJson devuelve {} ante cuerpo vacío, inválido o no-objeto', async () => {
  assert.deepEqual(await readJson(post('')), {});
  assert.deepEqual(await readJson(post('no es json')), {});
  assert.deepEqual(await readJson(post('[1,2]')), {});
  assert.deepEqual(await readJson(post('null')), {});
});

test('siteUrl quita la barra final y tiene default', () => {
  assert.equal(siteUrl({ PUBLIC_SITE_URL: 'https://a.test/' }), 'https://a.test');
  assert.equal(siteUrl({}), 'https://www.ajlnutricion.com');
});

test('clientIp prefiere CF-Connecting-IP y cae a x-forwarded-for', () => {
  const a = new Request('https://x.test', { headers: { 'CF-Connecting-IP': '1.1.1.1', 'x-forwarded-for': '2.2.2.2' } });
  const b = new Request('https://x.test', { headers: { 'x-forwarded-for': '3.3.3.3, 4.4.4.4' } });
  const c = new Request('https://x.test');
  assert.equal(clientIp(a), '1.1.1.1');
  assert.equal(clientIp(b), '3.3.3.3');
  assert.equal(clientIp(c), null);
});
```

`server/tokens.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomToken, couponCode } from './tokens.mjs';

test('randomToken(24) da 32 caracteres base64url', () => {
  const t = randomToken(24);
  assert.equal(t.length, 32);
  assert.match(t, /^[A-Za-z0-9_-]+$/);
  assert.notEqual(t, randomToken(24));
});

test('couponCode usa el alfabeto sin ambiguos', () => {
  for (let i = 0; i < 200; i++) assert.match(couponCode(), /^AJL-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
});
```

- [ ] **Step 3: Agregar el script de pruebas y correrlas para verlas fallar**

En `package.json`, dentro de `"scripts"`, agregar:

```json
"test": "node --test \"server/**/*.test.mjs\"",
"smoke": "node scripts/smoke-api.mjs"
```

Run: `npm test`
Expected: FAIL, `Cannot find module '.../server/http.mjs'`.

- [ ] **Step 4: Implementar `server/http.mjs`**

```js
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
```

- [ ] **Step 5: Implementar `server/tokens.mjs`**

```js
// ─── Tokens y cupones con Web Crypto (no hay 'crypto' de Node en Workers) ───

// Alfabeto sin caracteres ambiguos (0/O, 1/I/L).
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function randomToken(nBytes = 24) {
  const bytes = crypto.getRandomValues(new Uint8Array(nBytes));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function couponCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  let s = '';
  for (let i = 0; i < 6; i++) s += ALPHABET[bytes[i] % ALPHABET.length];
  return `AJL-${s}`;
}
```

- [ ] **Step 6: Implementar `server/deps.mjs`**

```js
// ─── Dependencias externas de las funciones, creadas desde env ──────────────
// En Workers no hay process.env: las variables llegan en context.env de cada
// request, así que el cliente se crea por request y no a nivel de módulo.

import { createClient } from '@supabase/supabase-js';

const RESEND_URL = 'https://api.resend.com/emails';

export function makeDeps(env) {
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  async function sendEmail({ from, to, subject, html }) {
    const r = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!r.ok) console.error('Resend error', r.status, await r.text());
    return r.ok;
  }

  return { db, sendEmail };
}
```

- [ ] **Step 7: Correr las pruebas**

Run: `npm test`
Expected: PASS, 9 pruebas.

- [ ] **Step 8: Configuración de Cloudflare**

`wrangler.toml`:

```toml
# Cloudflare Pages · landing AJL Nutrición
# Build: `npm run build` (Astro) → dist/. Las funciones viven en functions/.
name = "ajl-landing"
pages_build_output_dir = "dist"
compatibility_date = "2026-09-01"
compatibility_flags = ["nodejs_compat"]
```

En `.gitignore`, agregar al final:

```
.dev.vars
.wrangler/
```

Instalar wrangler:

```bash
npm install --save-dev wrangler
```

- [ ] **Step 9: Escribir `scripts/smoke-api.mjs`**

No escribe nada en la base: solo toca caminos de validación y una lectura de Supabase (token falso de baja), que sirve para comprobar que las variables del entorno están bien.

```js
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
```

- [ ] **Step 10: Correr el smoke contra producción (Vercel) como línea base**

Run: `npm run smoke -- https://www.ajlnutricion.com`
Expected: `16/16 OK`. Si alguna falla contra Vercel, es la línea base la que manda: ajustar el check para que refleje lo que Vercel hace hoy (y anotarlo en el commit), no el código.

- [ ] **Step 11: Commit**

```bash
git add wrangler.toml .gitignore package.json package-lock.json server/ scripts/smoke-api.mjs
git commit -m "cloudflare: utilidades compartidas, config de Pages y smoke de /api"
```

---

### Task 2: Portar `/api/conversion`

**Files:**
- Create: `server/handlers/conversion.mjs`, `server/handlers/conversion.test.mjs`, `functions/api/conversion.js`

**Interfaces:**
- Consumes: `json`, `empty`, `readJson` de `server/http.mjs`; `makeDeps` de `server/deps.mjs`.
- Produces: `handleConversion(request: Request, env: object, deps: { db }): Promise<Response>`

- [ ] **Step 1: Escribir las pruebas que fallan**

`server/handlers/conversion.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleConversion } from './conversion.mjs';

const intocable = { from() { throw new Error('no debía tocar la base'); } };
const req = (method, body, type = 'application/json') =>
  new Request('https://x.test/api/conversion', { method, headers: { 'Content-Type': type }, body });

function dbFalsa(error = null) {
  const filas = [];
  return { filas, from: (t) => ({ insert: async (fila) => { filas.push([t, fila]); return { error }; } }) };
}

test('GET → 405', async () => {
  const r = await handleConversion(req('GET'), {}, { db: intocable });
  assert.equal(r.status, 405);
});

test('OPTIONS → 204', async () => {
  const r = await handleConversion(req('OPTIONS'), {}, { db: intocable });
  assert.equal(r.status, 204);
});

test('cuerpo como texto (sendBeacon) inválido → 400 sin tocar la base', async () => {
  const r = await handleConversion(req('POST', 'basura', 'text/plain'), {}, { db: intocable });
  assert.equal(r.status, 400);
});

test('whatsapp_click válido se guarda recortado y sin query → 204', async () => {
  const db = dbFalsa();
  const cuerpo = JSON.stringify({
    evento: 'whatsapp_click', seccion: ' hero ', paquete: 'constancia',
    utm_source: 'x'.repeat(200), path: '/checkout/constancia/?fbclid=abc', extra: 'descartar',
  });
  const r = await handleConversion(req('POST', cuerpo, 'text/plain'), {}, { db });
  assert.equal(r.status, 204);
  const [tabla, fila] = db.filas[0];
  assert.equal(tabla, 'conversiones');
  assert.equal(fila.seccion, 'hero');
  assert.equal(fila.utm_source.length, 120);
  assert.equal(fila.path, '/checkout/constancia/');
  assert.equal(fila.extra, undefined);
});

test('error de la base → 500', async () => {
  const r = await handleConversion(req('POST', '{"evento":"whatsapp_click"}'), {}, { db: dbFalsa({ message: 'x' }) });
  assert.equal(r.status, 500);
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npm test`
Expected: FAIL, `Cannot find module '.../conversion.mjs'`.

- [ ] **Step 3: Implementar `server/handlers/conversion.mjs`**

```js
// ─── Registro de conversiones propias · AJL Nutrición ───────────────────────
// POST /api/conversion  { evento, seccion, paquete, utm_source, utm_medium,
//                          utm_campaign, utm_content, path }
//
// El clic a WhatsApp es la conversión real del negocio. Este endpoint la guarda
// en nuestra propia base para no depender de que el visitante acepte cookies,
// de bloqueadores, ni de lo que Meta o Google decidan reportar.
//
// PRIVACIDAD: no se persiste NADA identificable —ni IP, ni user-agent, ni
// identificador de sesión—, solo el evento y su origen de campaña. Es
// tratamiento anónimo a propósito. Ver la nota en db/conversiones.sql antes de
// añadir cualquier campo nuevo.

import { json, empty, readJson } from '../http.mjs';

// Allowlist estricta: cualquier campo que no esté aquí se descarta en silencio.
// Un endpoint público sin esto acaba siendo un vertedero de lo que a cualquiera
// se le ocurra mandar.
const EVENTOS_VALIDOS = new Set(['whatsapp_click']);
const MAX_LARGO = 120;

function limpiar(valor) {
  if (valor === null || valor === undefined) return null;
  const s = String(valor).trim();
  if (!s) return null;
  return s.slice(0, MAX_LARGO);
}

export async function handleConversion(request, env, { db }) {
  if (request.method === 'OPTIONS') return empty(204);
  if (request.method !== 'POST') return json(405, { ok: false, error: 'Método no permitido' });

  const data = await readJson(request);

  const evento = limpiar(data.evento);
  if (!EVENTOS_VALIDOS.has(evento)) {
    return json(400, { ok: false, error: 'Evento no reconocido' });
  }

  // El path se recorta a la ruta: si alguna vez llega con query string, no
  // queremos guardar parámetros arbitrarios de la URL.
  const path = limpiar(data.path);

  const fila = {
    evento,
    seccion: limpiar(data.seccion),
    paquete: limpiar(data.paquete),
    utm_source: limpiar(data.utm_source),
    utm_medium: limpiar(data.utm_medium),
    utm_campaign: limpiar(data.utm_campaign),
    utm_content: limpiar(data.utm_content),
    path: path ? path.split('?')[0] : null,
  };

  const { error } = await db.from('conversiones').insert(fila);

  if (error) {
    // Que falle el registro no debe romper nada para el visitante: ya se fue a
    // WhatsApp. Se loguea para verlo en los logs de Cloudflare Pages.
    console.error('conversion insert', error);
    return json(500, { ok: false });
  }

  // 204: sendBeacon ignora el cuerpo de la respuesta.
  return empty(204);
}
```

- [ ] **Step 4: Crear la ruta `functions/api/conversion.js`**

```js
import { handleConversion } from '../../server/handlers/conversion.mjs';
import { makeDeps } from '../../server/deps.mjs';

export const onRequest = ({ request, env }) => handleConversion(request, env, makeDeps(env));
```

- [ ] **Step 5: Correr pruebas**

Run: `npm test`
Expected: PASS (14 pruebas).

- [ ] **Step 6: Probar en local con wrangler**

Crear `.dev.vars` (ignorado por git) con las 7 variables reales, copiadas desde Vercel → Settings → Environment Variables (Joaquín las pega; no se escriben en el chat):

```
SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...
RESEND_API_KEY=...
FROM_EMAIL=...
NOTIFICATION_EMAIL=...
NEWSLETTER_FROM=...
PUBLIC_SITE_URL=http://localhost:8788
```

Run:
```bash
npm run build && npx wrangler pages dev dist --port 8788
```
En otra terminal: `npm run smoke -- http://localhost:8788`
Expected: los 4 checks de `/api/conversion` en OK; los de reclamaciones y newsletter fallan todavía (404), se resuelven en las Tasks 3 y 4. Los de páginas, en OK salvo que `wrangler` local difiera en barra final; eso se juzga en preview (Task 5), que es el runtime real.

- [ ] **Step 7: Commit**

```bash
git add server/handlers/conversion.mjs server/handlers/conversion.test.mjs functions/api/conversion.js
git commit -m "cloudflare: portar /api/conversion"
```

---

### Task 3: Portar `/api/reclamaciones`

**Files:**
- Create: `server/handlers/reclamaciones.mjs`, `server/handlers/reclamaciones.test.mjs`, `functions/api/reclamaciones.js`

**Interfaces:**
- Consumes: `json`, `empty`, `readJson`, `clientIp` de `server/http.mjs`; `makeDeps`.
- Produces: `handleReclamaciones(request, env, deps: { db, sendEmail }): Promise<Response>`

- [ ] **Step 1: Escribir las pruebas que fallan**

`server/handlers/reclamaciones.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleReclamaciones } from './reclamaciones.mjs';

const intocable = {
  db: { rpc() { throw new Error('no debía tocar la base'); }, from() { throw new Error('no debía tocar la base'); } },
  sendEmail() { throw new Error('no debía mandar correo'); },
};
const post = (body) => new Request('https://x.test/api/reclamaciones', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '9.9.9.9' }, body,
});
const valido = {
  nombre: ' Ana Pérez ', dni: '12345678', email: 'ANA@test.pe', tipo: 'reclamo',
  detalle: 'detalle', pedido: 'pedido', consentimiento: true,
};

test('GET → 405', async () => {
  const r = await handleReclamaciones(new Request('https://x.test/api/reclamaciones'), {}, intocable);
  assert.equal(r.status, 405);
});

test('cuerpo no JSON → 400 con error', async () => {
  const r = await handleReclamaciones(post('no es json'), {}, intocable);
  assert.equal(r.status, 400);
  assert.equal((await r.json()).ok, false);
});

test('menor de edad sin apoderado → 400', async () => {
  const r = await handleReclamaciones(post(JSON.stringify({ ...valido, edad: '15' })), {}, intocable);
  assert.equal(r.status, 400);
});

test('sin consentimiento → 400', async () => {
  const r = await handleReclamaciones(post(JSON.stringify({ ...valido, consentimiento: false })), {}, intocable);
  assert.equal(r.status, 400);
});

test('válido: guarda, manda 2 correos y devuelve el correlativo', async () => {
  let fila; const correos = [];
  const deps = {
    db: {
      rpc: async () => ({ data: 'AJL-2026-0007', error: null }),
      from: () => ({ insert: (f) => { fila = f; return { select: () => ({ single: async () =>
        ({ data: { correlativo: 'AJL-2026-0007', fecha_creacion: '2026-09-28T15:00:00Z' }, error: null }) }) }; } }),
    },
    sendEmail: async (m) => { correos.push(m); return true; },
  };
  const env = { FROM_EMAIL: 'reclamos@ajlnutricion.com', NOTIFICATION_EMAIL: 'asesor@ajlnutricion.com' };
  const r = await handleReclamaciones(post(JSON.stringify(valido)), env, deps);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).correlativo, 'AJL-2026-0007');
  assert.equal(fila.consumidor_nombre, 'Ana Pérez');
  assert.equal(fila.consumidor_email, 'ana@test.pe');
  assert.equal(fila.ip_origen, '9.9.9.9');
  assert.deepEqual(correos.map((c) => c.to).sort(), ['ana@test.pe', 'asesor@ajlnutricion.com']);
  assert.ok(correos.every((c) => c.from === 'reclamos@ajlnutricion.com'));
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npm test`
Expected: FAIL, `Cannot find module '.../reclamaciones.mjs'`.

- [ ] **Step 3: Implementar `server/handlers/reclamaciones.mjs`**

```js
// ─── Endpoint del Libro de Reclamaciones · AJL Nutrición ────────────────────
// POST /api/reclamaciones
// Recibe el form, asigna correlativo, persiste en Supabase, manda 2 emails.

import { json, empty, readJson, clientIp } from '../http.mjs';

function bad(status, message) {
  return json(status, { ok: false, error: message });
}

function esEmailValido(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s || '');
}

function esDniValido(s) {
  return /^[0-9A-Za-z]{8,12}$/.test(s || '');
}

function htmlClienteRecibido({ correlativo, nombre, tipo }) {
  return `
    <div style="font-family:system-ui,Arial,sans-serif;max-width:560px;margin:auto;color:#1D1D1F">
      <h2>Recibimos tu ${tipo === 'reclamo' ? 'reclamo' : 'queja'}</h2>
      <p>Hola ${nombre},</p>
      <p>Confirmamos la recepción de tu ${tipo} en AJL Nutrición. Tu número de seguimiento es:</p>
      <p style="font-size:22px;font-weight:700;color:#C8973A;letter-spacing:0.04em">${correlativo}</p>
      <p>Te responderemos dentro de los próximos <strong>30 días calendario</strong>, conforme a lo establecido en el Código de Protección y Defensa del Consumidor (Ley N° 29571).</p>
      <p>Si necesitas hacer seguimiento, menciona este número de correlativo.</p>
      <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
      <p style="font-size:13px;color:#6E6E73">AJL Nutrición · Jr. Almirante Manuel Villavicencio 1461, Lince, Lima</p>
    </div>
  `;
}

function htmlAsesorNotificacion(data) {
  const f = (k, v) => v ? `<tr><td style="padding:4px 8px;color:#6E6E73">${k}</td><td style="padding:4px 8px;color:#1D1D1F">${v}</td></tr>` : '';
  return `
    <div style="font-family:system-ui,Arial,sans-serif;max-width:680px;margin:auto;color:#1D1D1F">
      <h2 style="color:#C8973A">Nuevo ${data.reclamo_tipo}: ${data.correlativo}</h2>
      <p>Recibido el ${new Date(data.fecha_creacion).toLocaleString('es-PE')}</p>
      <table style="border-collapse:collapse;width:100%;margin-top:16px">
        ${f('Nombre', data.consumidor_nombre)}
        ${f('DNI/CE', data.consumidor_dni)}
        ${f('Email', data.consumidor_email)}
        ${f('Teléfono', data.consumidor_telefono)}
        ${f('Domicilio', data.consumidor_domicilio)}
        ${f('Edad', data.consumidor_edad)}
        ${f('Apoderado', data.apoderado_nombre)}
        ${f('Tipo de bien', data.bien_tipo)}
        ${f('Monto', data.bien_monto ? `S/${data.bien_monto}` : '')}
        ${f('Descripción del bien/servicio', data.bien_descripcion)}
        ${f('Tipo', data.reclamo_tipo)}
        ${f('Detalle', data.reclamo_detalle)}
        ${f('Pedido del cliente', data.reclamo_pedido)}
      </table>
      <p style="margin-top:24px"><strong>Plazo legal de respuesta: 30 días calendario</strong> (vence el ${
        new Date(new Date(data.fecha_creacion).getTime() + 30 * 24 * 3600 * 1000).toLocaleDateString('es-PE')
      }).</p>
      <p>Gestiona desde el dashboard de Supabase.</p>
    </div>
  `;
}

export async function handleReclamaciones(request, env, { db, sendEmail }) {
  if (request.method === 'OPTIONS') return empty(204);
  if (request.method !== 'POST') return bad(405, 'Método no permitido');

  const FROM = env.FROM_EMAIL || 'reclamos@ajlnutricion.com';
  const NOTIFY = env.NOTIFICATION_EMAIL || 'asesor@ajlnutricion.com';
  const data = await readJson(request);

  // 1. Validación de campos requeridos
  const req_fields = ['nombre', 'dni', 'email', 'tipo', 'detalle', 'pedido'];
  for (const k of req_fields) {
    if (!data[k] || String(data[k]).trim().length === 0) {
      return bad(400, `Campo requerido faltante: ${k}`);
    }
  }
  if (!esEmailValido(data.email)) return bad(400, 'Email inválido');
  if (!esDniValido(data.dni)) return bad(400, 'DNI o CE inválido');
  if (!['reclamo', 'queja'].includes(data.tipo)) {
    return bad(400, 'Tipo inválido (debe ser "reclamo" o "queja")');
  }
  if (data.consentimiento !== true) {
    return bad(400, 'Debes aceptar la Política de Privacidad para continuar');
  }

  // Edad y apoderado: si menor de 18, apoderado es obligatorio
  const edad = data.edad ? parseInt(data.edad, 10) : null;
  if (edad !== null && (isNaN(edad) || edad < 0 || edad > 120)) {
    return bad(400, 'Edad inválida');
  }
  if (edad !== null && edad < 18 && !data.apoderado_nombre) {
    return bad(400, 'Apoderado requerido si el consumidor es menor de edad');
  }

  // 2. Asignar correlativo (usa la función SQL definida en db/schema.sql)
  const { data: corrData, error: corrErr } = await db.rpc('generar_correlativo');
  if (corrErr) {
    console.error('Error generando correlativo:', corrErr);
    return bad(500, 'Error interno al generar correlativo');
  }
  const correlativo = corrData;

  // 3. Insertar en Supabase
  const row = {
    correlativo,
    consumidor_nombre: String(data.nombre).trim(),
    consumidor_dni: String(data.dni).trim(),
    consumidor_domicilio: data.domicilio?.trim() || null,
    consumidor_telefono: data.telefono?.trim() || null,
    consumidor_email: String(data.email).trim().toLowerCase(),
    consumidor_edad: edad,
    apoderado_nombre: data.apoderado_nombre?.trim() || null,
    bien_tipo: ['producto', 'servicio'].includes(data.bien_tipo) ? data.bien_tipo : null,
    bien_monto: data.bien_monto ? parseFloat(data.bien_monto) : null,
    bien_descripcion: data.bien_descripcion?.trim() || null,
    reclamo_tipo: data.tipo,
    reclamo_detalle: String(data.detalle).trim(),
    reclamo_pedido: String(data.pedido).trim(),
    consentimiento_otorgado: true,
    ip_origen: clientIp(request),
    user_agent: request.headers.get('user-agent') || null,
  };

  const { data: inserted, error: insErr } = await db
    .from('reclamos')
    .insert(row)
    .select('correlativo, fecha_creacion')
    .single();

  if (insErr) {
    console.error('Error insertando:', insErr);
    return bad(500, 'Error guardando el reclamo');
  }

  // 4. Emails: cliente + asesor (en paralelo)
  await Promise.all([
    sendEmail({
      from: FROM,
      to: row.consumidor_email,
      subject: `Tu ${row.reclamo_tipo} fue recibido — ${correlativo}`,
      html: htmlClienteRecibido({ correlativo, nombre: row.consumidor_nombre, tipo: row.reclamo_tipo }),
    }),
    sendEmail({
      from: FROM,
      to: NOTIFY,
      subject: `Nuevo ${row.reclamo_tipo} ${correlativo} — ${row.consumidor_nombre}`,
      html: htmlAsesorNotificacion({ ...row, fecha_creacion: inserted.fecha_creacion }),
    }),
  ]);

  // 5. Respuesta al cliente
  return json(200, {
    ok: true,
    correlativo,
    mensaje: 'Reclamo recibido. Te enviamos confirmación por email.',
  });
}
```

- [ ] **Step 4: Crear la ruta `functions/api/reclamaciones.js`**

```js
import { handleReclamaciones } from '../../server/handlers/reclamaciones.mjs';
import { makeDeps } from '../../server/deps.mjs';

export const onRequest = ({ request, env }) => handleReclamaciones(request, env, makeDeps(env));
```

- [ ] **Step 5: Correr pruebas**

Run: `npm test`
Expected: PASS (19 pruebas).

- [ ] **Step 6: Smoke local**

Run: `npm run build && npx wrangler pages dev dist --port 8788` y en otra terminal `npm run smoke -- http://localhost:8788`
Expected: checks de `/api/conversion` y `/api/reclamaciones` en OK.

- [ ] **Step 7: Commit**

```bash
git add server/handlers/reclamaciones.mjs server/handlers/reclamaciones.test.mjs functions/api/reclamaciones.js
git commit -m "cloudflare: portar /api/reclamaciones"
```

---

### Task 4: Portar el newsletter (alta, confirmación, baja)

**Files:**
- Create: `server/handlers/newsletter.mjs`, `server/handlers/newsletter.test.mjs`, `functions/api/newsletter.js`, `functions/api/newsletter-confirm.js`, `functions/api/newsletter-unsubscribe.js`

**Interfaces:**
- Consumes: `json`, `empty`, `redirect`, `readJson`, `siteUrl`, `clientIp`; `randomToken`, `couponCode`; `makeDeps`.
- Produces:
  - `handleSubscribe(request, env, deps: { db, sendEmail }): Promise<Response>`
  - `handleConfirm(request, env, deps: { db, sendEmail }): Promise<Response>`
  - `handleUnsubscribe(request, env, deps: { db }): Promise<Response>`

- [ ] **Step 1: Escribir las pruebas que fallan**

`server/handlers/newsletter.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleSubscribe, handleConfirm, handleUnsubscribe } from './newsletter.mjs';

const intocable = {
  db: { from() { throw new Error('no debía tocar la base'); } },
  sendEmail() { throw new Error('no debía mandar correo'); },
};
const env = { PUBLIC_SITE_URL: 'https://www.ajlnutricion.com', NEWSLETTER_FROM: 'AJL <hola@ajlnutricion.com>' };
const post = (body) => new Request('https://x.test/api/newsletter', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
});

test('alta: GET → 405', async () => {
  assert.equal((await handleSubscribe(new Request('https://x.test/api/newsletter'), env, intocable)).status, 405);
});

test('alta: honeypot lleno → 200 sin tocar nada', async () => {
  const r = await handleSubscribe(post('{"website":"bot","email":"a@b.pe","consent":true}'), env, intocable);
  assert.equal(r.status, 200);
});

test('alta: cuerpo no JSON → 400', async () => {
  assert.equal((await handleSubscribe(post('basura'), env, intocable)).status, 400);
});

test('alta: sin consentimiento → 400', async () => {
  assert.equal((await handleSubscribe(post('{"email":"a@b.pe"}'), env, intocable)).status, 400);
});

test('alta nueva: guarda pending y manda link de confirmación al sitio', async () => {
  let insertada; const correos = [];
  const deps = {
    db: {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
        insert: async (f) => { insertada = f; return { error: null }; },
      }),
    },
    sendEmail: async (m) => { correos.push(m); return true; },
  };
  const r = await handleSubscribe(post('{"email":" A@B.pe ","consent":true,"source":"popup"}'), env, deps);
  assert.equal(r.status, 200);
  assert.equal(insertada.email, 'a@b.pe');
  assert.equal(insertada.status, 'pending');
  assert.equal(correos[0].from, 'AJL <hola@ajlnutricion.com>');
  assert.ok(correos[0].html.includes(`https://www.ajlnutricion.com/api/newsletter-confirm?token=${insertada.confirm_token}`));
});

test('confirmación sin token → 302 a gracias?estado=invalido', async () => {
  const r = await handleConfirm(new Request('https://x.test/api/newsletter-confirm'), env, intocable);
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('Location'), 'https://www.ajlnutricion.com/newsletter/gracias/?estado=invalido');
});

test('baja sin token → 302 a baja?estado=invalido', async () => {
  const r = await handleUnsubscribe(new Request('https://x.test/api/newsletter-unsubscribe'), env, intocable);
  assert.equal(r.headers.get('Location'), 'https://www.ajlnutricion.com/newsletter/baja/?estado=invalido');
});

test('baja con token válido marca unsubscribed → estado=ok', async () => {
  let cambio;
  const deps = {
    db: {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 5 }, error: null }) }) }),
        update: (c) => { cambio = c; return { eq: async () => ({ error: null }) }; },
      }),
    },
  };
  const r = await handleUnsubscribe(new Request('https://x.test/api/newsletter-unsubscribe?token=abc'), env, deps);
  assert.equal(r.headers.get('Location'), 'https://www.ajlnutricion.com/newsletter/baja/?estado=ok');
  assert.equal(cambio.status, 'unsubscribed');
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npm test`
Expected: FAIL, `Cannot find module '.../newsletter.mjs'`.

- [ ] **Step 3: Implementar `server/handlers/newsletter.mjs`**

```js
// ─── Newsletter · AJL Nutrición ─────────────────────────────────────────────
// POST /api/newsletter                     alta con doble opt-in (queda 'pending')
// GET  /api/newsletter-confirm?token=XXX   confirma, emite cupón de 10% y redirige
// GET  /api/newsletter-unsubscribe?token=XXX  baja
// El cupón NO se entrega en el alta: se genera al confirmar.

import { json, empty, redirect, readJson, siteUrl, clientIp } from '../http.mjs';
import { randomToken, couponCode } from '../tokens.mjs';

const fromDe = (env) => env.NEWSLETTER_FROM || 'AJL Nutrición <hola@ajlnutricion.com>';

// Versión exacta del aviso de consentimiento (debe coincidir con el popup).
const CONSENT_TEXT =
  'Acepto recibir correos de AJL Nutrición (novedades, consejos y promociones) y he leído la Política de Privacidad. (v2026-07-20.2)';

function bad(status, message) {
  return json(status, { ok: false, error: message });
}
function esEmailValido(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s || '');
}

function htmlConfirmacion(confirmUrl) {
  return `
    <div style="font-family:system-ui,Arial,sans-serif;max-width:520px;margin:auto;color:#20302A">
      <h2 style="font-family:Georgia,serif;color:#173C2C">Confirma tu correo y recibe tu 10%</h2>
      <p>¡Gracias por suscribirte a AJL Nutrición! Solo falta un paso: confirma que este correo es tuyo y te enviamos tu cupón de <strong>10% de descuento</strong>.</p>
      <p style="margin:28px 0">
        <a href="${confirmUrl}" style="background:#D68A5C;color:#fff;text-decoration:none;font-weight:700;padding:13px 26px;border-radius:999px;display:inline-block">Confirmar y obtener mi 10%</a>
      </p>
      <p style="font-size:13px;color:#5E6B63">Si no fuiste tú, ignora este correo y no pasará nada.</p>
      <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
      <p style="font-size:12px;color:#5E6B63">AJL Nutrición · Jr. Almirante Manuel Villavicencio 1461, Lince, Lima</p>
    </div>`;
}

function htmlBienvenida({ code, unsubUrl }) {
  return `
    <div style="font-family:system-ui,Arial,sans-serif;max-width:520px;margin:auto;color:#20302A">
      <h2 style="font-family:Georgia,serif;color:#173C2C">Tu 10% de descuento</h2>
      <p>¡Listo! Tu suscripción quedó confirmada. Este es tu cupón:</p>
      <p style="font-size:30px;font-weight:800;letter-spacing:.06em;color:#BE6E42;text-align:center;background:#F6E5D9;border-radius:14px;padding:18px 12px;margin:20px 0">${code}</p>
      <p><strong>Cómo usarlo:</strong> al momento de pagar tu plan, envíanos este código por WhatsApp junto con tu comprobante y aplicamos el 10%. Es de un solo uso y vence en 30 días.</p>
      <p style="margin:26px 0">
        <a href="https://wa.me/51919151237?text=Hola!%20Quiero%20usar%20mi%20cup%C3%B3n%20${encodeURIComponent(code)}%20de%2010%25" style="background:#25D366;color:#fff;text-decoration:none;font-weight:700;padding:13px 26px;border-radius:999px;display:inline-block">Usar mi cupón por WhatsApp</a>
      </p>
      <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
      <p style="font-size:12px;color:#5E6B63">AJL Nutrición · Jr. Almirante Manuel Villavicencio 1461, Lince, Lima.<br>
      Si no quieres recibir más correos, <a href="${unsubUrl}" style="color:#5E6B63">date de baja aquí</a>.</p>
    </div>`;
}

export async function handleSubscribe(request, env, { db, sendEmail }) {
  if (request.method === 'OPTIONS') return empty(204);
  if (request.method !== 'POST') return bad(405, 'Método no permitido');

  const data = await readJson(request);

  // Honeypot: si un bot rellena el campo oculto, respondemos "ok" y no hacemos nada.
  if (data.website && String(data.website).trim() !== '') {
    return json(200, { ok: true, mensaje: 'Listo' });
  }

  const email = String(data.email || '').trim().toLowerCase();
  if (!esEmailValido(email)) return bad(400, 'Ingresa un correo válido');
  if (data.consent !== true) return bad(400, 'Debes aceptar la Política de Privacidad');

  // ¿Ya existe?
  const { data: existing, error: selErr } = await db
    .from('newsletter_subscribers')
    .select('id, status, confirm_token')
    .eq('email', email)
    .maybeSingle();
  if (selErr) {
    console.error('select error', selErr);
    return bad(500, 'Error interno');
  }

  if (existing && existing.status === 'confirmed') {
    return json(200, { ok: true, already: true, mensaje: 'Ya estás suscrito.' });
  }

  const ip = clientIp(request);
  const ua = request.headers.get('user-agent') || null;
  const confirm_token = existing?.confirm_token || randomToken();

  if (existing) {
    // Reenvía confirmación (sigue pending): refresca consentimiento.
    const { error } = await db
      .from('newsletter_subscribers')
      .update({ consent_text: CONSENT_TEXT, consent_at: new Date().toISOString(), ip_origen: ip, user_agent: ua })
      .eq('id', existing.id);
    if (error) { console.error(error); return bad(500, 'Error interno'); }
  } else {
    const { error } = await db.from('newsletter_subscribers').insert({
      email,
      status: 'pending',
      consent_text: CONSENT_TEXT,
      consent_at: new Date().toISOString(),
      confirm_token,
      unsubscribe_token: randomToken(),
      source: (data.source || null),
      ip_origen: ip,
      user_agent: ua,
    });
    if (error) { console.error(error); return bad(500, 'Error guardando la suscripción'); }
  }

  await sendEmail({
    from: fromDe(env),
    to: email,
    subject: 'Confirma tu correo y recibe tu 10% · AJL Nutrición',
    html: htmlConfirmacion(`${siteUrl(env)}/api/newsletter-confirm?token=${confirm_token}`),
  });

  return json(200, {
    ok: true,
    mensaje: 'Te enviamos un correo para confirmar. Revisa tu bandeja (y spam).',
  });
}

export async function handleConfirm(request, env, { db, sendEmail }) {
  const SITE = siteUrl(env);
  const token = new URL(request.url).searchParams.get('token') || '';
  if (!token) return redirect(SITE, '/newsletter/gracias/?estado=invalido');

  const { data: sub, error } = await db
    .from('newsletter_subscribers')
    .select('id, email, status, unsubscribe_token')
    .eq('confirm_token', token)
    .maybeSingle();

  if (error) { console.error(error); return redirect(SITE, '/newsletter/gracias/?estado=error'); }
  if (!sub) return redirect(SITE, '/newsletter/gracias/?estado=invalido');

  // Confirmar (idempotente).
  if (sub.status !== 'confirmed') {
    await db
      .from('newsletter_subscribers')
      .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
      .eq('id', sub.id);
  }

  // ¿Ya tiene un cupón activo? Reutilizarlo (no emitir de más).
  let code;
  const { data: existingCode } = await db
    .from('discount_codes')
    .select('code, status')
    .eq('email', sub.email)
    .in('status', ['issued'])
    .order('issued_at', { ascending: false })
    .maybeSingle();

  if (existingCode) {
    code = existingCode.code;
  } else {
    // Genera un código único (reintenta ante colisión del UNIQUE).
    for (let intento = 0; intento < 5 && !code; intento++) {
      const candidato = couponCode();
      const { error: insErr } = await db
        .from('discount_codes')
        .insert({ code: candidato, email: sub.email, percent: 10 });
      if (!insErr) code = candidato;
      else if (insErr.code !== '23505') { // 23505 = unique_violation → reintenta
        console.error('insert code error', insErr);
        break;
      }
    }
  }

  if (!code) return redirect(SITE, '/newsletter/gracias/?estado=error');

  const unsubUrl = `${SITE}/api/newsletter-unsubscribe?token=${sub.unsubscribe_token}`;
  await sendEmail({
    from: fromDe(env),
    to: sub.email,
    subject: `Tu cupón de 10%: ${code} · AJL Nutrición`,
    html: htmlBienvenida({ code, unsubUrl }),
  });

  return redirect(SITE, `/newsletter/gracias/?code=${encodeURIComponent(code)}`);
}

export async function handleUnsubscribe(request, env, { db }) {
  const SITE = siteUrl(env);
  const token = new URL(request.url).searchParams.get('token') || '';
  if (!token) return redirect(SITE, '/newsletter/baja/?estado=invalido');

  const { data: sub, error } = await db
    .from('newsletter_subscribers')
    .select('id')
    .eq('unsubscribe_token', token)
    .maybeSingle();

  if (error) { console.error(error); return redirect(SITE, '/newsletter/baja/?estado=error'); }
  if (!sub) return redirect(SITE, '/newsletter/baja/?estado=invalido');

  await db
    .from('newsletter_subscribers')
    .update({ status: 'unsubscribed', unsubscribed_at: new Date().toISOString() })
    .eq('id', sub.id);

  return redirect(SITE, '/newsletter/baja/?estado=ok');
}
```

- [ ] **Step 4: Crear las 3 rutas**

`functions/api/newsletter.js`:

```js
import { handleSubscribe } from '../../server/handlers/newsletter.mjs';
import { makeDeps } from '../../server/deps.mjs';

export const onRequest = ({ request, env }) => handleSubscribe(request, env, makeDeps(env));
```

`functions/api/newsletter-confirm.js`:

```js
import { handleConfirm } from '../../server/handlers/newsletter.mjs';
import { makeDeps } from '../../server/deps.mjs';

export const onRequest = ({ request, env }) => handleConfirm(request, env, makeDeps(env));
```

`functions/api/newsletter-unsubscribe.js`:

```js
import { handleUnsubscribe } from '../../server/handlers/newsletter.mjs';
import { makeDeps } from '../../server/deps.mjs';

export const onRequest = ({ request, env }) => handleUnsubscribe(request, env, makeDeps(env));
```

- [ ] **Step 5: Correr pruebas**

Run: `npm test`
Expected: PASS (27 pruebas).

- [ ] **Step 6: Smoke local completo**

Run: `npm run build && npx wrangler pages dev dist --port 8788` y `npm run smoke -- http://localhost:8788`
Expected: todos los checks de `/api` en OK. Si falla alguno de páginas solo por barra final en `wrangler` local, anotarlo y juzgarlo en preview (Task 5).

- [ ] **Step 7: Commit**

```bash
git add server/handlers/newsletter.mjs server/handlers/newsletter.test.mjs functions/api/newsletter*.js
git commit -m "cloudflare: portar alta, confirmación y baja del newsletter"
```

---

### Task 5: Proyecto de Cloudflare Pages y prueba en preview

Task de configuración con Joaquín: los clics en paneles los hace él; Claude guía y corre las verificaciones.

**Files:** ninguno (salvo que la verificación obligue a corregir código; en ese caso, commit aparte con el arreglo).

- [ ] **Step 1: Seguridad de la cuenta**

Joaquín confirma que la cuenta de Cloudflare usa `ajlnutricion@gmail.com` y activa 2FA (My Profile → Authentication).

- [ ] **Step 2: Subir la rama**

```bash
git push -u origin migracion-cloudflare
```

(Vercel también hará un preview de la rama; es inofensivo.)

- [ ] **Step 3: Crear el proyecto (Joaquín, en el panel)**

Workers & Pages → Create → Pages → Connect to Git → `Loayza97/AJL-Landing`.
- Project name: `ajl-landing`
- Production branch: `main`
- Framework preset: Astro · Build command: `npm run build` · Output: `dist`
- Environment variable de build: `NODE_VERSION` = `22`

- [ ] **Step 4: Variables (Joaquín, en el panel)**

Settings → Variables and Secrets: cargar las 7 variables en **Production** y en **Preview**, como *Secret* las 2 llaves (`SUPABASE_SERVICE_KEY` y `RESEND_API_KEY`); el resto como texto. `PUBLIC_SITE_URL` = `https://www.ajlnutricion.com` en Production y la URL del preview de rama en Preview (`https://migracion-cloudflare.ajl-landing.pages.dev`).

Luego: Deployments → reintentar el deploy de `migracion-cloudflare` para que tome las variables.

- [ ] **Step 5: Smoke en preview**

Run: `npm run smoke -- https://migracion-cloudflare.ajl-landing.pages.dev`
Expected: `16/16 OK`. El check «baja con token falso» prueba que Supabase está bien configurado en Preview.

Si fallan solo los checks con barra final (`GET /api/conversion/ → 405`), Pages no está enrutando `/api/x/` a la función. Arreglo: crear `functions/api/_middleware.js`, que redirige con 308 (conserva método y cuerpo) a la forma sin barra, y commitear aparte:

```js
// /api/x/ → /api/x. Vercel usaba la forma con barra; clientes y correos ya
// enviados pueden llegar con cualquiera de las dos.
export const onRequest = ({ request, next }) => {
  const url = new URL(request.url);
  if (url.pathname.length > 5 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.slice(0, -1);
    return Response.redirect(url.toString(), 308);
  }
  return next();
};
```

- [ ] **Step 6: Flujos reales en preview (Joaquín en el navegador, Claude verifica en Supabase)**

1. Newsletter: suscribir un correo propio → llega el correo de confirmación con link a `migracion-cloudflare.ajl-landing.pages.dev` → confirmar → aterriza en `/newsletter/gracias/?code=AJL-…` y llega el cupón → clic en «date de baja» → `/newsletter/baja/?estado=ok`.
2. Conversión: clic en un botón de WhatsApp → nueva fila en `conversiones` con `path` del preview.
3. Reclamo: enviar uno con nombre `PRUEBA MIGRACION CLOUDFLARE` y detalle «Prueba técnica, no es un reclamo real» → pantalla de gracias con correlativo, correo al titular y a `NOTIFICATION_EMAIL`.

- [ ] **Step 7: Limpieza en Supabase**

Borrar la suscripción de prueba y su cupón en `newsletter_subscribers` y `discount_codes`, y la fila de `conversiones` del preview (filtrar por `path` y hora). Para el reclamo: si su correlativo sigue siendo el mayor del año, borrarlo (así `generar_correlativo()` reutiliza el número y no queda hueco); si ya entró un reclamo real después, **no** borrarlo, dejarlo marcado como prueba.

---

### Task 6: Política de privacidad v1.3 y referencias a Vercel

**Files:**
- Modify: `public/privacidad/index.html:69` (fecha y versión), `public/privacidad/index.html:250-255` (fila de Vercel)
- Modify: `docs/legal/checklist-nuevo-procesador.md` (anexo de procesadores)
- Modify: `src/layouts/Layout.astro:20`, `astro.config.mjs` (comentario del dominio primario), `.env.example` (encabezado)

- [ ] **Step 1: Fila del bloque 4**

Reemplazar:

```html
          <tr>
            <td>Vercel Inc.</td>
            <td>Hosting del sitio y ejecución del backend (función serverless del Libro de Reclamaciones)</td>
            <td>Estados Unidos (infraestructura global)</td>
            <td>Datos del formulario en tránsito, IP, User-Agent, logs técnicos</td>
          </tr>
```

por:

```html
          <tr>
            <td>Cloudflare, Inc.</td>
            <td>Hosting del sitio y ejecución del backend (funciones del Libro de Reclamaciones, newsletter y registro de conversiones)</td>
            <td>Estados Unidos (infraestructura global)</td>
            <td>Datos del formulario en tránsito, IP, User-Agent, logs técnicos</td>
          </tr>
```

- [ ] **Step 2: Fecha y versión**

En la línea 69, `Última actualización: <strong>23 de septiembre de 2026</strong> · Versión 1.2` pasa a la fecha del corte real y `Versión 1.3`. Si la política tiene un historial de versiones, agregar la entrada: «1.3: el hosting del sitio pasa de Vercel a Cloudflare».

Run: `grep -n "Versión\|Vercel" public/privacidad/index.html`
Expected: una sola línea con `Versión 1.3` y ninguna mención a Vercel.

- [ ] **Step 3: Checklist de procesador y anexo**

En `docs/legal/checklist-nuevo-procesador.md`, anexo de procesadores: agregar la fila

```
| Cloudflare | Hosting y funciones del sitio | EE.UU. (red global) | Todos los del libro y newsletter + tráfico web | DPA estándar de Cloudflare (Customer DPA, incluye SCC) | 2026-09-28 |
```

y en la fila de Vercel, cambiar la última columna a `2026-05-22 · retirado <fecha de borrado del proyecto>`. Actualizar el título del anexo a la fecha del día.

- [ ] **Step 4: Comentarios que nombran Vercel**

`src/layouts/Layout.astro:20`: `// Debe coincidir con el dominio primario configurado en Vercel: hoy es el www.` → `// Debe coincidir con el dominio primario del sitio en Cloudflare Pages: hoy es el www.`

`astro.config.mjs`: en el comentario, «dominio PRIMARIO de Vercel» → «dominio PRIMARIO en Cloudflare Pages» y «si algún día se invierte el redirect en Vercel» → «si algún día se invierte el redirect del apex (Namecheap)».

`.env.example`: encabezado «Variables de entorno para Vercel» → «Variables de entorno para Cloudflare Pages», la instrucción «COPIAR a Vercel → Project Settings → Environment Variables» → «COPIAR a Cloudflare → Workers & Pages → ajl-landing → Settings → Variables and Secrets (Production y Preview). En local van en .dev.vars», y agregar al final:

```
# Newsletter
NEWSLETTER_FROM=AJL Nutrición <hola@ajlnutricion.com>
PUBLIC_SITE_URL=https://www.ajlnutricion.com
```

- [ ] **Step 5: Verificar build y commit**

Run: `npm run build && npm test`
Expected: build sin errores; pruebas PASS.

```bash
git add public/privacidad/index.html docs/legal/checklist-nuevo-procesador.md src/layouts/Layout.astro astro.config.mjs .env.example
git commit -m "privacidad v1.3: hosting en Cloudflare en lugar de Vercel"
git push
```

---

### Task 7: Corte a producción

Joaquín hace los clics en Namecheap y Cloudflare; Claude verifica cada paso.

- [ ] **Step 1: Merge a `main`**

```bash
git checkout main && git pull
git merge --no-ff migracion-cloudflare -m "migración a Cloudflare Pages"
git push
```

Esto publica en Vercel (que sigue siendo producción, con `api/` intacto) y en Cloudflare (`ajl-landing.pages.dev`). La política v1.3 queda visible desde aquí.

Run: `npm run smoke -- https://ajl-landing.pages.dev www.ajlnutricion.com` y `npm run smoke -- https://www.ajlnutricion.com`
Expected: `16/16 OK` en ambos (el primero valida las variables de **Production** de Cloudflare antes del corte).

- [ ] **Step 2: Dominio personalizado en Pages (Joaquín)**

`ajl-landing` → Custom domains → Set up a custom domain → `www.ajlnutricion.com`. Cloudflare indica el CNAME destino (`ajl-landing.pages.dev`) y queda en «pending».

- [ ] **Step 3: Anotar los valores actuales para revertir**

Antes de tocar Namecheap, dejar escritos en la bitácora de la sesión: CNAME de `www` = `2c2147d69973f08c.vercel-dns-017.com.` y A del apex = `216.198.79.1`.

- [ ] **Step 4: CNAME de `www` (Joaquín, Namecheap → Advanced DNS)**

Editar el CNAME `www` → `ajl-landing.pages.dev`, TTL automático. No tocar los MX ni los TXT.

Run (repetir hasta que cambie):
```bash
dig +short CNAME www.ajlnutricion.com
```
Expected: `ajl-landing.pages.dev.` y el dominio en Pages pasa a «Active» con certificado.

- [ ] **Step 5: Smoke y flujos en producción**

Run: `npm run smoke -- https://www.ajlnutricion.com`
Expected: `16/16 OK`, y `curl -sI https://www.ajlnutricion.com | grep -i server` muestra `cloudflare`.

Joaquín repite el flujo de newsletter completo en producción (confirma que Resend y `PUBLIC_SITE_URL` están bien en Production) y un clic a WhatsApp. El reclamo **no** se repite en producción: las variables `FROM_EMAIL` y `NOTIFICATION_EMAIL` se verifican por nombre con

```bash
npx wrangler pages secret list --project-name ajl-landing
```

(y en el panel, las de texto). Limpiar las filas de prueba como en la Task 5.

- [ ] **Step 6: Apex (Joaquín, Namecheap → Advanced DNS)**

Borrar el registro A `@ → 216.198.79.1` y crear un **URL Redirect Record** `@` → `https://www.ajlnutricion.com`, tipo **Permanent (301)**.

Run (tras la propagación):
```bash
curl -sI http://ajlnutricion.com | head -3
curl -sI https://ajlnutricion.com | head -3
```
Expected: ambos redirigen a `https://www.ajlnutricion.com/`, y el de HTTPS **sin** error de certificado.

**Condición de parada:** si `https://ajlnutricion.com` da error de certificado o no responde, volver el registro A a `216.198.79.1` (el apex sigue redirigiendo desde Vercel, que queda así hasta decidir) y avisar a Joaquín para decidir aparte entre mover los nameservers a Cloudflare o dejar el apex en Vercel. `www` no se ve afectado.

- [ ] **Step 7: Reversión (solo si algo falla en los pasos 4 a 6)**

CNAME `www` → `2c2147d69973f08c.vercel-dns-017.com` y A `@` → `216.198.79.1`. Vercel sigue sirviendo con `api/` intacto.

---

### Task 8: Documentación interna y memoria

**Files:**
- Modify: `~/ajl/CLAUDE.md` (bloque de proyectos y «Stack productivo»)
- Modify: memorias `~/.claude/projects/-Users-joaquin-ajl/memory/libro-reclamaciones-stack.md`, `landing-ajl-deploy-arch.md` y su línea en `MEMORY.md`

- [ ] **Step 1: `~/ajl/CLAUDE.md`**

La línea de `ajl-landing-companero/` pasa a: «sitio en producción (`https://www.ajlnutricion.com`, repo `Loayza97/AJL-Landing`, auto-deploy a Cloudflare Pages al hacer push a `main`). El sitio es el proyecto Astro en `src/`; las funciones de `/api` viven en `functions/api/` y su lógica en `server/handlers/`.» En «Stack productivo»: «Cloudflare Pages (plan gratuito, uso comercial permitido)» en lugar de «Vercel (Hobby)», y «Env vars en Cloudflare Pages (Production y Preview)» con las 7 variables. Agregar: «DNS en Namecheap: `www` es CNAME a `ajl-landing.pages.dev`; el apex redirige por URL Redirect de Namecheap.»

- [ ] **Step 2: Memorias**

Actualizar `landing-ajl-deploy-arch.md` y `libro-reclamaciones-stack.md` con el nuevo hosting, la estructura `functions/` + `server/`, `npm test` / `npm run smoke`, y la fecha del corte. Ajustar sus líneas en `MEMORY.md`.

- [ ] **Step 3: Commit del repo (si cambió algo versionado)**

`~/ajl/CLAUDE.md` y la memoria no están en el repo de la landing; no llevan commit.

---

### Task 9: Retiro de Vercel (no antes del 2026-10-05)

**Files:**
- Delete: `api/conversion.mjs`, `api/newsletter.mjs`, `api/newsletter-confirm.mjs`, `api/newsletter-unsubscribe.mjs`, `api/reclamaciones.mjs`, `vercel.json`

- [ ] **Step 1: Confirmar 7 días sin incidentes**

Revisar con Joaquín: reclamos, suscripciones y conversiones siguen entrando en Supabase desde el corte, y nadie reportó fallas.

- [ ] **Step 2: Borrar el código de Vercel**

```bash
git rm -r api vercel.json
npm run build && npm test
npm run smoke -- https://www.ajlnutricion.com
git commit -m "cloudflare: retirar funciones y config de Vercel"
git push
```

Expected: build y pruebas OK, smoke `16/16 OK` tras el deploy.

- [ ] **Step 3: Borrar el proyecto en Vercel (Joaquín)**

Solo después del paso 2 y si el apex ya no depende de Vercel (si en la Task 7 se dejó el apex en Vercel, este paso espera a esa decisión). Luego, en el anexo del checklist legal, completar la fecha de retiro de Vercel y hacer commit.
