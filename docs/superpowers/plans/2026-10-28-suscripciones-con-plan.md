# Suscripciones «con plan» y prueba de S/5 en producción · plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Que la suscripción no dependa del correo del paciente (Mercado Pago exige `payer_email` en las suscripciones sin plan, y debe ser el de la cuenta que paga), y poder probar todo en producción con un plan oculto de S/5 sin mostrar el pago mensual a los pacientes.

**Architecture:** En vez de `POST /preapproval` con `payer_email`, se crea un plan de Mercado Pago por suscripción (`POST /preapproval_plan`, con la cuota, `repetitions` = cobros del paquete y `back_url`). El paciente autoriza en el `init_point` del plan con cualquier cuenta. La suscripción que nace (`preapproval`) trae `preapproval_plan_id`, y por él reconocemos al paciente. Un interruptor `SUSCRIPCIONES_ABIERTAS` apaga el pago mensual para pacientes en producción; un producto interno `prueba` (S/5 al mes, 3 cobros) solo lo pueden crear los administradores desde el panel.

**Spec:** docs/superpowers/specs/2026-10-27-suscripciones-design.md (este plan cambia solo la integración con Mercado Pago y agrega el interruptor y el producto de prueba). Plan anterior: docs/superpowers/plans/2026-10-28-suscripciones.md (sus Global Constraints siguen valiendo).

**Hecho que motiva el cambio (2026-10-28):** en la versión de prueba Mercado Pago respondió «Both payer and collector must be real or test users», luego «User bad request» con un correo armado, y sin correo «payer_email is required».

## Global Constraints

- Las del plan anterior (montos en el servidor, «quien gana el UPDATE manda los correos», baja sin depender de pagar, texto en español de Perú sin rayas como inciso, nada secreto en el repo).
- No se pasa `payer_email` a Mercado Pago en ningún flujo de suscripción.
- Con `SUSCRIPCIONES_ABIERTAS` distinto de `"1"`: /reservar/ no muestra «¿Cómo quieres pagar?» (va directo como hoy, pago completo), `apartar` con `forma: 'mensual'` responde 400, y el panel solo ofrece el producto `prueba` en «Cobrar con suscripción», y solo a administradores (`acceso.admin === true`). Con `"1"`: todo como en el plan anterior, y `prueba` sigue siendo solo para administradores.
- `wrangler.toml`: `SUSCRIPCIONES_ABIERTAS = "1"` en `[env.preview.vars]`; en producción NO se define (queda apagado).
- Producto `prueba`: cuota S/5 (500 céntimos), precio mes a mes de referencia S/10 (1000), 3 cobros, título «Prueba interna · 3 meses · pago mensual». Con 1 cobro pagado, la penalidad es S/5.

---

### Task A: Mercado Pago con plan

**Files:** Modify `server/reservas/mercadopago.mjs`, `server/reservas/mercadopago.test.mjs`; Create `db/d1/0018_mp_plan.sql`; Modify `server/suscripciones/repo.mjs`, `server/suscripciones/repo.test.mjs`.

**Interfaces:**
- `crearSuscripcion({ suscripcionId, titulo, cuotaCentimos, cobros: number|null, urlRetorno }) → { planId, init_point }` hace `POST /preapproval_plan` con
  `{ reason: 'AJL Nutrición · <titulo>', back_url: urlRetorno, auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: cuota/100, currency_id: 'PEN', ...(cobros ? { repetitions: cobros } : {}) } }` y header `X-Idempotency-Key: plan-<suscripcionId>-<12 hex de sha256(urlRetorno)>`. Sin `payer_email`, sin `email` en la firma.
- `buscarSuscripcionDePlan(planId) → preapproval|null`: `GET /preapproval/search?preapproval_plan_id=<id>` y devuelve el primero de `results` (el más reciente).
- `desactivarPlan(planId)`: `PUT /preapproval_plan/<id>` con `{ status: 'cancelled' }` (best effort, para que el link no se pueda volver a usar).
- Migración `0018_mp_plan.sql`: `ALTER TABLE suscripciones ADD COLUMN mp_plan_id TEXT;` y `CREATE UNIQUE INDEX suscripciones_plan ON suscripciones (mp_plan_id) WHERE mp_plan_id IS NOT NULL;`
- Repo: `guardarPlan(db, id, planId, ahora)`, `porPlan(db, planId)`. `guardarPreapproval` sigue igual (se llama cuando llega el preapproval).

- [ ] Tests primero en mercadopago.test.mjs: la ruta, el cuerpo exacto (sin payer_email, con repetitions solo si hay cobros), la key; search y desactivar. En repo.test.mjs: guardarPlan/porPlan.
- [ ] Implementar, `npm test`, commit.

### Task B: Reconocer la suscripción por su plan

**Files:** Modify `server/suscripciones/procesar.mjs`, `server/handlers/reservas.mjs` (handlePagar, handleEstado), `server/handlers/suscripciones.mjs` (link), sus tests.

- `handlePagar` (mensual) y el POST del link: llaman `crearSuscripcion` con `cobros` y guardan `planId` con `guardarPlan`; responden `{ ok, url: init_point }`. La lógica de reintento de Task 6 cambia: si la fila ya tiene `mp_plan_id` y está `pendiente`, se crea un plan nuevo, se guarda y después se desactiva el viejo (best effort). El link de suscripción ya no pide correo a Mercado Pago, pero lo sigue pidiendo al paciente para los recibos.
- `procesarPreapproval(preapprovalId)`: lee el preapproval; busca la suscripción por `mp_preapproval_id`, si no por `preapproval_plan_id` (`porPlan`), si no por `external_reference`. Si la encontró por plan y no tenía `mp_preapproval_id`, lo guarda (`guardarPreapproval`) y desactiva el plan (best effort). El resto igual (authorized → nada; cancelled → baja).
- `procesarCobro`: si `porPreapproval` no encuentra, `obtenerSuscripcion(ap.preapproval_id)` y buscar por su `preapproval_plan_id` (además del `external_reference` actual); si la encuentra por plan sin `mp_preapproval_id`, lo guarda antes de seguir. La regla de «cobro de otro preapproval» (anómalo) compara contra el `mp_preapproval_id` ya guardado.
- `sincronizarDeReserva`: si la suscripción no tiene `mp_preapproval_id` pero sí `mp_plan_id`, usa `buscarSuscripcionDePlan` para obtenerlo y lo guarda; luego sigue como hoy.
- `handleEstado`: además de `preapproval_id`, sincroniza si la reserva es mensual y no está confirmada (el regreso del plan puede no traer el id), como máximo cada vez que llega `preapproval_id` o cada 5 sondeos (el front ya manda el parámetro cada 5).
- Tests: crear desde /reservar/ y desde link sin payer_email; preapproval que llega con `preapproval_plan_id` y sin external_reference → se asocia; cobro que llega antes que el preapproval → se asocia por plan; reintento de /pagar → plan nuevo y el viejo desactivado.

### Task C: Interruptor y producto de prueba

**Files:** `server/suscripciones/calculo.mjs` (+test), `server/handlers/reservas.mjs` (handleApartar), `server/handlers/equipo-suscripciones.mjs` (+test), `src/pages/reservar/index.astro` + `src/scripts/reservar.js`, `src/pages/panel/index.astro` + `src/scripts/panel-suscripciones.js`, `wrangler.toml`, `src/data/links-reserva.js` (los links `&forma=mensual` solo si está abierto).

- `condicionesSuscripcion('prueba', 3)` → `{ producto: 'prueba', duracion_meses: 3, cuota_centimos: 500, precio_mes_centimos: 1000, precio_3m_centimos: null, ahorro_mes_centimos: 500, cobros: 3, titulo: 'Prueba interna · 3 meses · pago mensual' }` (3 meses porque la migración 0016 limita `duracion_meses` a 1, 3 o 6; en la prueba se cancela tras el primer cobro, así que nunca se llega al tercero). `penalidadAlCancelar` no cambia: con 1 cobro, 1 × 1000 − 1 × 500 = 500. `prueba` no está en `plans.js` ni en `/reservar/`; `cotizar('prueba', …)` sigue devolviendo null.
- `handleApartar`: si `env.SUSCRIPCIONES_ABIERTAS !== '1'` y `forma === 'mensual'` → 400 «El pago mensual todavía no está disponible.».
- `/reservar/`: el catálogo lleva `suscripcionesAbiertas` (desde `import.meta.env` no sirve en Pages: el flag se lee en el cliente desde `GET /api/reservas/opciones` nuevo → `{ suscripciones: bool }`, o más simple: `handleHoras` ya se llama al abrir p3 y no sirve para p2). Ruling: endpoint nuevo `GET /api/reservas/opciones` que devuelve `{ ok: true, suscripciones: env.SUSCRIPCIONES_ABIERTAS === '1' }`; `reservar.js` lo pide al cargar y, si es false, al elegir duración va directo al calendario con pago completo (comportamiento de antes del plan anterior). `&forma=mensual` en la URL se ignora si está apagado.
- Panel: «Cobrar con suscripción» se muestra si `suscripciones` está abierto, o si el usuario es administrador (la respuesta de `/api/equipo/links` ya trae `admin`); el producto `prueba` aparece en la lista solo para administradores. El servidor (`crearLink`) rechaza `prueba` si `!acceso.admin` (403) y rechaza cualquier otro producto si está apagado (400).
- «Copiar (mensual)» en «Links de reserva web» solo si está abierto.
- Tests de servidor para cada regla.

### Task D: Prueba en producción (con Joaquín)

1. Joaquín activa en el panel de Mercado Pago (Tus integraciones → la aplicación de producción → Webhooks) los eventos de **Planes y suscripciones**, con la URL `https://www.ajlnutricion.com/api/reservas/webhook-mp`.
2. Con autorización: aplicar 0016, 0017 y 0018 en `ajl-reservas` (producción) y publicar `reservas-pago` a `main`. Con el interruptor apagado los pacientes no ven nada nuevo.
3. Joaquín, como administrador, crea en el panel un link «Prueba interna · S/5», lo abre, completa sus datos y autoriza en Mercado Pago con su cuenta real.
4. Esperado: llega el cobro de S/5, el panel muestra «1 de 2», llega el recibo con «Cancelar mi plan». Desde el recibo: «Pagar S/5 y cancelar» → se cobra la penalidad y la suscripción queda cancelada en Mercado Pago. Total cobrado S/10 (cuota S/5 + penalidad S/5), que se devuelve desde Mercado Pago si Joaquín quiere.
5. Anotar los estados reales en docs/superpowers/notas/2026-10-28-mp-suscripciones-prueba.md. Encender `SUSCRIPCIONES_ABIERTAS` en producción solo cuando Joaquín lo decida.
