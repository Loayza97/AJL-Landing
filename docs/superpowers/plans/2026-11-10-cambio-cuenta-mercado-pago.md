# Cambio a la cuenta personal de Mercado Pago · plan de construcción

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que todo cobro de la web entre a la cuenta personal de Mercado Pago de Alejandro (RUC 10), con el mismo flujo de hoy.

**Architecture:** la web solo lee dos datos de Mercado Pago: `MP_ACCESS_TOKEN` y `MP_WEBHOOK_SECRET` (comprobado el 10-nov). Para cambiar de cuenta basta con cambiar esos dos secretos y el webhook. El único cambio de código es el filtro de la alerta de «plan desconocido», para que no salte con los planes que Alejandro crea a mano en su cuenta.

**Tech Stack:** Astro 4, Cloudflare Pages Functions y D1, con pruebas en `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-09-cambio-cuenta-mercado-pago-design.md` (aprobado el 10-nov-2026 y reducido ese mismo día; ver «Reducción del 10-nov» en el spec).

## Global Constraints

- Por ningún motivo el cambio cancela una suscripción de un cliente, ni activa ni pendiente, ni desactiva planes de FJ.
- Los textos legales no se tocan.
- Las credenciales nunca van al repositorio (es público) ni al chat. Las carga Alejandro con `npx wrangler pages secret put … --project-name ajl-landing`, agregando `--env preview` para el sitio de prueba.
- Push a `main` solo con el OK explícito de Alejandro o Joaquín. Nada de `--force`.
- Los cambios de secretos aplican recién en el siguiente despliegue.
- El sitio de prueba cobra plata real y usa el Google Calendar real: hay que borrar las citas de prueba.

## Review Focus

1. **Pago aprobado de un plan manual de Alejandro** en la cuenta personal: no debe mandar «devolver este pago» (Task 1).
2. **Aviso sin `reason`:** se avisa igual que hoy, para que una alerta real no se pierda porque falte el campo (Task 1, con la prueba existente de la línea 322).
3. **Plan de la web que no está en la base:** sigue avisando (Task 1).
4. **Suscripciones viejas de FJ después del cambio:** «Sincronizar» da error y «Cancelar mi plan» en el último mes le pide al paciente escribir por WhatsApp. Es aceptado y no se arregla (spec, «Reducción del 10-nov»).

---

### Task 1: la alerta de plan desconocido ignora los planes que no crea la web

**Files:**
- Modify:
  - `server/reservas/mercadopago.mjs` (`crearSuscripcion`);
  - `server/suscripciones/procesar.mjs` (`suscripcionDe`, `procesarCobro`).
- Test: `server/suscripciones/procesar.test.mjs`

**Interfaces:**
- Produces: `PREFIJO_PLAN = 'AJL Nutrición · '`, exportado desde `mercadopago.mjs`. `crearSuscripcion` arma `reason: \`${PREFIJO_PLAN}${titulo}\``, el mismo texto de hoy.

Regla: cuando no encuentra la suscripción, `suscripcionDe` devuelve también `reason: p?.reason ?? null`. `procesarCobro` llama a `avisarPlanDesconocido` solo si `reason == null || reason.startsWith(PREFIJO_PLAN)`. Si no avisa, deja `console.log('plan ajeno a la web', planId, reason)`.

- [ ] **Step 1: pruebas que fallan**
  - `'cobro aprobado de un plan propio de Alejandro (reason sin el prefijo): no avisa'`: el mismo armado que la prueba de la línea 322, con `reason: 'Prueba S/5'` en el preapproval. Asserts: `{ estado: 'desconocido' }` y `alertas(d).length === 0`.
  - `'cobro aprobado de un plan de la web que no está en la base: avisa'`: con `reason: 'AJL Nutrición · Constancia · 3 meses'`. Assert: 1 alerta.
- [ ] **Step 2:** `npm test`. Resultado esperado: FAIL solo en la primera.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** `npm test`. Resultado esperado: todo en verde (531).
- [ ] **Step 5:** commit.

### Task 2: prueba en el sitio de prueba con la cuenta personal (Alejandro + Claude)

- [ ] **Step 1 (Alejandro):** en Mercado Pago Developers, con la cuenta personal:
  - crear la aplicación (Checkout Pro / pagos online y suscripciones);
  - en Webhooks, modo productivo, poner la URL `https://reservas-pago.ajl-landing.pages.dev/api/reservas/webhook-mp` con los eventos **Pagos** y **Planes y suscripciones**;
  - guardar la clave secreta;
  - cancelar la suscripción de prueba de S/5 del 09-nov.
- [ ] **Step 2 (Alejandro):** en la terminal, desde `~/AJL-Landing`, cargar las dos credenciales sin pegarlas en el chat:

```
npx wrangler pages secret put MP_ACCESS_TOKEN --project-name ajl-landing --env preview
npx wrangler pages secret put MP_WEBHOOK_SECRET --project-name ajl-landing --env preview
```

- [ ] **Step 3 (Claude):** `git push origin reservas-pago`, que publica el sitio de prueba con el código y los secretos nuevos.
- [ ] **Step 4 (Alejandro paga y Claude revisa):**
  1. **Reserva de pago único** con un link «Copiar». Revisar:
     - el pago aparece en la cuenta personal;
     - la reserva queda `confirmada`;
     - llega el correo de confirmación.

     Después, borrar la cita de Google Calendar.
  2. **Reserva «Copiar (mensual)».** Revisar:
     - el primer cobro aparece en la cuenta personal;
     - la reserva se confirma sola;
     - llegan «Recibimos tu pago» y «Suscripción nueva»;
     - el webhook respondió 200 en los registros de Cloudflare.

     Anotar si Mercado Pago avisó cada cambio de estado (el caso de Josué).
  3. **«Cancelar mi plan»** de esa suscripción: tiene que quedar cancelada en Mercado Pago y en la base.
  4. **`reason` del preapproval:** revisar si el preapproval del paso 2 trae `reason`. Si no lo trae, la Task 1 avisa siempre, igual que hoy: anotarlo en el spec.

  Para no pagar paquetes completos de prueba, primero hay que confirmar con Alejandro qué plan y monto se usan. `prueba` está bloqueado en el panel.
- [ ] **Step 5:** si algo falla, se detiene aquí. Si Mercado Pago no deja crear planes desde la web con la cuenta personal, se le avisa a Alejandro.

### Resultado de la Task 2 (10-nov-2026)

**Configuración**
- Aplicación «AJL Nutricion Web» (273911547585681) en la cuenta personal: producción activada, rubro Alimentos / Diética.
- Webhook productivo apuntando al sitio de prueba, con «Pagos (legacy)» y «Planes y suscripciones».
- Secretos cargados en preview.
- El token también está en el Llavero de macOS (`ajl-mercadopago-personal`).

**Qué se comprobó con dinero real** (link de S/5 creado directo en la base de preview)
- La web crea el plan y Mercado Pago, la suscripción.
- El cobro se aprueba, el aviso llega con la firma válida y la API responde con el token nuevo.
- Salen los correos al paciente y al equipo.
- La cancelación llega por webhook y se procesa.
- El preapproval trae `reason`.

**Lo que encontró la prueba y se arregló**
- `2859ac9`: si la primera tarjeta es rechazada y el paciente paga con otra, Mercado Pago crea otro preapproval del mismo plan. Antes, la web lo tomaba como duplicado y lo cancelaba. Ahora, mientras la suscripción no tiene ningún cobro, el primero que cobra se queda con ella.
- `11be9b6`, primer arreglo: Mercado Pago no avisó la aprobación de un primer cobro que pasó por «pendiente». Ahora `sincronizarSuscripcion` revisa todos los preapprovals del plan. La usan el botón «Sincronizar», el regreso de /reservar y /suscribirse/listo (con `sync=1`). Se comprobó en vivo: la suscripción quedó activa y salieron el recibo y el aviso al equipo.
- `11be9b6`, segundo arreglo: Mercado Pago cancela solo el preapproval de una tarjeta rechazada. Ahora, antes de cancelar, la web consulta si ya está cancelado, y así no avisa «Cancelar a mano» sin motivo.

**Pendiente: rechazos `cc_rejected_high_risk`**
- Son del antifraude de Mercado Pago, no del banco. En la cuenta nueva fueron 4 de 6 intentos, incluido un pago de S/325 de un paciente que pagó con un plan hecho a mano.
- El panel de Mercado Pago dice «el banco rechazó».
- Alejandro lo verá con el soporte de Mercado Pago. No bloquea el código.

### Task 3: cambio en producción (solo con el OK de Alejandro o Joaquín)

Se hace en un rato sin reservas a medio pagar, todo seguido.

- [ ] **Step 1 (Claude, panel de producción, como admin):** «Sincronizar con Mercado Pago» en cada una de las 6 `pendiente`, todavía con la credencial de FJ. **No se cancela ninguna.** Anotar el estado de cada una.
- [ ] **Step 2 (Claude):** comprobar que el resultado sea 0. Si no lo es, esperar a que venzan.

```
npx wrangler d1 execute ajl-reservas --remote --command "SELECT count(*) FROM reservas WHERE estado IN ('apartada','pagando')"
```

- [ ] **Step 3 (Alejandro):** cargar las credenciales en producción: los mismos dos comandos, sin `--env preview`.
- [ ] **Step 4 (Claude):** merge de `reservas-pago` a `main` y `git push origin main`, que despliega con los secretos nuevos. Después, `curl -s -o /dev/null -w '%{http_code}' https://www.ajlnutricion.com/` tiene que dar 200.
- [x] **Step 5 (Alejandro):**
  - en la aplicación nueva, cambiar la URL del webhook a `https://www.ajlnutricion.com/api/reservas/webhook-mp`;
  - en la aplicación de FJ, borrar el webhook. No se tocan planes ni suscripciones de FJ.
- [x] **Step 6:** con el primer cobro real en producción, revisar que llegue a la cuenta personal y que el webhook responda 200.

### Resultado de la Task 3 (10-nov-2026)

- **Step 5:** la simulación de webhook («Pagos (legacy)», pago 188870618390) llegó a producción con firma válida. El primer intento dio 500 porque Mercado Pago contestó `429 local_rate_limited` al consultar; Mercado Pago reintentó a los 13 s y dio 200. El webhook de la app de FJ queda por borrar (opcional: la web ya lo rechaza con 401).
- **Step 6, prueba de S/5 en producción** (fila `prueba` d0bce82c creada directo en `ajl-reservas`, con el OK de Alejandro): `/suscribirse` creó el plan b2515cc0… en la cuenta personal, el cobro 188924813358 se aprobó, llegaron 4 avisos con firma y 200, y la suscripción quedó `activa` con 1 cobro. La cancelación (hecha desde Mercado Pago) llegó por webhook: la web la dejó `cancelada` y el preapproval y el plan quedaron `cancelled`.
- **No probado en producción:** `/reservar` mensual (reserva + Google Calendar + suscripción) y el pago único con Checkout Pro. El código no cambió; lo cubre el primer lead real.
- El mismo día entró un cobro aprobado de S/270 de un plan hecho a mano en Mercado Pago («3 meses-1 sesión mes»): la web lo ignora, como corresponde.

- [ ] **Step 7:** actualizar el `Estado` del spec, el `CHANGELOG.md` y la memoria `proyecto-link-suscripcion-unico-pausa-culqi`. La pausa del link único se puede levantar: era por el RUC 20.

**Para volver atrás:** volver a cargar las credenciales de FJ (se generan otra vez en la aplicación de FJ) y hacer rollback del despliegue en Cloudflare.
