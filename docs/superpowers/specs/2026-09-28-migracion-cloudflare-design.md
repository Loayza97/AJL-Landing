# Migración del hosting de Vercel a Cloudflare Pages

**Fecha:** 2026-09-28 · **Estado:** diseño aprobado por Joaquín
**Contexto:** primer subproyecto antes de la pasarela Mercado Pago + agenda (spec aparte). Se migra primero para que las funciones nuevas de pago se escriban una sola vez, ya para Cloudflare, y para que una falla de migración no se confunda con una falla de pago.

## Por qué

- El plan Hobby de Vercel no permite uso comercial; cobrar desde el sitio lo haría más evidente. El plan gratuito de Cloudflare sí lo permite.
- La landing es estática (Astro) con 5 funciones pequeñas: la migración es barata.

## Qué NO cambia

- El registro del dominio y su DNS siguen en **Namecheap**. No se mueven nameservers.
- Registros de correo (ImprovMX MX, Resend en subdominios, verificación de Google): intactos.
- Astro, `astro build`, salida en `dist/`, estructura de `src/` y `public/`.
- Tablas de Supabase y la lógica de cada función.
- El flujo de trabajo: push a `main` en `Loayza97/AJL-Landing` publica solo.

## Cambios de código

1. **Funciones.** `api/*.mjs` (handlers Node de Vercel, `req`/`res`) pasan a `functions/api/*.js` como Pages Functions (`onRequestPost` / `onRequestGet`, `Request`/`Response`, variables en `context.env`). Mismas rutas públicas:
   - `/api/conversion`
   - `/api/newsletter`
   - `/api/newsletter-confirm`
   - `/api/newsletter-unsubscribe`
   - `/api/reclamaciones`

   Dependencias: `@supabase/supabase-js` (compatible con Workers) y `crypto.randomBytes` → `crypto.getRandomValues` (Web Crypto). Resend se llama por `fetch`.
2. **Configuración.** `vercel.json` se reemplaza por `wrangler.toml`. El `Cache-Control: no-store` de `/api/*` va en el código de las funciones, porque en Cloudflare `public/_headers` solo aplica a archivos estáticos (corregido al escribir el plan). URLs limpias y barra final las resuelve Pages por defecto con la salida en carpetas de Astro; se verifica en la prueba.
3. **Se borran** `api/` y `vercel.json` recién después del corte exitoso (ver Reversión).
4. **Comentarios que nombran Vercel** (`src/layouts/Layout.astro:20`, `astro.config.mjs`) se actualizan a Cloudflare.

## Variables de entorno (Cloudflare Pages → Settings → Variables, marcadas como secretas las llaves)

`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `RESEND_API_KEY`, `FROM_EMAIL`, `NOTIFICATION_EMAIL`, `NEWSLETTER_FROM`, `PUBLIC_SITE_URL`.

## Deploy

- Proyecto de Cloudflare Pages conectado a GitHub `Loayza97/AJL-Landing`, rama de producción `main`, build `npm run build` (o `astro build`), salida `dist`, Node 22.
- Cuenta de Cloudflare con `ajlnutricion@gmail.com` y 2FA (checklist de procesador, Paso 4).

## Corte sin caída

1. **Prueba en `*.pages.dev`**, con los datos reales de Supabase:
   - Home, `/checkout/<cada plan>/`, `/privacidad/`, `/reclamaciones/` y un 404 cargan; `/x` y `/x/` se comportan como hoy.
   - Libro de reclamaciones: envío de prueba → fila en Supabase + correo a `NOTIFICATION_EMAIL` + copia al titular.
   - Newsletter: alta → correo de confirmación → confirmar → baja.
   - Conversión: clic a WhatsApp → fila en la tabla de conversiones.
   - Cabecera `Cache-Control: no-store` en `/api/*`.
   - Las filas de prueba se borran después.
2. **Corte:** en Namecheap, el CNAME de `www` pasa de `…vercel-dns-017.com` al dominio que indique Cloudflare Pages; se agrega el dominio personalizado `www.ajlnutricion.com` en el proyecto de Pages. El apex `ajlnutricion.com` (hoy registro A a Vercel) se reemplaza por un registro **URL Redirect permanente** de Namecheap hacia `https://www.ajlnutricion.com`. Condición: `https://ajlnutricion.com` debe redirigir con certificado válido. Si Namecheap no lo sirve con HTTPS, el corte del apex se detiene y se decide aparte entre mover los nameservers a Cloudflare (copiando todos los registros de correo) o dejar el apex en Vercel.
3. **Verificación en producción:** repetir la prueba del punto 1 en `www.ajlnutricion.com`, más HTTPS válido en apex y www.

## Reversión

Vercel queda encendido y sin cambios durante al menos 7 días tras el corte. Si algo falla, se devuelve el CNAME de `www` y el registro A del apex a los valores de Vercel. Recién pasado ese plazo sin incidentes se borran `api/`, `vercel.json` y el proyecto de Vercel.

## Legal (regla: código y política dicen lo mismo)

- `public/privacidad/index.html`, tabla del bloque 4: **Vercel Inc.** se reemplaza por **Cloudflare, Inc.** (hosting del sitio y ejecución del backend; Estados Unidos, infraestructura global; mismos datos: formulario en tránsito, IP, User-Agent, logs técnicos). Se actualiza la fecha y se sube la versión a 1.3. Se publica en el mismo deploy del corte.
- `docs/legal/checklist-nuevo-procesador.md`: correr el checklist para Cloudflare (DPA estándar de Cloudflare) y actualizar el anexo de procesadores: Cloudflare agregado, Vercel marcado como retirado con fecha.
- Es cambio de proveedor con la misma finalidad: no requiere aviso a usuarios (Paso 6 del checklist).

## Documentación interna

- `~/ajl/CLAUDE.md` (stack productivo y descripción de `ajl-landing-companero/`, que además todavía dice que la página es `/index.html`).
- `CLAUDE.md` del repo si menciona Vercel.
- Memorias `libro-reclamaciones-stack` y `landing-ajl-deploy-arch`.

## Criterio de éxito

El sitio responde desde Cloudflare en `www.ajlnutricion.com`, el apex redirige, las 5 funciones pasan la prueba en producción, el correo entrante y saliente sigue funcionando, y la política de privacidad nombra a Cloudflare.
