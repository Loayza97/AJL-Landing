# Citas por agendar con cada cobro — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada cobro mensual aprobado avisa al equipo, aparece en el panel con las citas que faltan agendar y se agenda desde esa fila.

**Architecture:** Los cobros de planes hechos a mano van en tablas propias (ningún camino de recibos, bajas o penalidades las toca). «Faltan» se calcula al vuelo a partir de cobros, un estado por suscripción (`citas_suscripcion`), reservas de links y ajustes. El webhook existente y una revisión nueva cada 15 min (una lista de Mercado Pago) registran los cobros de forma idempotente por número de pago.

**Tech Stack:** Cloudflare Pages Functions, D1 (SQLite), `node:test`, Astro 4, JS sin framework.

**Spec:** `docs/superpowers/specs/2026-11-26-citas-por-cobro-design.md`

## Global Constraints

- Una hecha a mano nunca provoca recibo, cancelación en Mercado Pago, baja ni penalidad.
- Hecha a mano = `reason` presente y que no empieza con `PREFIJO_PLAN`. Sin `reason` = de la web.
- Un pago se registra y avisa una sola vez (`mp_payment_id` único).
- Citas por cobro: Acompañamiento 1; Constancia 3 el primer cobro y 2 después; Transformación 5 y luego 4. Salen de `plans.js`.
- Las citas se acumulan; no vencen solas. La fila sigue mientras haya algo que hacer, aunque la suscripción terminara.
- El producto de prueba (`PRODUCTO_PRUEBA`) no sale en «Por agendar».
- Correo de una hecha a mano solo si el cobro es posterior a `sync_estado.citas_por_cobro_desde`.
- Texto de la base en el panel: siempre `textContent`. Repo público: ningún secreto ni dato de paciente.
- `npm test` y `npm run build` en verde. Sin push ni migraciones remotas en este plan.

## Review Focus

1. Webhook y revisión registran el mismo pago a la vez → un registro, un correo (Tareas 3 y 4).
2. Cobro pendiente que luego se aprueba (hecha a mano) → no cuenta pendiente, cuenta al aprobarse (Tarea 3).
3. Último cobro de una hecha a mano que ya no sale en la lista `authorized` → se registra igual (Tarea 4).
4. Suscripción de la web creada con «Mensual, ya tiene cita» (sin reserva) → «por revisar», no infla citas (Tarea 2).
5. Link creado desde una fila, paciente cancela la cita → «Faltan» vuelve a subir (Tarea 2).

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `db/d1/0021_citas_por_cobro.sql` | Tablas nuevas, columnas del link, marcas iniciales |
| `server/agenda/opciones.mjs` | `citasDeCobros`, `sugerirPlan` |
| `server/suscripciones/citas.mjs` | Consultas y cuenta de «Por agendar», revisar, ajustar, quitar paciente |
| `server/suscripciones/externas.mjs` | Registrar suscripción y cobro hechos a mano |
| `server/suscripciones/revision.mjs` | Revisión cada 15 min y reintento ante 429 |
| `server/handlers/equipo-por-agendar.mjs` | API del panel |
| `server/handlers/equipo-links.mjs`, `server/agenda/repo.mjs` | Link ligado a una suscripción |
| `functions/api/equipo/por-agendar.js`, `functions/api/suscripciones/revision.js` | Rutas |
| `workers/resumen-cron/` | Disparar la revisión cada 15 min |
| `src/pages/panel/index.astro`, `src/scripts/panel-por-agendar.js` | Sección «Por agendar» |

---

### Task 1: Migración y cuenta de citas

**Files:** Create `db/d1/0021_citas_por_cobro.sql`; Modify `server/agenda/opciones.mjs`; Test `server/agenda/opciones.test.mjs`.

**Produces:**
- Tablas `sus_externas(preapproval_id PK, pagador, reason, monto_centimos, estado_mp, creado_mp, creado_en, actualizado_en)`, `sus_externa_cobros(mp_payment_id PK, preapproval_id, numero, monto_centimos, cobrado_en, creado_en)`, `citas_suscripcion(clave PK, cliente_id, plan, citas_por_cobro, citas_previas DEFAULT 0, por_revisar DEFAULT 0, revisado_en, revisado_por, actualizado_en)`, `citas_ajustes(id PK, clave, cantidad, motivo, creado_por, creado_en)`.
- `links_agenda.sus_clave TEXT`, `links_agenda.sus_cpc INTEGER`. Clave: `s:<suscripciones.id>` (web) o `x:<preapproval_id>` (a mano).
- Inserta `citas_suscripcion` con `por_revisar = 1` para cada `suscripciones` con `cobros_aprobados > 0`, y `sync_estado('citas_por_cobro_desde', <ahora ISO>)`.
- `citasDeCobros(plan: string, cobros: number, citasPorCobro?: number): number | null` — `null` si el plan es desconocido, o `otro` sin `citasPorCobro`.
- `sugerirPlan(reason: string): { producto, duracion, citasPorCobro } | null` — lee «N meses» y «N sesión(es)»: 1→acompanamiento, 2→constancia, 4→transformacion; si esa duración no existe en el catálogo → `{ producto: 'otro', duracion: null, citasPorCobro: sesiones }`.

- [ ] **Step 1: Tests** — `citasDeCobros('acompanamiento:3',2)===2`; `('constancia:3',1)===3`; `('constancia:3',3)===7`; `('transformacion:6',2)===9`; `('constancia:3',0)===0`; `('otro',2,4)===8`; `('otro',2)===null`; `('zzz',1)===null`. `sugerirPlan` para los 7 textos reales: `'3 meses- 1 sesión mes'`→acompanamiento/3; `'3 meses - 2 sesiones mes'`→constancia/3; `'6 meses 2 sesiones mes'`→constancia/6; `'2 meses-4 sesiones mes'`→`otro`, 4; `'cualquier cosa'`→null.
- [ ] **Step 2:** `node --test server/agenda/opciones.test.mjs` → FAIL.
- [ ] **Step 3:** Escribir migración y funciones.
- [ ] **Step 4:** Test → PASS; `npm test` → todo verde (la migración corre en `d1DePrueba`).
- [ ] **Step 5:** Commit `feat(citas): migración y cuenta de citas por cobro`.

### Task 2: «Por agendar»: consultas y link ligado

**Files:** Create `server/suscripciones/citas.mjs`, `citas.test.mjs`; Modify `server/agenda/repo.mjs` (`crearLink`, `agendarConLink`).

**Produces:**
- `filasPorAgendar(db, ahora, { todas=false }) → fila[]`, `filaPorClave(db, clave, ahora) → fila | null`. `fila = { clave, origen: 'web'|'mano', nombre, pagador, whatsapp, plan, citas_por_cobro, sin_asignar, por_revisar, cobros, cobros_total, monto_centimos, cobrado_en, dadas, usadas, ajuste, faltan, links_sin_usar, sugerido }`. `faltan` y `dadas` son `null` si `sin_asignar` o `por_revisar`.
- `faltan = dadas − citas_previas − primera − agendadas + ajuste`. `primera` = 1 solo en web sin `revisado_en` cuya reserva esté `confirmada`. `agendadas` = reservas `confirmada` de links con esa `sus_clave`. `por_revisar` = web sin `revisado_en` y (`por_revisar = 1` o sin `reserva_id`).
- Sin `todas`: solo `por_revisar`, `sin_asignar` o `faltan > 0`. Orden: por revisar, sin asignar, resto; dentro, cobro más reciente.
- `revisar(db, { clave, usadas, por, ahora }) → boolean` (web; `usadas` entero 0–25). `ajustar(db, { clave, cantidad, motivo, por, ahora })`. `quitarPaciente(db, { clave, ahora }) → boolean` (solo `x:`; borra cliente, plan y previas, y suelta `sus_clave` de sus links).
- `crearLink(db, {…, susClave=null, susCpc=null})`.
- `agendarConLink`: en el mismo batch, si el link usado tiene `sus_clave` `x:` y la suscripción no tiene `cliente_id`, guarda `cliente_id`, `plan`, `citas_por_cobro`, `citas_previas = cita − 1`. El resultado `ok` sigue saliendo del `UPDATE links_agenda`.

- [ ] **Step 1: Tests** (con `d1DePrueba`, sembrando suscripción, cobros, reserva y links):
  - web nueva constancia:3, 1 cobro, reserva confirmada → `faltan 2`; 2 cobros → 4.
  - web reserva `cancelada` → `faltan 3`.
  - web sin `reserva_id` → `por_revisar`, `faltan null`; tras `revisar(usadas: 3)` con 2 cobros → `faltan 2`.
  - externa sin asignar con 2 cobros → `sin_asignar`; link `x:` plan constancia:3 cita 2 y `agendarConLink` → previas 1, `faltan 5−1−1 = 3`, nombre del paciente.
  - segundo link usado de la misma externa no cambia `citas_previas`; cancelar esa reserva (`estado='cancelada'`) → `faltan` +1.
  - `ajustar(-1)` baja 1; fila con `faltan 0` solo sale con `todas`.
  - suscripción `terminada` con `faltan > 0` sale; `PRODUCTO_PRUEBA` no.
  - `quitarPaciente` → vuelve a `sin_asignar` y conserva cobros.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** `npm test` PASS.
- [ ] **Step 5:** Commit `feat(citas): por agendar y link ligado a la suscripción`.

### Task 3: Registrar cobros hechos a mano y avisar

**Files:** Create `server/suscripciones/externas.mjs`; Modify `procesar.mjs`, `correos.mjs`; Test `procesar.test.mjs`.

**Produces:**
- `esHechaAMano(reason): boolean`.
- `guardarExterna(db, pre, ahora)` — upsert desde un preapproval (pagador = `payer_first_name payer_last_name`, si no `payer_email`, si no null; monto = `auto_recurring.transaction_amount`). No borra datos con valores vacíos.
- `registrarCobroExterno(deps, env, pre, ap, pago) → { nuevo: boolean }` — solo `pago.status === 'approved'`; `numero` correlativo; avisa si `nuevo` y `cobrado_en` (`pago.date_approved ?? ap.debit_date ?? ap.date_created`) > `citas_por_cobro_desde`.
- `correoCobroEquipo({ quien, titulo, monto, numero, cobros, faltan })` en `correos.mjs`: asunto `Pago de <quien>: agendar sus citas` (`sin asignar` cuando no hay paciente).
- `procesarCobro`: si el preapproval no es de la web y es hecha a mano → `registrarCobroExterno`, devuelve `{ estado: 'externa' }`. En web, tras `nuevoAprobado` con `numero > 1` y no último → `avisarFijas(correoCobroEquipo(...))`.

- [ ] **Step 1: Tests:**
  - cobro 2 de una de la web → un correo `/agendar sus citas/`; repetido → sigue 1; cobro 1 y último → ninguno de ese asunto.
  - externa aprobada → fila en `sus_externa_cobros`, 1 correo, `canceladas` y `desactivados` vacíos, cero correos al paciente; dos veces en `Promise.all` → 1 registro, 1 correo.
  - externa `pending` → nada; la misma `approved` después → registra.
  - externa con fecha anterior a `citas_por_cobro_desde` → registra sin correo.
  - preapproval sin `reason` → `desconocido`, nada registrado.
  - los tests existentes de planes ajenos siguen verdes (se actualiza su expectativa de `estado` si hace falta, sin quitar la comprobación de que no se cancela ni alerta).
- [ ] **Step 2–4:** FAIL → implementar → `npm test` PASS.
- [ ] **Step 5:** Commit `feat(citas): registrar cobros hechos a mano y avisar cada cobro`.

### Task 4: Revisión cada 15 min y respaldo con pausas

**Files:** Create `server/suscripciones/revision.mjs`, `revision.test.mjs`, `functions/api/suscripciones/revision.js`; Modify `procesar.mjs` (`barrerSuscripciones`), `server/reservas/mercadopago.mjs` (+test), `server/handlers/suscripciones.mjs` (+test), `workers/resumen-cron/index.js`, `wrangler.toml`, `server/handlers/resumen-cron.test.mjs`.

**Produces:**
- `mp.listarSuscripcionesVigentes()` — `GET /preapproval/search?status=authorized&limit=50&offset=N` hasta `paging.total`.
- `conReintento(fn, esperar)` — ante un error cuyo mensaje contiene ` 429`, espera 2000 ms y reintenta una vez.
- `revisarCobros(deps, env) → { vigentes, consultadas, errores }`:
  - web con `charged_quantity > cobros_aprobados` → procesa sus cobros no aprobados;
  - hecha a mano: `guardarExterna`; si `charged_quantity` > cobros guardados → pide cobros y registra los no guardados;
  - hechas a mano guardadas como `authorized` que no vienen en la lista → pide su preapproval y sus cobros una vez y guarda el estado nuevo.
  - fallos por suscripción en `sync_estado('citas_revision_fallos')` (JSON `{clave: n}`); correo a `AVISOS_RESPALDO` cuando una llega a 4 seguidas (clave `lista` si falla la lista). Un éxito la borra.
- `handleRevisionCobros(request, env, deps)` — POST con `RESUMEN_TOKEN`, como el barrido.
- Worker: `*/15` dispara salud y `REVISION_URL`; una falla no frena la otra.
- `barrerSuscripciones`: 300 ms entre suscripciones (`deps.esperar`) y `conReintento` en la consulta de cobros.

- [ ] **Step 1: Tests:** paginación (60 resultados → 2 pedidos); contador igual → cero `buscarCobrosSuscripcion`; contador mayor → registra; dos corridas → un correo; externa que salió de la lista con un cobro nuevo → lo registra; 429 una vez → reintenta y registra; 429 en 3 corridas → sin correo, en la 4.ª → uno; barrido con 429 una vez → sin errores; handler 401 sin token; cron `*/15` pide salud y revisión.
- [ ] **Step 2–4:** FAIL → implementar → `npm test` PASS.
- [ ] **Step 5:** Commit `feat(citas): revisión de cobros cada 15 min y respaldo con pausas`.

### Task 5: API del panel

**Files:** Create `server/handlers/equipo-por-agendar.mjs` (+test), `functions/api/equipo/por-agendar.js`; Modify `equipo-links.mjs` (`crearLink`) (+test).

**Produces:**
- `GET /api/equipo/por-agendar?todas=1` → `{ ok, admin, filas }`.
- `POST /api/equipo/por-agendar` `{ accion: 'revisar'|'ajuste'|'quitar', clave, usadas?, cantidad?, motivo? }`. `ajuste`: entero ≠ 0 entre −25 y 25, motivo obligatorio (≤200). `quitar`: solo administradores. 400/404/409 con mensaje.
- `POST /api/equipo/links` acepta `sus` (clave) y `citas_por_cobro`: 404 clave desconocida; 409 si está por revisar; si la suscripción ya tiene plan, `plan` debe ser ese (400); `plan: 'otro'` solo con clave `x:`, `citas_por_cobro` entero 1–25 (si no estaba guardado) y `cita` 1–25; sin `sus`, `otro` sigue rechazado.

- [ ] **Step 1: Tests** de cada código y efecto anterior, más 401 sin acceso y que un link sin `sus` queda con `sus_clave` NULL.
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5:** Commit `feat(citas): API de por agendar y link desde la fila`.

### Task 6: Sección «Por agendar», changelog y verificación

**Files:** Create `src/scripts/panel-por-agendar.js`; Modify `src/pages/panel/index.astro`, `src/scripts/panel.js`, `src/styles/panel.css` si hace falta, `CHANGELOG.md`, `DESARROLLO.md` (despliegue del worker).

- Sección arriba de «Agendar a un paciente que ya pagó»: tabla Paciente · Plan · Último cobro · Faltan · acciones; casilla «Ver también las que están al día»; contador en el título.
- «Agendar» abre un `<dialog>` (tipo de cita, producto, duración, qué cita; «Otro» con citas por cobro solo en hechas a mano sin plan), prellenado con el plan conocido o sugerido y la cita siguiente; al crear muestra el link con «Copiar» y «Enviar por WhatsApp».
- «Por revisar» pide las citas ya usadas o agendadas. «Ajustar» pide +/− y motivo. «Quitar paciente» solo administradores, con confirmación.
- Solo `textContent`.

- [ ] **Step 1:** Implementar. **Step 2:** `npm run build` sin errores.
- [ ] **Step 3:** Probar en local con D1 local y datos inventados (`wrangler pages dev`), capturar la sección y el diálogo, y recorrer: revisar → agendar → ver el link → ajustar.
- [ ] **Step 4:** `CHANGELOG.md` en «Pendiente de publicar»; commit `feat(panel): sección Por agendar`.

## Después de este plan (requiere OK)

Migración en prueba y producción, push, merge a `main`, `npx wrangler deploy --config workers/resumen-cron/wrangler.toml`, y las tres comprobaciones del cobro del 27-nov.
