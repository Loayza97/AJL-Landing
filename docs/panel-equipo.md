# Panel del equipo

Página interna donde el equipo ve las reservas de la web: quién pagó y quién dejó sus datos sin pagar. Publicada el 2026-10-12.

## Cómo se entra

1. Abrir **https://www.ajlnutricion.com/panel/**. No hay botón ni menú que lleve ahí, y Google no la muestra en búsquedas: se entra solo con la dirección.
2. Escribir el correo y tocar «Enviar código».
3. Si el correo está autorizado, llega un código de 6 dígitos que vence en 10 minutos. Escribirlo y tocar «Entrar».
4. La sesión dura 12 horas. «Salir» la cierra antes.

Para tenerlo a mano: guardarlo en favoritos o, en el celular, agregarlo a la pantalla de inicio (Safari: Compartir → «Agregar a inicio»).

## Qué muestra

- **Pagaron:** fecha del pago, paciente (con fecha de nacimiento), documento, WhatsApp con enlace directo, correo, plan y monto, cita (fecha, modalidad, nutricionista) y medio de pago. Avisa si alguien pagó pero perdió su hora y hay que darle otra.
- **No pagaron (últimos 30 días):** quienes dejaron sus datos sin completar el pago, con el botón «Marcar contactado», que guarda quién lo marcó y cuándo.
- **Descargar Excel:** los dos grupos en un CSV que abre Excel.

## Qué tan seguro es

- Solo entran los correos autorizados, con un código que vence en 10 minutos.
- 5 intentos por código. Tras 10 intentos fallidos en 24 horas, ese correo queda bloqueado un día.
- La respuesta al pedir un código es la misma para cualquier correo: no se puede averiguar quién está autorizado.
- La sesión vive en una cookie que el código de la página no puede leer (HttpOnly, Secure, SameSite=Strict).
- Los códigos y las sesiones se guardan como hash: aunque alguien viera la base, no podría entrar.
- La página no carga analítica: ni Clarity ni Google graban lo que se ve ahí.
- El servidor revisa la sesión en cada pedido, también por la dirección alternativa `*.pages.dev`.

**Puntos débiles a cuidar**

- **El correo:** quien entre al Gmail de una persona autorizada puede pedir un código. Las personas autorizadas deben tener verificación en dos pasos en Gmail.
- **El Excel descargado** queda en la computadora de quien lo baja, con DNI y datos personales. No reenviarlo y borrarlo cuando ya no se use.

## Dar o quitar acceso

La lista de correos autorizados es el secreto `EQUIPO_EMAILS` de Cloudflare Pages (separados por coma). No está en este repositorio, que es público. Para cambiarla:

```bash
npx wrangler pages secret put EQUIPO_EMAILS --project-name ajl-landing
```

Al cambiarla, quien salió de la lista pierde el acceso en su siguiente pedido, aunque tenga una sesión abierta. La versión de prueba (`--env preview`) tiene su propia lista.

## Por qué no Cloudflare Access

Cloudflare Access solo protege dominios cuyo DNS está en Cloudflare, y el de ajlnutricion.com está en Namecheap. Por eso el acceso con código es propio (`server/equipo/acceso.mjs`).

## Dónde está el código

- Página: `src/pages/panel/index.astro` (sin el Layout del sitio, para no cargar analítica).
- Acceso: `server/equipo/acceso.mjs` y rutas `functions/api/equipo/{codigo,entrar,salir}.js`.
- Datos: `server/handlers/equipo.mjs` y rutas `functions/api/equipo/{reservas,contactado,excel}.js`.
- Base de datos: migraciones `db/d1/0004_contactado.sql` y `db/d1/0005_equipo_fallos.sql`.
- Pruebas: `server/equipo/acceso.test.mjs` y `server/handlers/equipo.test.mjs`.
- No proteger la ruta `/equipo/`: ahí están las fotos públicas del equipo que usa la reserva.
