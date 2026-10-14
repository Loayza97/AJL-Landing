# Motor de horarios en medias horas · plan (entrega 1 de 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el motor de reservas sepa de citas de 30 y 60 minutos y de inicios cada 30 minutos, sin ningún cambio visible en la web de pago.

**Architecture:** Cada reserva guarda `duracion_min` y `fin_utc`. La base impide cruces de horario dentro de la misma sentencia que inserta o actualiza (D1 ejecuta las sentencias en serie, así que la condición es atómica), además de los índices únicos que ya existen. El motor puro `horasLibres` acepta `duracionMin` y `pasoMin`; con los valores por defecto (60 y 60) devuelve exactamente lo de hoy.

**Tech Stack:** Cloudflare Pages Functions, D1 (SQLite), `node:test` con `node:sqlite` (`server/reservas/d1-prueba.mjs`).

**Spec:** `docs/superpowers/specs/2026-10-12-links-agenda-design.md`

## Global Constraints

- Trabajar en la worktree `~/ajl/ajl-landing-cloudflare`, rama `reservas-pago`. Nada a `main` sin autorización de Joaquín.
- La web de pago no cambia: `/api/reservas/apartar` y `/reubicar` siguen aceptando solo inicios en punto (`INICIO` = `/^\d{4}-\d{2}-\d{2}T\d{2}:00:00Z$/`), y `handleHoras` sigue llamando a `horasLibres` sin `duracionMin` ni `pasoMin`.
- Formato de fechas UTC en la base: `AAAA-MM-DDTHH:MM:SSZ`, sin milisegundos (así comparan bien como texto).
- Migraciones solo agregan (nunca borran ni renombran). Se aplican primero en `ajl-reservas-preview` y, con autorización, en `ajl-reservas` antes del merge.
- `npm test` en verde después de cada tarea (hoy hay 140+ pruebas).
- Comentarios en español, con el estilo de los archivos vecinos.

## Review Focus

1. Una cita de 30 min a las 10:30 y una de 60 min a las 10:00 con la misma nutricionista: la segunda que llegue no entra («ocupada»).
2. Dos presenciales que se cruzan con nutricionistas distintas: no entran (un solo consultorio); dos videos que se cruzan con nutricionistas distintas: sí.
3. Una retención vencida que se cruza no bloquea (se expira en la misma transacción).
4. Reservas viejas sin `fin_utc` (filas de antes de la migración o insertadas a mano) se tratan como de 60 min.
5. Con `duracionMin: 60, pasoMin: 60` (lo que usa la web) todas las pruebas actuales de `horasLibres` dan lo mismo que antes.

---

### Task 1: Migración 0006 y utilidades de tiempo

**Files:**
- Create: `db/d1/0006_duracion.sql`
- Modify: `server/reservas/tiempo.mjs`
- Test: `server/reservas/esquema.test.mjs`, `server/reservas/tiempo.test.mjs`

**Interfaces:**
- Produces: columnas `reservas.duracion_min INTEGER NOT NULL DEFAULT 60` y `reservas.fin_utc TEXT`; `inicioUtcMin(fecha: 'AAAA-MM-DD', minutos: number): string`; `sumarMinutos(iso: string, min: number): string`; `finDeReserva(r: {inicio_utc, fin_utc?, duracion_min?}): string`.

- [ ] **Step 1: Pruebas que fallan**

Agregar al final de `server/reservas/tiempo.test.mjs`:

```js
import { inicioUtcMin, sumarMinutos, finDeReserva } from './tiempo.mjs';

test('inicioUtcMin: minutos desde la medianoche de Lima a UTC sin milisegundos', () => {
  assert.equal(inicioUtcMin('2026-10-06', 10 * 60 + 30), '2026-10-06T15:30:00Z');
  assert.equal(inicioUtcMin('2026-10-06', 0), '2026-10-06T05:00:00Z');
});

test('sumarMinutos y finDeReserva: usa fin_utc si existe; si no, la duración o 60', () => {
  assert.equal(sumarMinutos('2026-10-06T15:00:00Z', 30), '2026-10-06T15:30:00Z');
  assert.equal(finDeReserva({ inicio_utc: '2026-10-06T15:00:00Z', fin_utc: '2026-10-06T15:30:00Z' }), '2026-10-06T15:30:00Z');
  assert.equal(finDeReserva({ inicio_utc: '2026-10-06T15:00:00Z', duracion_min: 30 }), '2026-10-06T15:30:00Z');
  assert.equal(finDeReserva({ inicio_utc: '2026-10-06T15:00:00Z' }), '2026-10-06T16:00:00Z');
});
```

(Si `tiempo.test.mjs` ya importa de `./tiempo.mjs`, sumar los nombres a ese `import` en vez de repetirlo.)

Agregar al final de `server/reservas/esquema.test.mjs`:

```js
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';

test('migración 0006: duración 60 por defecto y fin_utc calculado para las reservas existentes', () => {
  const sqlite = new DatabaseSync(':memory:');
  const dir = new URL('../../db/d1/', import.meta.url);
  const archivos = readdirSync(dir).filter((x) => x.endsWith('.sql')).sort();
  for (const f of archivos.filter((x) => x < '0006')) sqlite.exec(readFileSync(new URL(f, dir), 'utf8'));
  sqlite.exec(`INSERT INTO reservas (id, token, producto, duracion_meses, monto_centimos, peso_tope, nutricionista_id,
    inicio_utc, fecha_lima, modalidad, estado, creado_en, actualizado_en)
    VALUES ('vieja', 'tv', 'constancia', 3, 108000, 1, 'nico', '2026-10-06T15:00:00Z', '2026-10-06', 'presencial', 'confirmada', 'x', 'x')`);
  for (const f of archivos.filter((x) => x >= '0006')) sqlite.exec(readFileSync(new URL(f, dir), 'utf8'));
  const r = sqlite.prepare("SELECT duracion_min, fin_utc FROM reservas WHERE id = 'vieja'").get();
  assert.deepEqual({ ...r }, { duracion_min: 60, fin_utc: '2026-10-06T16:00:00Z' });
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `node --test server/reservas/tiempo.test.mjs server/reservas/esquema.test.mjs`
Expected: FAIL (`inicioUtcMin` no existe; la migración 0006 no existe y la consulta no encuentra `duracion_min`).

- [ ] **Step 3: Implementar**

Crear `db/d1/0006_duracion.sql`:

```sql
-- Duración real de cada cita (2026-10-12). Hasta hoy todas duraban 60 min; los
-- links de agenda traen citas de 30. fin_utc se guarda para que la propia base
-- compare cruces de horario. Solo agrega: nada existente cambia.
ALTER TABLE reservas ADD COLUMN duracion_min INTEGER NOT NULL DEFAULT 60;
ALTER TABLE reservas ADD COLUMN fin_utc TEXT;
UPDATE reservas SET fin_utc = strftime('%Y-%m-%dT%H:%M:%SZ', inicio_utc, '+60 minutes');
CREATE INDEX reservas_cruce ON reservas (fecha_lima, inicio_utc);
```

En `server/reservas/tiempo.mjs`, debajo de `inicioUtc`, agregar:

```js
// Inicio en UTC a partir de los minutos desde la medianoche de Lima (10:30 = 630).
export function inicioUtcMin(fecha, minutos) {
  const [y, m, d] = partes(fecha);
  return new Date(Date.UTC(y, m - 1, d, 5, minutos)).toISOString().replace('.000Z', 'Z');
}

export function sumarMinutos(iso, min) {
  return new Date(Date.parse(iso) + min * 60000).toISOString().replace('.000Z', 'Z');
}

// Fin de una reserva: las de antes de la migración 0006 no tienen fin_utc y
// duraban 60 min.
export function finDeReserva(r) {
  return r.fin_utc || sumarMinutos(r.inicio_utc, r.duracion_min ?? 60);
}
```

- [ ] **Step 4: Correr y ver que pasan**

Run: `npm test`
Expected: PASS (todas, incluidas las viejas).

- [ ] **Step 5: Commit**

```bash
git add db/d1/0006_duracion.sql server/reservas/tiempo.mjs server/reservas/tiempo.test.mjs server/reservas/esquema.test.mjs
git commit -m "reservas: duración y fin de cada cita (migración 0006)"
```

---

### Task 2: La base impide cruces de horario

**Files:**
- Modify: `server/reservas/repo.mjs` (`crearRetencion`, `confirmarReserva`, `reubicar`, `reservasActivasEntre`; nuevo `CRUCE` exportado)
- Test: `server/reservas/repo.test.mjs`

**Interfaces:**
- Consumes: `sumarMinutos` (Task 1).
- Produces: `export function CRUCE({ ini, fin, nutri, modalidad, excluir }): string` (fragmento SQL `EXISTS (...)`, cada argumento es un parámetro `?N` o una columna); `crearRetencion(db, { ..., duracion_min?: number })` guarda `duracion_min` (60 por defecto) y `fin_utc`; `reservasActivasEntre` devuelve también `fin_utc` y `duracion_min`.

- [ ] **Step 1: Pruebas que fallan**

Agregar al final de `server/reservas/repo.test.mjs`:

```js
test('cruce: 30 min a las 10:30 contra 60 min a las 10:00, misma nutricionista: ocupada', async () => {
  const db = d1DePrueba();
  assert.equal((await ret(db, { inicio_utc: '2026-10-06T15:00:00Z', modalidad: 'video' })).ok, true);
  assert.deepEqual(await ret(db, { inicio_utc: '2026-10-06T15:30:00Z', modalidad: 'video', duracion_min: 30 }), { ok: false, motivo: 'ocupada' });
});

test('cruce: dos de 30 seguidas con la misma nutricionista sí entran', async () => {
  const db = d1DePrueba();
  assert.equal((await ret(db, { inicio_utc: '2026-10-06T15:00:00Z', modalidad: 'video', duracion_min: 30 })).ok, true);
  assert.equal((await ret(db, { inicio_utc: '2026-10-06T15:30:00Z', modalidad: 'video', duracion_min: 30 })).ok, true);
  const r = await db.prepare("SELECT fin_utc, duracion_min FROM reservas WHERE inicio_utc = '2026-10-06T15:30:00Z'").first();
  assert.deepEqual(r, { fin_utc: '2026-10-06T16:00:00Z', duracion_min: 30 });
});

test('cruce: presenciales de distintas nutricionistas chocan; videos no', async () => {
  const db = d1DePrueba();
  await ret(db, { inicio_utc: '2026-10-06T15:00:00Z', nutricionista_id: 'nico' });
  assert.deepEqual(await ret(db, { inicio_utc: '2026-10-06T15:30:00Z', nutricionista_id: 'jussara', duracion_min: 30 }), { ok: false, motivo: 'ocupada' });
  assert.equal((await ret(db, { inicio_utc: '2026-10-06T15:30:00Z', nutricionista_id: 'jussara', modalidad: 'video', duracion_min: 30 })).ok, true);
});

test('cruce: una retención vencida que se cruza no bloquea', async () => {
  const db = d1DePrueba();
  await ret(db, { id: 'vieja', inicio_utc: '2026-10-06T15:00:00Z', modalidad: 'video' });
  assert.equal((await ret(db, { inicio_utc: '2026-10-06T15:30:00Z', modalidad: 'video', duracion_min: 30, ahora: mas(16) })).ok, true);
});

test('cruce: una fila sin fin_utc cuenta como de 60 min', async () => {
  const db = d1DePrueba();
  await db.prepare(`INSERT INTO reservas (id, token, producto, duracion_meses, monto_centimos, peso_tope, nutricionista_id, inicio_utc, fecha_lima,
    modalidad, estado, creado_en, actualizado_en) VALUES ('m', 'tm', 'constancia', 3, 0, 1, 'nico', '2026-10-06T15:00:00Z', '2026-10-06', 'video', 'confirmada', 'x', 'x')`).run();
  assert.deepEqual(await ret(db, { inicio_utc: '2026-10-06T15:30:00Z', modalidad: 'video', duracion_min: 30 }), { ok: false, motivo: 'ocupada' });
});

test('cruce: el tope sigue dando «tope» y no «ocupada»', async () => {
  const db = d1DePrueba();
  assert.deepEqual(await ret(db, { primerasManuales: 3 }), { ok: false, motivo: 'tope' });
});

test('cruce: reubicar a una hora que se cruza da ocupada', async () => {
  const db = d1DePrueba();
  await ret(db, { id: 'otra', inicio_utc: '2026-10-07T15:00:00Z', fecha_lima: '2026-10-07', modalidad: 'video' });
  await ret(db, { id: 'sin', inicio_utc: '2026-10-06T15:00:00Z', modalidad: 'video' });
  await repo.marcarSinHora(db, 'sin', t0);
  const res = await repo.reubicar(db, { id: 'sin', nutricionista_id: 'nico', inicio_utc: '2026-10-07T15:30:00Z', fecha_lima: '2026-10-07',
    modalidad: 'video', primerasManuales: 0, tope: 3, ahora: t0 });
  assert.deepEqual(res, { ok: false, motivo: 'ocupada' });
});

test('cruce: reubicar recalcula fin_utc con la duración de la reserva', async () => {
  const db = d1DePrueba();
  await ret(db, { id: 'sin', inicio_utc: '2026-10-06T15:00:00Z', modalidad: 'video', duracion_min: 30 });
  await repo.marcarSinHora(db, 'sin', t0);
  assert.deepEqual(await repo.reubicar(db, { id: 'sin', nutricionista_id: 'nico', inicio_utc: '2026-10-07T16:00:00Z', fecha_lima: '2026-10-07',
    modalidad: 'video', primerasManuales: 0, tope: 3, ahora: t0 }), { ok: true });
  const r = await repo.reservaPorId(db, 'sin');
  assert.equal(r.fin_utc, '2026-10-07T16:30:00Z');
});

test('cruce: revivir una expirada que ahora se cruza con otra no confirma', async () => {
  const db = d1DePrueba();
  await ret(db, { id: 'tarde', inicio_utc: '2026-10-06T15:00:00Z', modalidad: 'video' });
  await ret(db, { id: 'nueva', inicio_utc: '2026-10-06T15:30:00Z', modalidad: 'video', duracion_min: 30, ahora: mas(16) });
  const res = await repo.confirmarReserva(db, { id: 'tarde', fecha_lima: '2026-10-06', primerasManuales: 0, tope: 3, ahora: mas(17) });
  assert.equal(res.ok, false);
  assert.equal((await repo.reservaPorId(db, 'tarde')).estado, 'expirada');
});

test('reservasActivasEntre devuelve fin y duración', async () => {
  const db = d1DePrueba();
  await ret(db, { inicio_utc: '2026-10-06T15:00:00Z', modalidad: 'video', duracion_min: 30 });
  const [r] = await repo.reservasActivasEntre(db, '2026-10-06', '2026-10-07', t0);
  assert.equal(r.fin_utc, '2026-10-06T15:30:00Z');
  assert.equal(r.duracion_min, 30);
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `node --test server/reservas/repo.test.mjs`
Expected: FAIL en las pruebas «cruce» (hoy solo choca el inicio exacto) y en `reservasActivasEntre`.

- [ ] **Step 3: Implementar**

En `server/reservas/repo.mjs`, debajo de `const MIN = 60000;`:

```js
const FIN = (col) => `COALESCE(${col}.fin_utc, strftime('%Y-%m-%dT%H:%M:%SZ', ${col}.inicio_utc, '+60 minutes'))`;

// Otra cita activa que se cruza con [ini, fin): de la misma nutricionista o, si
// las dos son presenciales, en el único consultorio. Cada argumento es un
// parámetro (?N) o una columna. Va dentro de la misma sentencia que escribe:
// D1 corre las sentencias en serie, así que nadie se cuela entre medio.
export const CRUCE = ({ ini, fin, nutri, modalidad, excluir }) => `EXISTS (SELECT 1 FROM reservas o
  WHERE o.id <> ${excluir} AND o.estado IN ${ACTIVOS}
    AND o.inicio_utc < ${fin} AND ${FIN('o')} > ${ini}
    AND (o.nutricionista_id = ${nutri} OR (${modalidad} = 'presencial' AND o.modalidad = 'presencial')))`;
```

Debajo de `CRUCE`, el ayudante que explica por qué no entró una escritura:

```js
// ¿Hay cruce para esta cita? Se pregunta solo cuando una escritura no entró,
// para distinguir «ocupada» de «tope».
export async function hayCruce(db, { id, nutri, inicio, modalidad, fin }) {
  const { c } = await db.prepare(`SELECT ${CRUCE({ ini: '?3', fin: '?5', nutri: '?2', modalidad: '?4', excluir: '?1' })} AS c`)
    .bind(id, nutri, inicio, modalidad, fin).first();
  return Boolean(c);
}
```

Reemplazar el cuerpo de `crearRetencion` desde `const insertar = ...` hasta el final de la función por:

```js
  const duracion = r.duracion_min ?? 60;
  const fin = new Date(Date.parse(r.inicio_utc) + duracion * MIN).toISOString().replace('.000Z', 'Z');
  const insertar = db.prepare(
    `INSERT INTO reservas (id, token, producto, duracion_meses, monto_centimos, peso_tope, nutricionista_id,
       inicio_utc, fecha_lima, modalidad, estado, retencion_hasta, huella, creado_en, actualizado_en, variante, fin_utc, duracion_min)
     SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'apartada', ?11, ?15, ?12, ?12, ?16, ?17, ?18
     WHERE (SELECT COALESCE(SUM(peso_tope), 0) FROM reservas
            WHERE fecha_lima = ?9 AND estado IN ${ACTIVOS}) + ?6 + ?13 <= ?14
       AND NOT ${CRUCE({ ini: '?8', fin: '?17', nutri: '?7', modalidad: '?10', excluir: '?1' })}`,
  ).bind(r.id, r.token, r.producto, r.duracion_meses, r.monto_centimos, r.peso_tope, r.nutricionista_id,
    r.inicio_utc, r.fecha_lima, r.modalidad, hasta, ahoraIso, r.primerasManuales, r.tope, huella, r.variante ?? null, fin, duracion);
  try {
    const [, res] = await db.batch([expirar(db, ahoraIso), insertar]);
    if (res.meta.changes === 0) {
      const ocupada = await hayCruce(db, { id: r.id, nutri: r.nutricionista_id, inicio: r.inicio_utc, modalidad: r.modalidad, fin });
      return { ok: false, motivo: ocupada ? 'ocupada' : 'tope' };
    }
    return { ok: true, retencion_hasta: hasta };
  } catch (e) {
    if (UNIQUE.test(String(e?.message))) return { ok: false, motivo: 'ocupada' };
    throw e;
  }
}
```

En `confirmarReserva`, agregar el cruce al `WHERE` (usa las columnas de la propia fila):

```js
    const [, res] = await db.batch([expirar(db, ahoraIso), db.prepare(
      `UPDATE reservas SET estado = 'confirmada', retencion_hasta = NULL, actualizado_en = ?2
       WHERE id = ?1 AND NOT ${CRUCE({ ini: 'reservas.inicio_utc', fin: FIN('reservas'), nutri: 'reservas.nutricionista_id', modalidad: 'reservas.modalidad', excluir: 'reservas.id' })}
         AND (
         estado IN ('apartada', 'pagando')
         OR (estado = 'expirada' AND (SELECT COALESCE(SUM(peso_tope), 0) FROM reservas
               WHERE fecha_lima = ?3 AND estado IN ${ACTIVOS} AND id <> ?1) + peso_tope + ?4 <= ?5))`,
    ).bind(id, ahoraIso, fecha_lima, primerasManuales, tope)]);
```

En `reubicar`, reemplazar la sentencia por:

```js
    const fin = `strftime('%Y-%m-%dT%H:%M:%SZ', ?3, '+' || reservas.duracion_min || ' minutes')`;
    const [, res] = await db.batch([expirar(db, ahoraIso), db.prepare(
      `UPDATE reservas SET nutricionista_id = ?2, inicio_utc = ?3, fecha_lima = ?4, modalidad = ?5, fin_utc = ${fin},
         estado = 'confirmada', google_event_id = NULL, meet_url = NULL, actualizado_en = ?6
       WHERE id = ?1 AND estado = 'pagada_sin_hora'
         AND NOT ${CRUCE({ ini: '?3', fin, nutri: '?2', modalidad: '?5', excluir: '?1' })}
         AND (SELECT COALESCE(SUM(peso_tope), 0) FROM reservas
              WHERE fecha_lima = ?4 AND estado IN ${ACTIVOS} AND id <> ?1) + peso_tope + ?7 <= ?8`,
    ).bind(r.id, r.nutricionista_id, r.inicio_utc, r.fecha_lima, r.modalidad, ahoraIso, r.primerasManuales, r.tope)]);
    if (res.meta.changes === 1) return { ok: true };
    const actual = await reservaPorId(db, r.id);
    const finNuevo = new Date(Date.parse(r.inicio_utc) + (actual?.duracion_min ?? 60) * MIN).toISOString().replace('.000Z', 'Z');
    const ocupada = await hayCruce(db, { id: r.id, nutri: r.nutricionista_id, inicio: r.inicio_utc, modalidad: r.modalidad, fin: finNuevo });
    return { ok: false, motivo: ocupada ? 'ocupada' : 'tope' };
```

(borrar la línea `return res.meta.changes === 1 ? { ok: true } : { ok: false, motivo: 'tope' };` que queda debajo).

En `reservasActivasEntre`, cambiar el `SELECT` a:

```js
    `SELECT id, inicio_utc, fin_utc, duracion_min, fecha_lima, nutricionista_id, modalidad, peso_tope FROM reservas
```

- [ ] **Step 4: Correr y ver que pasan**

Run: `npm test`
Expected: PASS, incluidas `confirmar.test.mjs` y `handlers/reservas.test.mjs` sin tocarlas.

- [ ] **Step 5: Commit**

```bash
git add server/reservas/repo.mjs server/reservas/repo.test.mjs
git commit -m "reservas: la base impide cruces de horario, no solo inicios iguales"
```

---

### Task 3: El motor de horas libres en minutos

**Files:**
- Modify: `server/reservas/disponibilidad.mjs`
- Test: `server/reservas/disponibilidad.test.mjs`

**Interfaces:**
- Consumes: `inicioUtcMin`, `finDeReserva` (Task 1); reservas con `fin_utc`/`duracion_min` (Task 2).
- Produces: `horasLibres({ ..., duracionMin = 60, pasoMin = 60 })` → `[{ inicio, hora: 'HH:MM', nutricionista_id }]`.

- [ ] **Step 1: Pruebas que fallan**

Agregar al final de `server/reservas/disponibilidad.test.mjs`:

```js
const media = { duracionMin: 30, pasoMin: 30 };

test('30 min cada 30: martes presencial de 10:00 a 19:30, sin la hora del almuerzo', () => {
  const r = horasLibres({ ...base, ...media, fecha: '2026-10-06', modalidad: 'presencial' });
  assert.deepEqual(horas(r), ['10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30',
    '17:00', '17:30', '18:00', '18:30', '19:00', '19:30']);
  assert.equal(r[1].inicio, '2026-10-06T15:30:00Z');
});

test('60 min cada 30: no se ofrece 12:30 (pisa el almuerzo) ni 19:30 (pasa el cierre)', () => {
  const r = horas(horasLibres({ ...base, duracionMin: 60, pasoMin: 30, fecha: '2026-10-06', modalidad: 'presencial' }));
  assert.ok(r.includes('12:00'));
  assert.ok(!r.includes('12:30'));
  assert.ok(r.includes('19:00'));
  assert.ok(!r.includes('19:30'));
});

test('una reserva de 60 a las 10:00 tapa 10:00 y 10:30 de esa nutricionista; una de 30 a las 10:00 solo 10:00', () => {
  const de60 = [reserva({ inicio_utc: '2026-10-06T15:00:00Z', fin_utc: '2026-10-06T16:00:00Z', fecha_lima: '2026-10-06', nutricionista_id: 'jussara', modalidad: 'video' })];
  const r60 = horas(horasLibres({ ...base, ...media, reservas: de60, fecha: '2026-10-06', modalidad: 'video', filtroNutricionista: 'jussara' }));
  assert.ok(!r60.includes('10:00') && !r60.includes('10:30') && r60.includes('11:00'));
  const de30 = [reserva({ inicio_utc: '2026-10-06T15:00:00Z', fin_utc: '2026-10-06T15:30:00Z', fecha_lima: '2026-10-06', nutricionista_id: 'jussara', modalidad: 'video' })];
  const r30 = horas(horasLibres({ ...base, ...media, reservas: de30, fecha: '2026-10-06', modalidad: 'video', filtroNutricionista: 'jussara' }));
  assert.ok(!r30.includes('10:00') && r30.includes('10:30'));
});

test('una reserva vieja sin fin_utc cuenta como 60 min', () => {
  const reservas = [reserva({ inicio_utc: '2026-10-06T15:00:00Z', fecha_lima: '2026-10-06', nutricionista_id: 'jussara', modalidad: 'video' })];
  const r = horas(horasLibres({ ...base, ...media, reservas, fecha: '2026-10-06', modalidad: 'video', filtroNutricionista: 'jussara' }));
  assert.ok(!r.includes('10:30'));
});

test('la web sigue igual: una cita de 30 a las 10:30 tapa la hora de 10:00 a 11:00', () => {
  const reservas = [reserva({ inicio_utc: '2026-10-06T15:30:00Z', fin_utc: '2026-10-06T16:00:00Z', fecha_lima: '2026-10-06', nutricionista_id: 'jussara', modalidad: 'video' })];
  const r = horas(horasLibres({ ...base, reservas, fecha: '2026-10-06', modalidad: 'video', filtroNutricionista: 'jussara' }));
  assert.ok(!r.includes('10:00'));
  assert.ok(r.includes('11:00'));
});

test('un evento manual de 30 min bloquea solo esa media hora', () => {
  const eventos = [conHora('Carolina', '2026-10-06T10:00:00-05:00', '2026-10-06T10:30:00-05:00')];
  const r = horas(horasLibres({ ...base, ...media, eventos, fecha: '2026-10-06', modalidad: 'presencial' }));
  assert.ok(!r.includes('10:00'));
  assert.ok(r.includes('10:30'));
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `node --test server/reservas/disponibilidad.test.mjs`
Expected: FAIL en las seis nuevas (hoy solo hay horas en punto); las viejas siguen en verde.

- [ ] **Step 3: Implementar**

En `server/reservas/disponibilidad.mjs`:

Cambiar el `import` de tiempo a:

```js
import { inicioUtcMin, fechaLima, diaSemana, diasEntre, finDeReserva } from './tiempo.mjs';
```

Debajo de `const HORA_MS = 3600 * 1000;` agregar `const MIN_MS = 60 * 1000;`.

Reemplazar `ventanaCubre` por:

```js
// ¿La nutricionista atiende de `m` a `m + dur` (minutos desde la medianoche de
// Lima) ese día y en esa modalidad? Nada puede pisar la hora del almuerzo.
function ventanaCubre(nutricionista, fecha, modalidad, m, dur) {
  if (m < (HORA_ALMUERZO + 1) * 60 && m + dur > HORA_ALMUERZO * 60) return false;
  const dow = diaSemana(fecha);
  return nutricionista.ventanas.some((v) => {
    if (v.dia !== DIAS[dow]) return false;
    if (v.modalidad && v.modalidad !== modalidad) return false; // null = ambas
    if (v.cadaDosSemanas && Math.abs(diasEntre(v.cadaDosSemanas, fecha)) % 14 !== 0) return false;
    let desde = v.desde;
    let hasta = v.hasta;
    if (modalidad === 'presencial') {
      const clinica = HORARIO_CLINICA[dow];
      if (!clinica) return false;
      desde = Math.max(desde, clinica[0]);
      hasta = Math.min(hasta, clinica[1]);
    }
    return m >= desde * 60 && m + dur <= hasta * 60;
  });
}
```

En `horasOcupadas`, cambiar `return delDia.length + manuales;` por:

```js
  return delDia.reduce((s, r) => s + (r.duracion_min ?? 60) / 60, 0) + manuales;
```

En `horasLibres`, agregar `duracionMin = 60, pasoMin = 60,` a los parámetros (después de `maxHorasDia = null,`) y reemplazar desde `const carga = ...` hasta `return libres;` por:

```js
  const carga = (id) => delDia.filter((r) => r.nutricionista_id === id).length;
  const cruza = (r, ini, fin) => Date.parse(r.inicio_utc) < fin && Date.parse(finDeReserva(r)) > ini;
  const libres = [];
  for (let m = 0; m + duracionMin <= 24 * 60; m += pasoMin) {
    const inicio = inicioUtcMin(fecha, m);
    const ini = Date.parse(inicio);
    const fin = ini + duracionMin * MIN_MS;
    if (ini <= ahora.getTime()) continue;
    // Eventos manuales: no dicen quién atiende, así que bloquean ese tramo entero.
    if (eventos.some((ev) => !ev.propio && ev.bloquea && seCruza(ev, ini, fin))) continue;
    if (modalidad === 'presencial'
      && delDia.some((r) => r.modalidad === 'presencial' && cruza(r, ini, fin))) continue;

    const candidatas = nutricionistas.filter((n) => !ausentes.has(n.id)
      && (!filtroNutricionista || n.id === filtroNutricionista)
      && ventanaCubre(n, fecha, modalidad, m, duracionMin)
      && !delDia.some((r) => r.nutricionista_id === n.id && cruza(r, ini, fin)));
    if (!candidatas.length) continue;

    const elegida = candidatas.reduce((a, b) => (carga(b.id) < carga(a.id) ? b : a));
    const hh = String(Math.floor(m / 60)).padStart(2, '0');
    const mm = String(m % 60).padStart(2, '0');
    libres.push({ inicio, hora: `${hh}:${mm}`, nutricionista_id: elegida.id });
  }
  return libres;
```

Ajustar el comentario de `horasOcupadas` («cada reserva web ocupa 1 h» → «cada reserva ocupa su duración»).

- [ ] **Step 4: Correr y ver que pasan**

Run: `npm test`
Expected: PASS (las viejas de `disponibilidad.test.mjs` sin cambios y las seis nuevas).

- [ ] **Step 5: Commit**

```bash
git add server/reservas/disponibilidad.mjs server/reservas/disponibilidad.test.mjs
git commit -m "reservas: el motor de horas libres trabaja en minutos (duración y paso)"
```

---

### Task 4: Calendario, .ics y enlace de Google con la duración real

**Files:**
- Modify: `server/reservas/confirmar.mjs:45`, `server/handlers/reservas.mjs:60`
- Test: `server/reservas/confirmar.test.mjs`, `server/handlers/reservas.test.mjs`

**Interfaces:**
- Consumes: `finDeReserva` (Task 1).

- [ ] **Step 1: Pruebas que fallan**

En `server/reservas/confirmar.test.mjs`, agregar:

```js
test('el evento del calendario termina cuando termina la cita (fin_utc)', async () => {
  const { db, deps, creados } = await preparar({ pagos: { 555: aprobado() } });
  await db.prepare("UPDATE reservas SET duracion_min = 30, fin_utc = '2026-10-06T17:30:00Z' WHERE id = 'r1'").run();
  await procesarPago(deps, env, '555');
  assert.equal(creados[0].finUtc, '2026-10-06T17:30:00Z');
});
```

En `server/handlers/reservas.test.mjs`, agregar:

```js
test('ics: DTEND sale de fin_utc', async () => {
  const d = deps();
  await d.db.prepare(`INSERT INTO reservas (id, token, producto, duracion_meses, monto_centimos, peso_tope, nutricionista_id, inicio_utc, fecha_lima,
    modalidad, estado, creado_en, actualizado_en, duracion_min, fin_utc)
    VALUES ('i', 'ti', 'constancia', 3, 108000, 1, 'nico', '2026-10-06T15:00:00Z', '2026-10-06', 'video', 'confirmada', 'x', 'x', 30, '2026-10-06T15:30:00Z')`).run();
  const texto = await (await handleIcs(get('/api/reservas/ics?r=ti'), env, d)).text();
  assert.match(texto, /DTEND:20261006T153000Z/);
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `node --test server/reservas/confirmar.test.mjs server/handlers/reservas.test.mjs`
Expected: FAIL (hoy el fin es siempre inicio + 1 h).

- [ ] **Step 3: Implementar**

En `server/reservas/confirmar.mjs`: sumar `finDeReserva` al `import` de `./tiempo.mjs` y cambiar
`finUtc: new Date(Date.parse(r.inicio_utc) + 3600 * 1000).toISOString(),` por `finUtc: finDeReserva(r),`.

En `server/handlers/reservas.mjs`: sumar `finDeReserva` al `import` de `../reservas/tiempo.mjs` y, en `eventoDe`, el mismo cambio.

- [ ] **Step 4: Correr y ver que pasan**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/reservas/confirmar.mjs server/handlers/reservas.mjs server/reservas/confirmar.test.mjs server/handlers/reservas.test.mjs
git commit -m "reservas: evento, .ics y enlace de Google con la duración real de la cita"
```

---

### Task 5: Verificar en la versión de prueba y publicar

**Files:**
- Modify: `CHANGELOG.md` (entrada interna: «Motor de horarios preparado para citas de 30 min; sin cambios para el paciente»)

- [ ] **Step 1: Pruebas y build**

Run: `npm test && npm run build`
Expected: todo en verde, build sin errores.

- [ ] **Step 2: Migración en preview**

Run: `npx wrangler d1 migrations apply ajl-reservas-preview --remote`
Expected: aplica `0006_duracion.sql`. Luego verificar:
`npx wrangler d1 execute ajl-reservas-preview --remote --command "SELECT COUNT(*) AS sin_fin FROM reservas WHERE fin_utc IS NULL"` → `0`.

- [ ] **Step 3: Push y prueba de punta a punta en preview**

```bash
git add CHANGELOG.md && git commit -m "changelog: motor de horarios en medias horas"
git push origin reservas-pago
```

En `https://reservas-pago.ajl-landing.pages.dev/reservar/` (celular y computadora), con el comprador de prueba de Mercado Pago: elegir plan, ver que el calendario muestra las mismas horas en punto que antes, pagar, ver la pantalla Listo, la cita en Google Calendar con 1 hora de duración y los 3 correos. Repetir la misma hora desde otra ventana y ver «Esa hora acaba de ocuparse». Borrar a mano la cita de prueba del calendario real.

- [ ] **Step 4: Publicar (solo con autorización de Joaquín)**

Pedir autorización. Con el sí:

```bash
npx wrangler d1 migrations apply ajl-reservas --remote
git checkout main && git pull && git merge --no-ff reservas-pago -m "Motor de horarios en medias horas" && git push origin main
git checkout reservas-pago
```

Luego `npm run smoke -- https://www.ajlnutricion.com` y abrir `/reservar/` en producción para ver que carga horas.
