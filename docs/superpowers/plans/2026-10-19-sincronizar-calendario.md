# Sincronizar Google Calendar → base y panel · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que los cambios hechos a mano en Google Calendar (hora, duración, presencial/virtual, borrado) lleguen a la base D1 y al panel en 10 minutos o al abrir el panel, con marcas visibles y botones para revisar.

**Architecture:** Una función `sincronizarCalendario(deps)` pide a Google los eventos modificados desde un cursor guardado en D1 (`updatedMin`, incluye borrados), busca cada reserva por `google_event_id` o por el id privado `ajl_reserva_id`, compara con una función pura y actualiza la reserva o la marca para revisar. La disparan un cron cada 10 min del Worker `ajl-resumen-cron` (vía una ruta con token) y `/api/equipo/agendados` al abrir el panel (máximo una vez por minuto). El panel pinta las marcas y ofrece «Cancelar reserva» / «Mantener».

**Tech Stack:** Cloudflare Pages Functions + D1 (SQLite), Worker con cron, Google Calendar API v3 por `fetch`, pruebas con `node:test` y `node:sqlite` (`server/reservas/d1-prueba.mjs`), JS sin build en `src/scripts/`.

**Spec:** `docs/superpowers/specs/2026-10-19-sincronizar-calendario-design.md`

## Global Constraints

- Trabajar en la worktree `~/ajl/ajl-landing-cloudflare`, rama `reservas-pago`. Nada a `main` sin autorización de Joaquín.
- Pruebas: `npm test` (todas `server/**/*.test.mjs`) y `npm run build` deben pasar al final de cada tarea.
- Migración nueva `db/d1/0012_sincronizar_calendario.sql`, solo agrega. En preview: `npx wrangler d1 migrations apply ajl-reservas-preview --remote --env preview`. En producción, ANTES del merge: `npx wrangler d1 migrations apply ajl-reservas --remote`.
- Mismo secreto del resumen: `RESUMEN_TOKEN`. No crear secretos nuevos.
- Evento borrado en Google: la reserva NO se cancela sola; `calendario_revisar = 'borrado'`.
- «Cancelar reserva» desde el panel: `estado = 'cancelada'`, la fila sigue en Reservas, toda en rojo, «Cancelada»; la ficha del paciente no se purga; no entra en «Copiar para la base maestra» ni en el CSV.
- Título, descripción y nutricionista del evento no se leen.
- Copy del panel en español de Perú, sin rayas como inciso.
- Todo texto de la base se pinta con `textContent` (nunca `innerHTML`).
- Commits terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- Evento borrado que Google devuelve sin `extendedProperties` (solo `id` y `status: 'cancelled'`): debe encontrarse la reserva por `google_event_id`. Prueba en Task 3.
- Evento creado a mano por el equipo (sin id de reserva) o de día completo: se ignora sin error ni consulta inútil. Prueba en Task 3.
- La hora nueva choca con otra reserva activa (índice único o cruce por duración): no mueve, marca `cruce`, y la sincronización sigue con los demás. Prueba en Task 3.
- Google falla (token vencido, 5xx): la ruta responde 503 y el cursor no avanza; el panel carga igual. Pruebas en Task 3, Task 4 y Task 5.
- Paciente con una reserva cancelada desde el panel y otra expirada: la purga de 30 días no borra su ficha. Prueba en Task 1.

---

## File Structure

- Create `db/d1/0012_sincronizar_calendario.sql`: columnas nuevas, tabla `sync_estado`, índice por `google_event_id`.
- Modify `server/reservas/repo.mjs`: cursor (`leerSync`, `guardarSync`), `reservaPorEvento`, `aplicarCambioCalendario`, `marcarRevisar`, `quitarBorrado`, `resolverRevision`; purga que respeta `cancelada_en_panel`.
- Modify `server/reservas/google.mjs`: `cambioDeEvento` (exportada) y `listarCambios` en el cliente.
- Create `server/reservas/sincronizar.mjs`: `compararEvento` (pura), `textoCambios` y `sincronizarCalendario(deps, opciones)`.
- Modify `server/handlers/reservas.mjs`: `handleSincronizarCalendario`.
- Create `functions/api/reservas/sincronizar-calendario.js`.
- Modify `server/equipo/deps.mjs`: `google` en las deps del panel.
- Modify `server/handlers/equipo-links.mjs`: sincroniza en `handleAgendados`, campos y filtro nuevos, CSV sin canceladas, `handleRevision`.
- Create `functions/api/equipo/revision.js`.
- Modify `src/scripts/panel-reservas.js` y `src/styles/panel.css`: marcas, fila roja, botones, copiar sin canceladas.
- Modify `workers/resumen-cron/index.js` y `workers/resumen-cron/wrangler.toml`: cron de 10 min.
- Modify `CHANGELOG.md`.

---

### Task 1: Migración 0012 y funciones de base

**Files:**
- Create: `db/d1/0012_sincronizar_calendario.sql`
- Modify: `server/reservas/repo.mjs` (agregar al final; cambiar `purgarNoPagadas`)
- Test: `server/reservas/sincronizar-repo.test.mjs` (nuevo)

**Interfaces:**
- Produces (en `server/reservas/repo.mjs`):
  - `leerSync(db, clave) → Promise<string|null>`
  - `guardarSync(db, clave, valor) → Promise`
  - `reservaPorEvento(db, { eventoId, reservaId }) → Promise<{ id, estado, inicio_utc, fin_utc, duracion_min, fecha_lima, modalidad, nutricionista_id, calendario_revisar } | null>`
  - `aplicarCambioCalendario(db, { id, inicio, fin, duracion, fecha, modalidad, cambios, ahora }) → Promise<{ ok: true } | { ok: false, motivo: 'cruce' | 'no_confirmada' }>`
  - `marcarRevisar(db, { id, motivo, cambios, ahora }) → Promise` (`motivo` es `'borrado'` o `'cruce'`; `cambios` puede ser `null`)
  - `quitarBorrado(db, id) → Promise`
  - `resolverRevision(db, { id, accion, ahora }) → Promise<boolean>` (`accion` es `'cancelar'` o `'mantener'`)

- [ ] **Step 1: Escribir la migración**

`db/d1/0012_sincronizar_calendario.sql`:

```sql
-- Cambios hechos a mano en Google Calendar (spec 2026-10-19-sincronizar-calendario). Solo agrega.
-- calendario_editado_en / calendario_cambios: cuándo y qué se cambió en el calendario («10:00 → 9:00 · presencial → virtual»).
-- calendario_revisar: el equipo debe decidir (evento borrado o movido a una hora ocupada).
-- cancelada_en_panel: cancelada con el botón del panel; sigue visible en rojo y su ficha no se purga.
ALTER TABLE reservas ADD COLUMN calendario_editado_en TEXT;
ALTER TABLE reservas ADD COLUMN calendario_cambios TEXT;
ALTER TABLE reservas ADD COLUMN calendario_revisar TEXT CHECK (calendario_revisar IN ('borrado', 'cruce'));
ALTER TABLE reservas ADD COLUMN cancelada_en_panel TEXT;
CREATE INDEX reservas_google_evento ON reservas (google_event_id);
-- Cursor de la sincronización: clave 'calendario_cursor', valor ISO de la última revisión que terminó bien.
CREATE TABLE sync_estado (clave TEXT PRIMARY KEY, valor TEXT NOT NULL);
```

- [ ] **Step 2: Escribir las pruebas que fallan**

`server/reservas/sincronizar-repo.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1DePrueba } from './d1-prueba.mjs';
import * as repo from './repo.mjs';

const ahora = new Date('2026-10-19T17:00:00Z');
// Reserva confirmada con evento de Google, como la deja el sistema.
const reserva = (db, o = {}) => db.prepare(
  `INSERT INTO reservas (id, token, producto, duracion_meses, monto_centimos, peso_tope, nutricionista_id, inicio_utc, fin_utc, duracion_min,
     fecha_lima, modalidad, estado, retencion_hasta, creado_en, actualizado_en, google_event_id, cliente_id)
   VALUES (?1, ?1, 'link_c30p', 1, 0, 0, ?2, ?3, ?4, ?5, ?6, ?7, ?8, NULL, 'x', 'x', ?9, ?10)`,
).bind(o.id ?? 'r1', o.nutri ?? 'jussara', o.inicio ?? '2026-10-21T15:00:00Z', o.fin ?? '2026-10-21T15:30:00Z', o.duracion ?? 30,
  o.fecha ?? '2026-10-21', o.modalidad ?? 'presencial', o.estado ?? 'confirmada', o.evento ?? 'ev1', o.cliente ?? null).run();

test('cursor: vacío al inicio, se guarda y se reescribe', async () => {
  const db = d1DePrueba();
  assert.equal(await repo.leerSync(db, 'calendario_cursor'), null);
  await repo.guardarSync(db, 'calendario_cursor', '2026-10-19T16:00:00.000Z');
  await repo.guardarSync(db, 'calendario_cursor', '2026-10-19T16:10:00.000Z');
  assert.equal(await repo.leerSync(db, 'calendario_cursor'), '2026-10-19T16:10:00.000Z');
});

test('reservaPorEvento: por id de evento o por id de reserva; null si no existe', async () => {
  const db = d1DePrueba();
  await reserva(db);
  assert.equal((await repo.reservaPorEvento(db, { eventoId: 'ev1', reservaId: null })).id, 'r1');
  assert.equal((await repo.reservaPorEvento(db, { eventoId: 'otro', reservaId: 'r1' })).id, 'r1');
  assert.equal(await repo.reservaPorEvento(db, { eventoId: 'nada', reservaId: null }), null);
});

test('aplicarCambioCalendario: mueve hora y modalidad, deja rastro y quita la marca', async () => {
  const db = d1DePrueba();
  await reserva(db);
  await repo.marcarRevisar(db, { id: 'r1', motivo: 'borrado', cambios: null, ahora });
  const res = await repo.aplicarCambioCalendario(db, { id: 'r1', inicio: '2026-10-21T14:00:00Z', fin: '2026-10-21T14:30:00Z', duracion: 30,
    fecha: '2026-10-21', modalidad: 'video', cambios: '10:00 → 9:00 · presencial → virtual', ahora });
  assert.deepEqual(res, { ok: true });
  const r = await db.prepare('SELECT * FROM reservas WHERE id = ?1').bind('r1').first();
  assert.equal(r.inicio_utc, '2026-10-21T14:00:00Z');
  assert.equal(r.modalidad, 'video');
  assert.equal(r.calendario_cambios, '10:00 → 9:00 · presencial → virtual');
  assert.equal(r.calendario_editado_en, ahora.toISOString());
  assert.equal(r.calendario_revisar, null);
});

test('aplicarCambioCalendario: choque con índice único → cruce, sin mover', async () => {
  const db = d1DePrueba();
  await reserva(db, { id: 'r1', nutri: 'jussara' });
  await reserva(db, { id: 'r2', nutri: 'jussara', inicio: '2026-10-21T14:00:00Z', fin: '2026-10-21T14:30:00Z', evento: 'ev2' });
  const res = await repo.aplicarCambioCalendario(db, { id: 'r1', inicio: '2026-10-21T14:00:00Z', fin: '2026-10-21T14:30:00Z', duracion: 30,
    fecha: '2026-10-21', modalidad: 'presencial', cambios: '10:00 → 9:00', ahora });
  assert.deepEqual(res, { ok: false, motivo: 'cruce' });
  assert.equal((await repo.reservaPorEvento(db, { eventoId: 'ev1' })).inicio_utc, '2026-10-21T15:00:00Z');
});

test('aplicarCambioCalendario: una reserva no confirmada no se toca', async () => {
  const db = d1DePrueba();
  await reserva(db, { estado: 'cancelada' });
  const res = await repo.aplicarCambioCalendario(db, { id: 'r1', inicio: '2026-10-21T14:00:00Z', fin: '2026-10-21T14:30:00Z', duracion: 30,
    fecha: '2026-10-21', modalidad: 'presencial', cambios: 'x', ahora });
  assert.deepEqual(res, { ok: false, motivo: 'no_confirmada' });
});

test('marcarRevisar y quitarBorrado', async () => {
  const db = d1DePrueba();
  await reserva(db);
  await repo.marcarRevisar(db, { id: 'r1', motivo: 'borrado', cambios: null, ahora });
  assert.equal((await repo.reservaPorEvento(db, { eventoId: 'ev1' })).calendario_revisar, 'borrado');
  await repo.quitarBorrado(db, 'r1');
  assert.equal((await repo.reservaPorEvento(db, { eventoId: 'ev1' })).calendario_revisar, null);
  await repo.marcarRevisar(db, { id: 'r1', motivo: 'cruce', cambios: '10:00 → 9:00', ahora });
  await repo.quitarBorrado(db, 'r1'); // solo quita «borrado», no «cruce»
  const r = await db.prepare('SELECT calendario_revisar, calendario_cambios FROM reservas WHERE id = ?1').bind('r1').first();
  assert.deepEqual({ ...r }, { calendario_revisar: 'cruce', calendario_cambios: '10:00 → 9:00' });
});

test('resolverRevision: cancelar libera la hora y marca cancelada_en_panel; mantener solo quita la marca', async () => {
  const db = d1DePrueba();
  await reserva(db, { id: 'r1', evento: 'ev1' });
  await reserva(db, { id: 'r2', evento: 'ev2', inicio: '2026-10-22T15:00:00Z', fin: '2026-10-22T15:30:00Z', fecha: '2026-10-22' });
  assert.equal(await repo.resolverRevision(db, { id: 'r1', accion: 'cancelar', ahora }), false); // sin marca: no se puede
  await repo.marcarRevisar(db, { id: 'r1', motivo: 'borrado', cambios: null, ahora });
  await repo.marcarRevisar(db, { id: 'r2', motivo: 'borrado', cambios: null, ahora });
  assert.equal(await repo.resolverRevision(db, { id: 'r1', accion: 'cancelar', ahora }), true);
  assert.equal(await repo.resolverRevision(db, { id: 'r2', accion: 'mantener', ahora }), true);
  const r1 = await db.prepare('SELECT estado, cancelada_en_panel, calendario_revisar FROM reservas WHERE id = ?1').bind('r1').first();
  const r2 = await db.prepare('SELECT estado, cancelada_en_panel, calendario_revisar FROM reservas WHERE id = ?1').bind('r2').first();
  assert.deepEqual({ ...r1 }, { estado: 'cancelada', cancelada_en_panel: ahora.toISOString(), calendario_revisar: null });
  assert.deepEqual({ ...r2 }, { estado: 'confirmada', cancelada_en_panel: null, calendario_revisar: null });
  // La hora de r1 quedó libre: otra reserva confirmada puede ocuparla.
  await reserva(db, { id: 'r3', evento: 'ev3' });
});

test('purga de 30 días: no borra la ficha de quien tiene una reserva cancelada desde el panel', async () => {
  const db = d1DePrueba();
  await db.prepare(`INSERT INTO clientes (id, nombre, email, creado_en) VALUES ('c1', 'Cecilia', 'c@x.pe', 'x')`).run();
  await reserva(db, { id: 'r1', cliente: 'c1' });
  await db.prepare(`UPDATE reservas SET estado = 'cancelada', cancelada_en_panel = 'x', actualizado_en = '2026-09-01T00:00:00Z' WHERE id = 'r1'`).run();
  // Otra reserva vieja del mismo paciente, expirada.
  await reserva(db, { id: 'r2', cliente: 'c1', estado: 'expirada', evento: 'ev2', inicio: '2026-09-01T15:00:00Z', fin: '2026-09-01T15:30:00Z', fecha: '2026-09-01' });
  await db.prepare(`UPDATE reservas SET actualizado_en = '2026-09-01T00:00:00Z' WHERE id = 'r2'`).run();
  await repo.purgarNoPagadas(db, ahora);
  assert.equal((await db.prepare(`SELECT nombre FROM clientes WHERE id = 'c1'`).first()).nombre, 'Cecilia');
});
```

Si el `INSERT INTO clientes` falla por columnas obligatorias, revisar `db/d1/0001_reservas.sql` y `0002_cliente_detalle.sql` y completar solo las columnas `NOT NULL` que falten; no cambiar el resto de la prueba.

- [ ] **Step 3: Correr las pruebas y ver que fallan**

Run: `node --test server/reservas/sincronizar-repo.test.mjs`
Expected: FAIL (`repo.leerSync is not a function`).

- [ ] **Step 4: Implementar en `server/reservas/repo.mjs`**

Agregar al final del archivo:

```js
// ─── Sincronización con Google Calendar (spec 2026-10-19-sincronizar-calendario) ───

export const leerSync = async (db, clave) =>
  (await db.prepare('SELECT valor FROM sync_estado WHERE clave = ?1').bind(clave).first())?.valor ?? null;

export const guardarSync = (db, clave, valor) => db.prepare(
  'INSERT INTO sync_estado (clave, valor) VALUES (?1, ?2) ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor',
).bind(clave, valor).run();

// Un evento borrado puede llegar de Google sin el id privado: por eso se busca
// primero por el id del evento que guardamos al crearlo.
export const reservaPorEvento = (db, { eventoId = null, reservaId = null }) => db.prepare(
  `SELECT id, estado, inicio_utc, fin_utc, duracion_min, fecha_lima, modalidad, nutricionista_id, calendario_revisar
   FROM reservas WHERE google_event_id = ?1 OR id = ?2 LIMIT 1`,
).bind(eventoId, reservaId).first();

export async function aplicarCambioCalendario(db, { id, inicio, fin, duracion, fecha, modalidad, cambios, ahora }) {
  const ahoraIso = ahora.toISOString();
  try {
    const r = await db.prepare(
      `UPDATE reservas SET inicio_utc = ?2, fin_utc = ?3, duracion_min = ?4, fecha_lima = ?5, modalidad = ?6,
         calendario_cambios = ?7, calendario_editado_en = ?8, calendario_revisar = NULL, actualizado_en = ?8
       WHERE id = ?1 AND estado = 'confirmada'`,
    ).bind(id, inicio, fin, duracion, fecha, modalidad, cambios, ahoraIso).run();
    return r.meta.changes === 1 ? { ok: true } : { ok: false, motivo: 'no_confirmada' };
  } catch (e) {
    if (UNIQUE.test(String(e?.message))) return { ok: false, motivo: 'cruce' };
    throw e;
  }
}

export const marcarRevisar = (db, { id, motivo, cambios = null, ahora }) => db.prepare(
  `UPDATE reservas SET calendario_revisar = ?2, calendario_cambios = COALESCE(?3, calendario_cambios), calendario_editado_en = ?4
   WHERE id = ?1`,
).bind(id, motivo, cambios, ahora.toISOString()).run();

export const quitarBorrado = (db, id) => db.prepare(
  `UPDATE reservas SET calendario_revisar = NULL WHERE id = ?1 AND calendario_revisar = 'borrado'`,
).bind(id).run();

// Botones del panel. Cancelar libera la hora (deja de ser activa para los índices
// y el motor) pero la reserva sigue visible en rojo (cancelada_en_panel).
export async function resolverRevision(db, { id, accion, ahora }) {
  const ahoraIso = ahora.toISOString();
  const r = accion === 'cancelar'
    ? await db.prepare(
      `UPDATE reservas SET estado = 'cancelada', cancelada_en_panel = ?2, calendario_revisar = NULL, actualizado_en = ?2
       WHERE id = ?1 AND estado = 'confirmada' AND calendario_revisar IS NOT NULL`,
    ).bind(id, ahoraIso).run()
    : await db.prepare(
      `UPDATE reservas SET calendario_revisar = NULL WHERE id = ?1 AND calendario_revisar IS NOT NULL`,
    ).bind(id).run();
  return r.meta.changes === 1;
}
```

`UNIQUE` ya existe en `repo.mjs` (se usa en `crearRetencion`); si no estuviera definido arriba del punto donde se usa, comprobar con `grep -n "const UNIQUE" server/reservas/repo.mjs`.

En `purgarNoPagadas`, cambiar la subconsulta de exclusión:

```js
       AND id NOT IN (SELECT cliente_id FROM reservas
             WHERE cliente_id IS NOT NULL AND estado IN ('confirmada', 'pagada_sin_hora'))`,
```

por:

```js
       AND id NOT IN (SELECT cliente_id FROM reservas
             WHERE cliente_id IS NOT NULL AND (estado IN ('confirmada', 'pagada_sin_hora') OR cancelada_en_panel IS NOT NULL))`,
```

- [ ] **Step 5: Correr las pruebas**

Run: `node --test server/reservas/sincronizar-repo.test.mjs && npm test`
Expected: PASS en todo (incluye `esquema.test.mjs`, que aplica todas las migraciones).

- [ ] **Step 6: Commit**

```bash
git add db/d1/0012_sincronizar_calendario.sql server/reservas/repo.mjs server/reservas/sincronizar-repo.test.mjs
git commit -m "Sync calendario: migración 0012 y funciones de base

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `listarCambios` en el cliente de Google

**Files:**
- Modify: `server/reservas/google.mjs`
- Test: `server/reservas/google.test.mjs` (agregar pruebas al final)

**Interfaces:**
- Produces:
  - `cambioDeEvento(ev) → { id: string, borrado: boolean, reservaId: string|null, inicio: string|null, fin: string|null, meet: boolean, ubicacion: boolean }` (exportada; `inicio`/`fin` en ISO UTC sin milisegundos, como `'2026-10-21T15:00:00Z'`; `null` en eventos de día completo o borrados sin fechas).
  - En el objeto que devuelve `crearGoogle(env)`: `listarCambios(desdeIso) → Promise<Array<cambio>>`. Sin caché. Lanza `Error` si Google responde error.

- [ ] **Step 1: Escribir las pruebas que fallan**

Agregar al final de `server/reservas/google.test.mjs` (ya tiene `fetchFalso`, `env` y `beforeEach`):

```js
import { cambioDeEvento } from './google.mjs';

test('cambioDeEvento: propio presencial, propio virtual, borrado mínimo y de día completo', () => {
  assert.deepEqual(cambioDeEvento({ id: 'e1', status: 'confirmed', location: 'Jr. Almirante Manuel Villavicencio 1461',
    start: { dateTime: '2026-10-21T10:00:00-05:00' }, end: { dateTime: '2026-10-21T10:30:00-05:00' },
    extendedProperties: { private: { ajl_reserva_id: 'r1' } } }),
  { id: 'e1', borrado: false, reservaId: 'r1', inicio: '2026-10-21T15:00:00Z', fin: '2026-10-21T15:30:00Z', meet: false, ubicacion: true });
  const v = cambioDeEvento({ id: 'e2', hangoutLink: 'https://meet.google.com/x', start: { dateTime: '2026-10-21T14:00:00Z' }, end: { dateTime: '2026-10-21T14:30:00Z' } });
  assert.equal(v.meet, true);
  assert.equal(v.ubicacion, false);
  assert.equal(v.reservaId, null);
  assert.deepEqual(cambioDeEvento({ id: 'e3', status: 'cancelled' }),
    { id: 'e3', borrado: true, reservaId: null, inicio: null, fin: null, meet: false, ubicacion: false });
  assert.equal(cambioDeEvento({ id: 'e4', start: { date: '2026-10-21' }, end: { date: '2026-10-22' } }).inicio, null);
});

test('listarCambios: updatedMin y showDeleted, pagina, incluye borrados y no cachea', async () => {
  const f = fetchFalso([
    ['oauth2.googleapis.com/token', { access_token: 'AT', expires_in: 3600 }],
    ['/events', (url) => (String(url).includes('pageToken=p2')
      ? { items: [{ id: 'b', status: 'cancelled' }] }
      : { items: [{ id: 'a', start: { dateTime: '2026-10-21T15:00:00Z' }, end: { dateTime: '2026-10-21T15:30:00Z' } }], nextPageToken: 'p2' })],
  ]);
  const g = crearGoogle(env, f, () => 1000);
  const cambios = await g.listarCambios('2026-10-19T16:58:00.000Z');
  assert.deepEqual(cambios.map((c) => [c.id, c.borrado]), [['a', false], ['b', true]]);
  const url = new URL(f.llamadas[1].url);
  assert.equal(url.searchParams.get('updatedMin'), '2026-10-19T16:58:00.000Z');
  assert.equal(url.searchParams.get('showDeleted'), 'true');
  assert.equal(url.searchParams.get('singleEvents'), 'true');
  await g.listarCambios('2026-10-19T16:58:00.000Z');
  assert.equal(f.llamadas.filter((l) => l.url.includes('/events')).length, 4); // 2 páginas × 2 llamadas: sin caché
});

test('listarCambios: error de Google lanza', async () => {
  const f = fetchFalso([
    ['oauth2.googleapis.com/token', { access_token: 'AT', expires_in: 3600 }],
    ['/events', { error: 'x' }, 500],
  ]);
  await assert.rejects(crearGoogle(env, f, () => 1000).listarCambios('2026-10-19T16:58:00.000Z'), /events\.list 500/);
});
```

Si el archivo ya importa de `./google.mjs` en la línea 3, agregar `cambioDeEvento` a ese import en vez de duplicarlo.

- [ ] **Step 2: Correr y ver que fallan**

Run: `node --test server/reservas/google.test.mjs`
Expected: FAIL (`cambioDeEvento` no exportada).

- [ ] **Step 3: Implementar en `server/reservas/google.mjs`**

Debajo de `normalizarEvento`, agregar:

```js
const isoUtc = (dt) => (dt ? new Date(dt).toISOString().replace('.000Z', 'Z') : null);

// Lo que la sincronización necesita de cada evento modificado. Un evento borrado
// puede venir solo con id y status: el resto queda en null/false.
export function cambioDeEvento(ev) {
  return {
    id: ev.id,
    borrado: ev.status === 'cancelled',
    reservaId: ev.extendedProperties?.private?.ajl_reserva_id ?? null,
    inicio: isoUtc(ev.start?.dateTime),
    fin: isoUtc(ev.end?.dateTime),
    meet: Boolean(ev.hangoutLink || ev.conferenceData?.entryPoints?.length),
    ubicacion: Boolean(String(ev.location ?? '').trim()),
  };
}
```

Dentro de `crearGoogle`, después de `listarEventos`, agregar:

```js
  // Eventos modificados desde `desdeIso`, incluidos los borrados (con updatedMin
  // Google siempre los devuelve). Sin caché: lo usa la sincronización.
  async function listarCambios(desdeIso) {
    const cambios = [];
    let pageToken;
    do {
      const q = new URLSearchParams({ updatedMin: desdeIso, singleEvents: 'true', showDeleted: 'true', maxResults: '2500' });
      if (pageToken) q.set('pageToken', pageToken);
      const r = await fetchImpl(`${API}/calendars/${calendario}/events?${q}`, {
        headers: { Authorization: `Bearer ${await token()}` },
      });
      if (!r.ok) throw new Error(`Google events.list ${r.status}: ${await r.text()}`);
      const d = await r.json();
      cambios.push(...(d.items || []).map(cambioDeEvento));
      pageToken = d.nextPageToken;
    } while (pageToken);
    return cambios;
  }
```

Y cambiar el `return` final a `return { listarEventos, listarCambios, crearEvento };`.

- [ ] **Step 4: Correr las pruebas**

Run: `node --test server/reservas/google.test.mjs && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/reservas/google.mjs server/reservas/google.test.mjs
git commit -m "Sync calendario: listarCambios en el cliente de Google

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Comparar y sincronizar

**Files:**
- Create: `server/reservas/sincronizar.mjs`
- Test: `server/reservas/sincronizar.test.mjs`

**Interfaces:**
- Consumes: de Task 1 `leerSync`, `guardarSync`, `reservaPorEvento`, `aplicarCambioCalendario`, `marcarRevisar`, `quitarBorrado`; `hayCruce(db, { id, nutri, inicio, modalidad, fin })` (ya existe en `repo.mjs`); de Task 2 el formato `cambio` y `deps.google.listarCambios(desdeIso)`.
- Produces:
  - `compararEvento(reserva, cambio) → { accion: 'ignorar' } | { accion: 'revisar', motivo: 'borrado' } | { accion: 'quitarBorrado' } | { accion: 'aplicar', nuevo: { inicio, fin, duracion, fecha, modalidad }, texto: string }`
  - `textoCambios(reserva, nuevo) → string`
  - `sincronizarCalendario(deps, { minIntervaloMs = 0 } = {}) → Promise<{ omitida: true } | { aplicados: number, revisar: number, fallidos: string[] }>`; lanza si `listarCambios` lanza (el cursor no avanza). `deps` necesita `db`, `google`, `ahora`.
  - `CURSOR = 'calendario_cursor'`.

- [ ] **Step 1: Escribir las pruebas que fallan**

`server/reservas/sincronizar.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1DePrueba } from './d1-prueba.mjs';
import * as repo from './repo.mjs';
import { compararEvento, textoCambios, sincronizarCalendario, CURSOR } from './sincronizar.mjs';

const ahora = new Date('2026-10-19T17:00:00Z');
const r = { id: 'r1', estado: 'confirmada', inicio_utc: '2026-10-21T15:00:00Z', fin_utc: '2026-10-21T15:30:00Z', duracion_min: 30,
  fecha_lima: '2026-10-21', modalidad: 'presencial', nutricionista_id: 'jussara', calendario_revisar: null };
const c = (o = {}) => ({ id: 'ev1', borrado: false, reservaId: 'r1', inicio: '2026-10-21T15:00:00Z', fin: '2026-10-21T15:30:00Z',
  meet: false, ubicacion: true, ...o });

test('compararEvento: sin cambios, reserva inexistente o no confirmada → ignorar', () => {
  assert.deepEqual(compararEvento(r, c()), { accion: 'ignorar' });
  assert.deepEqual(compararEvento(null, c()), { accion: 'ignorar' });
  assert.deepEqual(compararEvento({ ...r, estado: 'cancelada' }, c({ inicio: '2026-10-21T14:00:00Z' })), { accion: 'ignorar' });
});

test('compararEvento: caso Cecilia, 10:00 presencial → 9:00 virtual', () => {
  const d = compararEvento(r, c({ inicio: '2026-10-21T14:00:00Z', fin: '2026-10-21T14:30:00Z', meet: true, ubicacion: false }));
  assert.deepEqual(d, { accion: 'aplicar', texto: '10:00 → 9:00 · presencial → virtual',
    nuevo: { inicio: '2026-10-21T14:00:00Z', fin: '2026-10-21T14:30:00Z', duracion: 30, fecha: '2026-10-21', modalidad: 'video' } });
});

test('compararEvento: duración, cambio de día, virtual → presencial, sin Meet ni ubicación', () => {
  assert.equal(compararEvento(r, c({ fin: '2026-10-21T16:00:00Z' })).texto, '30 → 60 min');
  assert.equal(compararEvento(r, c({ inicio: '2026-10-22T15:00:00Z', fin: '2026-10-22T15:30:00Z' })).texto, '21/10 10:00 → 22/10 10:00');
  assert.equal(compararEvento(r, c({ inicio: '2026-10-22T15:00:00Z', fin: '2026-10-22T15:30:00Z' })).nuevo.fecha, '2026-10-22');
  const virtual = { ...r, modalidad: 'video' };
  assert.equal(compararEvento(virtual, c({ meet: false, ubicacion: true })).texto, 'virtual → presencial');
  assert.deepEqual(compararEvento(virtual, c({ meet: false, ubicacion: false })), { accion: 'ignorar' });
});

test('compararEvento: borrado, ya marcado, deshacer y día completo', () => {
  assert.deepEqual(compararEvento(r, c({ borrado: true })), { accion: 'revisar', motivo: 'borrado' });
  assert.deepEqual(compararEvento({ ...r, calendario_revisar: 'borrado' }, c({ borrado: true })), { accion: 'ignorar' });
  assert.deepEqual(compararEvento({ ...r, calendario_revisar: 'borrado' }, c()), { accion: 'quitarBorrado' });
  assert.deepEqual(compararEvento(r, c({ inicio: null, fin: null })), { accion: 'ignorar' });
});

test('compararEvento: fin_utc nulo (reservas viejas) se toma como inicio + duración', () => {
  assert.deepEqual(compararEvento({ ...r, fin_utc: null }, c()), { accion: 'ignorar' });
});

test('textoCambios: une las partes con « · »', () => {
  assert.equal(textoCambios(r, { inicio: '2026-10-21T14:00:00Z', fin: '2026-10-21T15:00:00Z', duracion: 60, fecha: '2026-10-21', modalidad: 'video' }),
    '10:00 → 9:00 · 30 → 60 min · presencial → virtual');
});

// ─── sincronizarCalendario con D1 de prueba y Google falso ───

const sembrar = (db, o = {}) => db.prepare(
  `INSERT INTO reservas (id, token, producto, duracion_meses, monto_centimos, peso_tope, nutricionista_id, inicio_utc, fin_utc, duracion_min,
     fecha_lima, modalidad, estado, retencion_hasta, creado_en, actualizado_en, google_event_id)
   VALUES (?1, ?1, 'link_c30p', 1, 0, 0, ?2, ?3, ?4, 30, ?5, ?6, 'confirmada', NULL, 'x', 'x', ?7)`,
).bind(o.id ?? 'r1', o.nutri ?? 'jussara', o.inicio ?? '2026-10-21T15:00:00Z', o.fin ?? '2026-10-21T15:30:00Z', o.fecha ?? '2026-10-21',
  o.modalidad ?? 'presencial', o.evento ?? 'ev1').run();

function deps(cambios, o = {}) {
  const pedidos = [];
  return {
    db: d1DePrueba(), ahora: () => ahora, pedidos,
    google: { listarCambios: async (desde) => { pedidos.push(desde); if (cambios instanceof Error) throw cambios; return cambios; } },
    ...o,
  };
}
const fila = (d, id = 'r1') => d.db.prepare('SELECT * FROM reservas WHERE id = ?1').bind(id).first();

test('sincronizar: aplica el caso Cecilia y guarda el cursor', async () => {
  const d = deps([c({ inicio: '2026-10-21T14:00:00Z', fin: '2026-10-21T14:30:00Z', meet: true, ubicacion: false })]);
  await sembrar(d.db);
  const res = await sincronizarCalendario(d);
  assert.deepEqual(res, { aplicados: 1, revisar: 0, fallidos: [] });
  const f = await fila(d);
  assert.equal(f.inicio_utc, '2026-10-21T14:00:00Z');
  assert.equal(f.modalidad, 'video');
  assert.equal(f.calendario_cambios, '10:00 → 9:00 · presencial → virtual');
  assert.equal(await repo.leerSync(d.db, CURSOR), ahora.toISOString());
  // Primera vez: 30 días atrás.
  assert.equal(d.pedidos[0], new Date(ahora.getTime() - 30 * 86400000).toISOString());
});

test('sincronizar: segunda vez pide desde el cursor menos 2 minutos; repetir no cambia nada', async () => {
  const cambio = c({ inicio: '2026-10-21T14:00:00Z', fin: '2026-10-21T14:30:00Z' });
  const d = deps([cambio]);
  await sembrar(d.db);
  await repo.guardarSync(d.db, CURSOR, '2026-10-19T16:50:00.000Z');
  await sincronizarCalendario(d);
  const antes = await fila(d);
  const res = await sincronizarCalendario(d);
  assert.equal(d.pedidos[0], '2026-10-19T16:48:00.000Z');
  assert.deepEqual(res, { aplicados: 0, revisar: 0, fallidos: [] });
  assert.deepEqual(await fila(d), antes);
});

test('sincronizar: borrado sin extendedProperties se encuentra por id de evento y se marca', async () => {
  const d = deps([{ id: 'ev1', borrado: true, reservaId: null, inicio: null, fin: null, meet: false, ubicacion: false }]);
  await sembrar(d.db);
  const res = await sincronizarCalendario(d);
  assert.deepEqual(res, { aplicados: 0, revisar: 1, fallidos: [] });
  const f = await fila(d);
  assert.equal(f.estado, 'confirmada');
  assert.equal(f.calendario_revisar, 'borrado');
});

test('sincronizar: eventos del equipo sin id de reserva se ignoran sin consultar', async () => {
  const d = deps([c({ id: 'manual', reservaId: null }), c({ id: 'dia', reservaId: null, inicio: null, fin: null })]);
  const res = await sincronizarCalendario(d);
  assert.deepEqual(res, { aplicados: 0, revisar: 0, fallidos: [] });
});

test('sincronizar: moverla a una hora ocupada por duración marca cruce y no mueve; sigue con los demás', async () => {
  const d = deps([
    c({ id: 'ev1', reservaId: 'r1', inicio: '2026-10-21T13:45:00Z', fin: '2026-10-21T14:15:00Z' }),
    c({ id: 'ev3', reservaId: 'r3', inicio: '2026-10-23T14:00:00Z', fin: '2026-10-23T14:30:00Z' }),
  ]);
  await sembrar(d.db, { id: 'r1', evento: 'ev1' });
  await sembrar(d.db, { id: 'r2', evento: 'ev2', inicio: '2026-10-21T14:00:00Z', fin: '2026-10-21T14:30:00Z' });
  await sembrar(d.db, { id: 'r3', evento: 'ev3', inicio: '2026-10-23T15:00:00Z', fin: '2026-10-23T15:30:00Z', fecha: '2026-10-23' });
  const res = await sincronizarCalendario(d);
  assert.deepEqual(res, { aplicados: 1, revisar: 1, fallidos: [] });
  const r1 = await fila(d, 'r1');
  assert.equal(r1.inicio_utc, '2026-10-21T15:00:00Z');
  assert.equal(r1.calendario_revisar, 'cruce');
  assert.equal(r1.calendario_cambios, '10:00 → 8:45');
  assert.equal((await fila(d, 'r3')).inicio_utc, '2026-10-23T14:00:00Z');
});

test('sincronizar: si Google falla lanza y el cursor no avanza', async () => {
  const d = deps(new Error('Google events.list 500'));
  await repo.guardarSync(d.db, CURSOR, '2026-10-19T16:50:00.000Z');
  await assert.rejects(sincronizarCalendario(d), /500/);
  assert.equal(await repo.leerSync(d.db, CURSOR), '2026-10-19T16:50:00.000Z');
});

test('sincronizar: con minIntervaloMs no corre si la última fue hace menos', async () => {
  const d = deps([]);
  await repo.guardarSync(d.db, CURSOR, new Date(ahora.getTime() - 30000).toISOString());
  assert.deepEqual(await sincronizarCalendario(d, { minIntervaloMs: 60000 }), { omitida: true });
  assert.equal(d.pedidos.length, 0);
});

test('sincronizar: un evento que falla al aplicarse se reporta y el resto sigue', async () => {
  const d = deps([c({ id: 'ev1', reservaId: 'r1', inicio: '2026-10-21T14:00:00Z', fin: '2026-10-21T14:30:00Z' })]);
  await sembrar(d.db);
  const prepareReal = d.db.prepare.bind(d.db);
  d.db.prepare = (sql) => (sql.startsWith('UPDATE reservas SET inicio_utc') ? { bind: () => ({ run: async () => { throw new Error('D1 caído'); } }) } : prepareReal(sql));
  const res = await sincronizarCalendario(d);
  assert.deepEqual(res, { aplicados: 0, revisar: 0, fallidos: ['ev1'] });
  assert.equal(await repo.leerSync(d.db, CURSOR), ahora.toISOString());
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `node --test server/reservas/sincronizar.test.mjs`
Expected: FAIL (no existe `./sincronizar.mjs`).

- [ ] **Step 3: Implementar `server/reservas/sincronizar.mjs`**

```js
// Cambios hechos a mano en Google Calendar → base (spec 2026-10-19-sincronizar-calendario).
// compararEvento es pura; sincronizarCalendario pide a Google lo modificado desde
// el cursor, aplica o marca, y avanza el cursor solo si Google respondió bien.
// La disparan el cron cada 10 min (/api/reservas/sincronizar-calendario) y el panel.
import * as repo from './repo.mjs';
import { fechaLima } from './tiempo.mjs';

export const CURSOR = 'calendario_cursor';
const MIN = 60 * 1000;
const SOLAPE_MS = 2 * MIN;
const PRIMERA_VEZ_MS = 30 * 24 * 60 * MIN;
const MOD = { presencial: 'presencial', video: 'virtual' };

// Lima es UTC-5 todo el año (sin horario de verano).
const horaLima = (iso) => new Date(Date.parse(iso) - 5 * 60 * MIN).toISOString().slice(11, 16).replace(/^0/, '');
const diaMes = (iso) => fechaLima(new Date(iso)).split('-').reverse().slice(0, 2).join('/');
const finDe = (r) => r.fin_utc ?? new Date(Date.parse(r.inicio_utc) + (r.duracion_min ?? 60) * MIN).toISOString().replace('.000Z', 'Z');

export function textoCambios(r, nuevo) {
  const partes = [];
  if (nuevo.inicio !== r.inicio_utc) {
    partes.push(nuevo.fecha === r.fecha_lima
      ? `${horaLima(r.inicio_utc)} → ${horaLima(nuevo.inicio)}`
      : `${diaMes(r.inicio_utc)} ${horaLima(r.inicio_utc)} → ${diaMes(nuevo.inicio)} ${horaLima(nuevo.inicio)}`);
  }
  const antes = r.duracion_min ?? 60;
  if (nuevo.duracion !== antes) partes.push(`${antes} → ${nuevo.duracion} min`);
  if (nuevo.modalidad !== r.modalidad) partes.push(`${MOD[r.modalidad]} → ${MOD[nuevo.modalidad]}`);
  return partes.join(' · ');
}

export function compararEvento(r, c) {
  if (!r || r.estado !== 'confirmada') return { accion: 'ignorar' };
  if (c.borrado) return r.calendario_revisar === 'borrado' ? { accion: 'ignorar' } : { accion: 'revisar', motivo: 'borrado' };
  if (!c.inicio || !c.fin) return { accion: 'ignorar' }; // de día completo: no es una cita
  const modalidad = c.meet ? 'video' : c.ubicacion ? 'presencial' : r.modalidad;
  const nuevo = { inicio: c.inicio, fin: c.fin, duracion: Math.round((Date.parse(c.fin) - Date.parse(c.inicio)) / MIN),
    fecha: fechaLima(new Date(c.inicio)), modalidad };
  const igual = nuevo.inicio === r.inicio_utc && nuevo.fin === finDe(r) && nuevo.modalidad === r.modalidad;
  if (igual) return r.calendario_revisar === 'borrado' ? { accion: 'quitarBorrado' } : { accion: 'ignorar' };
  return { accion: 'aplicar', nuevo, texto: textoCambios(r, nuevo) };
}

export async function sincronizarCalendario(deps, { minIntervaloMs = 0 } = {}) {
  const ahora = deps.ahora();
  const ultima = await repo.leerSync(deps.db, CURSOR);
  if (minIntervaloMs && ultima && ahora.getTime() - Date.parse(ultima) < minIntervaloMs) return { omitida: true };
  const desde = new Date(ultima ? Date.parse(ultima) - SOLAPE_MS : ahora.getTime() - PRIMERA_VEZ_MS).toISOString();
  const cambios = await deps.google.listarCambios(desde); // si falla, lanza y el cursor no avanza
  const res = { aplicados: 0, revisar: 0, fallidos: [] };
  for (const c of cambios) {
    // Sin id de reserva y no borrado: evento del equipo, no nuestro.
    if (!c.borrado && !c.reservaId) continue;
    try {
      const r = await repo.reservaPorEvento(deps.db, { eventoId: c.id, reservaId: c.reservaId });
      const d = compararEvento(r, c);
      if (d.accion === 'revisar') {
        await repo.marcarRevisar(deps.db, { id: r.id, motivo: d.motivo, cambios: null, ahora });
        res.revisar++;
      } else if (d.accion === 'quitarBorrado') {
        await repo.quitarBorrado(deps.db, r.id);
      } else if (d.accion === 'aplicar') {
        const n = d.nuevo;
        const ocupada = await repo.hayCruce(deps.db, { id: r.id, nutri: r.nutricionista_id, inicio: n.inicio, modalidad: n.modalidad, fin: n.fin });
        const hecho = ocupada ? { ok: false, motivo: 'cruce' }
          : await repo.aplicarCambioCalendario(deps.db, { id: r.id, ...n, cambios: d.texto, ahora });
        if (hecho.ok) res.aplicados++;
        else if (hecho.motivo === 'cruce') {
          await repo.marcarRevisar(deps.db, { id: r.id, motivo: 'cruce', cambios: d.texto, ahora });
          res.revisar++;
        }
      }
    } catch (e) {
      console.error('sincronizar evento', c.id, e);
      res.fallidos.push(c.id);
    }
  }
  await repo.guardarSync(deps.db, CURSOR, ahora.toISOString());
  return res;
}
```

- [ ] **Step 4: Correr las pruebas**

Run: `node --test server/reservas/sincronizar.test.mjs && npm test`
Expected: PASS. Si la prueba de cruce por duración no marca `cruce`, revisar que `hayCruce` reciba `fin` y excluya `id` (ver `CRUCE` en `repo.mjs`); no cambiar la prueba.

- [ ] **Step 5: Commit**

```bash
git add server/reservas/sincronizar.mjs server/reservas/sincronizar.test.mjs
git commit -m "Sync calendario: comparar eventos y sincronizar con cursor

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Ruta `/api/reservas/sincronizar-calendario` y cron de 10 min

**Files:**
- Modify: `server/handlers/reservas.mjs` (agregar debajo de `handleResumenDiario`)
- Create: `functions/api/reservas/sincronizar-calendario.js`
- Modify: `workers/resumen-cron/index.js`, `workers/resumen-cron/wrangler.toml`
- Test: `server/handlers/reservas.test.mjs` (agregar), `server/handlers/resumen-cron.test.mjs` (agregar)

**Interfaces:**
- Consumes: `sincronizarCalendario(deps)` de Task 3; `correoEquipoAlerta({ asunto, detalle })` de `server/reservas/correos.mjs`; `mismoToken`, `bad`, `json` ya presentes en `reservas.mjs`.
- Produces: `handleSincronizarCalendario(request, env, deps)`; en el Worker, `dispararSincronizacion(env, fetchImpl)` y `scheduled` que elige por `evento.cron`.

- [ ] **Step 1: Escribir las pruebas que fallan**

Agregar al final de `server/handlers/reservas.test.mjs` (usar las importaciones que ya tiene; agregar `handleSincronizarCalendario` al import de `./reservas.mjs` y `d1DePrueba` si no está):

```js
test('sincronizar-calendario: 401 sin token, 200 con token, 503 si Google falla', async () => {
  const envS = { RESUMEN_TOKEN: 'tok', NOTIFICATION_EMAIL: 'equipo@x.pe' };
  const correos = [];
  const base = { db: d1DePrueba(), ahora: () => new Date('2026-10-19T17:00:00Z'), sendEmail: async (m) => { correos.push(m); return true; } };
  const req = (auth) => new Request('https://x.test/api/reservas/sincronizar-calendario', { method: 'POST', headers: auth ? { Authorization: auth } : {} });
  const ok = { ...base, google: { listarCambios: async () => [] } };
  assert.equal((await handleSincronizarCalendario(req(), envS, ok)).status, 401);
  assert.equal((await handleSincronizarCalendario(req('Bearer otro'), envS, ok)).status, 401);
  const r = await handleSincronizarCalendario(req('Bearer tok'), envS, ok);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, aplicados: 0, revisar: 0, fallidos: [] });
  const cae = { ...base, google: { listarCambios: async () => { throw new Error('Google events.list 500'); } } };
  assert.equal((await handleSincronizarCalendario(req('Bearer tok'), envS, cae)).status, 503);
  assert.equal(correos.length, 0);
});

test('sincronizar-calendario: si un evento falla, avisa al equipo', async () => {
  const envS = { RESUMEN_TOKEN: 'tok', NOTIFICATION_EMAIL: 'equipo@x.pe' };
  const correos = [];
  const db = d1DePrueba();
  await db.prepare(`INSERT INTO reservas (id, token, producto, duracion_meses, monto_centimos, peso_tope, nutricionista_id, inicio_utc, fin_utc, duracion_min,
     fecha_lima, modalidad, estado, retencion_hasta, creado_en, actualizado_en, google_event_id)
     VALUES ('r1', 'r1', 'link_c30p', 1, 0, 0, 'jussara', '2026-10-21T15:00:00Z', '2026-10-21T15:30:00Z', 30, '2026-10-21', 'presencial', 'confirmada', NULL, 'x', 'x', 'ev1')`).run();
  const prepareReal = db.prepare.bind(db);
  db.prepare = (sql) => (sql.startsWith('UPDATE reservas SET inicio_utc') ? { bind: () => ({ run: async () => { throw new Error('D1 caído'); } }) } : prepareReal(sql));
  const d = { db, ahora: () => new Date('2026-10-19T17:00:00Z'), sendEmail: async (m) => { correos.push(m); return true; },
    google: { listarCambios: async () => [{ id: 'ev1', borrado: false, reservaId: 'r1', inicio: '2026-10-21T14:00:00Z', fin: '2026-10-21T14:30:00Z', meet: false, ubicacion: true }] } };
  const r = await handleSincronizarCalendario(new Request('https://x.test/', { method: 'POST', headers: { Authorization: 'Bearer tok' } }), envS, d);
  assert.equal(r.status, 200);
  assert.equal(correos.length, 1);
  assert.equal(correos[0].to, 'equipo@x.pe');
  assert.match(correos[0].subject, /Calendario sin sincronizar/);
});
```

Agregar al final de `server/handlers/resumen-cron.test.mjs`:

```js
import worker, { dispararSincronizacion } from '../../workers/resumen-cron/index.js';

test('el cron de 10 min llama a la sincronización con el token', async () => {
  let pedido;
  const env = { SYNC_URL: 'https://www.ajlnutricion.com/api/reservas/sincronizar-calendario', RESUMEN_TOKEN: 'tok' };
  assert.equal(await dispararSincronizacion(env, async (url, init) => { pedido = { url, init }; return new Response('{}', { status: 200 }); }), 200);
  assert.equal(pedido.url, env.SYNC_URL);
  assert.equal(pedido.init.headers.Authorization, 'Bearer tok');
  await assert.rejects(dispararSincronizacion(env, async () => new Response('', { status: 503 })), /503/);
});

test('scheduled elige la tarea según el cron', async () => {
  const llamadas = [];
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = async (url) => { llamadas.push(String(url)); return new Response('{}', { status: 200 }); };
  try {
    const env = { RESUMEN_URL: 'https://r', SYNC_URL: 'https://s', RESUMEN_TOKEN: 'tok' };
    const promesas = [];
    const ctx = { waitUntil: (p) => promesas.push(p) };
    worker.scheduled({ cron: '0 13 * * *' }, env, ctx);
    worker.scheduled({ cron: '*/10 * * * *' }, env, ctx);
    await Promise.all(promesas);
    assert.deepEqual(llamadas, ['https://r', 'https://s']);
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `node --test server/handlers/reservas.test.mjs server/handlers/resumen-cron.test.mjs`
Expected: FAIL (`handleSincronizarCalendario` y `dispararSincronizacion` no existen).

- [ ] **Step 3: Implementar el handler**

En `server/handlers/reservas.mjs`, agregar a los imports:

```js
import { sincronizarCalendario } from '../reservas/sincronizar.mjs';
```

y comprobar que `correoEquipoAlerta` esté importado de `../reservas/correos.mjs` (si no, sumarlo a ese import). Debajo de `handleResumenDiario`:

```js
// Lo llama el cron cada 10 min (workers/resumen-cron). Mismo token que el resumen.
export async function handleSincronizarCalendario(request, env, deps) {
  if (request.method !== 'POST') return bad(405, 'Método no permitido');
  if (!env.RESUMEN_TOKEN) return bad(503, 'Sincronización sin configurar');
  if (!(await mismoToken(request.headers.get('Authorization') || '', `Bearer ${env.RESUMEN_TOKEN}`))) return bad(401, 'No autorizado');
  let res;
  try {
    res = await sincronizarCalendario(deps);
  } catch (e) {
    console.error('sincronizar-calendario', e);
    return bad(503, 'No se pudo leer el calendario');
  }
  if (res.fallidos?.length) {
    await deps.sendEmail({
      from: env.NEWSLETTER_FROM || 'AJL Nutrición <hola@ajlnutricion.com>', to: env.NOTIFICATION_EMAIL,
      ...correoEquipoAlerta({ asunto: 'Calendario sin sincronizar',
        detalle: `No se pudieron pasar a la base ${res.fallidos.length} cambios del calendario (eventos ${res.fallidos.join(', ')}). Revisa esas citas en el panel.` }),
    });
  }
  return json(200, { ok: true, ...res });
}
```

`correoEquipoAlerta` antepone «Reservas web: » al asunto; la prueba usa `match`, así que pasa.

`functions/api/reservas/sincronizar-calendario.js`:

```js
import { handleSincronizarCalendario } from '../../../server/handlers/reservas.mjs';
import { makeReservasDeps } from '../../../server/reservas/deps.mjs';

export const onRequest = (ctx) => handleSincronizarCalendario(ctx.request, ctx.env, makeReservasDeps(ctx.env, ctx));
```

- [ ] **Step 4: Implementar el Worker**

`workers/resumen-cron/index.js` completo:

```js
// Tareas programadas de la web (Pages no corre crons):
// - 8:00 en Lima: resumen de quienes dejaron sus datos y no pagaron.
// - Cada 10 min: sincronizar los cambios manuales de Google Calendar con la base.
// La lógica vive en la web; este Worker solo la dispara con el token compartido.
const RESUMEN_CRON = '0 13 * * *';

async function disparar(url, token, fetchImpl) {
  const r = await fetchImpl(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`${url} respondió ${r.status}`);
  return r.status;
}

export const dispararResumen = (env, fetchImpl = fetch) => disparar(env.RESUMEN_URL, env.RESUMEN_TOKEN, fetchImpl);
export const dispararSincronizacion = (env, fetchImpl = fetch) => disparar(env.SYNC_URL, env.RESUMEN_TOKEN, fetchImpl);

export default {
  scheduled(evento, env, ctx) {
    ctx.waitUntil(evento.cron === RESUMEN_CRON ? dispararResumen(env) : dispararSincronizacion(env));
  },
};
```

La prueba existente de `dispararResumen` espera el mensaje con `503`; el nuevo mensaje lo incluye.

En `workers/resumen-cron/wrangler.toml`, cambiar:

```toml
[triggers]
crons = ["0 13 * * *"] # 13:00 UTC = 8:00 en Lima
```

por:

```toml
[triggers]
crons = ["0 13 * * *", "*/10 * * * *"] # 13:00 UTC = 8:00 en Lima (resumen); cada 10 min (sincronizar calendario)
```

y en `[vars]` agregar:

```toml
SYNC_URL = "https://www.ajlnutricion.com/api/reservas/sincronizar-calendario"
```

- [ ] **Step 5: Correr las pruebas**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/handlers/reservas.mjs server/handlers/reservas.test.mjs functions/api/reservas/sincronizar-calendario.js workers/resumen-cron/index.js workers/resumen-cron/wrangler.toml server/handlers/resumen-cron.test.mjs
git commit -m "Sync calendario: ruta con token y cron cada 10 min

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: API del panel (sincronizar al abrir, campos nuevos, canceladas, revisión)

**Files:**
- Modify: `server/equipo/deps.mjs`
- Modify: `server/handlers/equipo-links.mjs` (`CAMPOS_AGENDADO`, `FROM_AGENDADO`, `vistaAgendado`, `handleAgendados`, `handleAgendadosCsv`; nueva `handleRevision`)
- Create: `functions/api/equipo/revision.js`
- Test: `server/handlers/equipo-links.test.mjs` (agregar)

**Interfaces:**
- Consumes: `sincronizarCalendario(deps, { minIntervaloMs })` (Task 3), `resolverRevision`, `marcarRevisar` (Task 1).
- Produces: cada fila de `/api/equipo/agendados` suma `cancelada: boolean`, `revisar: 'borrado' | 'cruce' | null`, `calendario: { editado_en: string, cambios: string } | null`. Ruta `POST /api/equipo/revision` `{ id, accion }` → `200 { ok: true }`, `400`, `401`, `404`.

- [ ] **Step 1: Escribir las pruebas que fallan**

Agregar al final de `server/handlers/equipo-links.test.mjs` (sumar `handleRevision` al import de `./equipo-links.mjs` y `import * as repo from '../reservas/repo.mjs';`):

```js
test('agendados: sincroniza el calendario al abrir, máximo una vez por minuto, y si falla carga igual', async () => {
  let llamadas = 0;
  const d = deps({ google: { listarCambios: async () => { llamadas++; return []; } } });
  await sembrar(d);
  assert.equal((await handleAgendados(get('/api/equipo/agendados'), env, d)).status, 200);
  await handleAgendados(get('/api/equipo/agendados'), env, d);
  assert.equal(llamadas, 1);
  const cae = deps({ google: { listarCambios: async () => { throw new Error('Google events.list 500'); } } });
  await sembrar(cae);
  const r = await handleAgendados(get('/api/equipo/agendados'), env, cae);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).filas.length, 1);
});

test('agendados: marcas de calendario y la cancelada desde el panel sigue en la lista; el CSV no la incluye', async () => {
  const d = deps();
  await sembrar(d);
  await d.db.prepare(`UPDATE reservas SET calendario_editado_en = '2026-10-12T19:00:00Z', calendario_cambios = '10:00 → 9:00' WHERE id = 'r-lucia'`).run();
  let f = (await (await handleAgendados(get('/api/equipo/agendados'), env, d)).json()).filas[0];
  assert.deepEqual(f.calendario, { editado_en: '2026-10-12T19:00:00Z', cambios: '10:00 → 9:00' });
  assert.equal(f.revisar, null);
  assert.equal(f.cancelada, false);
  await repo.marcarRevisar(d.db, { id: 'r-lucia', motivo: 'borrado', cambios: null, ahora: t0 });
  assert.equal((await handleRevision(post('/api/equipo/revision', { id: 'r-lucia', accion: 'cancelar' }), env, d)).status, 200);
  f = (await (await handleAgendados(get('/api/equipo/agendados'), env, d)).json()).filas[0];
  assert.equal(f.id, 'r-lucia');
  assert.equal(f.cancelada, true);
  const csv = await (await handleAgendadosCsv(get('/api/equipo/agendados-csv?ids=r-lucia'), env, d)).text();
  assert.doesNotMatch(csv, /Ramos/);
});

test('revision: 401 sin acceso, 400 datos inválidos, 404 sin marca, mantener quita la marca', async () => {
  const d = deps();
  await sembrar(d);
  assert.equal((await handleRevision(post('/api/equipo/revision', { id: 'r-lucia', accion: 'mantener' }), env, deps({ acceso: fuera }))).status, 401);
  assert.equal((await handleRevision(post('/api/equipo/revision', { id: 'r-lucia', accion: 'borrar' }), env, d)).status, 400);
  assert.equal((await handleRevision(post('/api/equipo/revision', { id: 1, accion: 'mantener' }), env, d)).status, 400);
  assert.equal((await handleRevision(post('/api/equipo/revision', { id: 'r-lucia', accion: 'mantener' }), env, d)).status, 404);
  await repo.marcarRevisar(d.db, { id: 'r-lucia', motivo: 'cruce', cambios: '10:00 → 9:00', ahora: t0 });
  assert.equal((await handleRevision(post('/api/equipo/revision', { id: 'r-lucia', accion: 'mantener' }), env, d)).status, 200);
  const f = (await (await handleAgendados(get('/api/equipo/agendados'), env, d)).json()).filas[0];
  assert.equal(f.revisar, null);
  assert.equal(f.cancelada, false);
});
```

Nota: la cita sembrada de Lucía es del 2026-10-14 y `t0` es 2026-10-12, así que está en «Próximas» (el tramo por defecto). Las pruebas existentes usan `deps()` sin `google`; `handleAgendados` debe funcionar sin `deps.google` (no sincroniza).

- [ ] **Step 2: Correr y ver que fallan**

Run: `node --test server/handlers/equipo-links.test.mjs`
Expected: FAIL (`handleRevision` no existe).

- [ ] **Step 3: Implementar**

`server/equipo/deps.mjs`: sumar el cliente de Google.

```js
import { crearGoogle } from '../reservas/google.mjs';
// …
  const deps = { db: env.DB, ahora: () => new Date(), nutricionistas, sendEmail: crearSendEmail(env), google: crearGoogle(env) };
```

`server/handlers/equipo-links.mjs`, imports:

```js
import { sincronizarCalendario } from '../reservas/sincronizar.mjs';
import { resolverRevision } from '../reservas/repo.mjs';
```

`CAMPOS_AGENDADO`: agregar al final de la lista (antes del backtick de cierre) `, r.calendario_editado_en, r.calendario_cambios, r.calendario_revisar, r.cancelada_en_panel`.

`FROM_AGENDADO`: reemplazar el `WHERE` por:

```js
  WHERE ((r.link_id IS NOT NULL AND l.id IS NOT NULL AND (r.estado = 'confirmada' OR r.cancelada_en_panel IS NOT NULL))
    OR (r.link_id IS NULL AND (r.estado IN ('confirmada', 'pagada_sin_hora') OR r.cancelada_en_panel IS NOT NULL)))`;
```

`vistaAgendado`: agregar antes del cierre del objeto:

```js
    cancelada: r.cancelada_en_panel != null,
    revisar: r.calendario_revisar ?? null,
    calendario: r.calendario_editado_en ? { editado_en: r.calendario_editado_en, cambios: r.calendario_cambios } : null,
```

`handleAgendados`: justo después de `if (!acceso.ok) return sinAcceso();`:

```js
  // Trae al panel los cambios manuales del calendario (como mucho una vez por minuto).
  // Si Google falla, el panel carga igual con lo que hay.
  if (deps.google) await sincronizarCalendario(deps, { minIntervaloMs: 60 * 1000 }).catch((e) => console.error('agendados/sincronizar', e));
```

`handleAgendadosCsv`: en la consulta, cambiar `${FROM_AGENDADO} AND r.id IN (SELECT value FROM json_each(?1))` por `${FROM_AGENDADO} AND r.cancelada_en_panel IS NULL AND r.id IN (SELECT value FROM json_each(?1))`.

Nueva función al final del archivo:

```js
// Botones de las reservas marcadas para revisar (evento borrado o movido a una hora ocupada).
export async function handleRevision(request, env, deps) {
  if (request.method !== 'POST') return bad(405, 'Método no permitido');
  const acceso = await deps.acceso(request, env);
  if (!acceso.ok) return sinAcceso();
  const d = await readJson(request);
  if (typeof d.id !== 'string' || !['cancelar', 'mantener'].includes(d.accion)) return bad(400, 'Datos inválidos');
  const hecho = await resolverRevision(deps.db, { id: d.id, accion: d.accion, ahora: deps.ahora() });
  if (!hecho) return bad(404, 'Esa reserva ya no está para revisar. Recarga la página.');
  return json(200, { ok: true });
}
```

`functions/api/equipo/revision.js`:

```js
import { handleRevision } from '../../../server/handlers/equipo-links.mjs';
import { makeEquipoDeps } from '../../../server/equipo/deps.mjs';

export const onRequest = (ctx) => handleRevision(ctx.request, ctx.env, makeEquipoDeps(ctx.env));
```

- [ ] **Step 4: Correr las pruebas**

Run: `npm test`
Expected: PASS (incluida la prueba existente «sin acceso: 401 en todo», que no debe tocar Google porque corta antes).

- [ ] **Step 5: Commit**

```bash
git add server/equipo/deps.mjs server/handlers/equipo-links.mjs server/handlers/equipo-links.test.mjs functions/api/equipo/revision.js
git commit -m "Sync calendario: panel sincroniza al abrir, muestra marcas y canceladas, ruta de revisión

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Panel (marcas, fila roja, botones, copiar sin canceladas)

**Files:**
- Modify: `src/scripts/panel-reservas.js` (`pintar`, `copiar`, handler de clics)
- Modify: `src/styles/panel.css`

**Interfaces:**
- Consumes: campos `cancelada`, `revisar`, `calendario` de Task 5; `POST /api/equipo/revision`.

- [ ] **Step 1: Implementar en `pintar()`**

Arriba del archivo, junto a `PROC`, agregar:

```js
const REVISAR = { borrado: 'Evento borrado en el calendario, revisar', cruce: 'Movida en el calendario a una hora ocupada, revisar' };
```

Dentro del `map` de `pintar()`, después de `tr.dataset.sel = …`:

```js
    if (f.cancelada) tr.classList.add('lk-fila--cancelada');
    else if (f.revisar) tr.classList.add('lk-fila--revisar');
```

Reemplazar la línea `const cita = f.sin_hora ? … ;` por:

```js
    const cita = f.sin_hora ? td(chip('Sin hora', 'lk-alerta'), f.tipo) : td(citaCorta(f.inicio_utc), f.tipo);
    if (f.cancelada) cita.prepend(chip('Cancelada', 'lk-alerta lk-bloque'));
    if (f.calendario) cita.append(chip(`Editada en calendario: ${f.calendario.cambios || 'sin cambios de hora'} · ${lima(f.calendario.editado_en)}`, 'lk-nota-cal'));
    if (f.revisar && !f.cancelada) {
      const caja = document.createElement('div');
      caja.className = 'lk-revisar';
      caja.append(chip(REVISAR[f.revisar], 'lk-alerta lk-bloque'));
      for (const [accion, texto] of [['cancelar', 'Cancelar reserva'], ['mantener', 'Mantener']]) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = `lk-btn lk-btn--${accion}`; b.textContent = texto;
        b.dataset.revision = accion; b.dataset.id = f.id;
        caja.append(b);
      }
      cita.append(caja);
    }
```

(`sinCorte(cita)` se sigue aplicando en el `tr.append` de abajo, sin cambios.)

- [ ] **Step 2: Copiar sin canceladas**

En `copiar()`, cambiar la primera línea por:

```js
  const elegidas = est.filas.filter((f) => est.sel.has(f.id) && !f.cancelada);
  if (!elegidas.length) { aviso('No hay citas para copiar: las canceladas no se copian, y las elegidas pueden estar en otra página de la tabla.'); return; }
```

- [ ] **Step 3: Botones de revisión**

Agregar la función, junto a `marcar`:

```js
async function revisar(b) {
  const accion = b.dataset.revision;
  if (accion === 'cancelar' && !confirm('¿Cancelar esta reserva? La hora queda libre en la web y la fila se queda en rojo.')) return;
  b.disabled = true;
  const r = await pedir('/api/equipo/revision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: b.dataset.id, accion }) });
  if (r?.status === 401) { mostrarLogin(); return; }
  if (r?.ok) { aviso(); await cargarReservas(); return; }
  b.disabled = false;
  aviso((await jsonDe(r))?.error || 'No se pudo guardar. Intenta de nuevo.');
}
```

En el `document.addEventListener('click', …)`, agregar como primera rama tras `if (!b) return;`:

```js
  if (b.dataset.revision) { revisar(b); return; }
```

- [ ] **Step 4: Estilos en `src/styles/panel.css`**

Agregar al final:

```css
/* Sincronización con Google Calendar */
.lk-fila--cancelada td { background: #FBE9E9; color: #7A1F1F; }
.lk-fila--revisar td { background: #FFF4E5; }
.lk-bloque { display: block; margin-bottom: 4px; }
.lk-nota-cal { display: block; font-size: .75rem; color: #5C4A1F; margin-top: 4px; white-space: normal; }
.lk-revisar { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: 6px; white-space: normal; }
.lk-btn--cancelar { background: #9B2C2C; color: #fff; border: 0; border-radius: 8px; padding: 8px 12px; min-height: 36px; font: inherit; font-weight: 700; cursor: pointer; }
.lk-btn--mantener { background: #fff; color: #141414; border: 1px solid #CFC9BD; border-radius: 8px; padding: 8px 12px; min-height: 36px; font: inherit; cursor: pointer; }
```

Si `.lk-btn` ya existe en el CSS con otros estilos, revisar que las clases nuevas ganen (van al final del archivo).

- [ ] **Step 5: Build y revisión rápida**

Run: `npm run build && npm test`
Expected: build «Complete!» y pruebas en verde. Abrir `dist/` no hace falta: la prueba visual va en Task 7 con preview.

- [ ] **Step 6: Commit**

```bash
git add src/scripts/panel-reservas.js src/styles/panel.css
git commit -m "Sync calendario: panel con marcas, fila roja y botones Cancelar/Mantener

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Changelog, privacidad y prueba en preview

**Files:**
- Modify: `CHANGELOG.md`
- Read: `src/pages/privacidad.astro` (o la ruta real de la política; ubicar con `grep -rln "Política de privacidad" src/pages`)

- [ ] **Step 1: Changelog**

En `CHANGELOG.md`, como primera línea de «Pendiente de publicar», agregar:

```markdown
- Panel y calendario: si alguien cambia a mano en Google Calendar la hora, la duración o si una cita es presencial o virtual, la reserva se actualiza sola en 10 minutos o al abrir el panel, y la fila muestra «Editada en calendario» con el cambio. Si borran el evento o lo mueven a una hora ocupada, la fila queda marcada para revisar con los botones «Cancelar reserva» (libera la hora; la fila se queda en rojo y no se copia a la base maestra) y «Mantener». Requiere la migración 0012 y desplegar el Worker del cron.
```

- [ ] **Step 2: Revisar la política de privacidad**

Buscar en la política qué dice sobre cuánto tiempo se guardan los datos de quien reserva y de quien cancela. Si dice que los datos de una reserva cancelada se borran a los 30 días, NO editar: anotar el párrafo exacto y avisar a Joaquín para que decida el texto (regla del repo: código y política deben decir lo mismo).

- [ ] **Step 3: Commit y subir a preview**

```bash
git add CHANGELOG.md
git commit -m "Changelog: sincronización con Google Calendar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
npx wrangler d1 migrations apply ajl-reservas-preview --remote --env preview
git push origin reservas-pago
```

Esperar el deploy de preview (`npx wrangler pages deployment list --project-name ajl-landing --environment preview`, buscar el commit) y correr `npm run smoke -- https://reservas-pago.ajl-landing.pages.dev` (17/17).

- [ ] **Step 4: Prueba real con Joaquín (preview usa el calendario real)**

1. Joaquín crea un link en `https://reservas-pago.ajl-landing.pages.dev/panel/` y lo agenda.
2. Mueve el evento en Google Calendar una hora antes y lo cambia a virtual (agregar Meet, quitar ubicación).
3. Recarga el panel de preview: la fila muestra la hora nueva, «Virtual» y «Editada en calendario: … → … · presencial → virtual».
4. Borra el evento en Google Calendar, recarga (esperar 1 minuto por el límite): la fila aparece marcada «Evento borrado en el calendario, revisar».
5. «Cancelar reserva»: la fila queda en rojo con «Cancelada».
6. Limpiar: pedir permiso a Joaquín antes de borrar de `ajl-reservas-preview` la ficha y la reserva de prueba.

El Worker del cron apunta a producción (`SYNC_URL` de www); en preview la sincronización se prueba solo al abrir el panel. No desplegar el Worker hasta publicar.

- [ ] **Step 5: Publicar (solo con autorización de Joaquín)**

```bash
npx wrangler d1 migrations apply ajl-reservas --remote
git fetch && git merge origin/main
git checkout --detach origin/main && git merge --no-ff reservas-pago -m "Merge reservas-pago: sincronizar Google Calendar → base y panel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin HEAD:main && git checkout reservas-pago
npm run smoke -- https://www.ajlnutricion.com
npx wrangler deploy --config workers/resumen-cron/wrangler.toml
```

Después del deploy del Worker, comprobar a los 10 minutos con `npx wrangler d1 execute ajl-reservas --remote --command "SELECT * FROM sync_estado"` que el cursor se actualizó.
