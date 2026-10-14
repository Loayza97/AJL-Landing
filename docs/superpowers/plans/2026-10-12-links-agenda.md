# Links de agenda de un solo uso · plan (entrega 2 de 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el equipo cree links de un solo uso para pacientes que pagaron por fuera de la web, y que el paciente agende con ellos su cita de 30 o 60 minutos en el calendario compartido.

**Architecture:** Tabla nueva `links_agenda` (token guardado como hash). Las citas de link se guardan en `reservas` como `confirmada`, con `producto = 'link_<tipo>'`, monto y peso 0 y `link_id`; así usan el mismo motor (`horasLibres` con `duracionMin` y `pasoMin: 30`) y los mismos candados de cruce que la reserva con pago (entrega 1). Agendar es un solo `db.batch` que inserta el cliente (si es nuevo), la reserva y marca el link usado, con las mismas condiciones en cada sentencia. Página del paciente `/agenda/?l=TOKEN` y panel `/panel/links/` (mismo acceso por código del panel actual), los dos sin analítica.

**Tech Stack:** Astro 4 (páginas estáticas + `<script>` con módulos de `src/scripts/`), Cloudflare Pages Functions, D1, Google Calendar (OAuth existente), Resend, `node:test`.

**Spec:** `docs/superpowers/specs/2026-10-12-links-agenda-design.md`

## Global Constraints

- Requiere la entrega 1 publicada (`docs/superpowers/plans/2026-10-12-motor-medias-horas.md`): `CRUCE`, `hayCruce`, `fin_utc`, `duracion_min`, `inicioUtcMin`, `sumarMinutos`, `finDeReserva`, `horasLibres({ duracionMin, pasoMin })`.
- Worktree `~/ajl/ajl-landing-cloudflare`, rama `reservas-pago`. Nada a `main` sin autorización.
- Tipos de evento: `c30v` (Control de 30 min · Virtual · solo video), `c30p` (Control de 30 min · Presencial o virtual), `s60` (Sesión de 1 hora · Presencial o virtual). Vence a los 7 días; reactivar suma 3 días desde ahora; 10 consultas de DNI por link; páginas de 20 filas.
- Inicios de link cada 30 min: `/^\d{4}-\d{2}-\d{2}T\d{2}:(00|30):00Z$/`. La web de pago sigue aceptando solo `:00`.
- Datos del paciente nuevo en este orden: Apellido paterno, Apellido materno (opcional), Nombres, Correo, WhatsApp, Fecha de nacimiento. Documento: siempre DNI de 8 dígitos (ya pedido en el paso anterior).
- Copy en español de Perú, tuteo, sin rayas como inciso; ADN de marca (Preciso · Real · Liberador).
- Ninguna página nueva carga GA, Meta ni Clarity (no usar `Layout.astro`). `<meta name="robots" content="noindex, nofollow">`.
- Todo texto que escribió el paciente pasa por `esc()` en correos y por `textContent` en el navegador.
- Variables y secretos: no hacen falta nuevos.

## Review Focus

1. Doble envío o dos pestañas confirmando el mismo link: una sola reserva; la otra recibe 410 «Este link ya se usó».
2. El link vence entre que el paciente lo abre y confirma: 410 con mensaje claro y nada se guarda.
3. La hora se ocupa (por la web de pago u otro link) entre elegir y confirmar: 409, vuelve al calendario y el link sigue sirviendo.
4. Una cita de link de 30 min a las 10:00 deja de ofrecerse a las 10:00 en la web de pago con esa nutricionista, y una cita web de 10:00 tapa el 10:30 del link.
5. Google Calendar caído al confirmar: la reserva queda confirmada con `calendario_pendiente = 1`, llega alerta al equipo y el paciente igual ve «Listo».

---

### Task 1: Base de datos, tipos y piezas compartidas

**Files:**
- Create: `db/d1/0007_links_agenda.sql`, `server/agenda/tipos.mjs`, `server/agenda/tipos.test.mjs`
- Modify: `server/tokens.mjs` (+ `sha256Hex`), `server/tokens.test.mjs`, `server/reservas/repo.mjs` (exportar `expirar`), `server/reservas/disponibilidad.mjs` (peso 0 no mira el tope), `server/reservas/disponibilidad.test.mjs`, `server/reservas/esquema.test.mjs`

**Interfaces:**
- Produces: tabla `links_agenda(id, token_hash, tipo, creado_en, creado_por, vence_en, reactivado_en, usado_en, reserva_id, paciente_nuevo, consultas_dni)`; `reservas.link_id`; `TIPOS_LINK: Record<'c30v'|'c30p'|'s60', { nombre, etiqueta, duracion_min, modalidades: ('presencial'|'video')[] }>`; `VENCE_DIAS = 7`, `REACTIVAR_DIAS = 3`, `MAX_CONSULTAS_DNI = 10`, `PASO_LINK_MIN = 30`; `tipoDeReserva(r): tipo | null`; `sha256Hex(texto): Promise<string>`; `export const expirar(db, ahoraIso)`.

- [ ] **Step 1: Pruebas que fallan**

`server/agenda/tipos.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TIPOS_LINK, tipoDeReserva } from './tipos.mjs';

test('tres tipos fijos: el virtual solo por video', () => {
  assert.deepEqual(Object.keys(TIPOS_LINK), ['c30v', 'c30p', 's60']);
  assert.deepEqual(TIPOS_LINK.c30v.modalidades, ['video']);
  assert.equal(TIPOS_LINK.s60.duracion_min, 60);
});

test('tipoDeReserva: solo para reservas creadas con link', () => {
  assert.equal(tipoDeReserva({ producto: 'link_c30v' }).nombre, 'Control de 30 min');
  assert.equal(tipoDeReserva({ producto: 'constancia' }), null);
  assert.equal(tipoDeReserva({ producto: 'link_zzz' }), null);
});
```

En `server/tokens.test.mjs`, agregar:

```js
import { sha256Hex } from './tokens.mjs';

test('sha256Hex en hexadecimal', async () => {
  assert.equal(await sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
```

En `server/reservas/esquema.test.mjs`, agregar:

```js
test('migración 0007: links de agenda con tipo controlado y reservas.link_id', async () => {
  const db = d1DePrueba();
  await db.prepare(`INSERT INTO links_agenda (id, token_hash, tipo, creado_en, creado_por, vence_en)
    VALUES ('l1', 'h1', 'c30v', 'x', 'a@x.pe', 'y')`).run();
  const l = await db.prepare("SELECT consultas_dni, usado_en FROM links_agenda WHERE id = 'l1'").first();
  assert.deepEqual(l, { consultas_dni: 0, usado_en: null });
  await assert.rejects(db.prepare(`INSERT INTO links_agenda (id, token_hash, tipo, creado_en, creado_por, vence_en)
    VALUES ('l2', 'h2', 'otro', 'x', 'a@x.pe', 'y')`).run(), /CHECK/);
  await assert.rejects(db.prepare(`INSERT INTO links_agenda (id, token_hash, tipo, creado_en, creado_por, vence_en)
    VALUES ('l3', 'h1', 's60', 'x', 'a@x.pe', 'y')`).run(), /UNIQUE/);
  await db.prepare("UPDATE reservas SET link_id = 'l1' WHERE 0").run();
});
```

En `server/reservas/disponibilidad.test.mjs`, agregar:

```js
test('peso 0 (citas de link) no mira el tope de primeras sesiones', () => {
  const eventos = ['09', '10', '11'].map((h) => conHora('1ra · X · Plan', `2026-10-06T${h}:00:00-05:00`, `2026-10-06T${h}:30:00-05:00`, { bloquea: false }));
  assert.deepEqual(horasLibres({ ...base, eventos, fecha: '2026-10-06', modalidad: 'presencial' }), []);
  assert.ok(horasLibres({ ...base, peso: 0, eventos, fecha: '2026-10-06', modalidad: 'presencial' }).length > 0);
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npm test`
Expected: FAIL (no existen `tipos.mjs`, `sha256Hex`, la tabla, y el tope corta también con peso 0).

- [ ] **Step 3: Implementar**

`db/d1/0007_links_agenda.sql`:

```sql
-- Links de agenda de un solo uso (2026-10-12): para pacientes que pagaron por
-- fuera de la web. El token se guarda como hash: la URL solo se ve al crearlo.
CREATE TABLE links_agenda (
  id             TEXT PRIMARY KEY,
  token_hash     TEXT NOT NULL UNIQUE,
  tipo           TEXT NOT NULL CHECK (tipo IN ('c30v', 'c30p', 's60')),
  creado_en      TEXT NOT NULL,
  creado_por     TEXT NOT NULL,
  vence_en       TEXT NOT NULL,
  reactivado_en  TEXT,
  usado_en       TEXT,
  reserva_id     TEXT REFERENCES reservas(id),
  paciente_nuevo INTEGER,
  consultas_dni  INTEGER NOT NULL DEFAULT 0
);

-- La cita que se agendó con un link (NULL en las reservas de la web).
ALTER TABLE reservas ADD COLUMN link_id TEXT;
```

`server/agenda/tipos.mjs`:

```js
// Tipos de evento de los links de agenda (fijos en el MVP, pedido de Alejandro
// del 2026-10-12). El producto de la reserva es `link_<id>`.
export const TIPOS_LINK = {
  c30v: { nombre: 'Control de 30 min', etiqueta: 'Virtual', duracion_min: 30, modalidades: ['video'] },
  c30p: { nombre: 'Control de 30 min', etiqueta: 'Presencial o virtual', duracion_min: 30, modalidades: ['presencial', 'video'] },
  s60: { nombre: 'Sesión de 1 hora', etiqueta: 'Presencial o virtual', duracion_min: 60, modalidades: ['presencial', 'video'] },
};

export const VENCE_DIAS = 7;
export const REACTIVAR_DIAS = 3;
export const MAX_CONSULTAS_DNI = 10; // por link: nadie usa un link para averiguar datos ajenos
export const PASO_LINK_MIN = 30;

export function tipoDeReserva(r) {
  const p = String(r?.producto ?? '');
  return p.startsWith('link_') ? TIPOS_LINK[p.slice(5)] ?? null : null;
}
```

En `server/tokens.mjs`, al final:

```js
export async function sha256Hex(texto) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
```

En `server/reservas/repo.mjs`, cambiar `const expirar = (db, ahoraIso) => ...` por `export const expirar = (db, ahoraIso) => ...`.

En `server/reservas/disponibilidad.mjs`, en `horasLibres`, cambiar `if (suma + peso > tope) return [];` por:

```js
  // Las citas de link (peso 0) no son primeras sesiones: el tope no las frena.
  if (peso > 0 && suma + peso > tope) return [];
```

- [ ] **Step 4: Correr y ver que pasan**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add db/d1/0007_links_agenda.sql server/agenda/tipos.mjs server/agenda/tipos.test.mjs server/tokens.mjs server/tokens.test.mjs \
  server/reservas/repo.mjs server/reservas/disponibilidad.mjs server/reservas/disponibilidad.test.mjs server/reservas/esquema.test.mjs
git commit -m "agenda: tabla de links, tipos de evento y piezas compartidas"
```

---

### Task 2: Repositorio de links

**Files:**
- Create: `server/agenda/repo.mjs`, `server/agenda/repo.test.mjs`, `server/agenda/mascaras.mjs`, `server/agenda/mascaras.test.mjs`

**Interfaces:**
- Consumes: `CRUCE`, `hayCruce`, `expirar` (`server/reservas/repo.mjs`); `VENCE_DIAS`, `REACTIVAR_DIAS` (Task 1).
- Produces:
  - `estadoLink(l, ahora): 'agendado' | 'vencido' | 'sin_usar'`
  - `crearLink(db, { id, tokenHash, tipo, creadoPor, ahora }): Promise<{ vence_en }>`
  - `linkPorHash(db, hash): Promise<link & { inicio_utc, fin_utc, modalidad, nutricionista_id } | null>`
  - `reactivarLink(db, id, ahora): Promise<string | null>` (nuevo `vence_en` o `null`)
  - `contarConsultaDni(db, id, max): Promise<boolean>`
  - `pacientePorDni(db, dni): Promise<cliente | null>`
  - `agendarConLink(db, { link, reservaId, token, tipoId, cliente, clienteId, hora: { inicio, fin, nutricionista_id, modalidad, fecha_lima, duracion_min }, pacienteNuevo, condicionesVersion, ahora }): Promise<{ ok: true } | { ok: false, motivo: 'link' | 'ocupada' }>`
  - `enmascararCorreo(email): string`, `enmascararTelefono(tel): string`

- [ ] **Step 1: Pruebas que fallan**

`server/agenda/mascaras.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enmascararCorreo, enmascararTelefono } from './mascaras.mjs';

test('máscaras: se reconoce el dato propio sin revelarlo', () => {
  assert.equal(enmascararCorreo('lucia.ramos@gmail.com'), 'l••••••@gmail.com');
  assert.equal(enmascararCorreo('a@x.pe'), 'a••••••@x.pe');
  assert.equal(enmascararTelefono('+51987654321'), '+51 ••• ••• 321');
  assert.equal(enmascararTelefono('987654321'), '••• ••• 321');
});
```

`server/agenda/repo.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1DePrueba } from '../reservas/d1-prueba.mjs';
import * as repo from '../reservas/repo.mjs';
import * as agenda from './repo.mjs';

const t0 = new Date('2026-10-05T15:00:00Z');
const dias = (n) => new Date(t0.getTime() + n * 86400000);
const nuevo = { nombre: 'Lucía Ramos Quispe', nombres: 'Lucía', apellido_paterno: 'Ramos', apellido_materno: 'Quispe',
  fecha_nacimiento: '1992-03-08', tipo_documento: 'dni', dni: '70123456', whatsapp: '+51987654321', email: 'lucia@x.pe' };
const hora = (o = {}) => ({ inicio: '2026-10-06T15:00:00Z', fin: '2026-10-06T15:30:00Z', nutricionista_id: 'nico', modalidad: 'video',
  fecha_lima: '2026-10-06', duracion_min: 30, ...o });
let n = 0;
async function link(db, o = {}) {
  const id = `l${++n}`;
  await agenda.crearLink(db, { id, tokenHash: `h${n}`, tipo: 'c30v', creadoPor: 'romi@x.pe', ahora: t0, ...o });
  return id;
}
const agendar = (db, linkId, o = {}) => agenda.agendarConLink(db, { link: linkId, reservaId: `r${++n}`, token: `t${n}`, tipoId: 'c30v',
  cliente: nuevo, clienteId: `c${n}`, hora: hora(), pacienteNuevo: true, condicionesVersion: 'v1', ahora: t0, ...o });

test('crear: vence a los 7 días; el estado sale de las fechas', async () => {
  const db = d1DePrueba();
  const { vence_en } = await agenda.crearLink(db, { id: 'a', tokenHash: 'ha', tipo: 's60', creadoPor: 'romi@x.pe', ahora: t0 });
  assert.equal(vence_en, dias(7).toISOString());
  const l = await agenda.linkPorHash(db, 'ha');
  assert.equal(agenda.estadoLink(l, t0), 'sin_usar');
  assert.equal(agenda.estadoLink(l, dias(7)), 'vencido');
  assert.equal(await agenda.linkPorHash(db, 'no'), null);
});

test('agendar: crea cliente, reserva confirmada de link y marca el link usado', async () => {
  const db = d1DePrueba();
  const id = await link(db);
  const res = await agendar(db, id, { reservaId: 'rx', token: 'tx', clienteId: 'cx' });
  assert.deepEqual(res, { ok: true });
  const r = await repo.reservaPorId(db, 'rx');
  assert.deepEqual([r.estado, r.producto, r.monto_centimos, r.peso_tope, r.link_id, r.fin_utc, r.duracion_min, r.dni, r.email],
    ['confirmada', 'link_c30v', 0, 0, id, '2026-10-06T15:30:00Z', 30, '70123456', 'lucia@x.pe']);
  const l = await agenda.linkPorHash(db, `h${n - 1}`);
  assert.equal(agenda.estadoLink(l, t0), 'agendado');
  assert.equal(l.reserva_id, 'rx');
  assert.equal(l.paciente_nuevo, 1);
});

test('agendar dos veces con el mismo link: la segunda no entra y no deja datos sueltos', async () => {
  const db = d1DePrueba();
  const id = await link(db);
  assert.equal((await agendar(db, id)).ok, true);
  assert.deepEqual(await agendar(db, id, { hora: hora({ inicio: '2026-10-07T15:00:00Z', fin: '2026-10-07T15:30:00Z', fecha_lima: '2026-10-07' }) }),
    { ok: false, motivo: 'link' });
  assert.equal((await db.prepare('SELECT COUNT(*) AS c FROM clientes').first()).c, 1);
  assert.equal((await db.prepare('SELECT COUNT(*) AS c FROM reservas').first()).c, 1);
});

test('agendar con link vencido: motivo link', async () => {
  const db = d1DePrueba();
  const id = await link(db);
  assert.deepEqual(await agendar(db, id, { ahora: dias(8) }), { ok: false, motivo: 'link' });
});

test('agendar sobre una hora que se cruza con una reserva web: ocupada, y el link sigue sin usar', async () => {
  const db = d1DePrueba();
  await repo.crearRetencion(db, { id: 'web', token: 'tw', producto: 'constancia', duracion_meses: 3, monto_centimos: 108000, peso_tope: 1,
    nutricionista_id: 'nico', inicio_utc: '2026-10-06T15:00:00Z', fecha_lima: '2026-10-06', modalidad: 'video', primerasManuales: 0, tope: 3, ahora: t0 });
  const id = await link(db);
  assert.deepEqual(await agendar(db, id, { hora: hora({ inicio: '2026-10-06T15:30:00Z', fin: '2026-10-06T16:00:00Z' }) }), { ok: false, motivo: 'ocupada' });
  const l = await db.prepare('SELECT usado_en FROM links_agenda WHERE id = ?1').bind(id).first();
  assert.equal(l.usado_en, null);
});

test('paciente conocido: agenda con su cliente existente, sin crear otro', async () => {
  const db = d1DePrueba();
  const a = await link(db);
  await agendar(db, a, { clienteId: 'c-lucia' });
  const b = await link(db);
  const res = await agendar(db, b, { cliente: null, clienteId: 'c-lucia', pacienteNuevo: false,
    hora: hora({ inicio: '2026-10-08T15:00:00Z', fin: '2026-10-08T15:30:00Z', fecha_lima: '2026-10-08' }) });
  assert.deepEqual(res, { ok: true });
  assert.equal((await db.prepare('SELECT COUNT(*) AS c FROM clientes').first()).c, 1);
});

test('pacientePorDni: solo quien tiene una reserva confirmada o pagada; el más reciente', async () => {
  const db = d1DePrueba();
  assert.equal(await agenda.pacientePorDni(db, '70123456'), null);
  await agendar(db, await link(db), { clienteId: 'c-1' });
  const p = await agenda.pacientePorDni(db, '70123456');
  assert.equal(p.id, 'c-1');
  assert.equal(p.email, 'lucia@x.pe');
  await db.prepare(`INSERT INTO clientes (id, nombre, dni, tipo_documento, email, creado_en) VALUES ('suelto', 'X', '11112222', 'dni', 'x@x.pe', 'z')`).run();
  assert.equal(await agenda.pacientePorDni(db, '11112222'), null);
});

test('reactivar: solo un link vencido y sin usar; suma 3 días desde ahora', async () => {
  const db = d1DePrueba();
  const id = await link(db);
  assert.equal(await agenda.reactivarLink(db, id, dias(1)), null);
  assert.equal(await agenda.reactivarLink(db, id, dias(9)), dias(12).toISOString());
  const usado = await link(db);
  await agendar(db, usado);
  assert.equal(await agenda.reactivarLink(db, usado, dias(9)), null);
});

test('consultas de DNI: hasta el máximo por link', async () => {
  const db = d1DePrueba();
  const id = await link(db);
  assert.equal(await agenda.contarConsultaDni(db, id, 2), true);
  assert.equal(await agenda.contarConsultaDni(db, id, 2), true);
  assert.equal(await agenda.contarConsultaDni(db, id, 2), false);
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `node --test server/agenda/repo.test.mjs server/agenda/mascaras.test.mjs`
Expected: FAIL (los módulos no existen).

- [ ] **Step 3: Implementar**

`server/agenda/mascaras.mjs`:

```js
// Datos de contacto a medias: el paciente reconoce los suyos y quien solo tiene
// el link no los aprende.
export function enmascararCorreo(email) {
  const [usuario, dominio] = String(email || '').split('@');
  return `${(usuario || '').slice(0, 1)}••••••@${dominio || ''}`;
}

export function enmascararTelefono(tel) {
  const s = String(tel || '');
  const codigo = s.startsWith('+51') ? '+51 ' : '';
  return `${codigo}••• ••• ${s.slice(-3)}`;
}
```

`server/agenda/repo.mjs`:

```js
// Acceso a D1 de los links de agenda. Agendar es una sola transacción: cliente
// (si es nuevo), reserva y link usado, cada sentencia con las mismas condiciones
// (link vigente y sin cruce), así nunca queda una mitad guardada.
import { CRUCE, hayCruce, expirar } from '../reservas/repo.mjs';
import { VENCE_DIAS, REACTIVAR_DIAS } from './tipos.mjs';

const DIA = 86400000;

export function estadoLink(l, ahora) {
  if (l.usado_en) return 'agendado';
  return Date.parse(l.vence_en) <= ahora.getTime() ? 'vencido' : 'sin_usar';
}

export async function crearLink(db, { id, tokenHash, tipo, creadoPor, ahora }) {
  const vence = new Date(ahora.getTime() + VENCE_DIAS * DIA).toISOString();
  await db.prepare(`INSERT INTO links_agenda (id, token_hash, tipo, creado_en, creado_por, vence_en) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`)
    .bind(id, tokenHash, tipo, ahora.toISOString(), creadoPor, vence).run();
  return { vence_en: vence };
}

export const linkPorHash = (db, hash) => db.prepare(
  `SELECT l.*, r.inicio_utc, r.fin_utc, r.modalidad, r.nutricionista_id
   FROM links_agenda l LEFT JOIN reservas r ON r.id = l.reserva_id WHERE l.token_hash = ?1`,
).bind(hash).first();

export async function reactivarLink(db, id, ahora) {
  const vence = new Date(ahora.getTime() + REACTIVAR_DIAS * DIA).toISOString();
  const r = await db.prepare(
    `UPDATE links_agenda SET vence_en = ?2, reactivado_en = ?3
     WHERE id = ?1 AND usado_en IS NULL AND vence_en <= ?3`,
  ).bind(id, vence, ahora.toISOString()).run();
  return r.meta.changes === 1 ? vence : null;
}

export async function contarConsultaDni(db, id, max) {
  const r = await db.prepare('UPDATE links_agenda SET consultas_dni = consultas_dni + 1 WHERE id = ?1 AND consultas_dni < ?2')
    .bind(id, max).run();
  return r.meta.changes === 1;
}

// Es paciente quien tiene un cliente con ese DNI y alguna cita confirmada o
// pagada; se usan sus datos más recientes.
export const pacientePorDni = (db, dni) => db.prepare(
  `SELECT c.* FROM clientes c
   WHERE c.dni = ?1 AND c.tipo_documento = 'dni' AND c.nombre IS NOT NULL
     AND EXISTS (SELECT 1 FROM reservas r WHERE r.cliente_id = c.id AND r.estado IN ('confirmada', 'pagada_sin_hora'))
   ORDER BY c.creado_en DESC LIMIT 1`,
).bind(dni).first();

const VIGENTE = (id, ahora) => `EXISTS (SELECT 1 FROM links_agenda WHERE id = ${id} AND usado_en IS NULL AND vence_en > ${ahora})`;

export async function agendarConLink(db, a) {
  const ahoraIso = a.ahora.toISOString();
  const h = a.hora;
  const sentencias = [expirar(db, ahoraIso)];
  if (a.cliente) {
    const c = a.cliente;
    sentencias.push(db.prepare(
      `INSERT INTO clientes (id, nombre, whatsapp, email, dni, nombres, apellido_paterno, apellido_materno, fecha_nacimiento, tipo_documento, creado_en)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'dni', ?10
       WHERE ${VIGENTE('?11', '?10')}
         AND NOT ${CRUCE({ ini: '?12', fin: '?13', nutri: '?14', modalidad: '?15', excluir: "''" })}`,
    ).bind(a.clienteId, c.nombre, c.whatsapp, c.email, c.dni, c.nombres, c.apellido_paterno, c.apellido_materno ?? null, c.fecha_nacimiento,
      ahoraIso, a.link, h.inicio, h.fin, h.nutricionista_id, h.modalidad));
  }
  sentencias.push(db.prepare(
    `INSERT INTO reservas (id, token, cliente_id, producto, duracion_meses, monto_centimos, peso_tope, nutricionista_id, inicio_utc, fin_utc,
       duracion_min, fecha_lima, modalidad, estado, acepto_condiciones_version, link_id, creado_en, actualizado_en)
     SELECT ?1, ?2, ?3, ?4, 0, 0, 0, ?5, ?6, ?7, ?8, ?9, ?10, 'confirmada', ?11, ?12, ?13, ?13
     WHERE EXISTS (SELECT 1 FROM clientes WHERE id = ?3)
       AND ${VIGENTE('?12', '?13')}
       AND NOT ${CRUCE({ ini: '?6', fin: '?7', nutri: '?5', modalidad: '?10', excluir: '?1' })}`,
  ).bind(a.reservaId, a.token, a.clienteId, `link_${a.tipoId}`, h.nutricionista_id, h.inicio, h.fin, h.duracion_min, h.fecha_lima, h.modalidad,
    a.condicionesVersion ?? null, a.link, ahoraIso));
  sentencias.push(db.prepare(
    `UPDATE links_agenda SET usado_en = ?2, reserva_id = ?3, paciente_nuevo = ?4
     WHERE id = ?1 AND usado_en IS NULL AND EXISTS (SELECT 1 FROM reservas WHERE id = ?3)`,
  ).bind(a.link, ahoraIso, a.reservaId, a.pacienteNuevo ? 1 : 0));
  try {
    const res = await db.batch(sentencias);
    if (res.at(-1).meta.changes === 1) return { ok: true };
  } catch (e) {
    if (!/UNIQUE constraint failed/i.test(String(e?.message))) throw e;
    return { ok: false, motivo: 'ocupada' };
  }
  const l = await db.prepare('SELECT usado_en, vence_en FROM links_agenda WHERE id = ?1').bind(a.link).first();
  if (!l || l.usado_en || Date.parse(l.vence_en) <= a.ahora.getTime()) return { ok: false, motivo: 'link' };
  const ocupada = await hayCruce(db, { id: a.reservaId, nutri: h.nutricionista_id, inicio: h.inicio, modalidad: h.modalidad, fin: h.fin });
  return { ok: false, motivo: ocupada ? 'ocupada' : 'link' };
}
```

- [ ] **Step 4: Correr y ver que pasan**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/agenda/repo.mjs server/agenda/repo.test.mjs server/agenda/mascaras.mjs server/agenda/mascaras.test.mjs
git commit -m "agenda: repositorio de links (crear, reactivar, DNI y agendar en una transacción)"
```

---

### Task 3: API del paciente

**Files:**
- Create: `server/handlers/agenda.mjs`, `server/handlers/agenda.test.mjs`, `server/agenda/finalizar.mjs`, `functions/api/agenda/link.js`, `functions/api/agenda/horas.js`, `functions/api/agenda/dni.js`, `functions/api/agenda/confirmar.js`
- Modify: `server/reservas/correos.mjs` (+ `correoCitaAgenda`, `dondeCita` compartido), `server/reservas/correos.test.mjs`, `server/handlers/reservas.mjs` (exportar `contexto`; `eventoDe` con título de link)

**Interfaces:**
- Consumes: Task 1 y 2; `horasLibres`, `primerasManuales`; `repo.reservaPorId`, `repo.guardarEvento`, `repo.marcarCalendarioPendiente`, `repo.reservasActivasEntre`; `validarDatos`, `hoyEnLima`; `enlaceGoogleCalendar`; `correoEquipoAlerta`.
- Produces (HTTP):
  - `GET /api/agenda/link?l=TOKEN` → `{ ok, estado: 'sin_usar'|'agendado'|'vencido', tipo: { id, nombre, etiqueta, duracion_min, modalidades }, nutricionistas: [{ id, nombre, foto }], cita?: { etiqueta, modalidad, nutricionista } }` · 404 si no existe.
  - `GET /api/agenda/horas?l&desde&dias&modalidad[&nutricionista]` → mismo formato que `/api/reservas/horas` · 410 si el link no está vigente.
  - `POST /api/agenda/dni { l, dni }` → `{ ok, conocido: false }` o `{ ok, conocido: true, nombre, email, whatsapp }` (enmascarados) · 400 DNI inválido · 410 · 429.
  - `POST /api/agenda/confirmar { l, inicio, modalidad, nutricionista?, dni, datos? }` (`datos`: `{ nombres, apellido_paterno, apellido_materno, email, whatsapp, fecha_nacimiento, acepto }`) → `{ ok, etiqueta, modalidad, nutricionista, duracion_min, meet, google_calendar, ics }` · 400 · 409 `{ motivo: 'ocupada' }` · 410 `{ motivo: 'link' }`.
  - `finalizarAgenda(deps, env, r): Promise<{ meet }>`.

- [ ] **Step 1: Pruebas que fallan**

En `server/reservas/correos.test.mjs`, agregar:

```js
import { correoCitaAgenda } from './correos.mjs';

test('correo de cita de link: duración real y sin hablar de plan ni de pago', () => {
  const c = correoCitaAgenda({ nombre: '<b>Lu</b>', titulo: 'Control de 30 min', etiqueta: 'miércoles, 14 de octubre, 10:30', duracion: 30,
    modalidad: 'video', direccion: 'Lince', meet: null, nutricionista: 'Nico', urlIcs: 'https://x/ics' });
  assert.match(c.html, /30 min/);
  assert.match(c.html, /&lt;b&gt;Lu/);
  assert.doesNotMatch(c.html, /Plan:|pago/i);
});
```

`server/handlers/agenda.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1DePrueba } from '../reservas/d1-prueba.mjs';
import { nutricionistas } from '../../src/data/nutricionistas.js';
import { sha256Hex } from '../tokens.mjs';
import * as agenda from '../agenda/repo.mjs';
import * as repo from '../reservas/repo.mjs';
import { handleAgendaLink, handleAgendaHoras, handleAgendaDni, handleAgendaConfirmar } from './agenda.mjs';

const t0 = new Date('2026-10-05T15:00:00Z'); // lunes 10:00 en Lima
const env = { PUBLIC_SITE_URL: 'https://www.ajlnutricion.com', NOTIFICATION_EMAIL: 'equipo@x.pe' };
function deps(extra = {}) {
  const correos = [];
  const eventos = [];
  return {
    db: d1DePrueba(), nutricionistas, ahora: () => t0, correos, eventos,
    sendEmail: async (m) => { correos.push(m); return true; },
    google: { listarEventos: async () => [], crearEvento: async (e) => { eventos.push(e); return { id: 'ev1', meet: e.modalidad === 'video' ? 'https://meet/x' : null }; } },
    ...extra,
  };
}
async function conLink(d, tipo = 'c30v', ahora = t0) {
  await agenda.crearLink(d.db, { id: `L-${tipo}`, tokenHash: await sha256Hex(`tok-${tipo}`), tipo, creadoPor: 'romi@x.pe', ahora });
  return `tok-${tipo}`;
}
const get = (ruta) => new Request(`https://x.test${ruta}`);
const post = (ruta, cuerpo) => new Request(`https://x.test${ruta}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
const datos = { nombres: 'Lucía', apellido_paterno: 'Ramos', apellido_materno: 'Quispe', email: 'lucia@x.pe', whatsapp: '+51987654321',
  fecha_nacimiento: '1992-03-08', acepto: true };
const confirmar = (d, l, o = {}) => handleAgendaConfirmar(post('/api/agenda/confirmar',
  { l, inicio: '2026-10-06T15:30:00Z', modalidad: 'video', dni: '70123456', datos, ...o }), env, d);

test('link: estado, tipo y equipo; token desconocido 404', async () => {
  const d = deps();
  const l = await conLink(d);
  const r = await (await handleAgendaLink(get(`/api/agenda/link?l=${l}`), env, d)).json();
  assert.equal(r.estado, 'sin_usar');
  assert.deepEqual(r.tipo, { id: 'c30v', nombre: 'Control de 30 min', etiqueta: 'Virtual', duracion_min: 30, modalidades: ['video'] });
  assert.equal(r.nutricionistas.length, nutricionistas.length);
  assert.equal((await handleAgendaLink(get('/api/agenda/link?l=nada'), env, d)).status, 404);
});

test('horas: cada 30 min; modalidad fuera del tipo da 400; link vencido 410', async () => {
  const d = deps();
  const l = await conLink(d);
  const r = await (await handleAgendaHoras(get(`/api/agenda/horas?l=${l}&desde=2026-10-06&dias=1&modalidad=video`), env, d)).json();
  assert.ok(r.dias[0].horas.some((h) => h.hora.endsWith(':30')));
  assert.equal((await handleAgendaHoras(get(`/api/agenda/horas?l=${l}&desde=2026-10-06&dias=1&modalidad=presencial`), env, d)).status, 400);
  const tarde = deps({ ahora: () => new Date(t0.getTime() + 8 * 86400000) });
  const l2 = await conLink(tarde, 'c30v', t0);
  assert.equal((await handleAgendaHoras(get(`/api/agenda/horas?l=${l2}&desde=2026-10-14&dias=1&modalidad=video`), env, tarde)).status, 410);
});

test('dni: desconocido → conocido false; conocido → datos enmascarados; formato malo 400', async () => {
  const d = deps();
  const l = await conLink(d);
  assert.deepEqual(await (await handleAgendaDni(post('/api/agenda/dni', { l, dni: '70123456' }), env, d)).json(), { ok: true, conocido: false });
  assert.equal((await handleAgendaDni(post('/api/agenda/dni', { l, dni: '123' }), env, d)).status, 400);
  await confirmar(d, l);
  const l2 = await conLink(d, 's60');
  const r = await (await handleAgendaDni(post('/api/agenda/dni', { l: l2, dni: '70.123.456' }), env, d)).json();
  assert.deepEqual(r, { ok: true, conocido: true, nombre: 'Lucía', email: 'l••••••@x.pe', whatsapp: '+51 ••• ••• 321' });
});

test('dni: más de 10 consultas con el mismo link da 429', async () => {
  const d = deps();
  const l = await conLink(d);
  for (let i = 0; i < 10; i++) await handleAgendaDni(post('/api/agenda/dni', { l, dni: '70123456' }), env, d);
  assert.equal((await handleAgendaDni(post('/api/agenda/dni', { l, dni: '70123456' }), env, d)).status, 429);
});

test('confirmar paciente nuevo: reserva, evento de 30 min con invitación, correo y vista de listo', async () => {
  const d = deps();
  const l = await conLink(d);
  const res = await confirmar(d, l);
  assert.equal(res.status, 200);
  const v = await res.json();
  assert.equal(v.duracion_min, 30);
  assert.equal(v.meet, 'https://meet/x');
  assert.match(v.google_calendar, /^https:\/\/calendar\.google\.com/);
  assert.equal(d.eventos[0].finUtc, '2026-10-06T16:00:00Z');
  assert.match(d.eventos[0].titulo, /^Agenda · Lucía Ramos Quispe · Control de 30 min$/);
  assert.equal(d.eventos[0].invitado.email, 'lucia@x.pe');
  assert.deepEqual(d.correos.map((c) => c.to), ['lucia@x.pe']);
  const link = await (await handleAgendaLink(get(`/api/agenda/link?l=${l}`), env, d)).json();
  assert.equal(link.estado, 'agendado');
  assert.equal(link.cita.nutricionista, 'Jussara');
});

test('confirmar dos veces el mismo link: la segunda 410', async () => {
  const d = deps();
  const l = await conLink(d);
  assert.equal((await confirmar(d, l)).status, 200);
  const r = await confirmar(d, l, { inicio: '2026-10-06T16:30:00Z' });
  assert.equal(r.status, 410);
});

test('confirmar paciente conocido sin datos: usa su ficha; DNI nuevo sin datos da 400', async () => {
  const d = deps();
  await confirmar(d, await conLink(d));
  const l2 = await conLink(d, 's60');
  const r = await confirmar(d, l2, { datos: undefined, inicio: '2026-10-07T15:00:00Z' });
  assert.equal(r.status, 200);
  const l3 = await conLink(d, 'c30p');
  assert.equal((await confirmar(d, l3, { datos: undefined, dni: '99999999', inicio: '2026-10-08T15:00:00Z' })).status, 400);
});

test('confirmar con datos inválidos o sin aceptar: 400 y el link sigue sin usar', async () => {
  const d = deps();
  const l = await conLink(d);
  assert.equal((await confirmar(d, l, { datos: { ...datos, email: 'malo' } })).status, 400);
  assert.equal((await confirmar(d, l, { datos: { ...datos, acepto: false } })).status, 400);
  assert.equal((await (await handleAgendaLink(get(`/api/agenda/link?l=${l}`), env, d)).json()).estado, 'sin_usar');
});

test('confirmar una hora que ya no se ofrece (reserva web encima): 409 y el link sigue', async () => {
  const d = deps();
  await repo.crearRetencion(d.db, { id: 'web', token: 'tw', producto: 'constancia', duracion_meses: 3, monto_centimos: 108000, peso_tope: 1,
    nutricionista_id: 'jussara', inicio_utc: '2026-10-06T15:00:00Z', fecha_lima: '2026-10-06', modalidad: 'video', primerasManuales: 0, tope: 3, ahora: t0 });
  const l = await conLink(d);
  const r = await confirmar(d, l, { nutricionista: 'jussara' });
  assert.equal(r.status, 409);
  assert.equal((await r.json()).motivo, 'ocupada');
});

test('confirmar con inicio que no es :00 ni :30, o modalidad fuera del tipo: 400', async () => {
  const d = deps();
  const l = await conLink(d);
  assert.equal((await confirmar(d, l, { inicio: '2026-10-06T15:15:00Z' })).status, 400);
  assert.equal((await confirmar(d, l, { modalidad: 'presencial' })).status, 400);
});

test('confirmar con Google caído: confirmada con calendario pendiente y alerta al equipo', async () => {
  const d = deps({ google: { listarEventos: async () => [], crearEvento: async () => { throw new Error('caído'); } } });
  const l = await conLink(d);
  assert.equal((await confirmar(d, l)).status, 200);
  const r = await d.db.prepare("SELECT estado, calendario_pendiente FROM reservas WHERE producto = 'link_c30v'").first();
  assert.deepEqual(r, { estado: 'confirmada', calendario_pendiente: 1 });
  assert.ok(d.correos.some((c) => c.to === 'equipo@x.pe'));
});

test('una cita de link de 30 a las 10:00 deja de ofrecerse en la web a las 10:00 con esa nutricionista', async () => {
  const { handleHoras } = await import('./reservas.mjs');
  const d = deps();
  const l = await conLink(d);
  await confirmar(d, l, { inicio: '2026-10-06T15:00:00Z', nutricionista: 'jussara' });
  const r = await (await handleHoras(get('/api/reservas/horas?desde=2026-10-06&dias=1&modalidad=video&producto=constancia&duracion=3&nutricionista=jussara'), env, d)).json();
  assert.ok(!r.dias[0].horas.some((h) => h.hora === '10:00'));
});
```

(La asignación a Jussara del primer test de confirmar sale del motor: el martes 6 a las 10:30 por video solo atiende Jussara. Si el equipo cambia en `src/data/nutricionistas.js`, ajustar el nombre esperado.)

- [ ] **Step 2: Correr y ver que fallan**

Run: `node --test server/handlers/agenda.test.mjs server/reservas/correos.test.mjs`
Expected: FAIL (no existen `agenda.mjs` ni `correoCitaAgenda`).

- [ ] **Step 3: Implementar**

En `server/reservas/correos.mjs`, sacar el cálculo de `donde` de `correoConfirmacion` a un ayudante y agregar el correo nuevo:

```js
const dondeCita = (modalidad, direccion, meet) => (modalidad === 'video'
  ? (meet ? `Por videollamada: <a href="${esc(meet)}">${esc(meet)}</a>` : 'Por videollamada: el enlace llega en la invitación de Google Calendar.')
  : `En nuestro consultorio: ${esc(direccion)}`);
```

En `correoConfirmacion`, reemplazar el `const donde = ...` por `const donde = dondeCita(modalidad, direccion, meet);`. Al final del archivo:

```js
export function correoCitaAgenda({ nombre, titulo, etiqueta, duracion, modalidad, direccion, meet, nutricionista, urlIcs }) {
  return {
    subject: `Tu cita: ${etiqueta} · AJL Nutrición`,
    html: marco(`
      <h2 style="font-family:Georgia,serif;color:#173C2C">Listo, ${esc(nombre)}. Tu cita está agendada.</h2>
      <p><strong>${esc(etiqueta)}</strong> · ${Number(duracion)} min · con ${esc(nutricionista)}</p>
      <p>${dondeCita(modalidad, direccion, meet)}</p>
      <p>${esc(titulo)}</p>
      ${boton(urlIcs, 'Agregar a mi calendario')}
      <p>Si necesitas mover tu cita, escríbenos por WhatsApp.</p>`),
  };
}
```

En `server/handlers/reservas.mjs`: cambiar `async function contexto(` por `export async function contexto(`; importar `import { tipoDeReserva } from '../agenda/tipos.mjs';` y en `eventoDe`:

```js
function eventoDe(r) {
  const tipo = tipoDeReserva(r);
  const precio = tipo ? null : cotizar(r.producto, r.duracion_meses);
  return {
    titulo: `Tu ${tipo ? 'cita' : 'sesión'} en AJL Nutrición · ${tipo ? tipo.nombre : (precio?.titulo ?? '')}`,
    inicioUtc: r.inicio_utc,
    finUtc: finDeReserva(r),
    ubicacion: r.modalidad === 'presencial' ? contacto.direccion : (r.meet_url || 'Videollamada (enlace en tu invitación)'),
    descripcion: 'Si necesitas mover tu cita, escríbenos por WhatsApp: +51 919 151 237.',
  };
}
```

y exportarla (`export function eventoDe`) para usarla en la vista de agenda.

`server/agenda/finalizar.mjs`:

```js
// Después de agendar con un link: evento en el calendario del equipo con el
// paciente invitado (así le llega a su calendario) y correo de confirmación.
// Si Google falla, la cita igual queda: se marca pendiente y se avisa al equipo.
import * as repo from '../reservas/repo.mjs';
import { etiquetaLima, finDeReserva } from '../reservas/tiempo.mjs';
import { correoCitaAgenda, correoEquipoAlerta } from '../reservas/correos.mjs';
import { tipoDeReserva } from './tipos.mjs';
import { siteUrl } from '../http.mjs';
import { contacto } from '../../src/data/contacto.js';

const remitente = (env) => env.NEWSLETTER_FROM || 'AJL Nutrición <hola@ajlnutricion.com>';

export async function finalizarAgenda(deps, env, r) {
  const tipo = tipoDeReserva(r);
  const n = deps.nutricionistas.find((x) => x.id === r.nutricionista_id);
  let meet = null;
  try {
    const ev = await deps.google.crearEvento({
      reservaId: r.id,
      titulo: `Agenda · ${r.nombre} · ${tipo.nombre}`,
      descripcion: `WhatsApp: ${r.whatsapp}\nCorreo: ${r.email}\nNutricionista: ${n.nombre}\nAgendado con link de un solo uso (${r.id}).`,
      inicioUtc: r.inicio_utc,
      finUtc: finDeReserva(r),
      modalidad: r.modalidad,
      direccion: contacto.direccion,
      invitado: { email: r.email, nombre: r.nombre },
    });
    meet = ev.meet;
    await repo.guardarEvento(deps.db, r.id, ev.id, meet, deps.ahora());
  } catch (e) {
    console.error('agenda/crearEvento', e);
    await repo.marcarCalendarioPendiente(deps.db, r.id, deps.ahora());
    await deps.sendEmail({ from: remitente(env), to: env.NOTIFICATION_EMAIL, ...correoEquipoAlerta({ asunto: 'Cita de link sin calendario',
      detalle: `${r.nombre} (${r.whatsapp}) agendó ${tipo.nombre} para ${etiquetaLima(r.inicio_utc)} con ${n.nombre}, pero no se pudo crear el evento. Créalo a mano e invita a ${r.email}.` }) });
  }
  await deps.sendEmail({
    from: remitente(env), to: r.email,
    ...correoCitaAgenda({ nombre: r.nombres || r.nombre, titulo: tipo.nombre, etiqueta: etiquetaLima(r.inicio_utc), duracion: tipo.duracion_min,
      modalidad: r.modalidad, direccion: contacto.direccion, meet, nutricionista: n.nombre,
      urlIcs: `${siteUrl(env)}/api/reservas/ics?r=${r.token}` }),
  });
  return { meet };
}
```

`server/handlers/agenda.mjs`:

```js
// ─── API de los links de agenda (paciente) · AJL Nutrición ──────────────────
// GET  /api/agenda/link       estado del link y tipo de cita
// GET  /api/agenda/horas      horas libres para ese tipo (cada 30 min)
// POST /api/agenda/dni        ¿ya es paciente? (datos enmascarados)
// POST /api/agenda/confirmar  agenda la cita y usa el link
// El token del link es la única llave: se busca por su hash.
import { json, readJson, siteUrl } from '../http.mjs';
import { randomToken, sha256Hex } from '../tokens.mjs';
import { TIPOS_LINK, MAX_CONSULTAS_DNI, PASO_LINK_MIN } from '../agenda/tipos.mjs';
import * as agenda from '../agenda/repo.mjs';
import { enmascararCorreo, enmascararTelefono } from '../agenda/mascaras.mjs';
import { finalizarAgenda } from '../agenda/finalizar.mjs';
import * as repo from '../reservas/repo.mjs';
import { horasLibres } from '../reservas/disponibilidad.mjs';
import { sumarDias, fechaLima, etiquetaLima, sumarMinutos } from '../reservas/tiempo.mjs';
import { TOPE_PRIMERAS, DESDE_DIAS, HASTA_DIAS } from '../reservas/constantes.mjs';
import { contexto, eventoDe } from './reservas.mjs';
import { enlaceGoogleCalendar } from '../reservas/ics.mjs';
import { validarDatos, hoyEnLima } from '../../src/data/validar-datos.js';
import { CONDICIONES_VERSION } from '../../src/data/condiciones.js';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const INICIO = /^\d{4}-\d{2}-\d{2}T\d{2}:(00|30):00Z$/;
const bad = (status, error, extra = {}) => json(status, { ok: false, error, ...extra });
const MSJ_NO_EXISTE = 'Este link no existe. Escríbenos por WhatsApp y te mandamos uno nuevo.';
const MSJ_NO_VIGENTE = 'Este link ya se usó o venció. Escríbenos por WhatsApp y lo reactivamos.';
const MSJ_OCUPADA = 'Esa hora acaba de ocuparse. Elige otra.';
const dniLimpio = (s) => String(s ?? '').replace(/[\s.-]+/g, '');

async function cargar(deps, token) {
  if (typeof token !== 'string' || !token || token.length > 100) return null;
  return agenda.linkPorHash(deps.db, await sha256Hex(token));
}

const tipoPublico = (id) => ({ id, ...TIPOS_LINK[id] });
const nutriValida = (deps, id) => !id || deps.nutricionistas.some((n) => n.id === id);

function libres(deps, ctx, tipo, { fecha, modalidad, filtro }) {
  return horasLibres({ fecha, modalidad, peso: 0, nutricionistas: deps.nutricionistas, eventos: ctx.eventos, reservas: ctx.reservas,
    ahora: deps.ahora(), filtroNutricionista: filtro || null, tope: TOPE_PRIMERAS, desdeDias: DESDE_DIAS, hastaDias: HASTA_DIAS,
    duracionMin: tipo.duracion_min, pasoMin: PASO_LINK_MIN });
}

export async function handleAgendaLink(request, env, deps) {
  if (request.method !== 'GET') return bad(405, 'Método no permitido');
  const l = await cargar(deps, new URL(request.url).searchParams.get('l'));
  if (!l) return bad(404, MSJ_NO_EXISTE);
  const estado = agenda.estadoLink(l, deps.ahora());
  const cuerpo = { ok: true, estado, tipo: tipoPublico(l.tipo), nutricionistas: deps.nutricionistas.map(({ id, nombre, foto }) => ({ id, nombre, foto })) };
  if (estado === 'agendado') {
    cuerpo.cita = { etiqueta: etiquetaLima(l.inicio_utc), modalidad: l.modalidad,
      nutricionista: deps.nutricionistas.find((n) => n.id === l.nutricionista_id)?.nombre ?? 'el equipo' };
  }
  return json(200, cuerpo);
}

export async function handleAgendaHoras(request, env, deps) {
  if (request.method !== 'GET') return bad(405, 'Método no permitido');
  const q = new URL(request.url).searchParams;
  const l = await cargar(deps, q.get('l'));
  if (!l) return bad(404, MSJ_NO_EXISTE);
  if (agenda.estadoLink(l, deps.ahora()) !== 'sin_usar') return bad(410, MSJ_NO_VIGENTE, { motivo: 'link' });
  const tipo = TIPOS_LINK[l.tipo];
  const desde = q.get('desde') || '';
  const modalidad = q.get('modalidad');
  const filtro = q.get('nutricionista') || '';
  const n = q.has('dias') ? Number(q.get('dias')) : 7;
  if (!FECHA.test(desde) || !tipo.modalidades.includes(modalidad) || !nutriValida(deps, filtro)
    || !Number.isInteger(n) || n < 1 || n > 28) return bad(400, 'Parámetros inválidos');
  try {
    const ctx = await contexto(deps, desde, n);
    const dias = [];
    for (let i = 0; i < n; i++) {
      const fecha = sumarDias(desde, i);
      dias.push({ fecha, horas: libres(deps, ctx, tipo, { fecha, modalidad, filtro }) });
    }
    return json(200, { ok: true, dias, nutricionistas: deps.nutricionistas.map(({ id, nombre, foto }) => ({ id, nombre, foto })) });
  } catch (e) {
    console.error('agenda/horas', e);
    return bad(503, 'No pudimos consultar la agenda. Intenta en un momento.');
  }
}

export async function handleAgendaDni(request, env, deps) {
  if (request.method !== 'POST') return bad(405, 'Método no permitido');
  const d = await readJson(request);
  const l = await cargar(deps, d.l);
  if (!l) return bad(404, MSJ_NO_EXISTE);
  if (agenda.estadoLink(l, deps.ahora()) !== 'sin_usar') return bad(410, MSJ_NO_VIGENTE, { motivo: 'link' });
  const dni = dniLimpio(d.dni);
  if (!/^\d{8}$/.test(dni)) return bad(400, 'Escribe tu DNI (8 dígitos).');
  if (!(await agenda.contarConsultaDni(deps.db, l.id, MAX_CONSULTAS_DNI))) {
    return bad(429, 'Demasiados intentos con este link. Escríbenos por WhatsApp.');
  }
  const p = await agenda.pacientePorDni(deps.db, dni);
  if (!p) return json(200, { ok: true, conocido: false });
  return json(200, { ok: true, conocido: true, nombre: p.nombres || p.nombre.split(' ')[0],
    email: enmascararCorreo(p.email), whatsapp: enmascararTelefono(p.whatsapp) });
}

export async function handleAgendaConfirmar(request, env, deps) {
  if (request.method !== 'POST') return bad(405, 'Método no permitido');
  const d = await readJson(request);
  const l = await cargar(deps, d.l);
  if (!l) return bad(404, MSJ_NO_EXISTE);
  const ahora = deps.ahora();
  if (agenda.estadoLink(l, ahora) !== 'sin_usar') return bad(410, MSJ_NO_VIGENTE, { motivo: 'link' });
  const tipo = TIPOS_LINK[l.tipo];
  if (!INICIO.test(d.inicio || '') || !tipo.modalidades.includes(d.modalidad) || !nutriValida(deps, d.nutricionista)) return bad(400, 'Datos inválidos');
  const dni = dniLimpio(d.dni);
  if (!/^\d{8}$/.test(dni)) return bad(400, 'Escribe tu DNI (8 dígitos).');

  const previo = await agenda.pacientePorDni(deps.db, dni);
  let cliente = null;
  let clienteId = previo?.id ?? null;
  if (d.datos && typeof d.datos === 'object') {
    const v = validarDatos({ ...d.datos, tipo_documento: 'dni', documento: dni }, hoyEnLima(ahora));
    if (!v.ok) return bad(400, v.error);
    cliente = v.cliente;
    clienteId = crypto.randomUUID();
  } else if (!previo) {
    return bad(400, 'Completa tus datos.', { motivo: 'datos' });
  }

  const fecha = fechaLima(new Date(d.inicio));
  try {
    const ctx = await contexto(deps, fecha, 1);
    const hora = libres(deps, ctx, tipo, { fecha, modalidad: d.modalidad, filtro: d.nutricionista }).find((h) => h.inicio === d.inicio);
    if (!hora) return bad(409, MSJ_OCUPADA, { motivo: 'ocupada' });
    const reservaId = crypto.randomUUID();
    const res = await agenda.agendarConLink(deps.db, {
      link: l.id, reservaId, token: randomToken(), tipoId: l.tipo, cliente, clienteId,
      hora: { inicio: hora.inicio, fin: sumarMinutos(hora.inicio, tipo.duracion_min), nutricionista_id: hora.nutricionista_id,
        modalidad: d.modalidad, fecha_lima: fecha, duracion_min: tipo.duracion_min },
      pacienteNuevo: !previo, condicionesVersion: cliente ? CONDICIONES_VERSION : null, ahora,
    });
    if (!res.ok) return res.motivo === 'link' ? bad(410, MSJ_NO_VIGENTE, { motivo: 'link' }) : bad(409, MSJ_OCUPADA, { motivo: 'ocupada' });
    const r = await repo.reservaPorId(deps.db, reservaId);
    const { meet } = await finalizarAgenda(deps, env, r);
    const n = deps.nutricionistas.find((x) => x.id === r.nutricionista_id);
    return json(200, {
      ok: true, etiqueta: etiquetaLima(r.inicio_utc), modalidad: r.modalidad, nutricionista: n?.nombre ?? 'el equipo', duracion_min: tipo.duracion_min,
      titulo: tipo.nombre, meet, google_calendar: enlaceGoogleCalendar(eventoDe(r)), ics: `${siteUrl(env)}/api/reservas/ics?r=${r.token}`,
    });
  } catch (e) {
    console.error('agenda/confirmar', e);
    return bad(503, 'No pudimos agendar tu cita. Intenta en un momento.');
  }
}
```

Las cuatro rutas, cada una con este molde (cambiando el nombre del handler):

`functions/api/agenda/link.js`:

```js
import { handleAgendaLink } from '../../../server/handlers/agenda.mjs';
import { makeReservasDeps } from '../../../server/reservas/deps.mjs';

export const onRequest = (ctx) => handleAgendaLink(ctx.request, ctx.env, makeReservasDeps(ctx.env, ctx));
```

`functions/api/agenda/horas.js` → `handleAgendaHoras`; `functions/api/agenda/dni.js` → `handleAgendaDni`; `functions/api/agenda/confirmar.js` → `handleAgendaConfirmar`.

- [ ] **Step 4: Correr y ver que pasan**

Run: `npm test`
Expected: PASS (incluidas las de `reservas.test.mjs`: el ics de la web sigue diciendo «Tu sesión en AJL Nutrición · …»).

- [ ] **Step 5: Commit**

```bash
git add server/handlers/agenda.mjs server/handlers/agenda.test.mjs server/agenda/finalizar.mjs server/reservas/correos.mjs \
  server/reservas/correos.test.mjs server/handlers/reservas.mjs functions/api/agenda
git commit -m "agenda: API del paciente (link, horas, DNI y confirmar)"
```

---

### Task 4: API del panel (links y agendados)

**Files:**
- Create: `server/agenda/periodo.mjs`, `server/agenda/periodo.test.mjs`, `server/handlers/equipo-links.mjs`, `server/handlers/equipo-links.test.mjs`, `functions/api/equipo/links.js`, `functions/api/equipo/links-reactivar.js`, `functions/api/equipo/agendados.js`, `functions/api/equipo/agendados-csv.js`
- Modify: `server/handlers/equipo.mjs` (excluir citas de link de «Pagaron»; exportar `celda`, `comoTexto`, `lima`), `server/handlers/equipo.test.mjs`

**Interfaces:**
- Consumes: `deps.acceso(request, env) → { ok, email }` (`server/equipo/deps.mjs`); Task 1 y 2.
- Produces:
  - `rangoPeriodo({ periodo, desde, hasta }, ahora, sentido: 'pasado'|'futuro'): { desde: string|null, hasta: string|null } | null` (`null` = parámetros inválidos).
  - `POST /api/equipo/links { tipo }` → `{ ok, id, url, vence_en, tipo }`.
  - `GET /api/equipo/links?estado=todos|sin_usar|agendado|vencido&q&periodo=30|mes|mes_anterior|rango|todo&desde&hasta&pagina` → `{ ok, filas: [{ id, tipo, nombre_tipo, etiqueta_tipo, estado, creado_en, vence_en, reactivado_en, paciente, cita }], conteos: { todos, sin_usar, agendado, vencido }, total, pagina, por_pagina: 20 }`.
  - `POST /api/equipo/links-reactivar { id }` → `{ ok, vence_en }` · 409.
  - `GET /api/equipo/agendados?tramo=proximas|pasadas&q&periodo&desde&hasta&pagina` → `{ ok, filas: [{ id, inicio_utc, etiqueta, tipo, modalidad, nutricionista, apellido_paterno, apellido_materno, nombres, dni, email, whatsapp, fecha_nacimiento, paciente_nuevo }], total, pagina, por_pagina: 20 }`.
  - `GET /api/equipo/agendados-csv?ids=a,b` → CSV (hasta 500 ids).

- [ ] **Step 1: Pruebas que fallan**

`server/agenda/periodo.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rangoPeriodo } from './periodo.mjs';

const ahora = new Date('2026-10-12T20:00:00Z'); // lunes 12, 15:00 en Lima

test('30 días: hacia atrás para links y pasadas, hacia adelante para próximas', () => {
  assert.deepEqual(rangoPeriodo({ periodo: '30' }, ahora, 'pasado'), { desde: '2026-09-12T20:00:00.000Z', hasta: null });
  assert.deepEqual(rangoPeriodo({}, ahora, 'futuro'), { desde: null, hasta: '2026-11-11T20:00:00.000Z' });
});

test('este mes y mes anterior en hora de Lima; todo sin límites', () => {
  assert.deepEqual(rangoPeriodo({ periodo: 'mes' }, ahora, 'pasado'), { desde: '2026-10-01T05:00:00Z', hasta: '2026-11-01T05:00:00Z' });
  assert.deepEqual(rangoPeriodo({ periodo: 'mes_anterior' }, ahora, 'pasado'), { desde: '2026-09-01T05:00:00Z', hasta: '2026-10-01T05:00:00Z' });
  assert.deepEqual(rangoPeriodo({ periodo: 'todo' }, ahora, 'pasado'), { desde: null, hasta: null });
});

test('rango de fechas inclusivo; inválido da null', () => {
  assert.deepEqual(rangoPeriodo({ periodo: 'rango', desde: '2026-10-01', hasta: '2026-10-05' }, ahora, 'pasado'),
    { desde: '2026-10-01T05:00:00Z', hasta: '2026-10-06T05:00:00Z' });
  assert.equal(rangoPeriodo({ periodo: 'rango', desde: '2026-10-05', hasta: '2026-10-01' }, ahora, 'pasado'), null);
  assert.equal(rangoPeriodo({ periodo: 'otro' }, ahora, 'pasado'), null);
});
```

`server/handlers/equipo-links.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1DePrueba } from '../reservas/d1-prueba.mjs';
import { nutricionistas } from '../../src/data/nutricionistas.js';
import * as agenda from '../agenda/repo.mjs';
import { handleLinks, handleLinksReactivar, handleAgendados, handleAgendadosCsv } from './equipo-links.mjs';

const t0 = new Date('2026-10-12T20:00:00Z');
const env = { PUBLIC_SITE_URL: 'https://www.ajlnutricion.com' };
const dentro = async () => ({ ok: true, email: 'romi@x.pe' });
const fuera = async () => ({ ok: false });
const deps = (o = {}) => ({ db: d1DePrueba(), ahora: () => t0, nutricionistas, acceso: dentro, ...o });
const get = (ruta) => new Request(`https://x.test${ruta}`);
const post = (ruta, cuerpo) => new Request(`https://x.test${ruta}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
const lucia = { nombre: 'Lucía Ramos Quispe', nombres: 'Lucía', apellido_paterno: 'Ramos', apellido_materno: 'Quispe', fecha_nacimiento: '1992-03-08',
  tipo_documento: 'dni', dni: '70123456', whatsapp: '+51987654321', email: 'lucia@x.pe' };

async function sembrar(d) {
  const crear = (id, creado) => agenda.crearLink(d.db, { id, tokenHash: `h-${id}`, tipo: 'c30v', creadoPor: 'romi@x.pe', ahora: new Date(creado) });
  await crear('sin', '2026-10-12T14:00:00Z');
  await crear('venc', '2026-10-01T14:00:00Z');
  await crear('viejo', '2026-08-01T14:00:00Z');
  await crear('usado', '2026-10-10T14:00:00Z');
  await agenda.agendarConLink(d.db, { link: 'usado', reservaId: 'r-lucia', token: 'tl', tipoId: 'c30v', cliente: lucia, clienteId: 'c-lucia',
    hora: { inicio: '2026-10-14T15:00:00Z', fin: '2026-10-14T15:30:00Z', nutricionista_id: 'nico', modalidad: 'video', fecha_lima: '2026-10-14', duracion_min: 30 },
    pacienteNuevo: true, condicionesVersion: 'v', ahora: new Date('2026-10-10T15:00:00Z') });
}

test('sin acceso: 401 en todo', async () => {
  const d = deps({ acceso: fuera });
  for (const r of [await handleLinks(get('/api/equipo/links'), env, d), await handleLinks(post('/api/equipo/links', { tipo: 'c30v' }), env, d),
    await handleLinksReactivar(post('/api/equipo/links-reactivar', { id: 'x' }), env, d), await handleAgendados(get('/api/equipo/agendados'), env, d),
    await handleAgendadosCsv(get('/api/equipo/agendados-csv?ids=x'), env, d)]) assert.equal(r.status, 401);
});

test('crear: devuelve la URL una sola vez; en la base solo queda el hash', async () => {
  const d = deps();
  const r = await (await handleLinks(post('/api/equipo/links', { tipo: 's60' }), env, d)).json();
  assert.match(r.url, /^https:\/\/www\.ajlnutricion\.com\/agenda\/\?l=[\w-]{20,}$/);
  const token = new URL(r.url).searchParams.get('l');
  const fila = await d.db.prepare('SELECT * FROM links_agenda').first();
  assert.notEqual(fila.token_hash, token);
  assert.equal(fila.creado_por, 'romi@x.pe');
  assert.equal((await handleLinks(post('/api/equipo/links', { tipo: 'zzz' }), env, d)).status, 400);
});

test('listar: por defecto 30 días (el vencido viejo no sale), con conteos por estado y datos del agendado', async () => {
  const d = deps();
  await sembrar(d);
  const r = await (await handleLinks(get('/api/equipo/links'), env, d)).json();
  assert.deepEqual(r.filas.map((f) => [f.id, f.estado]), [['sin', 'sin_usar'], ['usado', 'agendado'], ['venc', 'vencido']]);
  assert.deepEqual(r.conteos, { todos: 3, sin_usar: 1, agendado: 1, vencido: 1 });
  assert.equal(r.filas[1].paciente, 'Ramos Quispe, Lucía');
  const todo = await (await handleLinks(get('/api/equipo/links?periodo=todo&estado=vencido'), env, d)).json();
  assert.deepEqual(todo.filas.map((f) => f.id), ['venc', 'viejo']);
});

test('listar: buscar por apellido o DNI', async () => {
  const d = deps();
  await sembrar(d);
  for (const q of ['ramos', '7012']) {
    const r = await (await handleLinks(get(`/api/equipo/links?q=${q}`), env, d)).json();
    assert.deepEqual(r.filas.map((f) => f.id), ['usado'], q);
  }
});

test('reactivar: el vencido vuelve a «sin usar» y aparece en los 30 días; uno vigente da 409', async () => {
  const d = deps();
  await sembrar(d);
  const r = await (await handleLinksReactivar(post('/api/equipo/links-reactivar', { id: 'viejo' }), env, d)).json();
  assert.equal(r.vence_en, '2026-10-15T20:00:00.000Z');
  const lista = await (await handleLinks(get('/api/equipo/links?estado=sin_usar'), env, d)).json();
  assert.deepEqual(lista.filas.map((f) => f.id).sort(), ['sin', 'viejo']);
  assert.equal((await handleLinksReactivar(post('/api/equipo/links-reactivar', { id: 'sin' }), env, d)).status, 409);
});

test('agendados: próximas con datos completos; pasadas vacío; paginación de 20', async () => {
  const d = deps();
  await sembrar(d);
  const r = await (await handleAgendados(get('/api/equipo/agendados'), env, d)).json();
  assert.equal(r.total, 1);
  const f = r.filas[0];
  assert.deepEqual([f.apellido_paterno, f.nombres, f.dni, f.email, f.whatsapp, f.fecha_nacimiento, f.paciente_nuevo, f.tipo, f.nutricionista, f.modalidad],
    ['Ramos', 'Lucía', '70123456', 'lucia@x.pe', '+51987654321', '1992-03-08', 1, 'Control de 30 min', 'Nico', 'video']);
  assert.equal((await (await handleAgendados(get('/api/equipo/agendados?tramo=pasadas'), env, d)).json()).total, 0);
  assert.equal(r.por_pagina, 20);
});

test('csv: solo los ids pedidos, con columnas en el orden del formulario y DNI como texto', async () => {
  const d = deps();
  await sembrar(d);
  const res = await handleAgendadosCsv(get('/api/equipo/agendados-csv?ids=r-lucia,otro'), env, d);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('Content-Disposition'), /agendados-ajl-2026-10-12\.csv/);
  const texto = await res.text();
  const lineas = texto.replace(/^﻿/, '').trim().split('\r\n');
  assert.equal(lineas[0], 'sep=,');
  assert.equal(lineas[1], 'Cita (Lima),Evento,Modalidad,Nutricionista,Apellido paterno,Apellido materno,Nombres,DNI,Correo,WhatsApp,Fecha de nacimiento,Paciente');
  assert.equal(lineas.length, 3);
  assert.match(lineas[2], /Ramos,Quispe,Lucía,\t70123456,lucia@x\.pe,\t51987654321,1992-03-08,Nuevo$/);
  assert.equal((await handleAgendadosCsv(get('/api/equipo/agendados-csv?ids='), env, d)).status, 400);
});
```

En `server/handlers/equipo.test.mjs`, agregar:

```js
test('equipo: las citas agendadas con link no aparecen en «Pagaron»', async () => {
  const db = await base();
  await db.prepare("UPDATE reservas SET link_id = 'L1' WHERE id = 'pagada'").run();
  const deps = { db, ahora, nutricionistas, acceso: dentro };
  const d = await (await handleEquipoReservas(get('/api/equipo/reservas'), {}, deps)).json();
  assert.deepEqual(d.pagadas, []);
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `node --test server/agenda/periodo.test.mjs server/handlers/equipo-links.test.mjs server/handlers/equipo.test.mjs`
Expected: FAIL (módulos nuevos no existen; la cita de link sigue saliendo en «Pagaron»).

- [ ] **Step 3: Implementar**

`server/agenda/periodo.mjs`:

```js
// Periodos de los filtros del panel, en hora de Lima. Devuelve límites ISO en
// UTC (null = sin límite) o null si los parámetros no sirven.
import { fechaLima, inicioUtc, sumarDias } from '../reservas/tiempo.mjs';

const DIA = 86400000;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const primeroDelMes = (fecha) => `${fecha.slice(0, 7)}-01`;
const mesSiguiente = (primero) => {
  const [a, m] = primero.split('-').map(Number);
  return m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, '0')}-01`;
};
const mesAnterior = (primero) => {
  const [a, m] = primero.split('-').map(Number);
  return m === 1 ? `${a - 1}-12-01` : `${a}-${String(m - 1).padStart(2, '0')}-01`;
};

export function rangoPeriodo({ periodo = '30', desde, hasta } = {}, ahora, sentido) {
  const hoy = fechaLima(ahora);
  switch (periodo) {
    case '30':
      return sentido === 'futuro'
        ? { desde: null, hasta: new Date(ahora.getTime() + 30 * DIA).toISOString() }
        : { desde: new Date(ahora.getTime() - 30 * DIA).toISOString(), hasta: null };
    case 'mes': {
      const p = primeroDelMes(hoy);
      return { desde: inicioUtc(p, 0), hasta: inicioUtc(mesSiguiente(p), 0) };
    }
    case 'mes_anterior': {
      const p = mesAnterior(primeroDelMes(hoy));
      return { desde: inicioUtc(p, 0), hasta: inicioUtc(mesSiguiente(p), 0) };
    }
    case 'rango':
      if (!FECHA.test(desde || '') || !FECHA.test(hasta || '') || desde > hasta) return null;
      return { desde: inicioUtc(desde, 0), hasta: inicioUtc(sumarDias(hasta, 1), 0) };
    case 'todo':
      return { desde: null, hasta: null };
    default:
      return null;
  }
}
```

En `server/handlers/equipo.mjs`:
- En la consulta de `pagadas` de `listar`, cambiar `WHERE r.estado IN ('confirmada', 'pagada_sin_hora')` por `WHERE r.estado IN ('confirmada', 'pagada_sin_hora') AND r.link_id IS NULL`.
- Cambiar `const celda =`, `const comoTexto =` y `const lima =` por `export const ...`.

`server/handlers/equipo-links.mjs`:

```js
// ─── Panel del equipo · links de agenda ─────────────────────────────────────
// GET  /api/equipo/links             links con filtro, búsqueda, periodo y páginas
// POST /api/equipo/links             crea un link (la URL solo se ve aquí)
// POST /api/equipo/links-reactivar   +3 días a un link vencido sin usar
// GET  /api/equipo/agendados         citas agendadas con link, con datos del paciente
// GET  /api/equipo/agendados-csv     las elegidas, en CSV para Google Sheets o Excel
// Todas exigen sesión del equipo antes de leer nada.
import { json, readJson, siteUrl } from '../http.mjs';
import { randomToken, sha256Hex } from '../tokens.mjs';
import { TIPOS_LINK } from '../agenda/tipos.mjs';
import * as agenda from '../agenda/repo.mjs';
import { rangoPeriodo } from '../agenda/periodo.mjs';
import { etiquetaLima, fechaLima } from '../reservas/tiempo.mjs';
import { celda, comoTexto, lima } from './equipo.mjs';

const POR_PAGINA = 20;
const ESTADOS = ['sin_usar', 'agendado', 'vencido'];
const sinAcceso = () => json(401, { ok: false, error: 'Necesitas entrar con un correo autorizado del equipo.' });
const bad = (status, error) => json(status, { ok: false, error });

function busqueda(q) {
  const s = String(q || '').trim().toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`);
  return s.length >= 2 ? `%${s}%` : '';
}
const pagina = (p) => Math.max(1, Math.min(1000, Number.parseInt(p, 10) || 1));
const nombreCompleto = (r) => (r.nombres ? `${[r.apellido_paterno, r.apellido_materno].filter(Boolean).join(' ')}, ${r.nombres}` : null);
const filtroTexto = `(?3 = '' OR lower(COALESCE(c.nombre, '') || ' ' || COALESCE(c.dni, '')) LIKE ?3 ESCAPE '\\')`;

const BASE_LINKS = `SELECT l.id, l.tipo, l.creado_en, l.vence_en, l.reactivado_en, l.usado_en,
    CASE WHEN l.usado_en IS NOT NULL THEN 'agendado' WHEN l.vence_en <= ?4 THEN 'vencido' ELSE 'sin_usar' END AS estado,
    COALESCE(l.reactivado_en, l.creado_en) AS actividad,
    r.inicio_utc, r.modalidad, r.nutricionista_id, c.nombres, c.apellido_paterno, c.apellido_materno, c.dni
  FROM links_agenda l LEFT JOIN reservas r ON r.id = l.reserva_id LEFT JOIN clientes c ON c.id = r.cliente_id
  WHERE (?1 IS NULL OR COALESCE(l.reactivado_en, l.creado_en) >= ?1) AND (?2 IS NULL OR COALESCE(l.reactivado_en, l.creado_en) < ?2)
    AND ${filtroTexto}`;

async function listarLinks(request, deps) {
  const q = new URL(request.url).searchParams;
  const rango = rangoPeriodo({ periodo: q.get('periodo') || '30', desde: q.get('desde'), hasta: q.get('hasta') }, deps.ahora(), 'pasado');
  const estado = q.get('estado') || 'todos';
  if (!rango || (estado !== 'todos' && !ESTADOS.includes(estado))) return bad(400, 'Filtros inválidos');
  const p = pagina(q.get('pagina'));
  const args = [rango.desde, rango.hasta, busqueda(q.get('q')), deps.ahora().toISOString()];
  const { results: grupos } = await deps.db.prepare(`SELECT estado, COUNT(*) AS n FROM (${BASE_LINKS}) GROUP BY estado`).bind(...args).all();
  const conteos = { todos: 0, sin_usar: 0, agendado: 0, vencido: 0 };
  for (const g of grupos) { conteos[g.estado] = g.n; conteos.todos += g.n; }
  const { results } = await deps.db.prepare(
    `SELECT * FROM (${BASE_LINKS}) WHERE (?5 = 'todos' OR estado = ?5) ORDER BY actividad DESC LIMIT ${POR_PAGINA} OFFSET ?6`,
  ).bind(...args, estado, (p - 1) * POR_PAGINA).all();
  const filas = results.map((r) => ({
    id: r.id, tipo: r.tipo, nombre_tipo: TIPOS_LINK[r.tipo].nombre, etiqueta_tipo: TIPOS_LINK[r.tipo].etiqueta, estado: r.estado,
    creado_en: r.creado_en, vence_en: r.vence_en, reactivado_en: r.reactivado_en, paciente: nombreCompleto(r),
    cita: r.inicio_utc ? etiquetaLima(r.inicio_utc) : null,
  }));
  return json(200, { ok: true, filas, conteos, total: estado === 'todos' ? conteos.todos : conteos[estado], pagina: p, por_pagina: POR_PAGINA });
}

async function crearLink(request, env, deps, email) {
  const d = await readJson(request);
  if (!Object.hasOwn(TIPOS_LINK, d.tipo)) return bad(400, 'Tipo de evento inválido');
  const token = randomToken();
  const id = crypto.randomUUID();
  const { vence_en } = await agenda.crearLink(deps.db, { id, tokenHash: await sha256Hex(token), tipo: d.tipo, creadoPor: email, ahora: deps.ahora() });
  return json(200, { ok: true, id, tipo: d.tipo, vence_en, url: `${siteUrl(env)}/agenda/?l=${token}` });
}

export async function handleLinks(request, env, deps) {
  if (!['GET', 'POST'].includes(request.method)) return bad(405, 'Método no permitido');
  const acceso = await deps.acceso(request, env);
  if (!acceso.ok) return sinAcceso();
  return request.method === 'POST' ? crearLink(request, env, deps, acceso.email) : listarLinks(request, deps);
}

export async function handleLinksReactivar(request, env, deps) {
  if (request.method !== 'POST') return bad(405, 'Método no permitido');
  const acceso = await deps.acceso(request, env);
  if (!acceso.ok) return sinAcceso();
  const d = await readJson(request);
  if (typeof d.id !== 'string') return bad(400, 'Datos inválidos');
  const vence = await agenda.reactivarLink(deps.db, d.id, deps.ahora());
  if (!vence) return bad(409, 'Este link no se puede reactivar: está vigente o ya se usó.');
  return json(200, { ok: true, vence_en: vence });
}

const CAMPOS_AGENDADO = `r.id, r.producto, r.inicio_utc, r.modalidad, r.nutricionista_id, l.paciente_nuevo,
  c.apellido_paterno, c.apellido_materno, c.nombres, c.dni, c.email, c.whatsapp, c.fecha_nacimiento
  FROM reservas r JOIN links_agenda l ON l.reserva_id = r.id JOIN clientes c ON c.id = r.cliente_id
  WHERE r.estado = 'confirmada'`;

const vistaAgendado = (r, deps) => ({
  id: r.id, inicio_utc: r.inicio_utc, etiqueta: etiquetaLima(r.inicio_utc), tipo: TIPOS_LINK[r.producto.slice(5)]?.nombre ?? r.producto,
  modalidad: r.modalidad, nutricionista: deps.nutricionistas.find((n) => n.id === r.nutricionista_id)?.nombre ?? r.nutricionista_id,
  apellido_paterno: r.apellido_paterno, apellido_materno: r.apellido_materno, nombres: r.nombres, dni: r.dni, email: r.email,
  whatsapp: r.whatsapp, fecha_nacimiento: r.fecha_nacimiento, paciente_nuevo: r.paciente_nuevo,
});

export async function handleAgendados(request, env, deps) {
  if (request.method !== 'GET') return bad(405, 'Método no permitido');
  const acceso = await deps.acceso(request, env);
  if (!acceso.ok) return sinAcceso();
  const q = new URL(request.url).searchParams;
  const tramo = q.get('tramo') || 'proximas';
  if (!['proximas', 'pasadas'].includes(tramo)) return bad(400, 'Filtros inválidos');
  const ahoraIso = deps.ahora().toISOString();
  const rango = rangoPeriodo({ periodo: q.get('periodo') || '30', desde: q.get('desde'), hasta: q.get('hasta') }, deps.ahora(),
    tramo === 'proximas' ? 'futuro' : 'pasado');
  if (!rango) return bad(400, 'Filtros inválidos');
  const p = pagina(q.get('pagina'));
  const donde = `${CAMPOS_AGENDADO}
    AND (?1 IS NULL OR r.inicio_utc >= ?1) AND (?2 IS NULL OR r.inicio_utc < ?2) AND ${filtroTexto}
    AND ${tramo === 'proximas' ? 'r.inicio_utc >= ?4' : 'r.inicio_utc < ?4'}`;
  const args = [rango.desde, rango.hasta, busqueda(q.get('q')), ahoraIso];
  const { n } = await deps.db.prepare(`SELECT COUNT(*) AS n ${donde.slice(donde.indexOf('FROM'))}`).bind(...args).first();
  const { results } = await deps.db.prepare(
    `SELECT ${donde} ORDER BY r.inicio_utc ${tramo === 'proximas' ? 'ASC' : 'DESC'} LIMIT ${POR_PAGINA} OFFSET ?5`,
  ).bind(...args, (p - 1) * POR_PAGINA).all();
  return json(200, { ok: true, filas: results.map((r) => vistaAgendado(r, deps)), total: n, pagina: p, por_pagina: POR_PAGINA });
}

export async function handleAgendadosCsv(request, env, deps) {
  if (request.method !== 'GET') return bad(405, 'Método no permitido');
  const acceso = await deps.acceso(request, env);
  if (!acceso.ok) return sinAcceso();
  const ids = String(new URL(request.url).searchParams.get('ids') || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!ids.length || ids.length > 500) return bad(400, 'Elige entre 1 y 500 citas.');
  const marcas = ids.map((_, i) => `?${i + 1}`).join(', ');
  const { results } = await deps.db.prepare(`SELECT ${CAMPOS_AGENDADO} AND r.id IN (${marcas}) ORDER BY r.inicio_utc`).bind(...ids).all();
  const cab = ['Cita (Lima)', 'Evento', 'Modalidad', 'Nutricionista', 'Apellido paterno', 'Apellido materno', 'Nombres', 'DNI', 'Correo',
    'WhatsApp', 'Fecha de nacimiento', 'Paciente'];
  const filas = results.map((r) => {
    const v = vistaAgendado(r, deps);
    return [lima(v.inicio_utc), v.tipo, v.modalidad === 'video' ? 'Videollamada' : 'Presencial', v.nutricionista, v.apellido_paterno,
      v.apellido_materno, v.nombres, comoTexto(v.dni), v.email, comoTexto(v.whatsapp), v.fecha_nacimiento,
      v.paciente_nuevo ? 'Nuevo' : 'Ya paciente'].map(celda).join(',');
  });
  const csv = ['sep=,', cab.map(celda).join(','), ...filas].join('\r\n');
  return new Response(`﻿${csv}\r\n`, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="agendados-ajl-${fechaLima(deps.ahora())}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
```

Rutas (`makeEquipoDeps` como en `functions/api/equipo/reservas.js`):

```js
// functions/api/equipo/links.js
import { handleLinks } from '../../../server/handlers/equipo-links.mjs';
import { makeEquipoDeps } from '../../../server/equipo/deps.mjs';

export const onRequest = (ctx) => handleLinks(ctx.request, ctx.env, makeEquipoDeps(ctx.env));
```

`links-reactivar.js` → `handleLinksReactivar`; `agendados.js` → `handleAgendados`; `agendados-csv.js` → `handleAgendadosCsv`.

- [ ] **Step 4: Correr y ver que pasan**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/agenda/periodo.mjs server/agenda/periodo.test.mjs server/handlers/equipo-links.mjs server/handlers/equipo-links.test.mjs \
  server/handlers/equipo.mjs server/handlers/equipo.test.mjs functions/api/equipo/links.js functions/api/equipo/links-reactivar.js \
  functions/api/equipo/agendados.js functions/api/equipo/agendados-csv.js
git commit -m "agenda: API del panel (crear, listar, reactivar, agendados y CSV)"
```

---

### Task 5: Página del paciente `/agenda/`

**Files:**
- Modify: `src/scripts/selector-horas.js` (fuente de horas y modalidades configurables, horas con minutos)
- Create: `src/pages/agenda/index.astro`, `src/scripts/agenda.js`

**Interfaces:**
- Consumes: API de la Task 3.
- Produces: `montarSelector(raiz, { producto?, duracion?, onElegir, urlHoras?: (params: URLSearchParams) => string, modalidades?: ('presencial'|'video')[] })`. Sin `urlHoras` ni `modalidades`, se comporta igual que hoy.

No hay pruebas automáticas de navegador en este repo: la verificación es manual (Step 4) y en la Task 7.

- [ ] **Step 1: Selector configurable**

En `src/scripts/selector-horas.js`:

Reemplazar `hora12` por:

```js
const hora12 = (h) => { const [hh, mm = '00'] = String(h).split(':'); const n = parseInt(hh, 10); return `${n % 12 || 12}:${mm} ${n >= 12 ? 'p. m.' : 'a. m.'}`; };
const NOMBRE_MODALIDAD = { presencial: 'En Lince', video: 'Por videollamada' };
```

Cambiar la firma y el estado inicial:

```js
export function montarSelector(raiz, { producto, duracion, onElegir, urlHoras, modalidades = ['presencial', 'video'] }) {
  const manana = sumarDias(hoyLima(), 1);
  const limite = sumarDias(manana, DIAS_VENTANA - 1);
  const meses = [...new Set([manana.slice(0, 7), limite.slice(0, 7)])];
  const estado = { modalidad: modalidades[0], nutricionista: '', mes: meses[0], fecha: null, datos: null };
```

En el `raiz.innerHTML`, reemplazar el bloque `<div class="sel-modalidad" ...>…</div>` por:

```js
      <div class="sel-modalidad" role="group" aria-label="Modalidad"${modalidades.length < 2 ? ' hidden' : ''}>
        ${modalidades.map((m) => `<button type="button" data-modalidad="${m}">${NOMBRE_MODALIDAD[m]}</button>`).join('')}
      </div>
```

En `cargar()`, reemplazar las dos líneas que arman `p` y el `fetch` por:

```js
    const p = new URLSearchParams({ desde: manana, dias: String(DIAS_VENTANA), modalidad: estado.modalidad });
    if (producto) { p.set('producto', producto); p.set('duracion', String(duracion)); }
    if (estado.nutricionista) p.set('nutricionista', estado.nutricionista);
    try {
      const r = await fetch(urlHoras ? urlHoras(p) : `/api/reservas/horas?${p}`);
```

- [ ] **Step 2: Página**

`src/pages/agenda/index.astro`:

```astro
---
// Página del link de agenda (/agenda/?l=TOKEN): pacientes que ya pagaron eligen
// su hora. Sin el Layout del sitio: el token va en la URL y aquí se escriben
// datos personales, así que no se carga analítica.
import '../../styles/reservar.css';
const DIAS = Array.from({ length: 31 }, (_, i) => i + 1);
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const ANIO = new Date().getFullYear();
const ANIOS = Array.from({ length: 91 }, (_, i) => ANIO - 10 - i);
---
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <meta name="referrer" content="no-referrer">
  <title>Agenda tu cita · AJL Nutrición</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800&display=swap">
  <style is:global>body { margin: 0; } [hidden] { display: none !important; }</style>
</head>
<body>
  <main class="rs">
    <section class="rs-paso" data-paso="cargando"><p class="rs-lead">Cargando tu link…</p></section>

    <section class="rs-paso" data-paso="horario" hidden>
      <p class="rs-k" id="a-tipo"></p>
      <h1>Agenda tu cita</h1>
      <p class="rs-lead">Tu cita ya está pagada. Solo elige día y hora.</p>
      <div id="a-selector"></div>
      <p class="rs-error" id="a-error-horario" role="alert"></p>
    </section>

    <section class="rs-paso" data-paso="dni" hidden>
      <button type="button" class="rs-volver" data-volver="horario">‹ Cambiar hora</button>
      <div class="rs-resumen" data-resumen></div>
      <h1>¿Cuál es tu DNI?</h1>
      <p class="rs-lead">Si ya eres paciente, no tienes que llenar nada más.</p>
      <form id="a-form-dni" novalidate>
        <label for="a-dni">Número de DNI</label>
        <input type="text" id="a-dni" inputmode="numeric" maxlength="10" autocomplete="off" placeholder="8 dígitos" required>
        <button type="submit" class="rs-btn">Continuar</button>
        <p class="rs-error" id="a-error-dni" role="alert"></p>
      </form>
    </section>

    <section class="rs-paso" data-paso="conocido" hidden>
      <button type="button" class="rs-volver" data-volver="dni">‹ Volver</button>
      <h1 id="a-hola"></h1>
      <p class="rs-lead">Ya tenemos tus datos. Te avisamos a estos contactos:</p>
      <ul class="rs-lista" id="a-contactos"></ul>
      <div class="rs-resumen" data-resumen></div>
      <button type="button" class="rs-btn" id="a-confirmar-conocido">Confirmar cita</button>
      <button type="button" class="rs-btn rs-btn--ghost" data-ir="datos">Mis datos cambiaron</button>
      <p class="rs-error" id="a-error-conocido" role="alert"></p>
    </section>

    <section class="rs-paso" data-paso="datos" hidden>
      <button type="button" class="rs-volver" data-volver="dni">‹ Volver</button>
      <h1>Tus datos</h1>
      <p class="rs-lead">Los pedimos una sola vez.</p>
      <div class="rs-resumen" data-resumen></div>
      <form id="a-form-datos" novalidate>
        <div class="rs-dos">
          <div><label for="a-paterno">Apellido paterno</label><input type="text" id="a-paterno" autocomplete="family-name" maxlength="60" required></div>
          <div><label for="a-materno">Apellido materno <small>(si tienes)</small></label><input type="text" id="a-materno" maxlength="60"></div>
        </div>
        <label for="a-nombres">Nombres</label>
        <input type="text" id="a-nombres" autocomplete="given-name" maxlength="60" required>
        <label for="a-email">Correo · aquí llega la invitación para tu calendario</label>
        <input type="email" id="a-email" autocomplete="email" required>
        <label for="a-whatsapp">WhatsApp</label>
        <input type="tel" id="a-whatsapp" autocomplete="tel" inputmode="tel" placeholder="+51 9__ ___ ___" required>
        <label for="a-nac-dia" id="a-l-nac">Fecha de nacimiento</label>
        <div class="rs-fecha" role="group" aria-labelledby="a-l-nac">
          <select id="a-nac-dia" aria-label="Día" required><option value="">Día</option>{DIAS.map((d) => <option value={String(d).padStart(2, '0')}>{d}</option>)}</select>
          <select id="a-nac-mes" aria-label="Mes" required><option value="">Mes</option>{MESES.map((m, i) => <option value={String(i + 1).padStart(2, '0')}>{m}</option>)}</select>
          <select id="a-nac-anio" aria-label="Año" required><option value="">Año</option>{ANIOS.map((a) => <option value={String(a)}>{a}</option>)}</select>
        </div>
        <label class="rs-check"><input type="checkbox" id="a-acepto" required> <span>Acepto las <a href="/condiciones/" target="_blank" rel="noopener">condiciones del servicio</a> y he leído la <a href="/privacidad/" target="_blank" rel="noopener">política de privacidad</a>.</span></label>
        <button type="submit" class="rs-btn">Confirmar cita</button>
        <p class="rs-error" id="a-error-datos" role="alert"></p>
      </form>
    </section>

    <section class="rs-paso" data-paso="listo" hidden>
      <h1>Tu cita está agendada</h1>
      <p class="rs-lead">Te mandamos la invitación a tu correo. Ya está también en nuestro calendario.</p>
      <div class="rs-resumen" id="a-listo"></div>
      <a class="rs-btn" id="a-gcal" target="_blank" rel="noopener">Agregar a Google Calendar</a>
      <a class="rs-btn rs-btn--ghost" id="a-ics">Otro calendario (.ics)</a>
      <p class="rs-nota">¿Necesitas cambiar la hora? Escríbenos por WhatsApp.</p>
    </section>

    <section class="rs-paso" data-paso="fin" hidden>
      <h1 id="a-fin-t"></h1>
      <p class="rs-lead" id="a-fin-d"></p>
      <a class="rs-btn rs-btn--wa" href="https://wa.me/51919151237" target="_blank" rel="noopener">Escribir por WhatsApp</a>
    </section>
  </main>
  <script>
    import '../../scripts/agenda.js';
  </script>
</body>
</html>
```

- [ ] **Step 3: Controlador**

`src/scripts/agenda.js`:

```js
// Controlador de /agenda/?l=TOKEN: horario → DNI → (ya paciente: confirmar |
// nuevo: datos) → listo. Las horas, el DNI y la cita los decide el servidor.
import { montarSelector } from './selector-horas.js';
import { validarDatos, hoyEnLima } from '../data/validar-datos.js';

const $ = (s) => document.querySelector(s);
const token = new URLSearchParams(location.search).get('l') || '';
const estado = { link: null, hora: null, dni: null, selector: null };
const MOD = { presencial: 'En Lince', video: 'Por videollamada' };

function irA(paso) {
  document.querySelectorAll('.rs-paso').forEach((s) => { s.hidden = s.dataset.paso !== paso; });
  window.scrollTo(0, 0);
}

function fin(titulo, detalle) {
  $('#a-fin-t').textContent = titulo;
  $('#a-fin-d').textContent = detalle;
  irA('fin');
}

function pintarResumen() {
  const h = estado.hora;
  const t = estado.link.tipo;
  document.querySelectorAll('[data-resumen]').forEach((el) => {
    el.replaceChildren();
    const b = document.createElement('b');
    b.textContent = h.etiqueta;
    const s = document.createElement('span');
    s.textContent = `${t.nombre} · ${MOD[h.modalidad]} · con ${h.nutricionistaNombre}`;
    el.append(b, document.createElement('br'), s);
  });
}

const fmt = new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' });
const etiqueta = (iso) => { const s = fmt.format(new Date(iso)); return s.charAt(0).toUpperCase() + s.slice(1); };

async function api(ruta, cuerpo) {
  const r = await fetch(ruta, cuerpo ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) } : undefined);
  let d = {};
  try { d = await r.json(); } catch {}
  return { status: r.status, d };
}

function linkNoVigente() {
  fin('Este link ya no sirve', 'Ya se usó o venció. Escríbenos por WhatsApp y lo reactivamos.');
}

async function confirmar(datos, errorSel) {
  const btns = document.querySelectorAll('.rs-btn');
  btns.forEach((b) => { b.disabled = true; });
  const h = estado.hora;
  const { status, d } = await api('/api/agenda/confirmar', { l: token, inicio: h.inicio, modalidad: h.modalidad, nutricionista: h.nutricionista, dni: estado.dni, datos });
  btns.forEach((b) => { b.disabled = false; });
  if (status === 200) {
    $('#a-listo').textContent = `${d.etiqueta} · ${d.titulo} · ${MOD[d.modalidad]} · con ${d.nutricionista}`;
    $('#a-gcal').href = d.google_calendar;
    $('#a-ics').href = d.ics;
    irA('listo');
  } else if (status === 409) {
    $('#a-error-horario').textContent = d.error || 'Esa hora acaba de ocuparse. Elige otra.';
    irA('horario');
    estado.selector.recargar();
  } else if (status === 410) {
    linkNoVigente();
  } else if (d.motivo === 'datos') {
    irA('datos');
  } else {
    $(errorSel).textContent = d.error || 'No pudimos agendar tu cita. Intenta en un momento.';
  }
}

$('#a-form-dni').addEventListener('submit', async (e) => {
  e.preventDefault();
  const dni = $('#a-dni').value.replace(/[\s.-]+/g, '');
  if (!/^\d{8}$/.test(dni)) { $('#a-error-dni').textContent = 'Escribe tu DNI (8 dígitos).'; return; }
  $('#a-error-dni').textContent = '';
  const { status, d } = await api('/api/agenda/dni', { l: token, dni });
  if (status === 410) return linkNoVigente();
  if (status !== 200) { $('#a-error-dni').textContent = d.error || 'No pudimos revisar tu DNI. Intenta de nuevo.'; return; }
  estado.dni = dni;
  if (!d.conocido) return irA('datos');
  $('#a-hola').textContent = `Hola, ${d.nombre}`;
  const lista = $('#a-contactos');
  lista.replaceChildren(...[d.email, d.whatsapp].map((t) => { const li = document.createElement('li'); li.textContent = t; return li; }));
  irA('conocido');
});

$('#a-confirmar-conocido').addEventListener('click', () => confirmar(undefined, '#a-error-conocido'));

$('#a-form-datos').addEventListener('submit', (e) => {
  e.preventDefault();
  let whatsapp = $('#a-whatsapp').value.replace(/[^\d+]/g, '');
  if (/^9\d{8}$/.test(whatsapp)) whatsapp = `+51${whatsapp}`;
  const datos = {
    apellido_paterno: $('#a-paterno').value, apellido_materno: $('#a-materno').value, nombres: $('#a-nombres').value,
    email: $('#a-email').value, whatsapp,
    fecha_nacimiento: `${$('#a-nac-anio').value}-${$('#a-nac-mes').value}-${$('#a-nac-dia').value}`,
    acepto: $('#a-acepto').checked,
  };
  const v = validarDatos({ ...datos, tipo_documento: 'dni', documento: estado.dni }, hoyEnLima(new Date()));
  if (!v.ok) { $('#a-error-datos').textContent = v.error; return; }
  $('#a-error-datos').textContent = '';
  confirmar(datos, '#a-error-datos');
});

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-volver], [data-ir]');
  if (b) irA(b.dataset.volver || b.dataset.ir);
});

async function iniciar() {
  if (!token) return fin('Falta el link', 'Abre el link completo que te mandamos por WhatsApp.');
  const { status, d } = await api(`/api/agenda/link?l=${encodeURIComponent(token)}`);
  if (status === 404) return fin('Este link no existe', d.error || 'Escríbenos por WhatsApp y te mandamos uno nuevo.');
  if (status !== 200) return fin('No pudimos abrir tu link', 'Intenta de nuevo en un momento.');
  estado.link = d;
  if (d.estado === 'agendado') return fin('Este link ya se usó', `Con él se agendó tu cita: ${d.cita.etiqueta}, ${MOD[d.cita.modalidad]}, con ${d.cita.nutricionista}. Si necesitas cambiarla, escríbenos.`);
  if (d.estado === 'vencido') return fin('Este link venció', 'Escríbenos por WhatsApp y lo reactivamos.');
  $('#a-tipo').textContent = `${d.tipo.nombre} · ${d.tipo.etiqueta}`;
  estado.selector = montarSelector($('#a-selector'), {
    modalidades: d.tipo.modalidades,
    urlHoras: (p) => { p.set('l', token); return `/api/agenda/horas?${p}`; },
    onElegir: (h) => {
      estado.hora = { ...h, etiqueta: etiqueta(h.inicio) };
      $('#a-error-horario').textContent = '';
      pintarResumen();
      irA('dni');
    },
  });
  irA('horario');
}

iniciar();
```

- [ ] **Step 4: Probar a mano en local**

Run: `npm run build && npx wrangler pages dev dist --d1 DB=ajl-reservas-preview` (o el comando de desarrollo que ya usa el repo para funciones; si no hay `.dev.vars`, probar directo en preview en la Task 7).
Revisar: `/reservar/` sigue mostrando los botones «En Lince» y «Por videollamada» y horas en punto («10:00 a. m.»); `/agenda/?l=...` con un link creado a mano muestra horas con «:30» y sin el selector de modalidad para `c30v`.

- [ ] **Step 5: Commit**

```bash
git add src/scripts/selector-horas.js src/pages/agenda/index.astro src/scripts/agenda.js
git commit -m "agenda: página del paciente /agenda/ (horario, DNI, datos y listo)"
```

---

### Task 6: Panel `/panel/links/`

**Files:**
- Create: `src/pages/panel/links.astro`, `src/scripts/panel-links.js`
- Modify: `src/pages/panel/index.astro` (enlace «Links de agenda» junto al título)

**Interfaces:**
- Consumes: API de la Task 4; login del panel (`/api/equipo/codigo`, `/entrar`, `/salir`).

- [ ] **Step 1: Enlace desde el panel actual**

En `src/pages/panel/index.astro`, dentro de `<div class="eq-cab">`, después del `<div>` del título, agregar:

```html
      <a class="eq-salir" href="/panel/links/">Links de agenda ›</a>
```

- [ ] **Step 2: Página**

`src/pages/panel/links.astro` (mismo `<head>` y estilos que `src/pages/panel/index.astro`, más los de abajo):

```astro
---
// Panel del equipo · links de agenda. Sin el Layout del sitio (no carga
// analítica). Los datos los da /api/equipo/links* y /agenda*, que exigen acceso.
import { TIPOS_LINK } from '../../../server/agenda/tipos.mjs';
const tipos = Object.entries(TIPOS_LINK);
---
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>Links de agenda · AJL Nutrición</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800&display=swap">
  <style is:global>
    [hidden] { display: none !important; }
    :root { --ink: #111111; --muted: #6B6B6B; --hair: #E4E4E4; --gold: #C9A24B; --gold-ink: #9C7A2B; --gold-pale: #F8F3E6; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Montserrat, Arial, sans-serif; color: var(--ink); background: #F6F4EF; }
    .lk { max-width: 1120px; margin: 0 auto; padding: 24px 16px 64px; display: flex; flex-direction: column; gap: 32px; }
    .lk-cab { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
    h1 { margin: 0; font-size: 1.6rem; font-weight: 800; } h2 { margin: 0 0 12px; font-size: 1.2rem; }
    .lk-quien, .lk-nota { color: var(--muted); font-size: .85rem; }
    .lk-tarjetas { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }
    .lk-tarjeta { background: #fff; border: 1px solid var(--hair); border-radius: 14px; padding: 20px; display: flex; flex-direction: column; gap: 12px; }
    .lk-chip { display: inline-block; font-size: .75rem; font-weight: 700; padding: 4px 10px; border-radius: 999px; background: var(--gold-pale); color: #5A4512; margin-right: 6px; }
    .lk-btn { min-height: 44px; border: 0; border-radius: 10px; background: var(--gold); color: var(--ink); font: inherit; font-weight: 700; padding: 0 16px; cursor: pointer; }
    .lk-btn--borde { background: #fff; border: 1px solid var(--ink); }
    .lk-btn--wa { background: #1F7A4D; color: #fff; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; }
    .lk-btn:disabled { opacity: .5; cursor: not-allowed; }
    .lk-url { width: 100%; min-height: 44px; border: 1px solid #CFCFCF; border-radius: 10px; padding: 0 12px; font: inherit; }
    .lk-dos { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .lk-barra { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 12px; }
    .lk-barra input[type=search], .lk-barra select, .lk-barra input[type=date] { min-height: 44px; border: 1px solid #CFCFCF; border-radius: 10px; padding: 0 12px; font: inherit; background: #fff; }
    .lk-barra input[type=search] { flex: 1 1 240px; }
    .lk-grupo { display: flex; gap: 4px; padding: 4px; background: #EAE6DC; border-radius: 12px; flex-wrap: wrap; }
    .lk-grupo button { min-height: 40px; border: 0; border-radius: 9px; background: transparent; font: inherit; font-size: .85rem; font-weight: 700; padding: 0 12px; cursor: pointer; }
    .lk-grupo button[aria-pressed=true] { background: var(--ink); color: #fff; }
    .lk-scroll { overflow-x: auto; background: #fff; border: 1px solid var(--hair); border-radius: 14px; }
    table { width: 100%; border-collapse: collapse; font-size: .85rem; }
    th { text-align: left; font-size: .72rem; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); padding: 12px; white-space: nowrap; }
    td { border-top: 1px solid var(--hair); padding: 12px; vertical-align: top; }
    tr[data-sel=true] td { background: var(--gold-pale); }
    .lk-estado { font-size: .75rem; font-weight: 700; padding: 3px 9px; border-radius: 999px; white-space: nowrap; }
    .lk-estado--agendado { background: #E3F1E8; color: #145C38; } .lk-estado--sin_usar { background: #F3EBD8; color: #5A4512; } .lk-estado--vencido { background: #EDEDED; color: #4A4A4A; }
    .lk-pie { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 10px; font-size: .85rem; color: var(--muted); }
    .lk-check { display: flex; align-items: center; gap: 8px; min-height: 44px; cursor: pointer; }
    .lk-login { max-width: 380px; display: flex; flex-direction: column; gap: 10px; }
    .lk-login input { border: 1px solid #CFCFCF; border-radius: 10px; padding: 12px; font: inherit; }
    .lk-enlace { background: none; border: 0; color: var(--gold-ink); font: inherit; font-weight: 600; cursor: pointer; padding: 0; text-decoration: underline; }
  </style>
</head>
<body>
  <main class="lk">
    <div class="lk-cab">
      <div><h1>Links de agenda</h1><span class="lk-quien" id="quien"></span> <button type="button" class="lk-enlace" id="salir" hidden>Salir</button></div>
      <a class="lk-enlace" href="/panel/">‹ Reservas de la web</a>
    </div>

    <form class="lk-login" id="login" hidden>
      <p id="login-msg">Escribe tu correo del equipo y te mandamos un código.</p>
      <input type="email" id="login-email" autocomplete="email" placeholder="tucorreo@gmail.com" required>
      <input type="text" id="login-codigo" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="Código de 6 dígitos" hidden>
      <button type="submit" class="lk-btn" id="login-btn">Enviar código</button>
    </form>

    <div id="app" hidden>
      <section>
        <h2>Agendar a un paciente que ya pagó</h2>
        <p class="lk-nota">Crea un link, mándalo por WhatsApp y el paciente elige su hora. Sirve una sola vez y vence a los 7 días si no se usa.</p>
        <div class="lk-tarjetas">
          {tipos.map(([id, t]) => (
            <article class="lk-tarjeta" data-tipo={id}>
              <div><span class="lk-chip">{t.duracion_min === 60 ? '1 hora' : `${t.duracion_min} min`}</span><span class="lk-chip">{t.etiqueta}</span></div>
              <b>{t.nombre}</b>
              <button type="button" class="lk-btn" data-crear={id}>Crear link de un solo uso</button>
              <div data-creado hidden>
                <label class="lk-nota">Link nuevo · sirve una vez · vence en 7 días<input class="lk-url" readonly></label>
                <div class="lk-dos"><button type="button" class="lk-btn lk-btn--borde" data-copiar>Copiar</button><a class="lk-btn lk-btn--wa" data-wa target="_blank" rel="noopener">Enviar por WhatsApp</a></div>
                <button type="button" class="lk-enlace" data-crear={id}>Crear otro link</button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section>
        <h2>Links creados</h2>
        <div class="lk-barra">
          <input type="search" id="l-q" placeholder="Buscar por nombre, apellido o DNI" aria-label="Buscar links">
          <select id="l-periodo" aria-label="Periodo"><option value="30">Últimos 30 días</option><option value="mes">Este mes</option><option value="mes_anterior">Mes anterior</option><option value="rango">Elegir fechas…</option><option value="todo">Todo</option></select>
          <span id="l-rango" hidden><input type="date" id="l-desde" aria-label="Desde"> <input type="date" id="l-hasta" aria-label="Hasta"></span>
          <div class="lk-grupo" role="group" aria-label="Filtrar por estado" id="l-estados">
            <button type="button" data-estado="todos" aria-pressed="true">Todos <span></span></button>
            <button type="button" data-estado="sin_usar" aria-pressed="false">Sin usar <span></span></button>
            <button type="button" data-estado="agendado" aria-pressed="false">Agendados <span></span></button>
            <button type="button" data-estado="vencido" aria-pressed="false">Vencidos <span></span></button>
          </div>
        </div>
        <div class="lk-scroll"><table><thead><tr><th>Creado</th><th>Evento</th><th>Estado</th><th>Detalle</th></tr></thead><tbody id="l-filas"></tbody></table></div>
        <div class="lk-pie"><span>Los vencidos con más de 30 días se archivan solos. Siguen en «Vencidos» con el periodo «Todo».</span>
          <span><span id="l-pag"></span> <button type="button" class="lk-btn lk-btn--borde" id="l-prev" aria-label="Página anterior">‹</button> <button type="button" class="lk-btn lk-btn--borde" id="l-next" aria-label="Página siguiente">›</button></span></div>
      </section>

      <section>
        <h2>Agendados</h2>
        <div class="lk-barra">
          <div class="lk-grupo" role="group" aria-label="Próximas o pasadas" id="a-tramos">
            <button type="button" data-tramo="proximas" aria-pressed="true">Próximas</button>
            <button type="button" data-tramo="pasadas" aria-pressed="false">Pasadas</button>
          </div>
          <input type="search" id="a-q" placeholder="Buscar por nombre, apellido o DNI" aria-label="Buscar agendados">
          <select id="a-periodo" aria-label="Periodo"><option value="30">30 días</option><option value="mes">Este mes</option><option value="mes_anterior">Mes anterior</option><option value="rango">Elegir fechas…</option><option value="todo">Todo</option></select>
          <span id="a-rango" hidden><input type="date" id="a-desde" aria-label="Desde"> <input type="date" id="a-hasta" aria-label="Hasta"></span>
          <button type="button" class="lk-btn" id="a-descargar" disabled>Elige a quiénes descargar</button>
        </div>
        <div class="lk-scroll"><table><thead><tr>
          <th><label class="lk-check"><input type="checkbox" id="a-todos"> Todos</label></th>
          <th>Cita</th><th>Apellidos</th><th>Nombres</th><th>DNI</th><th>Correo</th><th>WhatsApp</th><th>Nacimiento</th><th>Paciente</th>
        </tr></thead><tbody id="a-filas"></tbody></table></div>
        <div class="lk-pie"><span></span><span><span id="a-pag"></span> <button type="button" class="lk-btn lk-btn--borde" id="a-prev" aria-label="Página anterior">‹</button> <button type="button" class="lk-btn lk-btn--borde" id="a-next" aria-label="Página siguiente">›</button></span></div>
      </section>
    </div>
  </main>
  <script>
    import '../../scripts/panel-links.js';
  </script>
</body>
</html>
```

- [ ] **Step 3: Controlador**

`src/scripts/panel-links.js`:

```js
// Panel /panel/links/: crea links, lista y filtra links y agendados, reactiva y
// descarga CSV. Todo el texto de la base se pinta con textContent.
const $ = (s) => document.querySelector(s);
const lima = (iso) => (iso ? new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)) : '');
const MOD = { presencial: 'Presencial', video: 'Virtual' };
const ESTADO = { sin_usar: 'Sin usar', agendado: 'Agendado', vencido: 'Vencido' };
const est = {
  links: { estado: 'todos', pagina: 1, total: 0 },
  ag: { tramo: 'proximas', pagina: 1, total: 0, filas: [] },
  sel: new Set(),
};

const td = (...partes) => {
  const c = document.createElement('td');
  partes.filter((p) => p != null && p !== '').forEach((p, i) => {
    if (p instanceof Node) c.append(p);
    else { const e = document.createElement(i === 0 ? 'span' : 'small'); e.textContent = p; if (i > 0) e.style.display = 'block'; c.append(e); }
  });
  return c;
};

function periodo(prefijo) {
  const p = new URLSearchParams({ periodo: $(`#${prefijo}-periodo`).value });
  if (p.get('periodo') === 'rango') {
    if (!$(`#${prefijo}-desde`).value || !$(`#${prefijo}-hasta`).value) return null;
    p.set('desde', $(`#${prefijo}-desde`).value); p.set('hasta', $(`#${prefijo}-hasta`).value);
  }
  const q = $(`#${prefijo}-q`).value.trim();
  if (q.length >= 2) p.set('q', q);
  return p;
}

function paginar(prefijo, s) {
  const desde = s.total ? (s.pagina - 1) * 20 + 1 : 0;
  $(`#${prefijo}-pag`).textContent = s.total ? `${desde} a ${Math.min(s.pagina * 20, s.total)} de ${s.total}` : '0 resultados';
  $(`#${prefijo}-prev`).disabled = s.pagina <= 1;
  $(`#${prefijo}-next`).disabled = s.pagina * 20 >= s.total;
}

async function cargarLinks() {
  const p = periodo('l');
  if (!p) return;
  p.set('estado', est.links.estado); p.set('pagina', String(est.links.pagina));
  const r = await fetch(`/api/equipo/links?${p}`, { cache: 'no-store' });
  if (r.status === 401) return mostrarLogin();
  const d = await r.json();
  est.links.total = d.total;
  document.querySelectorAll('#l-estados button').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.estado === est.links.estado));
    b.querySelector('span').textContent = String(d.conteos[b.dataset.estado]);
  });
  $('#l-filas').replaceChildren(...(d.filas.length ? d.filas.map((f) => {
    const tr = document.createElement('tr');
    const chip = document.createElement('span');
    chip.className = `lk-estado lk-estado--${f.estado}`; chip.textContent = ESTADO[f.estado];
    let detalle;
    if (f.estado === 'vencido') {
      detalle = document.createElement('button');
      detalle.type = 'button'; detalle.className = 'lk-btn lk-btn--borde'; detalle.textContent = 'Reactivar 3 días más';
      detalle.addEventListener('click', () => reactivar(f.id, detalle));
    } else if (f.estado === 'agendado') {
      detalle = `${f.paciente ?? ''} · ${f.cita}`;
    } else {
      detalle = `Esperando al paciente · vence el ${lima(f.vence_en)}`;
    }
    tr.append(td(lima(f.reactivado_en || f.creado_en)), td(`${f.nombre_tipo} · ${f.etiqueta_tipo}`), td(chip), td(detalle));
    return tr;
  }) : [Object.assign(document.createElement('tr'), { innerHTML: '<td colspan="4">No hay links con este filtro.</td>' })]));
  paginar('l', est.links);
}

async function reactivar(id, b) {
  b.disabled = true;
  const r = await fetch('/api/equipo/links-reactivar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
  if (!r.ok) { b.disabled = false; alert('No se pudo reactivar. Recarga la página.'); return; }
  cargarLinks();
}

async function cargarAgendados() {
  const p = periodo('a');
  if (!p) return;
  p.set('tramo', est.ag.tramo); p.set('pagina', String(est.ag.pagina));
  const r = await fetch(`/api/equipo/agendados?${p}`, { cache: 'no-store' });
  if (r.status === 401) return mostrarLogin();
  const d = await r.json();
  est.ag.total = d.total; est.ag.filas = d.filas;
  document.querySelectorAll('#a-tramos button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tramo === est.ag.tramo)));
  pintarAgendados();
  paginar('a', est.ag);
}

function pintarAgendados() {
  const filas = est.ag.filas;
  $('#a-filas').replaceChildren(...(filas.length ? filas.map((f) => {
    const tr = document.createElement('tr');
    tr.dataset.sel = String(est.sel.has(f.id));
    const caja = document.createElement('input');
    caja.type = 'checkbox'; caja.checked = est.sel.has(f.id);
    caja.setAttribute('aria-label', `Seleccionar a ${f.nombres} ${f.apellido_paterno}`);
    caja.addEventListener('change', () => { caja.checked ? est.sel.add(f.id) : est.sel.delete(f.id); pintarAgendados(); });
    const etq = document.createElement('label'); etq.className = 'lk-check'; etq.append(caja);
    tr.append(td(etq), td(f.etiqueta, `${f.tipo} · ${MOD[f.modalidad]} · ${f.nutricionista}`),
      td([f.apellido_paterno, f.apellido_materno].filter(Boolean).join(' ')), td(f.nombres), td(f.dni), td(f.email), td(f.whatsapp),
      td(f.fecha_nacimiento ? f.fecha_nacimiento.split('-').reverse().join('/') : ''), td(f.paciente_nuevo ? 'Nuevo' : 'Ya paciente'));
    return tr;
  }) : [Object.assign(document.createElement('tr'), { innerHTML: '<td colspan="9">No hay citas con este filtro.</td>' })]));
  $('#a-todos').checked = filas.length > 0 && filas.every((f) => est.sel.has(f.id));
  const n = est.sel.size;
  $('#a-descargar').disabled = n === 0;
  $('#a-descargar').textContent = n ? `Descargar ${n} para Google Sheets (.csv)` : 'Elige a quiénes descargar';
}

async function crear(tipo, tarjeta) {
  const btns = tarjeta.querySelectorAll('[data-crear]');
  btns.forEach((b) => { b.disabled = true; });
  const r = await fetch('/api/equipo/links', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo }) });
  btns.forEach((b) => { b.disabled = false; });
  if (r.status === 401) return mostrarLogin();
  if (!r.ok) { alert('No se pudo crear el link. Intenta de nuevo.'); return; }
  const d = await r.json();
  tarjeta.querySelector('.lk-url').value = d.url;
  tarjeta.querySelector('[data-wa]').href = `https://wa.me/?text=${encodeURIComponent(`Agenda tu cita en AJL Nutrición aquí (sirve una sola vez): ${d.url}`)}`;
  tarjeta.querySelector('[data-crear]').hidden = true;
  tarjeta.querySelector('[data-creado]').hidden = false;
  cargarLinks();
}

function mostrarLogin() {
  $('#login').hidden = false; $('#app').hidden = true; $('#salir').hidden = true; $('#quien').textContent = '';
}

async function iniciar() {
  const r = await fetch('/api/equipo/links?pagina=1', { cache: 'no-store' });
  if (r.status === 401) return mostrarLogin();
  $('#login').hidden = true; $('#app').hidden = false; $('#salir').hidden = false;
  const yo = await fetch('/api/equipo/reservas', { cache: 'no-store' }).then((x) => x.json()).catch(() => ({}));
  if (yo.email) $('#quien').textContent = `Entraste como ${yo.email}`;
  cargarLinks();
  cargarAgendados();
}

// Login: el mismo flujo de /panel/ (código por correo, sesión en cookie).
let pasoCodigo = false;
$('#login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('#login-email').value;
  const btn = $('#login-btn');
  btn.disabled = true;
  if (!pasoCodigo) {
    await fetch('/api/equipo/codigo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
    pasoCodigo = true;
    $('#login-msg').textContent = 'Si tu correo está autorizado, te llegó un código. Escríbelo aquí (vence en 10 minutos).';
    $('#login-codigo').hidden = false; $('#login-codigo').focus();
    btn.textContent = 'Entrar';
  } else {
    const r = await fetch('/api/equipo/entrar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, codigo: $('#login-codigo').value }) });
    if (r.ok) iniciar(); else $('#login-msg').textContent = 'El código no es válido o ya venció. Recarga la página para pedir otro.';
  }
  btn.disabled = false;
});
$('#salir').addEventListener('click', async () => { await fetch('/api/equipo/salir', { method: 'POST' }); location.reload(); });

document.addEventListener('click', (e) => {
  const b = e.target.closest('button, a');
  if (!b) return;
  if (b.dataset.crear) crear(b.dataset.crear, b.closest('[data-tipo]'));
  else if (b.dataset.copiar !== undefined) { const u = b.closest('[data-tipo]').querySelector('.lk-url'); navigator.clipboard?.writeText(u.value); b.textContent = 'Copiado'; }
  else if (b.dataset.estado) { est.links.estado = b.dataset.estado; est.links.pagina = 1; cargarLinks(); }
  else if (b.dataset.tramo) { est.ag.tramo = b.dataset.tramo; est.ag.pagina = 1; cargarAgendados(); }
  else if (b.id === 'l-prev' || b.id === 'l-next') { est.links.pagina += b.id === 'l-next' ? 1 : -1; cargarLinks(); }
  else if (b.id === 'a-prev' || b.id === 'a-next') { est.ag.pagina += b.id === 'a-next' ? 1 : -1; cargarAgendados(); }
  else if (b.id === 'a-descargar' && est.sel.size) { location.href = `/api/equipo/agendados-csv?ids=${encodeURIComponent([...est.sel].join(','))}`; }
});

$('#a-todos').addEventListener('change', (e) => {
  est.ag.filas.forEach((f) => (e.target.checked ? est.sel.add(f.id) : est.sel.delete(f.id)));
  pintarAgendados();
});

let espera;
for (const [prefijo, cargar, s] of [['l', cargarLinks, est.links], ['a', cargarAgendados, est.ag]]) {
  $(`#${prefijo}-q`).addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(() => { s.pagina = 1; cargar(); }, 300); });
  $(`#${prefijo}-periodo`).addEventListener('change', (e) => { $(`#${prefijo}-rango`).hidden = e.target.value !== 'rango'; s.pagina = 1; cargar(); });
  for (const lado of ['desde', 'hasta']) $(`#${prefijo}-${lado}`).addEventListener('change', () => { s.pagina = 1; cargar(); });
}

iniciar();
```

El servidor pinta el `<tr>` vacío con `innerHTML` de texto fijo (sin datos de la base); todo lo demás va por `textContent`.

- [ ] **Step 3b: Build**

Run: `npm run build`
Expected: sin errores; existen `dist/panel/links/index.html` y `dist/agenda/index.html`.

- [ ] **Step 4: Commit**

```bash
git add src/pages/panel/links.astro src/scripts/panel-links.js src/pages/panel/index.astro
git commit -m "agenda: panel /panel/links/ (crear, filtrar, reactivar, agendados y CSV)"
```

---

### Task 7: Probar en preview y publicar

**Files:**
- Modify: `CHANGELOG.md` (entrada visible: «Links de agenda de un solo uso para pacientes que pagaron por otro medio: panel /panel/links/ y página /agenda/»)
- Modify (memoria privada, fuera del repo): `~/ajl/memoria/notas/panel-equipo-ajl.md` (sección «Links de agenda»: dónde se entra, qué hace cada botón, que la URL del link solo se ve al crearlo).

- [ ] **Step 1: Pruebas y build**

Run: `npm test && npm run build`
Expected: todo en verde.

- [ ] **Step 2: Migración en preview y push**

```bash
npx wrangler d1 migrations apply ajl-reservas-preview --remote
git add CHANGELOG.md && git commit -m "changelog: links de agenda"
git push origin reservas-pago
```

- [ ] **Step 3: Prueba de punta a punta en preview (con Joaquín, celular y computadora)**

En `https://reservas-pago.ajl-landing.pages.dev/panel/links/` (entrar con `ajlnutricion@gmail.com`):
1. Crear un link `c30v`; «Copiar» y «Enviar por WhatsApp» abren el texto con la URL.
2. Abrir la URL en el celular: tipo «Control de 30 min · Virtual», sin selector de modalidad, horas con «:30». Elegir una hora.
3. DNI nuevo → formulario → confirmar. Ver «Tu cita está agendada», el evento de 30 min en el calendario real con Meet y el paciente invitado, y el correo.
4. Abrir otra vez la URL: «Este link ya se usó» con la cita.
5. En el panel: el link pasa a «Agendado» con el nombre; la cita aparece en «Agendados»; marcar la casilla y descargar el CSV; abrirlo en Google Sheets (Archivo › Importar) y ver tildes, DNI y WhatsApp como texto.
6. Crear un link `s60`, poner el mismo DNI: «Hola, <nombre>» con datos enmascarados; confirmar sin llenar nada.
7. En `/reservar/` (preview), buscar la misma nutricionista y día: la hora tomada por el link no aparece.
8. Vencer un link a mano (`npx wrangler d1 execute ajl-reservas-preview --remote --command "UPDATE links_agenda SET vence_en = '2026-01-01T00:00:00Z' WHERE id = '<id>'"`), ver «Vencido» y «Reactivar 3 días más»; tras reactivar, la URL vuelve a funcionar.
9. Borrar a mano los eventos de prueba del calendario real.

- [ ] **Step 4: Publicar (solo con autorización de Joaquín)**

Antes: resolver con Joaquín los dos puntos abiertos del spec (`c30p` y la política de privacidad). Con el sí:

```bash
npx wrangler d1 migrations apply ajl-reservas --remote
git checkout main && git pull && git merge --no-ff reservas-pago -m "Links de agenda de un solo uso" && git push origin main
git checkout reservas-pago
```

Luego `npm run smoke -- https://www.ajlnutricion.com`, entrar a `https://www.ajlnutricion.com/panel/links/` y crear un link real de prueba (vencerlo después a mano).
