# Cómo trabajar en este repo

Web de AJL Nutrición: **https://www.ajlnutricion.com**, con reserva y pago en línea, panel del equipo (`/panel/`) y links de agenda (`/agenda/`).

## Stack

| Pieza | Tecnología | Dónde |
|---|---|---|
| Páginas | Astro 4 (sitio estático) | `src/pages/`, `src/components/`, `src/styles/` |
| JS del navegador | JavaScript sin frameworks | `src/scripts/` |
| API | Cloudflare Pages Functions | `functions/api/` (cada archivo es una ruta `/api/...`) |
| Lógica del servidor | Módulos `.mjs` que llaman las Functions | `server/` (handlers, reservas, agenda, equipo, suscripciones) |
| Base principal | Cloudflare D1: `ajl-reservas` (producción), `ajl-reservas-preview` (prueba) | Migraciones en `db/d1/` |
| Base secundaria | Supabase: newsletter, reclamos, códigos de descuento, conversiones | `db/*.sql` |
| Calendario | Google Calendar API (OAuth) | `server/reservas/google.mjs`, `scripts/google-oauth.mjs` |
| Pagos | Mercado Pago (pagos y suscripciones) | `server/reservas/mercadopago.mjs` |
| Correos | Resend | `server/correo.mjs` |
| Resumen diario | Worker con cron | `workers/resumen-cron/` |

Datos del negocio que la web muestra (precios, nutricionistas, condiciones, contacto): `src/data/`.

## Requisitos

Node 22.5 o más.

```
npm install
npm test        # 518+ pruebas (node:test, server/**/*.test.mjs)
npm run build   # build de Astro a dist/
npx wrangler login
```

## Despliegue

No hay comando de despliegue. **Cloudflare Pages publica solo con cada push:**

| Rama | Se publica en |
|---|---|
| `reservas-pago` | https://reservas-pago.ajl-landing.pages.dev (versión de prueba) |
| `main` | https://www.ajlnutricion.com (producción) |

Ver el estado: `npx wrangler pages deployment list --project-name ajl-landing --environment production`

## Flujo de trabajo

1. Trabajar en `reservas-pago`.
2. `npm test` y `npm run build` sin errores.
3. Anotar el cambio visible en `CHANGELOG.md`, en «Pendiente de publicar».
4. Push a `reservas-pago` y probar en la versión de prueba.
5. **Solo con aprobación de Joaquín:** merge a `main` y push. Mover la entrada del CHANGELOG a una sección «AAAA-MM-DD · publicado».
6. Verificar producción: `npm run smoke -- https://www.ajlnutricion.com` (debe dar todo OK).

### Si el cambio toca la base (D1)

1. Nueva migración en `db/d1/000N_descripcion.sql`.
2. Aplicarla en prueba: `npx wrangler d1 migrations apply ajl-reservas-preview --remote --env preview`
3. Aplicarla en producción **antes** del merge a `main` (si no, producción falla): `npx wrangler d1 migrations apply ajl-reservas --remote`

## Secretos

El repo es **público**: nada secreto en el código ni en `wrangler.toml`.

- Variables de texto (no secretas): en `wrangler.toml`, `[vars]` para producción y `[env.preview.vars]` para prueba. No se heredan entre sí.
- Secretos: solo con `npx wrangler pages secret put NOMBRE --project-name ajl-landing` (agregar `--env preview` para la versión de prueba). **Nunca** editar la tabla de variables en el panel de Cloudflare, porque deja los secretos vacíos.
- Secretos que usa el código: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `RESEND_API_KEY`, `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GOOGLE_CALENDAR_ID`, `EQUIPO_EMAILS`, `EQUIPO_ADMINS`, `CORREOS_EQUIPO`, `RESUMEN_TOKEN`.
- Los cambios de variables o secretos aplican recién en el siguiente despliegue.

## Cuidados

- **La versión de prueba usa el Google Calendar real.** Una reserva de prueba crea una cita de verdad: borrarla después.
- Mercado Pago de prueba también cobra de verdad si se paga.
- Lo que hace el código de medición (píxel, conversiones, cookies) y lo que dice `public/privacidad/` tienen que coincidir. Si cambia uno, cambia el otro.
- Las condiciones del servicio están en `src/pages/condiciones.astro` y en el resumen `src/data/condiciones.js`. Si cambia el texto, subir `CONDICIONES_VERSION`.
- Correo del negocio para herramientas: `ajlnutricion@gmail.com`.
- Las carpetas `02-comercial/`, `04-automatizaciones/`, `infografias/`, `api/` y `vercel.json` son de la etapa anterior (Vercel) y no forman parte de la web actual.
