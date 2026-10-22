# Editar cita desde el panel · plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Botón «Editar» en Reservas del panel que cambia fecha, hora, nutricionista y modalidad de una cita confirmada futura, sin tope diario y sin cruces, y actualiza el mismo evento de Google Calendar.

**Architecture:** El motor `horasLibres` gana `sinTope`. Un módulo nuevo `server/reservas/editar.mjs` arma el texto del cambio y orquesta base + Google. Dos rutas nuevas del panel (`editar-horas`, `editar`) en `server/handlers/equipo-editar.mjs`. Google gana `actualizarEvento` (PATCH). El panel abre un `<dialog>`.

**Tech Stack:** Astro + Cloudflare Pages Functions, D1 (SQLite), Google Calendar API v3, node:test con `d1DePrueba`.

**Spec:** `docs/superpowers/specs/2026-10-22-editar-cita-design.md`

## Global Constraints

- Se edita fecha, hora, nutricionista y modalidad; nunca la duración.
- Solo citas `estado = 'confirmada'` con `inicio_utc` > ahora. Ni `pagada_sin_hora` ni canceladas.
- Horas: reglas de la web (ventana, consultorio, almuerzo, ausencias, eventos manuales, cruces) sin tope; desde ahora (`desdeDias: 0`) hasta 60 días (`hastaDias: 60`).
- El tope diario no se mira en ningún paso de la edición.
- Aviso al paciente: solo Google (`sendUpdates=all`). Sin correo propio.
- Google falla: la cita queda editada, `calendario_pendiente = 1`, alerta al equipo; respuesta 200 `{ ok: true, calendario: 'pendiente' }`.
- Sin `google_event_id` o Google 404/410: se crea el evento con `crearEvento`.
- Mensaje de hora tomada: «Esa hora acaba de ocuparse. Elige otra.». Cita no editable: «Esta cita ya no se puede editar.».
- Textos del panel en español, sin rayas como inciso. Todo texto de la base se pinta con `textContent`.
- Migración nueva `db/d1/0015_editar_cita.sql`, solo `ALTER TABLE … ADD COLUMN`.
- Commits con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- Mover una cita a la misma nutricionista media hora más tarde (se solapa consigo misma): debe entrar, la cita se excluye de su propio cruce.
- Una cita de link de 30 min: las horas se ofrecen cada 30 y el fin se recalcula con 30.
- Pasar de virtual a presencial: el PATCH manda `conferenceData: null` y `location`; `meet_url` queda null.
- Dos personas editan a la misma hora a la vez: el `UPDATE` con `NOT CRUCE` deja entrar solo a una (la otra 409).
- Cita editada a un día lleno: la web y los links ven ese día con los minutos reales (la cita suma donde quedó).

---

### Task 1: Motor sin tope

**Files:**
- Modify: `server/reservas/disponibilidad.mjs` (firma de `horasLibres`, línea del tope)
- Test: `server/reservas/disponibilidad.test.mjs`

**Interfaces:**
- Produces: `horasLibres({ ..., sinTope = false })`: con `sinTope: true` no aplica el tope diario.

- [ ] **Step 1: Write the failing test** (al final de `disponibilidad.test.mjs`)

```js
test('sinTope (editar desde el panel): un día lleno sigue ofreciendo horas libres', () => {
  const llenas = delMartes([10, 11, 12, 14, 15]);
  assert.deepEqual(horasLibres({ ...base, reservas: llenas, fecha: '2026-10-06', modalidad: 'video' }), []);
  const r = horasLibres({ ...base, reservas: llenas, fecha: '2026-10-06', modalidad: 'video', sinTope: true });
  assert.ok(horas(r).includes('16:00'));
});
```

- [ ] **Step 2:** `node --test server/reservas/disponibilidad.test.mjs` → FAIL (array vacío).
- [ ] **Step 3: Implement.** En la firma agregar `sinTope = false,` después de `pasoMin = 60,`. Cambiar la línea del tope a:

```js
  if (!sinTope && usados + duracionMin > topeMinutosDia(fecha)) return [];
```

- [ ] **Step 4:** Test → PASS.
- [ ] **Step 5: Commit** `git commit -am "Motor: opción sinTope para editar desde el panel"`.

---

### Task 2: Migración y repo `editarReserva`

**Files:**
- Create: `db/d1/0015_editar_cita.sql`
- Modify: `server/reservas/repo.mjs` (función nueva al final)
- Test: `server/reservas/repo.test.mjs`

**Interfaces:**
- Produces: `editarReserva(db, { id, nutricionista_id, inicio_utc, fecha_lima, modalidad, editadaPor, cambios, ahora })` → `{ ok: true }` | `{ ok: false, motivo: 'ocupada' | 'estado' }`. Mantiene la duración; recalcula `fin_utc`; no mira el tope; exige `confirmada` y que la hora actual no haya pasado.

- [ ] **Step 1: Migración**

```sql
-- Editar cita desde el panel (2026-10-22): quién y cuándo hizo la última edición
-- y el texto del cambio, para mostrarlo en la fila.
ALTER TABLE reservas ADD COLUMN editada_en TEXT;
ALTER TABLE reservas ADD COLUMN editada_por TEXT;
ALTER TABLE reservas ADD COLUMN edicion_cambios TEXT;
```

- [ ] **Step 2: Failing tests** (al final de `repo.test.mjs`; `ret`, `mas`, `t0` ya existen)

```js
const confirmada = async (db, o) => { await ret(db, o); await db.prepare("UPDATE reservas SET estado = 'confirmada', retencion_hasta = NULL WHERE id = ?1").bind(o.id).run(); };
const editar = (db, o) => repo.editarReserva(db, { id: 'e', nutricionista_id: 'nico', inicio_utc: '2026-10-07T16:00:00Z', fecha_lima: '2026-10-07',
  modalidad: 'video', editadaPor: 'romi@x.pe', cambios: 'x', ahora: mas(5), ...o });

test('editarReserva: mueve hora, nutri y modalidad, conserva la duración y guarda quién', async () => {
  const db = d1DePrueba();
  await confirmada(db, { id: 'e', duracion_min: 30, modalidad: 'presencial' });
  assert.deepEqual(await editar(db, { nutricionista_id: 'paola', cambios: '10:00 → 11:00' }), { ok: true });
  const r = await repo.reservaPorId(db, 'e');
  assert.deepEqual([r.nutricionista_id, r.inicio_utc, r.fin_utc, r.fecha_lima, r.modalidad, r.estado, r.editada_por, r.edicion_cambios],
    ['paola', '2026-10-07T16:00:00Z', '2026-10-07T16:30:00Z', '2026-10-07', 'video', 'confirmada', 'romi@x.pe', '10:00 → 11:00']);
  assert.equal(r.editada_en, mas(5).toISOString());
});

test('editarReserva: se puede solapar consigo misma (media hora después)', async () => {
  const db = d1DePrueba();
  await confirmada(db, { id: 'e', inicio_utc: '2026-10-06T17:00:00Z' });
  assert.deepEqual(await editar(db, { nutricionista_id: 'nico', inicio_utc: '2026-10-06T17:30:00Z', fecha_lima: '2026-10-06', modalidad: 'presencial' }), { ok: true });
});

test('editarReserva: cruce con otra cita de la nutri o con otra presencial da ocupada y no cambia nada', async () => {
  const db = d1DePrueba();
  await confirmada(db, { id: 'e' });
  await confirmada(db, { id: 'otra', nutricionista_id: 'paola', inicio_utc: '2026-10-07T16:00:00Z', fecha_lima: '2026-10-07', modalidad: 'presencial' });
  assert.deepEqual(await editar(db, { nutricionista_id: 'paola' }), { ok: false, motivo: 'ocupada' });
  assert.deepEqual(await editar(db, { nutricionista_id: 'jussara', modalidad: 'presencial' }), { ok: false, motivo: 'ocupada' });
  assert.equal((await repo.reservaPorId(db, 'e')).inicio_utc, '2026-10-06T17:00:00Z');
});

test('editarReserva: no mira el tope del día', async () => {
  const db = d1DePrueba();
  for (const h of ['14', '15', '16', '17', '19']) await confirmada(db, { id: `l${h}`, inicio_utc: `2026-10-07T${h}:00:00Z`, fecha_lima: '2026-10-07', nutricionista_id: `n${h}`, modalidad: 'video' });
  await confirmada(db, { id: 'e' });
  assert.deepEqual(await editar(db, { inicio_utc: '2026-10-07T21:00:00Z' }), { ok: true });
});

test('editarReserva: cita pasada, cancelada o pagada sin hora da estado', async () => {
  const db = d1DePrueba();
  await confirmada(db, { id: 'e' });
  assert.deepEqual(await editar(db, { ahora: new Date('2026-10-06T17:00:00Z') }), { ok: false, motivo: 'estado' });
  await db.prepare("UPDATE reservas SET estado = 'pagada_sin_hora' WHERE id = 'e'").run();
  assert.deepEqual(await editar(db), { ok: false, motivo: 'estado' });
  await db.prepare("UPDATE reservas SET estado = 'cancelada' WHERE id = 'e'").run();
  assert.deepEqual(await editar(db), { ok: false, motivo: 'estado' });
});
```

- [ ] **Step 3:** `node --test server/reservas/repo.test.mjs` → FAIL (`editarReserva` no existe).
- [ ] **Step 4: Implement** (al final de `repo.mjs`)

```js
// Editar desde el panel (2026-10-22): misma duración, sin tope, nunca encima de
// otra cita. La propia cita se excluye del cruce, así puede moverse media hora.
export async function editarReserva(db, r) {
  const ahoraIso = r.ahora.toISOString();
  const fin = `strftime('%Y-%m-%dT%H:%M:%SZ', ?3, '+' || COALESCE(reservas.duracion_min, 60) || ' minutes')`;
  try {
    const res = await db.prepare(
      `UPDATE reservas SET nutricionista_id = ?2, inicio_utc = ?3, fecha_lima = ?4, modalidad = ?5, fin_utc = ${fin},
         editada_en = ?6, editada_por = ?7, edicion_cambios = ?8, actualizado_en = ?6
       WHERE id = ?1 AND estado = 'confirmada' AND inicio_utc > ?6
         AND NOT ${CRUCE({ ini: '?3', fin, nutri: '?2', modalidad: '?5', excluir: '?1' })}`,
    ).bind(r.id, r.nutricionista_id, r.inicio_utc, r.fecha_lima, r.modalidad, ahoraIso, r.editadaPor, r.cambios).run();
    if (res.meta.changes === 1) return { ok: true };
  } catch (e) {
    if (!UNIQUE.test(String(e?.message))) throw e;
    return { ok: false, motivo: 'ocupada' };
  }
  const actual = await reservaPorId(db, r.id);
  if (!actual || actual.estado !== 'confirmada' || actual.inicio_utc <= ahoraIso) return { ok: false, motivo: 'estado' };
  return { ok: false, motivo: 'ocupada' };
}
```

`reservaPorId` usa `CON_CLIENTE` (`SELECT r.*`), así que las columnas nuevas ya salen.

- [ ] **Step 5:** Test → PASS; `npm test` completo → PASS.
- [ ] **Step 6: Commit** `git add db/d1/0015_editar_cita.sql server/reservas/repo.mjs server/reservas/repo.test.mjs && git commit -m "Reservas: editarReserva sin tope y sin cruces, con quién editó (migración 0015)"`.

---

### Task 3: Google `actualizarEvento`

**Files:**
- Modify: `server/reservas/google.mjs`
- Test: `server/reservas/google.test.mjs`

**Interfaces:**
- Produces: `google.actualizarEvento(eventId, { titulo, descripcion, inicioUtc, finUtc, modalidad, direccion })` → `{ id, meet }`. Si Google responde 404 o 410 lanza un `Error` con `e.noExiste = true`.

- [ ] **Step 1: Failing tests**

```js
test('actualizarEvento a virtual: PATCH con hora y título nuevos, pide Meet y quita la ubicación', async () => {
  const f = fetchFalso([['oauth2.googleapis.com/token', { access_token: 'AT', expires_in: 3600 }], ['/events/ev1?', { id: 'ev1', hangoutLink: 'https://meet.google.com/n' }]]);
  const g = crearGoogle(env, f);
  const r = await g.actualizarEvento('ev1', { titulo: 'Ana · 1 de 1', descripcion: 'd', inicioUtc: '2026-10-09T20:00:00Z', finUtc: '2026-10-09T21:00:00Z', modalidad: 'video', direccion: 'Lince' });
  assert.deepEqual(r, { id: 'ev1', meet: 'https://meet.google.com/n' });
  const { url, init } = f.llamadas[1];
  assert.equal(init.method, 'PATCH');
  assert.match(url, /events\/ev1\?conferenceDataVersion=1&sendUpdates=all/);
  const c = JSON.parse(init.body);
  assert.equal(c.summary, 'Ana · 1 de 1');
  assert.equal(c.start.dateTime, '2026-10-09T20:00:00Z');
  assert.equal(c.location, null);
  assert.equal(c.conferenceData.createRequest.conferenceSolutionKey.type, 'hangoutsMeet');
});

test('actualizarEvento a presencial: dirección y sin Meet', async () => {
  const f = fetchFalso([['oauth2.googleapis.com/token', { access_token: 'AT', expires_in: 3600 }], ['/events/ev2?', { id: 'ev2' }]]);
  const g = crearGoogle(env, f);
  assert.deepEqual(await g.actualizarEvento('ev2', { titulo: 't', descripcion: 'd', inicioUtc: '2026-10-06T17:00:00Z', finUtc: '2026-10-06T18:00:00Z', modalidad: 'presencial', direccion: 'Jr. X' }),
    { id: 'ev2', meet: null });
  const c = JSON.parse(f.llamadas[1].init.body);
  assert.equal(c.location, 'Jr. X');
  assert.equal(c.conferenceData, null);
});

test('actualizarEvento: 404 o 410 avisan que el evento no existe; 500 es otro error', async () => {
  for (const [status, noExiste] of [[404, true], [410, true], [500, undefined]]) {
    _limpiarCachesGoogle();
    const f = fetchFalso([['oauth2.googleapis.com/token', { access_token: 'AT', expires_in: 3600 }], ['/events/ev3?', { error: 'x' }, status]]);
    const g = crearGoogle(env, f);
    const e = await g.actualizarEvento('ev3', { titulo: 't', descripcion: 'd', inicioUtc: 'a', finUtc: 'b', modalidad: 'video' }).catch((x) => x);
    assert.ok(e instanceof Error);
    assert.equal(e.noExiste, noExiste, String(status));
  }
});
```

- [ ] **Step 2:** `node --test server/reservas/google.test.mjs` → FAIL.
- [ ] **Step 3: Implement** (dentro de `crearGoogle`, después de `crearEvento`)

```js
  // Editar desde el panel: mismo evento (un solo aviso al paciente). Al pasar a
  // virtual se pide Meet y se quita la dirección; a presencial, al revés.
  async function actualizarEvento(eventId, e) {
    const cuerpo = {
      summary: e.titulo,
      description: e.descripcion,
      start: { dateTime: e.inicioUtc, timeZone: 'America/Lima' },
      end: { dateTime: e.finUtc, timeZone: 'America/Lima' },
      ...(e.modalidad === 'presencial'
        ? { location: e.direccion, conferenceData: null }
        : { location: null, conferenceData: { createRequest: { requestId: `${eventId}-${Date.now()}`, conferenceSolutionKey: { type: 'hangoutsMeet' } } } }),
    };
    const r = await fetchImpl(`${API}/calendars/${calendario}/events/${encodeURIComponent(eventId)}?conferenceDataVersion=1&sendUpdates=all`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    });
    if (!r.ok) {
      const err = new Error(`Google events.patch ${r.status}: ${await r.text()}`);
      if (r.status === 404 || r.status === 410) err.noExiste = true;
      throw err;
    }
    const d = await r.json();
    eventosCacheados.clear();
    return { id: d.id, meet: e.modalidad === 'presencial' ? null : d.hangoutLink || null };
  }
```

Cambiar el `return` a `return { listarEventos, listarCambios, crearEvento, actualizarEvento };`.

Nota: un evento que ya era virtual y sigue virtual también recibe `createRequest`; Google conserva el Meet existente si ya hay `conferenceData` con el mismo tipo. Si en la prueba real de preview cambia el link, ajustar para mandar `conferenceData` solo cuando la modalidad cambió (el handler sabe la anterior) y anotarlo en el ledger.

- [ ] **Step 4:** Test → PASS.
- [ ] **Step 5: Commit** `git commit -am "Google: actualizarEvento (PATCH del mismo evento, Meet o dirección según modalidad)"`.

---

### Task 4: Orquestación y rutas del panel

**Files:**
- Create: `server/reservas/editar.mjs`, `server/reservas/editar.test.mjs`
- Create: `server/handlers/equipo-editar.mjs`, `server/handlers/equipo-editar.test.mjs`
- Create: `functions/api/equipo/editar.js`, `functions/api/equipo/editar-horas.js`
- Modify: `server/equipo/deps.mjs` (vuelve `google: crearGoogle(env)`)

**Interfaces:**
- Consumes: `horasLibres({ sinTope })` (Task 1), `repo.editarReserva` (Task 2), `google.actualizarEvento` (Task 3), `google.crearEvento`, `repo.guardarEvento`, `repo.marcarCalendarioPendiente`, `repo.reservaPorId`, `eventoEquipo(r, nutricionista)`, `contexto(deps, fecha, dias)` de `server/handlers/reservas.mjs`.
- Produces: `textoCambios(antes, despues, nutricionistas)` → string; `handleEditarHoras`, `handleEditar`.

- [ ] **Step 1: `textoCambios` failing test** (`server/reservas/editar.test.mjs`)

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { textoCambios } from './editar.mjs';
import { nutricionistas } from '../../src/data/nutricionistas.js';

const antes = { inicio_utc: '2026-10-29T15:00:00Z', modalidad: 'presencial', nutricionista_id: 'jussara' };

test('textoCambios: solo lo que cambió; el día si cambió la fecha', () => {
  assert.equal(textoCambios(antes, { ...antes, inicio_utc: '2026-10-29T14:00:00Z' }, nutricionistas), '10:00 → 9:00');
  assert.equal(textoCambios(antes, { inicio_utc: '2026-10-30T20:00:00Z', modalidad: 'video', nutricionista_id: 'nico' }, nutricionistas),
    'jue 29 oct 10:00 → vie 30 oct 15:00 · presencial → virtual · Jussara → Nico');
  assert.equal(textoCambios(antes, antes, nutricionistas), 'sin cambios');
});
```

- [ ] **Step 2:** FAIL. **Step 3: Implement** `server/reservas/editar.mjs`:

```js
// Editar una cita desde el panel (spec 2026-10-22-editar-cita-design.md):
// base primero (sin tope, sin cruces) y después el mismo evento de Google.
// Si Google falla, la cita queda editada y marcada pendiente, como al agendar.
import * as repo from './repo.mjs';
import { fechaLima, finDeReserva } from './tiempo.mjs';
import { eventoEquipo } from './evento-equipo.mjs';
import { correoEquipoAlerta } from './correos.mjs';
import { contacto } from '../../src/data/contacto.js';

const MOD = { presencial: 'presencial', video: 'virtual' };
const hora = (iso) => new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', hour: 'numeric', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
const dia = (iso) => new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', weekday: 'short', day: 'numeric', month: 'short' })
  .format(new Date(iso)).replace(/\./g, '').replace(',', '');

export function textoCambios(antes, despues, nutricionistas) {
  const nombre = (id) => nutricionistas.find((n) => n.id === id)?.nombre ?? id;
  const partes = [];
  if (antes.inicio_utc !== despues.inicio_utc) {
    partes.push(fechaLima(new Date(antes.inicio_utc)) === fechaLima(new Date(despues.inicio_utc))
      ? `${hora(antes.inicio_utc)} → ${hora(despues.inicio_utc)}`
      : `${dia(antes.inicio_utc)} ${hora(antes.inicio_utc)} → ${dia(despues.inicio_utc)} ${hora(despues.inicio_utc)}`);
  }
  if (antes.modalidad !== despues.modalidad) partes.push(`${MOD[antes.modalidad]} → ${MOD[despues.modalidad]}`);
  if (antes.nutricionista_id !== despues.nutricionista_id) partes.push(`${nombre(antes.nutricionista_id)} → ${nombre(despues.nutricionista_id)}`);
  return partes.join(' · ') || 'sin cambios';
}

const remitente = (env) => env.NEWSLETTER_FROM || 'AJL Nutrición <hola@ajlnutricion.com>';

// Lleva el evento de Google a la cita ya editada en la base. Devuelve 'ok' o 'pendiente'.
export async function sincronizarEventoEditado(deps, env, r) {
  const n = deps.nutricionistas.find((x) => x.id === r.nutricionista_id);
  const datos = { ...eventoEquipo(r, n), inicioUtc: r.inicio_utc, finUtc: finDeReserva(r), modalidad: r.modalidad, direccion: contacto.direccion };
  try {
    let ev;
    try {
      if (!r.google_event_id) throw Object.assign(new Error('sin evento'), { noExiste: true });
      ev = await deps.google.actualizarEvento(r.google_event_id, datos);
    } catch (e) {
      if (!e.noExiste) throw e;
      ev = await deps.google.crearEvento({ reservaId: r.id, ...datos, invitado: { email: r.email, nombre: r.nombre } });
    }
    await repo.guardarEvento(deps.db, r.id, ev.id, ev.meet, deps.ahora());
    return 'ok';
  } catch (e) {
    console.error('editar/google', e);
    await repo.marcarCalendarioPendiente(deps.db, r.id, deps.ahora());
    await deps.sendEmail({ from: remitente(env), to: env.NOTIFICATION_EMAIL, ...correoEquipoAlerta({
      asunto: 'Cita editada sin calendario',
      detalle: `${r.nombre}: la cita se cambió en el panel (${r.edicion_cambios}) pero Google Calendar no se pudo actualizar. Revisar el evento a mano. Reserva ${r.id}.`,
    }) }).catch((x) => console.error('editar/alerta', x));
    return 'pendiente';
  }
}
```

Agregar a `editar.test.mjs` pruebas de `sincronizarEventoEditado` con un `d1DePrueba`, una reserva confirmada (crear con `repo.crearRetencion` + `UPDATE estado='confirmada', google_event_id='ev1'` y un cliente con `guardarDatosYPagar` o INSERT directo en `clientes` y `cliente_id`) y un `google` falso:
  - con `google_event_id`: llama `actualizarEvento('ev1', …)` con el título de `eventoEquipo` y guarda `meet_url` devuelto; devuelve `'ok'`.
  - `actualizarEvento` lanza `{ noExiste: true }` → llama `crearEvento` con `invitado` y guarda el id nuevo.
  - sin `google_event_id` → `crearEvento`.
  - `actualizarEvento` lanza otro error → `'pendiente'`, `calendario_pendiente = 1`, un correo a `NOTIFICATION_EMAIL`.

- [ ] **Step 4: Handlers failing tests** (`server/handlers/equipo-editar.test.mjs`). Deps como en `equipo-links.test.mjs` (`db: d1DePrueba()`, `ahora: () => t0` con `t0 = 2026-10-05T15:00:00Z`, `nutricionistas`, `acceso: dentro`), más `google: { listarEventos: async () => [], actualizarEvento: async (id) => ({ id, meet: null }), crearEvento: async () => ({ id: 'nuevo', meet: null }) }` y `sendEmail: async () => {}`. Casos:
  - `GET /api/equipo/editar-horas` sin acceso → 401; parámetros inválidos → 400; con una cita propia de Nico el martes 6 a las 10:00 (Lima) y `nutricionista=nico&fecha=2026-10-06&modalidad=presencial` → la lista incluye `10:00` (se excluye a sí misma); con el día lleno por otras 5 citas sigue habiendo horas.
  - `POST /api/equipo/editar` sin acceso → 401; datos inválidos → 400; cita pasada → 409 «Esta cita ya no se puede editar.»; hora no ofrecida (fuera de ventana) → 409 «Esa hora acaba de ocuparse. Elige otra.»; caso feliz → 200 `{ ok: true, calendario: 'ok' }`, la reserva cambió, `editada_por = 'romi@x.pe'`, `edicion_cambios` es el texto de `textoCambios`, y `actualizarEvento` fue llamado; Google falla → 200 `{ ok: true, calendario: 'pendiente' }`.

- [ ] **Step 5: Implement** `server/handlers/equipo-editar.mjs`:

```js
// ─── Panel del equipo · editar cita ─────────────────────────────────────────
// GET  /api/equipo/editar-horas   horas libres para mover una cita (sin tope)
// POST /api/equipo/editar         mueve la cita y actualiza el evento de Google
import { json, readJson } from '../http.mjs';
import * as repo from '../reservas/repo.mjs';
import { horasLibres } from '../reservas/disponibilidad.mjs';
import { fechaLima } from '../reservas/tiempo.mjs';
import { contexto } from './reservas.mjs';
import { textoCambios, sincronizarEventoEditado } from '../reservas/editar.mjs';

const MODALIDADES = new Set(['presencial', 'video']);
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const INICIO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00Z$/;
const HASTA_DIAS = 60;
const MSJ_OCUPADA = 'Esa hora acaba de ocuparse. Elige otra.';
const MSJ_ESTADO = 'Esta cita ya no se puede editar.';
const bad = (status, error) => json(status, { ok: false, error });
const sinAcceso = () => json(401, { ok: false, error: 'Necesitas entrar con un correo autorizado del equipo.' });
const editable = (r, ahora) => r && r.estado === 'confirmada' && Date.parse(r.inicio_utc) > ahora.getTime();

async function horasPara(deps, r, { fecha, modalidad, nutricionista }) {
  const ctx = await contexto(deps, fecha, 1);
  const dur = r.duracion_min ?? 60;
  return horasLibres({ fecha, modalidad, nutricionistas: deps.nutricionistas, eventos: ctx.eventos,
    reservas: ctx.reservas.filter((x) => x.id !== r.id), ahora: deps.ahora(), filtroNutricionista: nutricionista,
    desdeDias: 0, hastaDias: HASTA_DIAS, duracionMin: dur, pasoMin: dur, sinTope: true });
}

export async function handleEditarHoras(request, env, deps) {
  if (request.method !== 'GET') return bad(405, 'Método no permitido');
  const acceso = await deps.acceso(request, env);
  if (!acceso.ok) return sinAcceso();
  const q = new URL(request.url).searchParams;
  const fecha = q.get('fecha') || '';
  const modalidad = q.get('modalidad');
  const nutricionista = q.get('nutricionista');
  if (!FECHA.test(fecha) || !MODALIDADES.has(modalidad) || !deps.nutricionistas.some((n) => n.id === nutricionista)) return bad(400, 'Datos inválidos');
  const r = await repo.reservaPorId(deps.db, String(q.get('id') || ''));
  if (!editable(r, deps.ahora())) return bad(409, MSJ_ESTADO);
  try {
    const horas = await horasPara(deps, r, { fecha, modalidad, nutricionista });
    return json(200, { ok: true, horas: horas.map(({ inicio, hora }) => ({ inicio, hora })) });
  } catch (e) {
    console.error('editar-horas', e);
    return bad(503, 'No pudimos consultar la agenda. Intenta en un momento.');
  }
}

export async function handleEditar(request, env, deps) {
  if (request.method !== 'POST') return bad(405, 'Método no permitido');
  const acceso = await deps.acceso(request, env);
  if (!acceso.ok) return sinAcceso();
  const d = await readJson(request);
  if (typeof d.id !== 'string' || !INICIO.test(d.inicio || '') || !MODALIDADES.has(d.modalidad)
    || !deps.nutricionistas.some((n) => n.id === d.nutricionista)) return bad(400, 'Datos inválidos');
  const antes = await repo.reservaPorId(deps.db, d.id);
  if (!editable(antes, deps.ahora())) return bad(409, MSJ_ESTADO);
  const fecha = fechaLima(new Date(d.inicio));
  try {
    const libres = await horasPara(deps, antes, { fecha, modalidad: d.modalidad, nutricionista: d.nutricionista });
    if (!libres.some((h) => h.inicio === d.inicio)) return bad(409, MSJ_OCUPADA);
    const despues = { inicio_utc: d.inicio, modalidad: d.modalidad, nutricionista_id: d.nutricionista };
    const res = await repo.editarReserva(deps.db, { id: d.id, ...despues, fecha_lima: fecha, editadaPor: acceso.email,
      cambios: textoCambios(antes, despues, deps.nutricionistas), ahora: deps.ahora() });
    if (!res.ok) return bad(409, res.motivo === 'estado' ? MSJ_ESTADO : MSJ_OCUPADA);
  } catch (e) {
    console.error('editar', e);
    return bad(503, 'No pudimos guardar el cambio. Intenta en un momento.');
  }
  const calendario = await sincronizarEventoEditado(deps, env, await repo.reservaPorId(deps.db, d.id));
  return json(200, { ok: true, calendario });
}
```

Rutas (`functions/api/equipo/editar.js` y `editar-horas.js`), igual que `revision.js`:

```js
import { handleEditar } from '../../../server/handlers/equipo-editar.mjs';
import { makeEquipoDeps } from '../../../server/equipo/deps.mjs';

export const onRequest = (ctx) => handleEditar(ctx.request, ctx.env, makeEquipoDeps(ctx.env));
```

(`editar-horas.js` con `handleEditarHoras`.) En `server/equipo/deps.mjs` importar `crearGoogle` de `../reservas/google.mjs` y agregar `google: crearGoogle(env)` a `deps`.

- [ ] **Step 6:** `npm test` → PASS.
- [ ] **Step 7: Commit** `git add -A server functions && git commit -m "Panel: rutas editar y editar-horas; base sin tope y mismo evento de Google"`.

---

### Task 5: Panel (botón, cuadro y marca)

**Files:**
- Modify: `server/handlers/equipo-links.mjs` (`CAMPOS_AGENDADO`, `vistaAgendado`)
- Modify: `server/handlers/equipo-links.test.mjs`
- Modify: `src/pages/panel/index.astro` (`<dialog id="e-dialogo">`)
- Modify: `src/scripts/panel-reservas.js`
- Modify: `src/styles/panel.css`

**Interfaces:**
- Consumes: `GET /api/equipo/editar-horas`, `POST /api/equipo/editar` (Task 4).
- Produces: en cada fila de `/api/equipo/agendados`: `nutricionista_id`, `duracion_min`, `editable` (bool), `edicion` (`{ en, por, cambios }` o null).

- [ ] **Step 1: Failing test** en `equipo-links.test.mjs`: una cita confirmada futura sale con `editable: true`, `nutricionista_id`, `duracion_min`; una pasada o `pagada_sin_hora` con `editable: false`; tras `UPDATE reservas SET editada_en='2026-10-12T19:00:00Z', editada_por='romi@x.pe', edicion_cambios='10:00 → 9:00'` sale `edicion: { en: '2026-10-12T19:00:00Z', por: 'romi@x.pe', cambios: '10:00 → 9:00' }`.
- [ ] **Step 2:** FAIL. **Step 3: Implement.** En `CAMPOS_AGENDADO` agregar `r.editada_en, r.editada_por, r.edicion_cambios`. `vistaAgendado(r, deps)` recibe el ahora: cambiar la firma a `vistaAgendado(r, deps, ahoraIso)` y en `handleAgendados` pasar `ahoraIso`; en los otros llamados pasar `deps.ahora().toISOString()`. Agregar:

```js
    nutricionista_id: r.nutricionista_id, duracion_min: r.duracion_min ?? 60,
    editable: r.estado === 'confirmada' && r.cancelada_en_panel == null && r.inicio_utc > ahoraIso,
    edicion: r.editada_en ? { en: r.editada_en, por: r.editada_por, cambios: r.edicion_cambios } : null,
```

- [ ] **Step 4: Dialog** en `src/pages/panel/index.astro`, justo después de la tabla de Reservas (`#a-scroll`):

```html
<dialog id="e-dialogo" class="lk-dialogo" aria-labelledby="e-titulo">
  <form method="dialog" id="e-form">
    <h3 id="e-titulo">Editar cita</h3>
    <p id="e-paciente" class="lk-sub"></p>
    <label>Nutricionista <select id="e-nutri" required></select></label>
    <label>Modalidad <select id="e-modalidad" required><option value="presencial">Presencial</option><option value="video">Virtual</option></select></label>
    <label>Fecha <input type="date" id="e-fecha" required></label>
    <fieldset><legend>Hora</legend><div id="e-horas" class="lk-horas" role="radiogroup"></div></fieldset>
    <p id="e-msg" class="lk-error" role="alert" hidden></p>
    <div class="lk-acciones">
      <button type="button" id="e-cancelar" class="lk-btn lk-btn--mantener">Cancelar</button>
      <button type="submit" id="e-guardar" class="lk-btn" disabled>Guardar cambio</button>
    </div>
  </form>
</dialog>
```

- [ ] **Step 5: Script** en `panel-reservas.js`:
  - `est` gana `nutris: []` (se llena en `cargarReservas` desde la respuesta si viene, o con la lista fija `[['nico','Nico'],['paola','Paola'],['jussara','Jussara'],['paolo','Paolo']]` si no; usar la fija para no tocar la API).
  - En `pintar()`, si `f.edicion` agregar `cita.append(chip(\`Editada por ${f.edicion.por.split('@')[0]} · ${lima(f.edicion.en)}: ${f.edicion.cambios}\`, 'lk-nota-cal'))`. Si `f.editable` y no `f.revisar`, agregar un botón `lk-btn lk-btn--mantener` con texto «Editar», `data-editar = f.id`, `aria-label` «Editar cita de {nombre}».
  - Click en `data-editar` → `abrirEditar(f)`: llena `#e-paciente` (nombre + cita actual con `citaCorta`), selecciona la nutri, modalidad y fecha actuales (fecha Lima `YYYY-MM-DD` del `inicio_utc`), `min` = hoy Lima, `max` = hoy + 60 días; `showModal()`; llama `cargarHoras()`.
  - `cargarHoras()`: GET `/api/equipo/editar-horas?id&fecha&modalidad&nutricionista`; pinta un botón por hora (`aria-pressed`, `data-inicio`); la hora actual de la cita sale marcada si está en la lista; sin horas → «No hay horas libres ese día.»; 401 → `mostrarLogin()`. Cambiar nutri, modalidad o fecha vuelve a llamar `cargarHoras()` y deshabilita «Guardar cambio» hasta elegir hora.
  - Submit → POST `/api/equipo/editar`; 200 con `calendario: 'ok'` → cerrar, `aviso()`, `cargarReservas()`; 200 con `'pendiente'` → cerrar, `aviso('Cita cambiada. El calendario no se pudo actualizar: revisa el evento a mano.')`, recargar; 409/400/503 → mostrar `error` en `#e-msg` y recargar horas.
  - `#e-cancelar` → `close()`.
- [ ] **Step 6: CSS** en `panel.css`:

```css
.lk-dialogo { border: 0; border-radius: 12px; padding: 20px; width: min(420px, calc(100vw - 32px)); }
.lk-dialogo::backdrop { background: rgb(0 0 0 / .4); }
.lk-dialogo form { display: grid; gap: 12px; }
.lk-dialogo label { display: grid; gap: 4px; font-size: .875rem; }
.lk-horas { display: flex; flex-wrap: wrap; gap: 6px; }
.lk-horas button { min-height: 44px; padding: 8px 12px; border: 1px solid #CFC9BD; border-radius: 8px; background: #fff; font: inherit; cursor: pointer; }
.lk-horas button[aria-pressed=true] { background: #141414; color: #fff; border-color: #141414; }
.lk-acciones { display: flex; gap: 8px; justify-content: flex-end; }
```

- [ ] **Step 7:** `npm test` y `npm run build` → PASS.
- [ ] **Step 8: Commit** `git commit -am "Panel: botón Editar, cuadro de horas sin tope y marca «Editada por»"`.

---

### Task 6: Changelog, migración en preview y prueba real

- [ ] **Step 1:** `CHANGELOG.md`, arriba de «Pendiente de publicar»: «Panel, Reservas: botón «Editar» en cada cita confirmada que no pasó. Cambia fecha, hora, nutricionista y modalidad (presencial o virtual) entre las horas libres de esa nutricionista, aunque el día esté lleno, nunca encima de otra cita. Actualiza el mismo evento de Google Calendar (Google avisa al paciente) y la fila muestra quién la editó y qué cambió. Requiere la migración 0015.»
- [ ] **Step 2:** `npx wrangler d1 migrations apply ajl-reservas-preview --env preview --remote` (aplica 0015; 0014 ya está en preview).
- [ ] **Step 3:** Commit, push a `reservas-pago`, esperar el deploy y `npm run smoke -- https://reservas-pago.ajl-landing.pages.dev` → 17/17.
- [ ] **Step 4:** Joaquín prueba en preview: crear una cita de prueba por link, editarla (hora, nutri, modalidad) y verla movida en Google Calendar; luego cancelarla en preview y borrar el evento a mano.
- [ ] **Step 5:** Publicar solo con autorización. Ojo: 0014 (neto) sigue sin publicar; publicar esta función sola exige cherry-pick o aplicar 0014 y 0015 en `ajl-reservas` antes del merge.
