# Reserva y pago en la web (V1) · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el paciente elija acompañamiento, duración y primera hora en `www.ajlnutricion.com/reservar/`, pague en Mercado Pago y salga con la cita creada en el Google Calendar del equipo, sin intervención humana.

**Architecture:** Páginas Astro estáticas (`src/pages/reservar/`) con JavaScript propio, y Pages Functions en `functions/api/reservas/` que delegan en módulos puros de `server/reservas/` (disponibilidad, catálogo, repositorio D1, integraciones). La base es Cloudflare D1, y los choques los impide la base misma (índices únicos parciales y un `INSERT … SELECT` condicionado al tope). Mercado Pago Checkout Pro cobra y avisa por webhook firmado. Google Calendar se lee para saber qué está ocupado y se escribe al confirmar, vía OAuth de la cuenta dueña del calendario.

**Tech Stack:** Astro 4, Cloudflare Pages Functions y D1, `node:test` + `node:sqlite` (D1 falso para pruebas), Mercado Pago Checkout Pro (REST), Google Calendar API v3 (REST + OAuth refresh token), Resend.

**Spec:** `docs/superpowers/specs/2026-10-01-reservas-y-pago-design.md`

## Global Constraints

- Todo vive en la rama `reservas-pago` hasta el lanzamiento (Task 11). Push a `main` publica en producción.
- Repo **público**: nunca poner secretos ni IDs privados en archivos versionados. Los secretos van con `npx wrangler pages secret put <NOMBRE> --project-name ajl-landing [--env preview]`, nunca editando la tabla del panel de Cloudflare (eso deja los valores vacíos).
- Zona horaria del negocio: `America/Lima`, UTC−5 fijo. Se guarda en UTC: `inicio_utc` con el formato exacto `YYYY-MM-DDTHH:00:00Z`, el resto con `Date#toISOString()`.
- Tope: **3 primeras sesiones por día** (`TOPE_PRIMERAS = 3`). Peso: plan o sesión única = 1; evaluación = 0,5. Se reserva si `suma + peso ≤ 3`.
- Un solo consultorio: una presencial por hora. Video en paralelo por nutricionista.
- Retención: 15 min al elegir hora; al pagar se extiende a `creado_en + 30 min`.
- Ventana de reserva: desde mañana (`desdeDias = 1`) hasta 21 días (`hastaDias = 21`).
- Pago: solo Mercado Pago Checkout Pro, `installments: 1`, excluye `ticket` y `atm` (PagoEfectivo), sin recargo.
- DNI obligatorio solo si el total supera S/700 (`monto_centimos > 70000`).
- Desviación deliberada del spec: `GOOGLE_CALENDAR_ID` va como **secreto**, no en `wrangler.toml`, porque el repo es público. Además el preview usa **otro** calendario de pruebas y otra base D1.
- Textos de cara al paciente en español peruano con tuteo, sin rayas como inciso; voz de marca Preciso · Real · Liberador.
- Correos de reservas salen de `NEWSLETTER_FROM` (`AJL Nutrición <hola@ajlnutricion.com>`); avisos al equipo a `NOTIFICATION_EMAIL` (`ajlnutricion@gmail.com`).
- Código y política de privacidad dicen lo mismo: la política v1.4 sale en el mismo deploy que el flujo (Task 11).

## Review Focus

1. **Doble venta de la misma hora** por dos pacientes a la vez: solo uno gana y el otro recibe 409 con mensaje claro. (Task 4, prueba «segunda retención presencial a la misma hora».)
2. **Pago aprobado después de vencida la retención**, con la hora ya tomada por otro: no se cobra de nuevo, queda `pagada_sin_hora` y el paciente recibe link para reubicarse. (Task 6, prueba «aprobado tarde con la hora tomada».)
3. **Webhook duplicado, o webhook y regreso del paciente al mismo tiempo:** un solo evento de calendario y un solo par de correos. (Task 6, prueba «procesar dos veces el mismo pago».)
4. **Webhook falsificado** sin firma o con firma inválida: 401 y nada cambia. (Task 7, prueba «webhook con firma inválida».)
5. **Ausencias mal leídas**: «paola no viene» no saca a Paolo, «nico viene» no saca a Nico, «vacas yuyu» saca a Jussara. (Task 3, pruebas de ausencias.)

---

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `db/d1/0001_reservas.sql` | Esquema D1: clientes, reservas, pagos e índices anti-choque |
| `server/reservas/d1-prueba.mjs` | D1 falso sobre `node:sqlite` para pruebas |
| `server/reservas/constantes.mjs` | Tope y ventana de días |
| `server/reservas/tiempo.mjs` | Fechas y horas en Lima |
| `src/data/nutricionistas.js` | Equipo: apodos, ventanas, alternancias |
| `src/data/condiciones.js` | Versión de las condiciones y del texto de novedades |
| `server/reservas/catalogo.mjs` | Precio, peso y DNI por producto y duración |
| `server/reservas/disponibilidad.mjs` | Motor puro de horas libres y asignación |
| `server/reservas/repo.mjs` | Acceso a D1 |
| `server/correo.mjs` | `crearSendEmail(env)` compartido (Resend) |
| `server/reservas/google.mjs` | Google Calendar: token, listar, crear, normalizar |
| `server/reservas/mercadopago.mjs` | Preferencias, pagos y firma del webhook |
| `server/reservas/correos.mjs` | Plantillas de correo con escape de HTML |
| `server/reservas/ics.mjs` | Archivo .ics |
| `server/reservas/confirmar.mjs` | `procesarPago`, `finalizarConfirmacion` |
| `server/reservas/deps.mjs` | Arma las dependencias reales desde `env` |
| `server/handlers/reservas.mjs` | Handlers HTTP |
| `functions/api/reservas/*.js` | Rutas de 3 líneas |
| `src/scripts/selector-horas.js` | Selector P3 compartido |
| `src/scripts/reservar.js` | Controlador P1–P4 |
| `src/pages/reservar/index.astro`, `listo.astro`, `reubicar.astro` | Páginas del flujo |
| `src/pages/condiciones.astro` | Condiciones del servicio |
| `scripts/google-oauth.mjs` | Autorización única de Google |

---

### Task 1: Base de datos D1 y D1 de prueba

**Files:**
- Create: `db/d1/0001_reservas.sql`, `server/reservas/d1-prueba.mjs`, `server/reservas/esquema.test.mjs`
- Modify: `package.json` (añadir `"type": "module"`), `wrangler.toml` (bindings D1), `.gitignore` (nada nuevo; verificar `.wrangler/`)

**Interfaces:**
- Produces: `d1DePrueba(): D1Like` con `prepare(sql).bind(...).first()/all()/run()` y `batch([stmts])` transaccional; tablas `clientes`, `reservas`, `pagos`.

- [ ] **Step 1: Prueba que falla**

`server/reservas/esquema.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1DePrueba } from './d1-prueba.mjs';

const fila = (db, o) => db.prepare(
  `INSERT INTO reservas (id, token, producto, duracion_meses, monto_centimos, peso_tope, nutricionista_id,
     inicio_utc, fecha_lima, modalidad, estado, retencion_hasta, creado_en, actualizado_en)
   VALUES (?1, ?1, 'constancia', 3, 108000, 1, ?2, ?3, '2026-10-06', ?4, ?5, NULL, 'x', 'x')`,
).bind(o.id, o.nutri, o.inicio, o.modalidad, o.estado).run();

test('dos presenciales activas a la misma hora chocan', async () => {
  const db = d1DePrueba();
  await fila(db, { id: 'a', nutri: 'nico', inicio: '2026-10-06T17:00:00Z', modalidad: 'presencial', estado: 'apartada' });
  await assert.rejects(
    fila(db, { id: 'b', nutri: 'jussara', inicio: '2026-10-06T17:00:00Z', modalidad: 'presencial', estado: 'confirmada' }),
    /UNIQUE constraint failed/,
  );
});

test('una expirada no bloquea la hora', async () => {
  const db = d1DePrueba();
  await fila(db, { id: 'a', nutri: 'nico', inicio: '2026-10-06T17:00:00Z', modalidad: 'presencial', estado: 'expirada' });
  await fila(db, { id: 'b', nutri: 'nico', inicio: '2026-10-06T17:00:00Z', modalidad: 'presencial', estado: 'apartada' });
});

test('la misma nutricionista no puede tener dos videos a la vez', async () => {
  const db = d1DePrueba();
  await fila(db, { id: 'a', nutri: 'nico', inicio: '2026-10-09T17:00:00Z', modalidad: 'video', estado: 'confirmada' });
  await assert.rejects(
    fila(db, { id: 'b', nutri: 'nico', inicio: '2026-10-09T17:00:00Z', modalidad: 'video', estado: 'apartada' }),
    /UNIQUE constraint failed/,
  );
  await fila(db, { id: 'c', nutri: 'paolo', inicio: '2026-10-09T17:00:00Z', modalidad: 'video', estado: 'apartada' });
});

test('batch revierte todo si una sentencia falla', async () => {
  const db = d1DePrueba();
  const ok = db.prepare("INSERT INTO clientes (id, creado_en) VALUES ('c1', 'x')");
  const malo = db.prepare("INSERT INTO clientes (id, creado_en) VALUES ('c1', 'x')");
  await assert.rejects(db.batch([ok, malo]));
  assert.equal(await db.prepare('SELECT id FROM clientes').first(), null);
});
```

- [ ] **Step 2: Ver que falla**

Run: `npm test`
Expected: FAIL, `Cannot find module '.../server/reservas/d1-prueba.mjs'`.

- [ ] **Step 3: Esquema**

`db/d1/0001_reservas.sql`:

```sql
-- Reservas y pagos de la web (Cloudflare D1, SQLite).
-- Los índices únicos parciales hacen imposible vender dos veces la misma hora:
-- un solo consultorio (una presencial por hora) y una nutricionista por hora.

CREATE TABLE clientes (
  id        TEXT PRIMARY KEY,
  nombre    TEXT,
  whatsapp  TEXT,
  email     TEXT,
  dni       TEXT,
  creado_en TEXT NOT NULL
);

CREATE TABLE reservas (
  id                         TEXT PRIMARY KEY,
  token                      TEXT NOT NULL UNIQUE,
  cliente_id                 TEXT REFERENCES clientes(id),
  producto                   TEXT NOT NULL,
  duracion_meses             INTEGER NOT NULL,
  monto_centimos             INTEGER NOT NULL,
  peso_tope                  REAL NOT NULL,
  nutricionista_id           TEXT NOT NULL,
  inicio_utc                 TEXT NOT NULL,
  fecha_lima                 TEXT NOT NULL,
  modalidad                  TEXT NOT NULL CHECK (modalidad IN ('presencial', 'video')),
  estado                     TEXT NOT NULL CHECK (estado IN ('apartada', 'pagando', 'confirmada', 'pagada_sin_hora', 'expirada', 'cancelada')),
  retencion_hasta            TEXT,
  mp_preference_id           TEXT,
  google_event_id            TEXT,
  meet_url                   TEXT,
  calendario_pendiente       INTEGER NOT NULL DEFAULT 0,
  acepto_condiciones_version TEXT,
  novedades_optin            INTEGER NOT NULL DEFAULT 0,
  creado_en                  TEXT NOT NULL,
  actualizado_en             TEXT NOT NULL
);

CREATE UNIQUE INDEX reservas_consultorio ON reservas (inicio_utc)
  WHERE modalidad = 'presencial' AND estado IN ('apartada', 'pagando', 'confirmada');

CREATE UNIQUE INDEX reservas_nutricionista_hora ON reservas (nutricionista_id, inicio_utc)
  WHERE estado IN ('apartada', 'pagando', 'confirmada');

CREATE INDEX reservas_fecha_estado ON reservas (fecha_lima, estado);

CREATE TABLE pagos (
  id             TEXT PRIMARY KEY,
  reserva_id     TEXT NOT NULL REFERENCES reservas(id),
  mp_payment_id  TEXT NOT NULL UNIQUE,
  estado         TEXT NOT NULL,
  monto_centimos INTEGER NOT NULL,
  metodo         TEXT,
  creado_en      TEXT NOT NULL
);
```

- [ ] **Step 4: D1 de prueba**

`server/reservas/d1-prueba.mjs`:

```js
// D1 falso sobre node:sqlite para las pruebas. D1 es SQLite, así que la SQL
// (índices parciales, INSERT … SELECT, ON CONFLICT) se comporta igual; aquí
// solo se imita la forma de la API que usan los módulos.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

export function d1DePrueba() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../../db/d1/0001_reservas.sql', import.meta.url), 'utf8'));

  const plano = (fila) => (fila ? { ...fila } : null);
  function sentencia(sql, params = []) {
    const ejecutar = () => {
      const r = sqlite.prepare(sql).run(...params);
      return { meta: { changes: Number(r.changes) } };
    };
    return {
      bind: (...p) => sentencia(sql, p),
      first: async () => plano(sqlite.prepare(sql).get(...params)),
      all: async () => ({ results: sqlite.prepare(sql).all(...params).map(plano) }),
      run: async () => ejecutar(),
      _ejecutar: ejecutar,
    };
  }

  return {
    prepare: (sql) => sentencia(sql),
    batch: async (sentencias) => {
      sqlite.exec('BEGIN');
      try {
        const res = sentencias.map((s) => s._ejecutar());
        sqlite.exec('COMMIT');
        return res;
      } catch (e) {
        sqlite.exec('ROLLBACK');
        throw e;
      }
    },
  };
}
```

En `package.json`, agregar `"type": "module",` después de `"private": true,`.

- [ ] **Step 5: Correr**

Run: `npm test`
Expected: PASS, 27 pruebas previas + 4 nuevas = 31.

Run: `npm run build`
Expected: `Complete!` (el `"type": "module"` no rompe Astro).

- [ ] **Step 6: Crear las bases D1 y declararlas**

```bash
npx wrangler d1 create ajl-reservas
npx wrangler d1 create ajl-reservas-preview
```

Cada comando imprime un `database_id`. Agregar al final de `wrangler.toml`, con esos dos IDs (no son secretos):

```toml

# Base de reservas (Cloudflare D1). El preview usa su propia base para que las
# pruebas nunca toquen reservas reales. Los bindings no se heredan entre entornos.
[[d1_databases]]
binding = "DB"
database_name = "ajl-reservas"
database_id = "ID_QUE_IMPRIMIÓ_ajl-reservas"
migrations_dir = "db/d1"

[[env.preview.d1_databases]]
binding = "DB"
database_name = "ajl-reservas-preview"
database_id = "ID_QUE_IMPRIMIÓ_ajl-reservas-preview"
migrations_dir = "db/d1"
```

Y en `[env.preview.vars]` cambiar `PUBLIC_SITE_URL` a `"https://reservas-pago.ajl-landing.pages.dev"`.

Aplicar el esquema:

```bash
npx wrangler d1 migrations apply ajl-reservas --remote
npx wrangler d1 migrations apply ajl-reservas-preview --remote --env preview
```

Expected: ambas terminan con `0001_reservas.sql ✅`.

- [ ] **Step 7: Commit**

```bash
git add db/d1 server/reservas/d1-prueba.mjs server/reservas/esquema.test.mjs package.json wrangler.toml
git commit -m "reservas: esquema D1 con índices anti-choque y D1 de prueba"
```

---

### Task 2: Tiempo, equipo y catálogo

**Files:**
- Create: `server/reservas/constantes.mjs`, `server/reservas/tiempo.mjs`, `server/reservas/tiempo.test.mjs`, `src/data/nutricionistas.js`, `src/data/condiciones.js`, `server/reservas/catalogo.mjs`, `server/reservas/catalogo.test.mjs`
- Modify: `src/data/plans.js:56-58,79-81,105-107` (añadir `totalSoles`)

**Interfaces:**
- Produces:
  - `TOPE_PRIMERAS = 3`, `DESDE_DIAS = 1`, `HASTA_DIAS = 21`
  - `fechaLima(date: Date): 'YYYY-MM-DD'`
  - `inicioUtc(fecha, hora: number): 'YYYY-MM-DDTHH:00:00Z'`
  - `sumarDias(fecha, n): fecha`
  - `diaSemana(fecha): 0..6` (0 = domingo)
  - `diasEntre(a, b): number`
  - `etiquetaLima(iso): string`
  - `nutricionistas: Array<{ id, nombre, apodos: string[], foto: string|null, ventanas: Array<{ dia, modalidad, desde, hasta, cadaDosSemanas?: 'YYYY-MM-DD' }> }>`
  - `CONDICIONES_VERSION`, `NOVEDADES_TEXTO`
  - `cotizar(producto, duracion): { titulo, monto_centimos, duracion_meses, peso, requiereDni } | null`

- [ ] **Step 1: Pruebas que fallan**

`server/reservas/tiempo.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fechaLima, inicioUtc, sumarDias, diaSemana, diasEntre, etiquetaLima } from './tiempo.mjs';

test('fechaLima usa UTC−5: las 3:00 UTC del 6 son aún el 5 en Lima', () => {
  assert.equal(fechaLima(new Date('2026-10-06T03:00:00Z')), '2026-10-05');
  assert.equal(fechaLima(new Date('2026-10-06T05:00:00Z')), '2026-10-06');
});

test('inicioUtc convierte hora de Lima a UTC con formato fijo', () => {
  assert.equal(inicioUtc('2026-10-06', 10), '2026-10-06T15:00:00Z');
  assert.equal(inicioUtc('2026-10-06', 20), '2026-10-07T01:00:00Z');
});

test('sumarDias cruza meses', () => {
  assert.equal(sumarDias('2026-10-30', 3), '2026-11-02');
  assert.equal(sumarDias('2026-10-01', -1), '2026-09-30');
});

test('diaSemana y diasEntre', () => {
  assert.equal(diaSemana('2026-10-07'), 3); // miércoles
  assert.equal(diasEntre('2026-10-07', '2026-10-21'), 14);
  assert.equal(diasEntre('2026-10-07', '2026-09-30'), -7);
});

test('etiquetaLima muestra la fecha en Lima', () => {
  const t = etiquetaLima('2026-10-08T22:00:00Z');
  assert.match(t, /8/);
  assert.match(t, /octubre/);
  assert.match(t, /5:00/);
});
```

`server/reservas/catalogo.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cotizar } from './catalogo.mjs';

test('2 sesiones al mes por 3 meses: S/1.080, peso 1, pide DNI', () => {
  assert.deepEqual(cotizar('constancia', 3), {
    titulo: '2 sesiones al mes · 3 meses', monto_centimos: 108000, duracion_meses: 3, peso: 1, requiereDni: true,
  });
});

test('mes a mes usa el precio mensual y no pide DNI', () => {
  const c = cotizar('transformacion', 1);
  assert.equal(c.monto_centimos, 60000);
  assert.equal(c.requiereDni, false);
});

test('evaluación pesa 0,5 y sesión única 1', () => {
  assert.equal(cotizar('evaluacion', 1).peso, 0.5);
  assert.equal(cotizar('evaluacion', 1).monto_centimos, 8000);
  assert.equal(cotizar('basico', 1).peso, 1);
});

test('combinaciones inválidas devuelven null', () => {
  assert.equal(cotizar('evaluacion', 3), null);
  assert.equal(cotizar('constancia', 6), null);
  assert.equal(cotizar('inventado', 1), null);
  assert.equal(cotizar('__proto__', 1), null);
});
```

- [ ] **Step 2: Ver que fallan**

Run: `npm test`
Expected: FAIL, `Cannot find module '.../tiempo.mjs'` y `'.../catalogo.mjs'`.

- [ ] **Step 3: Implementar**

`server/reservas/constantes.mjs`:

```js
// Reglas del negocio que el spec fija (Alejandro, 30-sep y 1-oct-2026).
export const TOPE_PRIMERAS = 3; // primeras sesiones por día, todos los canales
export const DESDE_DIAS = 1;    // no se reserva para el mismo día
export const HASTA_DIAS = 21;   // hasta tres semanas adelante
export const RETENCION_MIN = 15;
export const RETENCION_MAX_MIN = 30;
```

`server/reservas/tiempo.mjs`:

```js
// Lima está en UTC−5 todo el año (sin horario de verano), así que basta un
// desplazamiento fijo. Se guarda en UTC y solo se convierte para mostrar.
const OFFSET_MS = 5 * 3600 * 1000;
const DIA_MS = 86400 * 1000;

const partes = (fecha) => fecha.split('-').map(Number);

export function fechaLima(fecha) {
  return new Date(fecha.getTime() - OFFSET_MS).toISOString().slice(0, 10);
}

export function inicioUtc(fecha, hora) {
  const [y, m, d] = partes(fecha);
  return new Date(Date.UTC(y, m - 1, d, hora + 5)).toISOString().replace('.000Z', 'Z');
}

export function sumarDias(fecha, n) {
  const [y, m, d] = partes(fecha);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function diaSemana(fecha) {
  return new Date(`${fecha}T12:00:00Z`).getUTCDay();
}

export function diasEntre(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DIA_MS);
}

const FORMATO = new Intl.DateTimeFormat('es-PE', {
  timeZone: 'America/Lima', weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit',
});

export function etiquetaLima(iso) {
  return FORMATO.format(new Date(iso));
}
```

`src/data/nutricionistas.js`:

```js
// ─── Equipo y horarios de atención (handoff de Alejandro, 30-sep-2026) ──────
// Fuente única de la agenda web. Horas en formato 24 h, hora de Lima; `hasta`
// es la hora en que termina la última cita. Las presenciales además se recortan
// al horario del consultorio (ver HORARIO_CLINICA en disponibilidad.mjs).
//
// `apodos`: cómo nombra el equipo a cada una en el calendario. Un evento de día
// completo que contenga cualquiera de estas palabras la saca ese día.
//
// `cadaDosSemanas`: una fecha en la que esa ventana SÍ aplica; aplica también
// cada 14 días antes y después. Nico: viene el miércoles 7-oct-2026 y el
// sábado 3-oct-2026 (el miércoles 30-sep no vino).
//
// Paolo: su sábado («alternativo a viernes») está pendiente de aclarar, así que
// no se ofrece. Mejor perder horas que vender una que no atiende.

export const nutricionistas = [
  {
    id: 'nico',
    nombre: 'Nico',
    apodos: ['nico'],
    foto: null,
    ventanas: [
      { dia: 'lunes', modalidad: 'presencial', desde: 11, hasta: 20 },
      { dia: 'martes', modalidad: 'presencial', desde: 11, hasta: 20 },
      { dia: 'miercoles', modalidad: 'presencial', desde: 11, hasta: 20, cadaDosSemanas: '2026-10-07' },
      { dia: 'jueves', modalidad: 'presencial', desde: 11, hasta: 20 },
      { dia: 'viernes', modalidad: 'video', desde: 11, hasta: 20 },
      { dia: 'sabado', modalidad: 'presencial', desde: 11, hasta: 20, cadaDosSemanas: '2026-10-03' },
    ],
  },
  {
    id: 'paola',
    nombre: 'Paola',
    apodos: ['paola'],
    foto: null,
    ventanas: [
      { dia: 'lunes', modalidad: 'video', desde: 14, hasta: 20 },
      { dia: 'miercoles', modalidad: 'presencial', desde: 14, hasta: 20 },
      { dia: 'viernes', modalidad: 'presencial', desde: 14, hasta: 20 },
      { dia: 'sabado', modalidad: 'presencial', desde: 10, hasta: 19 },
    ],
  },
  {
    id: 'jussara',
    nombre: 'Jussara',
    apodos: ['jussara', 'yuyu'],
    foto: null,
    ventanas: [
      { dia: 'lunes', modalidad: 'presencial', desde: 10, hasta: 17 },
      { dia: 'martes', modalidad: 'presencial', desde: 10, hasta: 17 },
      { dia: 'miercoles', modalidad: 'presencial', desde: 10, hasta: 17 },
      { dia: 'jueves', modalidad: 'presencial', desde: 10, hasta: 17 },
      { dia: 'viernes', modalidad: 'presencial', desde: 10, hasta: 17 },
      { dia: 'sabado', modalidad: 'presencial', desde: 9, hasta: 13 },
    ],
  },
  {
    id: 'paolo',
    nombre: 'Paolo',
    apodos: ['paolo'],
    foto: null,
    ventanas: [
      { dia: 'lunes', modalidad: 'presencial', desde: 14, hasta: 20 },
      { dia: 'martes', modalidad: 'presencial', desde: 14, hasta: 20 },
      { dia: 'jueves', modalidad: 'presencial', desde: 10, hasta: 17 },
      { dia: 'viernes', modalidad: 'video', desde: 14, hasta: 20 },
    ],
  },
];
```

`src/data/condiciones.js`:

```js
// Versiones de los textos que el paciente acepta en el paso 4. Se guardan con
// cada reserva: si el texto cambia, sube la versión.
export const CONDICIONES_VERSION = '2026-10-01';
export const NOVEDADES_TEXTO =
  'Quiero recibir novedades y promociones de AJL Nutrición por correo. (v2026-10-01)';
```

En `src/data/plans.js`, añadir `totalSoles` a cada programa de 3 meses:

```js
      { label: '3 meses', total: 'S/810', perMes: 'S/270 al mes', totalSoles: 810 },
```
```js
      { label: '3 meses', total: 'S/1.080', perMes: 'S/360 al mes', totalSoles: 1080 },
```
```js
      { label: '3 meses', total: 'S/1.530', perMes: 'S/510 al mes', totalSoles: 1530 },
```

`server/reservas/catalogo.mjs`:

```js
// Precio, peso para el tope y si pide DNI, a partir de src/data/plans.js (la
// misma fuente que pinta la web). El servidor cotiza siempre: nunca confía en
// un monto que mande el navegador.
import { plans } from '../../src/data/plans.js';

const MENSUALES = new Set(['acompanamiento', 'constancia', 'transformacion']);
const DNI_DESDE_CENTIMOS = 70000; // boleta con DNI si el total supera S/700

function armar(titulo, soles, duracion_meses, peso) {
  const monto_centimos = Math.round(soles * 100);
  return { titulo, monto_centimos, duracion_meses, peso, requiereDni: monto_centimos > DNI_DESDE_CENTIMOS };
}

export function cotizar(producto, duracion) {
  if (!Object.hasOwn(plans, producto)) return null;
  const plan = plans[producto];
  if (MENSUALES.has(producto)) {
    if (duracion === 1) return armar(`${plan.name} · 1 mes`, plan.price, 1, 1);
    if (duracion === 3) return armar(`${plan.name} · 3 meses`, plan.programs[0].totalSoles, 3, 1);
    return null;
  }
  if (duracion !== 1) return null;
  if (producto === 'evaluacion') return armar(plan.name, plan.price, 1, 0.5);
  if (producto === 'basico') return armar(plan.name, plan.price, 1, 1);
  return null;
}
```

- [ ] **Step 4: Correr**

Run: `npm test`
Expected: PASS, 40 pruebas.

- [ ] **Step 5: Commit**

```bash
git add server/reservas/constantes.mjs server/reservas/tiempo.mjs server/reservas/tiempo.test.mjs server/reservas/catalogo.mjs server/reservas/catalogo.test.mjs src/data/nutricionistas.js src/data/condiciones.js src/data/plans.js
git commit -m "reservas: tiempo en Lima, equipo con horarios y catálogo cotizable"
```

---

### Task 3: Motor de disponibilidad

**Files:**
- Create: `server/reservas/disponibilidad.mjs`, `server/reservas/disponibilidad.test.mjs`

**Interfaces:**
- Consumes: `inicioUtc`, `fechaLima`, `diaSemana`, `diasEntre` (Task 2); `nutricionistas` (Task 2).
- Produces:
  - `normalizar(texto): string`
  - `ausenciasDelDia(eventos, fecha, nutricionistas): { ausentes: Set<string>, cerrada: boolean }`
  - `primerasManuales(eventos, fecha): number`
  - `horasLibres({ fecha, modalidad, peso, nutricionistas, eventos, reservas, ahora, filtroNutricionista = null, tope = 3, desdeDias = 1, hastaDias = 21 }): Array<{ inicio, hora: 'HH:00', nutricionista_id }>`
- Formas de entrada:
  - **Evento normalizado:** `{ titulo, todoElDia, desde, hasta, propio, bloquea }`. En los de día completo, `desde`/`hasta` son fechas `YYYY-MM-DD` y `hasta` es exclusiva. En los demás son ISO con zona.
  - **Reserva activa:** `{ inicio_utc, fecha_lima, nutricionista_id, modalidad, peso_tope }`.

- [ ] **Step 1: Pruebas que fallan**

`server/reservas/disponibilidad.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { horasLibres, ausenciasDelDia, primerasManuales } from './disponibilidad.mjs';
import { nutricionistas } from '../../src/data/nutricionistas.js';

// Lunes 5-oct-2026, 10:00 en Lima.
const ahora = new Date('2026-10-05T15:00:00Z');
const base = { peso: 1, nutricionistas, eventos: [], reservas: [], ahora };
const horas = (r) => r.map((h) => h.hora);
const de = (r, nutri) => r.filter((h) => h.nutricionista_id === nutri);
const diaCompleto = (titulo, desde, hasta) => ({ titulo, todoElDia: true, desde, hasta, propio: false, bloquea: true });
const conHora = (titulo, desde, hasta, extra = {}) => ({ titulo, todoElDia: false, desde, hasta, propio: false, bloquea: true, ...extra });
const reserva = (o) => ({ peso_tope: 1, modalidad: 'presencial', ...o });

test('martes presencial: de 10:00 a 19:00, recortado al consultorio', () => {
  const r = horasLibres({ ...base, fecha: '2026-10-06', modalidad: 'presencial' });
  assert.deepEqual(horas(r), ['10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00']);
  assert.equal(r[0].inicio, '2026-10-06T15:00:00Z');
});

test('Nico alterna: miércoles 7 sí, miércoles 14 no; sábado 10 no, sábado 17 sí y cierra a las 19', () => {
  const nico = (fecha) => horasLibres({ ...base, fecha, modalidad: 'presencial', filtroNutricionista: 'nico' });
  assert.equal(horas(nico('2026-10-07'))[0], '11:00');
  assert.deepEqual(nico('2026-10-14'), []);
  assert.deepEqual(nico('2026-10-10'), []);
  assert.deepEqual(horas(nico('2026-10-17')), ['11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00']);
});

test('Paolo no se ofrece los sábados', () => {
  assert.deepEqual(horasLibres({ ...base, fecha: '2026-10-10', modalidad: 'presencial', filtroNutricionista: 'paolo' }), []);
});

test('viernes por video: Nico desde las 11, Paolo desde las 14', () => {
  const r = horasLibres({ ...base, fecha: '2026-10-09', modalidad: 'video' });
  assert.equal(r[0].hora, '11:00');
  assert.equal(r.at(-1).hora, '19:00');
});

test('consultorio único: una presencial ocupa la hora para todas, pero no el video', () => {
  const reservas = [reserva({ inicio_utc: '2026-10-09T20:00:00Z', fecha_lima: '2026-10-09', nutricionista_id: 'paola' })];
  const pres = horasLibres({ ...base, reservas, fecha: '2026-10-09', modalidad: 'presencial' });
  assert.ok(!horas(pres).includes('15:00'));
  const video = horasLibres({ ...base, reservas, fecha: '2026-10-09', modalidad: 'video' });
  assert.ok(horas(video).includes('15:00'));
});

test('nutricionista ocupada por video: la hora se le asigna a otra', () => {
  const reservas = [reserva({ inicio_utc: '2026-10-09T20:00:00Z', fecha_lima: '2026-10-09', nutricionista_id: 'nico', modalidad: 'video' })];
  const r = horasLibres({ ...base, reservas, fecha: '2026-10-09', modalidad: 'video' });
  assert.equal(r.find((h) => h.hora === '15:00').nutricionista_id, 'paolo');
});

test('eventos con hora del calendario bloquean la hora; los transparentes y los propios no', () => {
  const eventos = [
    conHora('Carolina Wimpon', '2026-10-06T15:00:00-05:00', '2026-10-06T16:00:00-05:00'),
    conHora('Libre', '2026-10-06T16:00:00-05:00', '2026-10-06T17:00:00-05:00', { bloquea: false }),
    conHora('1ra · Ana · Plan', '2026-10-06T17:00:00-05:00', '2026-10-06T18:00:00-05:00', { propio: true }),
  ];
  const r = horas(horasLibres({ ...base, eventos, fecha: '2026-10-06', modalidad: 'presencial' }));
  assert.ok(!r.includes('15:00'));
  assert.ok(r.includes('14:00'));
  assert.ok(r.includes('16:00'));
  assert.ok(r.includes('17:00'));
});

test('ausencias: «vacas yuyu» saca a Jussara varios días; «nico viene» no saca a Nico', () => {
  const eventos = [diaCompleto('vacas yuyu', '2026-10-06', '2026-10-09'), diaCompleto('nico viene', '2026-10-06', '2026-10-07')];
  const r = horasLibres({ ...base, eventos, fecha: '2026-10-06', modalidad: 'presencial' });
  assert.deepEqual(de(r, 'jussara'), []);
  assert.ok(!horas(r).includes('10:00'));
  assert.ok(horas(r).includes('11:00'));
  assert.equal(r.find((h) => h.hora === '11:00').nutricionista_id, 'nico');
});

test('ausencias: «Paola no viene» no saca a Paolo; tildes y mayúsculas no importan', () => {
  const eventos = [diaCompleto('PAOLA no viene', '2026-10-12', '2026-10-13'), diaCompleto('Nicó no viene', '2026-10-12', '2026-10-13')];
  const { ausentes } = ausenciasDelDia(eventos, '2026-10-12', nutricionistas);
  assert.deepEqual([...ausentes].sort(), ['nico', 'paola']);
});

test('feriado o cerrado cierra la clínica', () => {
  const eventos = [diaCompleto('Feriado', '2026-10-08', '2026-10-09')];
  assert.deepEqual(horasLibres({ ...base, eventos, fecha: '2026-10-08', modalidad: 'presencial' }), []);
});

test('tope: 3 primeras llenan el día; 2,5 deja pasar una evaluación pero no un plan', () => {
  const r3 = [1, 2, 3].map((i) => reserva({ inicio_utc: `2026-10-06T1${i}:00:00Z`, fecha_lima: '2026-10-06', nutricionista_id: 'x' }));
  assert.deepEqual(horasLibres({ ...base, reservas: r3, fecha: '2026-10-06', modalidad: 'presencial' }), []);
  const r25 = [...r3.slice(0, 2), reserva({ inicio_utc: '2026-10-06T19:00:00Z', fecha_lima: '2026-10-06', nutricionista_id: 'x', peso_tope: 0.5 })];
  assert.deepEqual(horasLibres({ ...base, reservas: r25, fecha: '2026-10-06', modalidad: 'presencial' }), []);
  assert.ok(horasLibres({ ...base, reservas: r25, peso: 0.5, fecha: '2026-10-06', modalidad: 'presencial' }).length > 0);
});

test('tope: los eventos manuales que empiezan con «1ra» cuentan', () => {
  const eventos = ['10', '11', '12'].map((h) => conHora(`1ra Juan ${h}`, `2026-10-06T${h}:00:00-05:00`, `2026-10-06T${h}:30:00-05:00`));
  assert.equal(primerasManuales(eventos, '2026-10-06'), 3);
  assert.deepEqual(horasLibres({ ...base, eventos, fecha: '2026-10-06', modalidad: 'presencial' }), []);
});

test('ventana: nada para hoy ni más allá de 21 días', () => {
  assert.deepEqual(horasLibres({ ...base, fecha: '2026-10-05', modalidad: 'presencial' }), []);
  assert.deepEqual(horasLibres({ ...base, fecha: '2026-10-27', modalidad: 'presencial' }), []);
  assert.ok(horasLibres({ ...base, fecha: '2026-10-26', modalidad: 'presencial' }).length > 0);
});

test('asigna a la menos cargada del día, en el orden del equipo si empatan', () => {
  const reservas = [reserva({ inicio_utc: '2026-10-06T23:00:00Z', fecha_lima: '2026-10-06', nutricionista_id: 'nico' })];
  const r = horasLibres({ ...base, reservas, fecha: '2026-10-06', modalidad: 'presencial' });
  assert.equal(r.find((h) => h.hora === '15:00').nutricionista_id, 'jussara');
  assert.equal(r.find((h) => h.hora === '17:00').nutricionista_id, 'paolo');
});
```

- [ ] **Step 2: Ver que falla**

Run: `npm test`
Expected: FAIL, `Cannot find module '.../disponibilidad.mjs'`.

- [ ] **Step 3: Implementar**

`server/reservas/disponibilidad.mjs`:

```js
// Motor puro de horas libres. Sin red ni base de datos: recibe el equipo, los
// eventos del calendario ya normalizados y las reservas activas, y devuelve qué
// horas se pueden vender y a quién se le asignan. Toda regla del spec vive aquí.
import { inicioUtc, fechaLima, diaSemana, diasEntre } from './tiempo.mjs';

export const DIAS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
// Horario del consultorio de Lince (src/data/contacto.js). Domingo cerrado.
export const HORARIO_CLINICA = { 1: [10, 20], 2: [10, 20], 3: [10, 20], 4: [10, 20], 5: [10, 20], 6: [9, 19] };
const HORA_MS = 3600 * 1000;

export function normalizar(texto) {
  return String(texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function contienePalabra(texto, palabra) {
  return new RegExp(`(^|[^a-z0-9])${palabra}([^a-z0-9]|$)`).test(texto);
}

const cubreDia = (ev, fecha) => ev.todoElDia && ev.desde <= fecha && fecha < ev.hasta;
const seCruza = (ev, ini, fin) => !ev.todoElDia && Date.parse(ev.desde) < fin && Date.parse(ev.hasta) > ini;

export function ausenciasDelDia(eventos, fecha, nutricionistas) {
  const ausentes = new Set();
  let cerrada = false;
  for (const ev of eventos) {
    if (!cubreDia(ev, fecha)) continue;
    const t = normalizar(ev.titulo);
    if (contienePalabra(t, 'cerrado') || contienePalabra(t, 'feriado')) cerrada = true;
    // «nico viene» marca presencia en su sábado alterno; solo «no viene» es ausencia.
    if (contienePalabra(t, 'viene') && !t.includes('no viene')) continue;
    for (const n of nutricionistas) {
      if (n.apodos.some((a) => contienePalabra(t, a))) ausentes.add(n.id);
    }
  }
  return { ausentes, cerrada };
}

export function primerasManuales(eventos, fecha) {
  return eventos.filter((ev) => !ev.todoElDia && !ev.propio
    && fechaLima(new Date(ev.desde)) === fecha
    && normalizar(ev.titulo).trim().startsWith('1ra')).length;
}

function ventanaCubre(nutricionista, fecha, modalidad, hora) {
  const dow = diaSemana(fecha);
  return nutricionista.ventanas.some((v) => {
    if (v.dia !== DIAS[dow] || v.modalidad !== modalidad) return false;
    if (v.cadaDosSemanas && Math.abs(diasEntre(v.cadaDosSemanas, fecha)) % 14 !== 0) return false;
    let desde = v.desde;
    let hasta = v.hasta;
    if (modalidad === 'presencial') {
      const clinica = HORARIO_CLINICA[dow];
      if (!clinica) return false;
      desde = Math.max(desde, clinica[0]);
      hasta = Math.min(hasta, clinica[1]);
    }
    return hora >= desde && hora + 1 <= hasta;
  });
}

export function horasLibres({
  fecha, modalidad, peso, nutricionistas, eventos, reservas, ahora,
  filtroNutricionista = null, tope = 3, desdeDias = 1, hastaDias = 21,
}) {
  const distancia = diasEntre(fechaLima(ahora), fecha);
  if (distancia < desdeDias || distancia > hastaDias) return [];

  const { ausentes, cerrada } = ausenciasDelDia(eventos, fecha, nutricionistas);
  if (cerrada) return [];

  const delDia = reservas.filter((r) => r.fecha_lima === fecha);
  const suma = delDia.reduce((s, r) => s + r.peso_tope, 0) + primerasManuales(eventos, fecha);
  if (suma + peso > tope) return [];

  const carga = (id) => delDia.filter((r) => r.nutricionista_id === id).length;
  const libres = [];
  for (let hora = 0; hora < 24; hora++) {
    const inicio = inicioUtc(fecha, hora);
    const ini = Date.parse(inicio);
    const fin = ini + HORA_MS;
    if (ini <= ahora.getTime()) continue;
    // Eventos manuales: no dicen quién atiende, así que bloquean la hora entera.
    if (eventos.some((ev) => !ev.propio && ev.bloquea && seCruza(ev, ini, fin))) continue;
    if (modalidad === 'presencial'
      && delDia.some((r) => r.modalidad === 'presencial' && r.inicio_utc === inicio)) continue;

    const candidatas = nutricionistas.filter((n) => !ausentes.has(n.id)
      && (!filtroNutricionista || n.id === filtroNutricionista)
      && ventanaCubre(n, fecha, modalidad, hora)
      && !delDia.some((r) => r.nutricionista_id === n.id && r.inicio_utc === inicio));
    if (!candidatas.length) continue;

    const elegida = candidatas.reduce((a, b) => (carga(b) < carga(a) ? b : a));
    libres.push({ inicio, hora: `${String(hora).padStart(2, '0')}:00`, nutricionista_id: elegida.id });
  }
  return libres;
}
```

- [ ] **Step 4: Correr**

Run: `npm test`
Expected: PASS, 54 pruebas.

- [ ] **Step 5: Commit**

```bash
git add server/reservas/disponibilidad.mjs server/reservas/disponibilidad.test.mjs
git commit -m "reservas: motor de disponibilidad (consultorio, ausencias, tope, alternancias)"
```

---

### Task 4: Repositorio D1

**Files:**
- Create: `server/reservas/repo.mjs`, `server/reservas/repo.test.mjs`

**Interfaces:**
- Consumes: `d1DePrueba` (Task 1).
- Produces (todas `async`, `db` es D1 o D1 de prueba, `ahora: Date`):
  - `crearRetencion(db, { id, token, producto, duracion_meses, monto_centimos, peso_tope, nutricionista_id, inicio_utc, fecha_lima, modalidad, primerasManuales, tope, ahora, minutos = 15 })` → `{ ok: true, retencion_hasta } | { ok: false, motivo: 'ocupada' | 'tope' }`
  - `reservasActivasEntre(db, desdeFecha, hastaFechaExclusiva, ahora)` → filas `{ id, inicio_utc, fecha_lima, nutricionista_id, modalidad, peso_tope }`
  - `reservaPorToken(db, token)` y `reservaPorId(db, id)` → fila de reserva con `nombre, whatsapp, email, dni` del cliente, o `null`
  - `guardarDatosYPagar(db, { reserva, cliente: { nombre, whatsapp, email, dni }, condicionesVersion, novedades, ahora })` → `{ ok: true, retencion_hasta } | { ok: false, motivo: 'vencida' }`
  - `guardarPreferencia(db, id, preferenceId, ahora)`
  - `registrarPago(db, { reserva_id, mp_payment_id, estado, monto_centimos, metodo, ahora })`
  - `ultimoPago(db, reservaId)` → `{ estado } | null`
  - `confirmarReserva(db, { id, fecha_lima, primerasManuales, tope, ahora })` → `{ ok: true } | { ok: false, motivo: 'ocupada' | 'tope' | 'ya_confirmada' }`
  - `marcarSinHora(db, id, ahora)`
  - `guardarEvento(db, id, eventId, meetUrl, ahora)`
  - `marcarCalendarioPendiente(db, id, ahora)`
  - `reubicar(db, { id, nutricionista_id, inicio_utc, fecha_lima, modalidad, primerasManuales, tope, ahora })` → `{ ok: true } | { ok: false, motivo: 'ocupada' | 'tope' }`
  - `purgarNoPagadas(db, ahora, dias = 30)`

- [ ] **Step 1: Pruebas que fallan**

`server/reservas/repo.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1DePrueba } from './d1-prueba.mjs';
import * as repo from './repo.mjs';

const t0 = new Date('2026-10-05T15:00:00Z');
const mas = (min) => new Date(t0.getTime() + min * 60000);
let n = 0;
const ret = (db, o = {}) => repo.crearRetencion(db, {
  id: `r${++n}`, token: `t${n}`, producto: 'constancia', duracion_meses: 3, monto_centimos: 108000, peso_tope: 1,
  nutricionista_id: 'nico', inicio_utc: '2026-10-06T17:00:00Z', fecha_lima: '2026-10-06', modalidad: 'presencial',
  primerasManuales: 0, tope: 3, ahora: t0, ...o,
});

test('retención nueva queda apartada 15 minutos', async () => {
  const db = d1DePrueba();
  const r = await ret(db, { id: 'a', token: 'ta' });
  assert.deepEqual(r, { ok: true, retencion_hasta: mas(15).toISOString() });
  assert.equal((await repo.reservaPorToken(db, 'ta')).estado, 'apartada');
});

test('segunda retención presencial a la misma hora: ocupada', async () => {
  const db = d1DePrueba();
  await ret(db);
  assert.deepEqual(await ret(db, { nutricionista_id: 'jussara' }), { ok: false, motivo: 'ocupada' });
});

test('una retención vencida se libera al intentar otra', async () => {
  const db = d1DePrueba();
  await ret(db, { id: 'viejo' });
  assert.deepEqual((await ret(db, { ahora: mas(16) })).ok, true);
  assert.equal((await repo.reservaPorId(db, 'viejo')).estado, 'expirada');
});

test('tope: la cuarta primera sesión del día no entra; con 2,5 entra una evaluación', async () => {
  const db = d1DePrueba();
  for (const h of ['14', '15', '16']) await ret(db, { inicio_utc: `2026-10-06T${h}:00:00Z`, nutricionista_id: `n${h}` });
  assert.deepEqual(await ret(db, { inicio_utc: '2026-10-06T22:00:00Z' }), { ok: false, motivo: 'tope' });
  const db2 = d1DePrueba();
  await ret(db2, { inicio_utc: '2026-10-06T14:00:00Z', nutricionista_id: 'a' });
  await ret(db2, { inicio_utc: '2026-10-06T15:00:00Z', nutricionista_id: 'b' });
  assert.equal((await ret(db2, { inicio_utc: '2026-10-06T16:00:00Z', nutricionista_id: 'c', peso_tope: 0.5, primerasManuales: 0 })).ok, true);
  assert.deepEqual(await ret(db2, { inicio_utc: '2026-10-06T22:00:00Z', peso_tope: 0.5, primerasManuales: 0 }), { ok: true, retencion_hasta: mas(15).toISOString() });
});

test('las primeras manuales del calendario cuentan para el tope', async () => {
  const db = d1DePrueba();
  assert.deepEqual(await ret(db, { primerasManuales: 3 }), { ok: false, motivo: 'tope' });
});

test('guardar datos extiende la retención a 30 minutos desde que se creó', async () => {
  const db = d1DePrueba();
  await ret(db, { id: 'p', token: 'tp' });
  const r = await repo.reservaPorToken(db, 'tp');
  const res = await repo.guardarDatosYPagar(db, {
    reserva: r, cliente: { nombre: 'Ana Pérez', whatsapp: '+51987654321', email: 'ana@x.pe', dni: '12345678' },
    condicionesVersion: '2026-10-01', novedades: true, ahora: mas(10),
  });
  assert.deepEqual(res, { ok: true, retencion_hasta: mas(30).toISOString() });
  const despues = await repo.reservaPorToken(db, 'tp');
  assert.equal(despues.estado, 'pagando');
  assert.equal(despues.nombre, 'Ana Pérez');
  assert.equal(despues.novedades_optin, 1);
});

test('guardar datos con la retención vencida: vencida', async () => {
  const db = d1DePrueba();
  await ret(db, { token: 'tv' });
  const r = await repo.reservaPorToken(db, 'tv');
  const res = await repo.guardarDatosYPagar(db, {
    reserva: r, cliente: { nombre: 'Ana', whatsapp: '+51987654321', email: 'a@x.pe', dni: null },
    condicionesVersion: 'v', novedades: false, ahora: mas(20),
  });
  assert.deepEqual(res, { ok: false, motivo: 'vencida' });
});

test('confirmar desde pagando; confirmar dos veces avisa ya_confirmada', async () => {
  const db = d1DePrueba();
  await ret(db, { id: 'c' });
  const args = { id: 'c', fecha_lima: '2026-10-06', primerasManuales: 0, tope: 3, ahora: mas(5) };
  assert.deepEqual(await repo.confirmarReserva(db, args), { ok: true });
  assert.deepEqual(await repo.confirmarReserva(db, args), { ok: false, motivo: 'ya_confirmada' });
});

test('confirmar una expirada cuya hora ya tomó otro: ocupada', async () => {
  const db = d1DePrueba();
  await ret(db, { id: 'tarde' });
  await ret(db, { id: 'otro', nutricionista_id: 'jussara', ahora: mas(16) });
  const res = await repo.confirmarReserva(db, { id: 'tarde', fecha_lima: '2026-10-06', primerasManuales: 0, tope: 3, ahora: mas(20) });
  assert.deepEqual(res, { ok: false, motivo: 'ocupada' });
});

test('registrarPago es idempotente por mp_payment_id', async () => {
  const db = d1DePrueba();
  await ret(db, { id: 'pg' });
  const p = { reserva_id: 'pg', mp_payment_id: '999', estado: 'pending', monto_centimos: 108000, metodo: 'yape', ahora: t0 };
  await repo.registrarPago(db, p);
  await repo.registrarPago(db, { ...p, estado: 'approved' });
  const filas = await db.prepare('SELECT estado FROM pagos').all();
  assert.deepEqual(filas.results, [{ estado: 'approved' }]);
  assert.deepEqual(await repo.ultimoPago(db, 'pg'), { estado: 'approved' });
});

test('reubicar una pagada sin hora la deja confirmada en la nueva hora', async () => {
  const db = d1DePrueba();
  await ret(db, { id: 's' });
  await repo.marcarSinHora(db, 's', mas(1));
  const res = await repo.reubicar(db, { id: 's', nutricionista_id: 'paola', inicio_utc: '2026-10-07T19:00:00Z', fecha_lima: '2026-10-07', modalidad: 'presencial', primerasManuales: 0, tope: 3, ahora: mas(2) });
  assert.deepEqual(res, { ok: true });
  const r = await repo.reservaPorId(db, 's');
  assert.equal(r.estado, 'confirmada');
  assert.equal(r.nutricionista_id, 'paola');
});

test('purgar borra datos de contacto de reservas no pagadas con más de 30 días', async () => {
  const db = d1DePrueba();
  await ret(db, { id: 'np', token: 'tnp' });
  const r = await repo.reservaPorToken(db, 'tnp');
  await repo.guardarDatosYPagar(db, { reserva: r, cliente: { nombre: 'Ana', whatsapp: '+51987654321', email: 'a@x.pe', dni: null }, condicionesVersion: 'v', novedades: false, ahora: mas(1) });
  await repo.purgarNoPagadas(db, new Date(t0.getTime() + 31 * 86400000));
  assert.equal((await repo.reservaPorToken(db, 'tnp')).nombre, null);
});
```

- [ ] **Step 2: Ver que falla**

Run: `npm test`
Expected: FAIL, `Cannot find module '.../repo.mjs'`.

- [ ] **Step 3: Implementar**

`server/reservas/repo.mjs`:

```js
// Acceso a D1. Las reglas que no pueden fallar por concurrencia las impone la
// propia base: índices únicos parciales (hora del consultorio y de cada
// nutricionista) y el tope dentro de la misma sentencia que inserta.
const ACTIVOS = "('apartada', 'pagando', 'confirmada')";
const UNIQUE = /UNIQUE constraint failed/i;
const MIN = 60000;

const expirar = (db, ahoraIso) => db.prepare(
  `UPDATE reservas SET estado = 'expirada', actualizado_en = ?1
   WHERE estado IN ('apartada', 'pagando') AND retencion_hasta < ?1`,
).bind(ahoraIso);

const CON_CLIENTE = `SELECT r.*, c.nombre, c.whatsapp, c.email, c.dni
  FROM reservas r LEFT JOIN clientes c ON c.id = r.cliente_id`;

export async function crearRetencion(db, r) {
  const ahoraIso = r.ahora.toISOString();
  const hasta = new Date(r.ahora.getTime() + (r.minutos ?? 15) * MIN).toISOString();
  const insertar = db.prepare(
    `INSERT INTO reservas (id, token, producto, duracion_meses, monto_centimos, peso_tope, nutricionista_id,
       inicio_utc, fecha_lima, modalidad, estado, retencion_hasta, creado_en, actualizado_en)
     SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'apartada', ?11, ?12, ?12
     WHERE (SELECT COALESCE(SUM(peso_tope), 0) FROM reservas
            WHERE fecha_lima = ?9 AND estado IN ${ACTIVOS}) + ?6 + ?13 <= ?14`,
  ).bind(r.id, r.token, r.producto, r.duracion_meses, r.monto_centimos, r.peso_tope, r.nutricionista_id,
    r.inicio_utc, r.fecha_lima, r.modalidad, hasta, ahoraIso, r.primerasManuales, r.tope);
  try {
    const [, res] = await db.batch([expirar(db, ahoraIso), insertar]);
    if (res.meta.changes === 0) return { ok: false, motivo: 'tope' };
    return { ok: true, retencion_hasta: hasta };
  } catch (e) {
    if (UNIQUE.test(String(e?.message))) return { ok: false, motivo: 'ocupada' };
    throw e;
  }
}

export async function reservasActivasEntre(db, desde, hasta, ahora) {
  const { results } = await db.prepare(
    `SELECT id, inicio_utc, fecha_lima, nutricionista_id, modalidad, peso_tope FROM reservas
     WHERE fecha_lima >= ?1 AND fecha_lima < ?2
       AND (estado = 'confirmada' OR (estado IN ('apartada', 'pagando') AND retencion_hasta >= ?3))`,
  ).bind(desde, hasta, ahora.toISOString()).all();
  return results;
}

export const reservaPorToken = (db, token) => db.prepare(`${CON_CLIENTE} WHERE r.token = ?1`).bind(token).first();
export const reservaPorId = (db, id) => db.prepare(`${CON_CLIENTE} WHERE r.id = ?1`).bind(id).first();

export async function guardarDatosYPagar(db, { reserva, cliente, condicionesVersion, novedades, ahora }) {
  const ahoraIso = ahora.toISOString();
  const hasta = new Date(Date.parse(reserva.creado_en) + 30 * MIN).toISOString();
  const clienteId = reserva.cliente_id || crypto.randomUUID();
  const guardarCliente = reserva.cliente_id
    ? db.prepare('UPDATE clientes SET nombre = ?2, whatsapp = ?3, email = ?4, dni = ?5 WHERE id = ?1')
      .bind(clienteId, cliente.nombre, cliente.whatsapp, cliente.email, cliente.dni)
    : db.prepare('INSERT INTO clientes (id, nombre, whatsapp, email, dni, creado_en) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
      .bind(clienteId, cliente.nombre, cliente.whatsapp, cliente.email, cliente.dni, ahoraIso);
  const actualizar = db.prepare(
    `UPDATE reservas SET cliente_id = ?1, estado = 'pagando', retencion_hasta = ?2,
       acepto_condiciones_version = ?3, novedades_optin = ?4, actualizado_en = ?5
     WHERE id = ?6 AND estado IN ('apartada', 'pagando') AND retencion_hasta >= ?5`,
  ).bind(clienteId, hasta, condicionesVersion, novedades ? 1 : 0, ahoraIso, reserva.id);
  const [, res] = await db.batch([guardarCliente, actualizar]);
  if (res.meta.changes === 0) return { ok: false, motivo: 'vencida' };
  return { ok: true, retencion_hasta: hasta };
}

export const guardarPreferencia = (db, id, pref, ahora) => db.prepare(
  'UPDATE reservas SET mp_preference_id = ?2, actualizado_en = ?3 WHERE id = ?1',
).bind(id, pref, ahora.toISOString()).run();

export const registrarPago = (db, p) => db.prepare(
  `INSERT INTO pagos (id, reserva_id, mp_payment_id, estado, monto_centimos, metodo, creado_en)
   VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
   ON CONFLICT (mp_payment_id) DO UPDATE SET estado = excluded.estado`,
).bind(crypto.randomUUID(), p.reserva_id, p.mp_payment_id, p.estado, p.monto_centimos, p.metodo, p.ahora.toISOString()).run();

export const ultimoPago = (db, reservaId) => db.prepare(
  'SELECT estado FROM pagos WHERE reserva_id = ?1 ORDER BY creado_en DESC LIMIT 1',
).bind(reservaId).first();

export async function confirmarReserva(db, { id, fecha_lima, primerasManuales, tope, ahora }) {
  try {
    const res = await db.prepare(
      `UPDATE reservas SET estado = 'confirmada', retencion_hasta = NULL, actualizado_en = ?2
       WHERE id = ?1 AND (
         estado IN ('apartada', 'pagando')
         OR (estado = 'expirada' AND (SELECT COALESCE(SUM(peso_tope), 0) FROM reservas
               WHERE fecha_lima = ?3 AND estado IN ${ACTIVOS} AND id <> ?1) + peso_tope + ?4 <= ?5))`,
    ).bind(id, ahora.toISOString(), fecha_lima, primerasManuales, tope).run();
    if (res.meta.changes === 1) return { ok: true };
    const actual = await reservaPorId(db, id);
    return { ok: false, motivo: actual?.estado === 'confirmada' ? 'ya_confirmada' : 'tope' };
  } catch (e) {
    if (UNIQUE.test(String(e?.message))) return { ok: false, motivo: 'ocupada' };
    throw e;
  }
}

export const marcarSinHora = (db, id, ahora) => db.prepare(
  `UPDATE reservas SET estado = 'pagada_sin_hora', retencion_hasta = NULL, actualizado_en = ?2
   WHERE id = ?1 AND estado IN ('apartada', 'pagando', 'expirada')`,
).bind(id, ahora.toISOString()).run();

export const guardarEvento = (db, id, eventId, meetUrl, ahora) => db.prepare(
  `UPDATE reservas SET google_event_id = ?2, meet_url = ?3, calendario_pendiente = 0, actualizado_en = ?4
   WHERE id = ?1`,
).bind(id, eventId, meetUrl, ahora.toISOString()).run();

export const marcarCalendarioPendiente = (db, id, ahora) => db.prepare(
  'UPDATE reservas SET calendario_pendiente = 1, actualizado_en = ?2 WHERE id = ?1',
).bind(id, ahora.toISOString()).run();

export async function reubicar(db, r) {
  try {
    const res = await db.prepare(
      `UPDATE reservas SET nutricionista_id = ?2, inicio_utc = ?3, fecha_lima = ?4, modalidad = ?5,
         estado = 'confirmada', google_event_id = NULL, meet_url = NULL, actualizado_en = ?6
       WHERE id = ?1 AND estado = 'pagada_sin_hora'
         AND (SELECT COALESCE(SUM(peso_tope), 0) FROM reservas
              WHERE fecha_lima = ?4 AND estado IN ${ACTIVOS} AND id <> ?1) + peso_tope + ?7 <= ?8`,
    ).bind(r.id, r.nutricionista_id, r.inicio_utc, r.fecha_lima, r.modalidad, r.ahora.toISOString(),
      r.primerasManuales, r.tope).run();
    return res.meta.changes === 1 ? { ok: true } : { ok: false, motivo: 'tope' };
  } catch (e) {
    if (UNIQUE.test(String(e?.message))) return { ok: false, motivo: 'ocupada' };
    throw e;
  }
}

export const purgarNoPagadas = (db, ahora, dias = 30) => {
  const limite = new Date(ahora.getTime() - dias * 86400000).toISOString();
  return db.prepare(
    `UPDATE clientes SET nombre = NULL, whatsapp = NULL, email = NULL, dni = NULL
     WHERE nombre IS NOT NULL
       AND id IN (SELECT cliente_id FROM reservas WHERE cliente_id IS NOT NULL AND (
             (estado IN ('expirada', 'cancelada') AND actualizado_en < ?1)
             OR (estado IN ('apartada', 'pagando') AND retencion_hasta < ?1)))
       AND id NOT IN (SELECT cliente_id FROM reservas
             WHERE cliente_id IS NOT NULL AND estado IN ('confirmada', 'pagada_sin_hora'))`,
  ).bind(limite).run();
};
```

- [ ] **Step 4: Correr**

Run: `npm test`
Expected: PASS, 66 pruebas.

- [ ] **Step 5: Commit**

```bash
git add server/reservas/repo.mjs server/reservas/repo.test.mjs
git commit -m "reservas: repositorio D1 con retención, tope atómico, pagos idempotentes y purga"
```

---

### Task 5: Integraciones (correo, Google, Mercado Pago, .ics)

**Files:**
- Create: `server/correo.mjs`, `server/reservas/google.mjs`, `server/reservas/google.test.mjs`, `server/reservas/mercadopago.mjs`, `server/reservas/mercadopago.test.mjs`, `server/reservas/correos.mjs`, `server/reservas/ics.mjs`, `server/reservas/correos.test.mjs`
- Modify: `server/deps.mjs` (usar `crearSendEmail`)

**Interfaces:**
- Produces:
  - `crearSendEmail(env, fetchImpl = fetch)` → `async ({ from, to, subject, html }) => boolean`. No lanza nunca: ante cualquier fallo devuelve `false`.
  - `normalizarEvento(evGoogle)` → evento normalizado (forma de Task 3).
  - `crearGoogle(env, fetchImpl = fetch, reloj = Date.now)` → `{ listarEventos(desdeUtc, hastaUtc): Promise<Evento[]>, crearEvento({ reservaId, titulo, descripcion, inicioUtc, finUtc, modalidad, direccion, invitado: { email, nombre } }): Promise<{ id, meet }> }`
  - `_limpiarCachesGoogle()` (solo para pruebas)
  - `crearMp(env, fetchImpl = fetch)` → `{ crearPreferencia({ reservaId, titulo, montoCentimos, email, nombre, venceEn: Date, ahora: Date, urlRetorno }): Promise<{ id, init_point }>, obtenerPago(id): Promise<pago> }`
  - `isoLima(date)` → `'YYYY-MM-DDTHH:mm:ss.000-05:00'`
  - `firmaValida({ xSignature, xRequestId, dataId, secreto }): Promise<boolean>`
  - Correos (cada uno devuelve `{ subject, html }`):
    - `correoConfirmacion({ nombre, titulo, etiqueta, modalidad, direccion, meet, nutricionista, urlIcs })`
    - `correoEquipoConfirmada({ nombre, whatsapp, email, dni, titulo, etiqueta, modalidad, nutricionista, monto, calendarioPendiente, novedades })`
    - `correoSinHora({ nombre, urlReubicar })`
    - `correoEquipoAlerta({ asunto, detalle })`
  - `icsDeReserva({ uid, titulo, inicioUtc, finUtc, ubicacion, descripcion, ahora })` → string

- [ ] **Step 1: Pruebas que fallan**

`server/reservas/google.test.mjs`:

```js
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { crearGoogle, normalizarEvento, _limpiarCachesGoogle } from './google.mjs';

const env = { GOOGLE_CLIENT_ID: 'c', GOOGLE_CLIENT_SECRET: 's', GOOGLE_REFRESH_TOKEN: 'r', GOOGLE_CALENDAR_ID: 'cal@group.calendar.google.com' };
beforeEach(() => _limpiarCachesGoogle());

function fetchFalso(rutas) {
  const llamadas = [];
  const f = async (url, init = {}) => {
    llamadas.push({ url: String(url), init });
    const ruta = rutas.find(([patron]) => String(url).includes(patron));
    const [, cuerpo, status = 200] = ruta;
    return new Response(JSON.stringify(typeof cuerpo === 'function' ? cuerpo(url, init) : cuerpo), { status });
  };
  f.llamadas = llamadas;
  return f;
}

test('normaliza eventos con hora, de día completo, propios y transparentes', () => {
  assert.deepEqual(normalizarEvento({ summary: 'nico no viene', start: { date: '2026-10-07' }, end: { date: '2026-10-08' } }),
    { titulo: 'nico no viene', todoElDia: true, desde: '2026-10-07', hasta: '2026-10-08', propio: false, bloquea: true });
  const ev = normalizarEvento({ start: { dateTime: '2026-10-06T15:00:00-05:00' }, end: { dateTime: '2026-10-06T16:00:00-05:00' },
    transparency: 'transparent', extendedProperties: { private: { ajl_reserva_id: 'x' } } });
  assert.equal(ev.titulo, '');
  assert.equal(ev.propio, true);
  assert.equal(ev.bloquea, false);
});

test('listarEventos pide token, pagina, descarta cancelados y cachea 60 s', async () => {
  const f = fetchFalso([
    ['oauth2.googleapis.com/token', { access_token: 'AT', expires_in: 3600 }],
    ['/events', (url) => (String(url).includes('pageToken=p2')
      ? { items: [{ summary: 'B', start: { date: '2026-10-07' }, end: { date: '2026-10-08' } }] }
      : { items: [{ summary: 'A', start: { date: '2026-10-07' }, end: { date: '2026-10-08' } }, { status: 'cancelled', start: { date: '2026-10-07' }, end: { date: '2026-10-08' } }], nextPageToken: 'p2' })],
  ]);
  const g = crearGoogle(env, f, () => 1000);
  const eventos = await g.listarEventos('2026-10-06T05:00:00Z', '2026-10-13T05:00:00Z');
  assert.deepEqual(eventos.map((e) => e.titulo), ['A', 'B']);
  assert.match(f.llamadas[1].url, /calendars\/cal%40group\.calendar\.google\.com\/events/);
  assert.equal(f.llamadas[1].init.headers.Authorization, 'Bearer AT');
  await g.listarEventos('2026-10-06T05:00:00Z', '2026-10-13T05:00:00Z');
  assert.equal(f.llamadas.length, 3);
});

test('crearEvento por video pide Meet, invita al paciente y marca la reserva', async () => {
  const f = fetchFalso([
    ['oauth2.googleapis.com/token', { access_token: 'AT', expires_in: 3600 }],
    ['/events?', { id: 'ev1', hangoutLink: 'https://meet.google.com/abc' }],
  ]);
  const g = crearGoogle(env, f);
  const r = await g.crearEvento({ reservaId: 'r1', titulo: '1ra · Ana · Plan', descripcion: 'd', inicioUtc: '2026-10-09T20:00:00Z',
    finUtc: '2026-10-09T21:00:00Z', modalidad: 'video', direccion: 'Lince', invitado: { email: 'ana@x.pe', nombre: 'Ana' } });
  assert.deepEqual(r, { id: 'ev1', meet: 'https://meet.google.com/abc' });
  const { url, init } = f.llamadas[1];
  assert.match(url, /conferenceDataVersion=1/);
  assert.match(url, /sendUpdates=all/);
  const cuerpo = JSON.parse(init.body);
  assert.equal(cuerpo.conferenceData.createRequest.conferenceSolutionKey.type, 'hangoutsMeet');
  assert.equal(cuerpo.extendedProperties.private.ajl_reserva_id, 'r1');
  assert.deepEqual(cuerpo.attendees, [{ email: 'ana@x.pe', displayName: 'Ana' }]);
  assert.equal(cuerpo.location, undefined);
});

test('crearEvento presencial lleva la dirección y no pide Meet', async () => {
  const f = fetchFalso([['oauth2.googleapis.com/token', { access_token: 'AT', expires_in: 3600 }], ['/events?', { id: 'ev2' }]]);
  const g = crearGoogle(env, f);
  await g.crearEvento({ reservaId: 'r2', titulo: 't', descripcion: 'd', inicioUtc: '2026-10-06T17:00:00Z', finUtc: '2026-10-06T18:00:00Z',
    modalidad: 'presencial', direccion: 'Jr. Almirante 1461, Lince, Lima', invitado: { email: 'a@x.pe', nombre: 'A' } });
  const cuerpo = JSON.parse(f.llamadas[1].init.body);
  assert.equal(cuerpo.location, 'Jr. Almirante 1461, Lince, Lima');
  assert.equal(cuerpo.conferenceData, undefined);
});
```

`server/reservas/mercadopago.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { crearMp, firmaValida, isoLima } from './mercadopago.mjs';

test('isoLima escribe la hora de Lima con su desfase', () => {
  assert.equal(isoLima(new Date('2026-10-06T17:30:00Z')), '2026-10-06T12:30:00.000-05:00');
});

test('crearPreferencia: un ítem en soles, una cuota, sin efectivo, con vencimiento y retorno', async () => {
  let pedido;
  const f = async (url, init) => { pedido = { url, init }; return new Response(JSON.stringify({ id: 'pref1', init_point: 'https://mp/pay' })); };
  const mp = crearMp({ MP_ACCESS_TOKEN: 'TEST-1' }, f);
  const r = await mp.crearPreferencia({ reservaId: 'r1', titulo: '2 sesiones al mes · 3 meses', montoCentimos: 108000, email: 'a@x.pe',
    nombre: 'Ana', venceEn: new Date('2026-10-05T15:30:00Z'), ahora: new Date('2026-10-05T15:00:00Z'), urlRetorno: 'https://w/reservar/listo/?r=t' });
  assert.deepEqual(r, { id: 'pref1', init_point: 'https://mp/pay' });
  assert.equal(pedido.url, 'https://api.mercadopago.com/checkout/preferences');
  assert.equal(pedido.init.headers.Authorization, 'Bearer TEST-1');
  const c = JSON.parse(pedido.init.body);
  assert.deepEqual(c.items, [{ id: 'r1', title: '2 sesiones al mes · 3 meses', quantity: 1, unit_price: 1080, currency_id: 'PEN' }]);
  assert.equal(c.external_reference, 'r1');
  assert.deepEqual(c.payment_methods, { excluded_payment_types: [{ id: 'ticket' }, { id: 'atm' }], installments: 1 });
  assert.equal(c.expires, true);
  assert.equal(c.expiration_date_to, '2026-10-05T10:30:00.000-05:00');
  assert.equal(c.back_urls.success, 'https://w/reservar/listo/?r=t');
  assert.equal(c.auto_return, 'approved');
});

test('crearPreferencia lanza si MP responde error', async () => {
  const mp = crearMp({ MP_ACCESS_TOKEN: 'x' }, async () => new Response('{"message":"bad"}', { status: 400 }));
  await assert.rejects(mp.crearPreferencia({ reservaId: 'r', titulo: 't', montoCentimos: 100, email: 'a@x.pe', nombre: 'A',
    venceEn: new Date(), ahora: new Date(), urlRetorno: 'u' }), /Mercado Pago 400/);
});

test('firmaValida acepta la firma correcta y rechaza la alterada o ausente', async () => {
  const secreto = 'secreto-webhook';
  const manifiesto = 'id:123456;request-id:req-1;ts:1700000000;';
  const v1 = createHmac('sha256', secreto).update(manifiesto).digest('hex');
  const base = { xRequestId: 'req-1', dataId: '123456', secreto };
  assert.equal(await firmaValida({ ...base, xSignature: `ts=1700000000,v1=${v1}` }), true);
  assert.equal(await firmaValida({ ...base, xSignature: `ts=1700000000,v1=${'0'.repeat(64)}` }), false);
  assert.equal(await firmaValida({ ...base, xSignature: null }), false);
  assert.equal(await firmaValida({ ...base, dataId: '999', xSignature: `ts=1700000000,v1=${v1}` }), false);
});
```

`server/reservas/correos.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { correoConfirmacion, correoEquipoConfirmada } from './correos.mjs';
import { icsDeReserva } from './ics.mjs';
import { crearSendEmail } from '../correo.mjs';

test('los correos escapan lo que escribe el paciente', () => {
  const c = correoEquipoConfirmada({ nombre: '<script>x</script>', whatsapp: '+51', email: 'a@x.pe', dni: null, titulo: 'T',
    etiqueta: 'E', modalidad: 'video', nutricionista: 'Nico', monto: 1080, calendarioPendiente: true, novedades: false });
  assert.ok(!c.html.includes('<script>'));
  assert.ok(c.html.includes('&lt;script&gt;'));
  assert.match(c.html, /a mano/);
});

test('confirmación por video incluye el Meet; presencial, la dirección', () => {
  const v = correoConfirmacion({ nombre: 'Ana', titulo: 'T', etiqueta: 'jueves', modalidad: 'video', direccion: 'Lince', meet: 'https://meet/x', nutricionista: 'Nico', urlIcs: 'https://i' });
  assert.match(v.html, /https:\/\/meet\/x/);
  const p = correoConfirmacion({ nombre: 'Ana', titulo: 'T', etiqueta: 'jueves', modalidad: 'presencial', direccion: 'Jr. Almirante', meet: null, nutricionista: 'Nico', urlIcs: 'https://i' });
  assert.match(p.html, /Jr\. Almirante/);
});

test('ics con horas UTC y texto escapado', () => {
  const t = icsDeReserva({ uid: 'r1', titulo: 'Sesión, AJL', inicioUtc: '2026-10-06T17:00:00Z', finUtc: '2026-10-06T18:00:00Z',
    ubicacion: 'Lince; Lima', descripcion: 'a\nb', ahora: new Date('2026-10-05T15:00:00Z') });
  assert.match(t, /DTSTART:20261006T170000Z/);
  assert.match(t, /SUMMARY:Sesión\\, AJL/);
  assert.match(t, /LOCATION:Lince\\; Lima/);
  assert.match(t, /\r\nEND:VCALENDAR\r\n$/);
});

test('sendEmail devuelve false si la red falla, sin lanzar', async () => {
  const send = crearSendEmail({ RESEND_API_KEY: 'k' }, async () => { throw new Error('red'); });
  assert.equal(await send({ from: 'a', to: 'b', subject: 's', html: 'h' }), false);
});
```

- [ ] **Step 2: Ver que fallan**

Run: `npm test`
Expected: FAIL, módulos inexistentes.

- [ ] **Step 3: Implementar**

`server/correo.mjs`:

```js
// Envío de correos por Resend, compartido por todas las funciones. Nunca lanza:
// un correo que falla no debe tumbar un reclamo guardado ni un pago confirmado.
const RESEND_URL = 'https://api.resend.com/emails';

export function crearSendEmail(env, fetchImpl = fetch) {
  return async function sendEmail({ from, to, subject, html }) {
    try {
      const r = await fetchImpl(RESEND_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to, subject, html }),
      });
      if (!r.ok) console.error('Resend error', r.status, await r.text());
      return r.ok;
    } catch (e) {
      console.error('Resend sin respuesta', e);
      return false;
    }
  };
}
```

`server/deps.mjs` queda:

```js
// ─── Dependencias externas de las funciones, creadas desde env ──────────────
// En Workers no hay process.env: las variables llegan en context.env de cada
// request, así que el cliente se crea por request y no a nivel de módulo.

import { createClient } from '@supabase/supabase-js';
import { crearSendEmail } from './correo.mjs';

export function makeDeps(env) {
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });
  return { db, sendEmail: crearSendEmail(env) };
}
```

`server/reservas/google.mjs`:

```js
// Google Calendar del equipo (Gmail normal, sin Workspace): OAuth con el
// refresh token de la cuenta dueña del calendario. Se lee para saber qué está
// ocupado y se escribe al confirmar un pago.
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://www.googleapis.com/calendar/v3';
const CACHE_EVENTOS_MS = 60 * 1000;

// Caché a nivel de módulo: sobrevive entre requests del mismo isolate.
let tokenCacheado = null;
const eventosCacheados = new Map();
export function _limpiarCachesGoogle() { tokenCacheado = null; eventosCacheados.clear(); }

export function normalizarEvento(ev) {
  const todoElDia = Boolean(ev.start?.date);
  return {
    titulo: ev.summary || '',
    todoElDia,
    desde: todoElDia ? ev.start.date : ev.start?.dateTime,
    hasta: todoElDia ? ev.end.date : ev.end?.dateTime,
    propio: Boolean(ev.extendedProperties?.private?.ajl_reserva_id),
    bloquea: ev.transparency !== 'transparent',
  };
}

export function crearGoogle(env, fetchImpl = fetch, reloj = Date.now) {
  const calendario = encodeURIComponent(env.GOOGLE_CALENDAR_ID || '');

  async function token() {
    if (tokenCacheado && tokenCacheado.vence > reloj() + 60000) return tokenCacheado.valor;
    const r = await fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET,
        refresh_token: env.GOOGLE_REFRESH_TOKEN, grant_type: 'refresh_token',
      }),
    });
    if (!r.ok) throw new Error(`Google token ${r.status}: ${await r.text()}`);
    const d = await r.json();
    tokenCacheado = { valor: d.access_token, vence: reloj() + d.expires_in * 1000 };
    return tokenCacheado.valor;
  }

  async function listarEventos(desdeUtc, hastaUtc) {
    const clave = `${calendario}|${desdeUtc}|${hastaUtc}`;
    const enCache = eventosCacheados.get(clave);
    if (enCache && enCache.vence > reloj()) return enCache.eventos;
    const eventos = [];
    let pageToken;
    do {
      const q = new URLSearchParams({ timeMin: desdeUtc, timeMax: hastaUtc, singleEvents: 'true', maxResults: '2500' });
      if (pageToken) q.set('pageToken', pageToken);
      const r = await fetchImpl(`${API}/calendars/${calendario}/events?${q}`, {
        headers: { Authorization: `Bearer ${await token()}` },
      });
      if (!r.ok) throw new Error(`Google events.list ${r.status}: ${await r.text()}`);
      const d = await r.json();
      eventos.push(...(d.items || []).filter((ev) => ev.status !== 'cancelled').map(normalizarEvento));
      pageToken = d.nextPageToken;
    } while (pageToken);
    eventosCacheados.set(clave, { vence: reloj() + CACHE_EVENTOS_MS, eventos });
    return eventos;
  }

  async function crearEvento(e) {
    const cuerpo = {
      summary: e.titulo,
      description: e.descripcion,
      start: { dateTime: e.inicioUtc, timeZone: 'America/Lima' },
      end: { dateTime: e.finUtc, timeZone: 'America/Lima' },
      attendees: [{ email: e.invitado.email, displayName: e.invitado.nombre }],
      extendedProperties: { private: { ajl_reserva_id: e.reservaId } },
    };
    if (e.modalidad === 'presencial') cuerpo.location = e.direccion;
    else cuerpo.conferenceData = { createRequest: { requestId: e.reservaId, conferenceSolutionKey: { type: 'hangoutsMeet' } } };

    const r = await fetchImpl(`${API}/calendars/${calendario}/events?conferenceDataVersion=1&sendUpdates=all`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    });
    if (!r.ok) throw new Error(`Google events.insert ${r.status}: ${await r.text()}`);
    const d = await r.json();
    eventosCacheados.clear();
    return { id: d.id, meet: d.hangoutLink || null };
  }

  return { listarEventos, crearEvento };
}
```

`server/reservas/mercadopago.mjs`:

```js
// Mercado Pago Checkout Pro: preferencia (la página de pago de MP), consulta
// del pago y verificación de la firma del webhook. El monto nunca viene del
// navegador: lo calcula catalogo.mjs.
const API = 'https://api.mercadopago.com';

export function isoLima(fecha) {
  return new Date(fecha.getTime() - 5 * 3600 * 1000).toISOString().replace('Z', '-05:00');
}

export function crearMp(env, fetchImpl = fetch) {
  const auth = { Authorization: `Bearer ${env.MP_ACCESS_TOKEN}` };

  async function crearPreferencia({ reservaId, titulo, montoCentimos, email, nombre, venceEn, ahora, urlRetorno }) {
    const cuerpo = {
      items: [{ id: reservaId, title: titulo, quantity: 1, unit_price: montoCentimos / 100, currency_id: 'PEN' }],
      payer: { name: nombre, email },
      external_reference: reservaId,
      back_urls: { success: urlRetorno, pending: urlRetorno, failure: urlRetorno },
      auto_return: 'approved',
      payment_methods: { excluded_payment_types: [{ id: 'ticket' }, { id: 'atm' }], installments: 1 },
      expires: true,
      expiration_date_from: isoLima(ahora),
      expiration_date_to: isoLima(venceEn),
      statement_descriptor: 'AJLNUTRICION',
    };
    const r = await fetchImpl(`${API}/checkout/preferences`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json', 'X-Idempotency-Key': `${reservaId}-${venceEn.getTime()}` },
      body: JSON.stringify(cuerpo),
    });
    if (!r.ok) throw new Error(`Mercado Pago ${r.status}: ${await r.text()}`);
    const d = await r.json();
    return { id: d.id, init_point: d.init_point };
  }

  async function obtenerPago(id) {
    const r = await fetchImpl(`${API}/v1/payments/${encodeURIComponent(id)}`, { headers: auth });
    if (!r.ok) throw new Error(`Mercado Pago pago ${r.status}: ${await r.text()}`);
    return r.json();
  }

  return { crearPreferencia, obtenerPago };
}

function iguales(a, b) {
  if (a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}

// x-signature: "ts=...,v1=<hmac-sha256 hex>"; manifiesto "id:<data.id>;request-id:<x-request-id>;ts:<ts>;"
export async function firmaValida({ xSignature, xRequestId, dataId, secreto }) {
  if (!xSignature || !secreto) return false;
  const partes = Object.fromEntries(xSignature.split(',').map((p) => p.trim().split('=')));
  if (!partes.ts || !partes.v1) return false;
  const id = /^[a-z0-9]+$/i.test(dataId || '') ? String(dataId).toLowerCase() : dataId;
  let manifiesto = '';
  if (id) manifiesto += `id:${id};`;
  if (xRequestId) manifiesto += `request-id:${xRequestId};`;
  manifiesto += `ts:${partes.ts};`;
  const clave = await crypto.subtle.importKey('raw', new TextEncoder().encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const firma = await crypto.subtle.sign('HMAC', clave, new TextEncoder().encode(manifiesto));
  const hex = [...new Uint8Array(firma)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return iguales(hex, partes.v1);
}
```

`server/reservas/correos.mjs`:

```js
// Plantillas de correo de reservas. Todo lo que escribió el paciente pasa por
// esc(): un nombre con HTML no puede inyectar nada en el correo del equipo.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const marco = (cuerpo) => `
  <div style="font-family:system-ui,Arial,sans-serif;max-width:560px;margin:auto;color:#20302A">
    ${cuerpo}
    <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
    <p style="font-size:12px;color:#5E6B63">AJL Nutrición · Jr. Almirante Manuel Villavicencio 1461, Lince, Lima · WhatsApp +51 919 151 237</p>
  </div>`;

const boton = (href, texto) => `<p style="margin:24px 0"><a href="${esc(href)}" style="background:#D68A5C;color:#fff;text-decoration:none;font-weight:700;padding:13px 26px;border-radius:999px;display:inline-block">${esc(texto)}</a></p>`;

export function correoConfirmacion({ nombre, titulo, etiqueta, modalidad, direccion, meet, nutricionista, urlIcs }) {
  const donde = modalidad === 'video'
    ? (meet ? `Por videollamada: <a href="${esc(meet)}">${esc(meet)}</a>` : 'Por videollamada: el enlace llega en la invitación de Google Calendar.')
    : `En nuestro consultorio: ${esc(direccion)}`;
  return {
    subject: `Tu primera sesión: ${etiqueta} · AJL Nutrición`,
    html: marco(`
      <h2 style="font-family:Georgia,serif;color:#173C2C">Listo, ${esc(nombre)}. Tu sesión está reservada.</h2>
      <p><strong>${esc(etiqueta)}</strong> · 60 min · con ${esc(nutricionista)}</p>
      <p>${donde}</p>
      <p>Plan: ${esc(titulo)}</p>
      ${boton(urlIcs, 'Agregar a mi calendario')}
      <p>Si necesitas mover tu cita, escríbenos por WhatsApp. Es gratis hasta 48 horas antes.</p>`),
  };
}

export function correoEquipoConfirmada(d) {
  return {
    subject: `Nueva reserva web: ${d.nombre} · ${d.etiqueta}`,
    html: marco(`
      <h2 style="color:#BE6E42">Reserva pagada en la web</h2>
      ${d.calendarioPendiente ? '<p style="color:#b00020"><strong>No se pudo crear el evento en el calendario: créalo a mano.</strong></p>' : ''}
      <p><strong>${esc(d.nombre)}</strong> · ${esc(d.whatsapp)} · ${esc(d.email)}${d.dni ? ` · DNI ${esc(d.dni)}` : ''}</p>
      <p>${esc(d.titulo)} · S/${esc(d.monto)}</p>
      <p>${esc(d.etiqueta)} · ${d.modalidad === 'video' ? 'Videollamada' : 'Presencial'} · ${esc(d.nutricionista)}</p>
      <p>Novedades por correo: ${d.novedades ? 'sí' : 'no'}</p>
      <p>Emitir el comprobante de pago.</p>`),
  };
}

export function correoSinHora({ nombre, urlReubicar }) {
  return {
    subject: 'Tu pago está confirmado: elige tu hora · AJL Nutrición',
    html: marco(`
      <h2 style="font-family:Georgia,serif;color:#173C2C">Tu pago llegó, ${esc(nombre)}.</h2>
      <p>La hora que habías elegido se ocupó mientras pagabas. No tienes que pagar de nuevo: elige otra hora aquí.</p>
      ${boton(urlReubicar, 'Elegir mi hora')}`),
  };
}

export function correoEquipoAlerta({ asunto, detalle }) {
  return { subject: `Reservas web: ${asunto}`, html: marco(`<h2 style="color:#b00020">${esc(asunto)}</h2><p>${esc(detalle)}</p>`) };
}
```

`server/reservas/ics.mjs`:

```js
// Archivo .ics para «Agregar a mi calendario» (Apple, Outlook y otros).
const sello = (iso) => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (m) => `\\${m}`);

export function icsDeReserva({ uid, titulo, inicioUtc, finUtc, ubicacion, descripcion, ahora }) {
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//AJL Nutricion//Reservas//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}@ajlnutricion.com`,
    `DTSTAMP:${sello(ahora.toISOString())}`,
    `DTSTART:${sello(inicioUtc)}`,
    `DTEND:${sello(finUtc)}`,
    `SUMMARY:${esc(titulo)}`,
    `LOCATION:${esc(ubicacion)}`,
    `DESCRIPTION:${esc(descripcion)}`,
    'END:VEVENT', 'END:VCALENDAR', '',
  ].join('\r\n');
}
```

- [ ] **Step 4: Correr**

Run: `npm test`
Expected: PASS, 78 pruebas (incluidas las de newsletter y reclamaciones, que siguen usando `makeDeps`).

- [ ] **Step 5: Commit**

```bash
git add server/correo.mjs server/deps.mjs server/reservas/google.mjs server/reservas/google.test.mjs server/reservas/mercadopago.mjs server/reservas/mercadopago.test.mjs server/reservas/correos.mjs server/reservas/correos.test.mjs server/reservas/ics.mjs
git commit -m "reservas: integraciones con Google Calendar, Mercado Pago, correos e .ics"
```

---

### Task 6: Procesar el pago y confirmar

**Files:**
- Create: `server/reservas/confirmar.mjs`, `server/reservas/confirmar.test.mjs`

**Interfaces:**
- Consumes: `repo.*` (Task 4), `horasLibres`, `primerasManuales` (Task 3), `cotizar` (Task 2), `etiquetaLima`, `inicioUtc`, `sumarDias` (Task 2), correos (Task 5), `siteUrl` (`server/http.mjs`), `contacto` (`src/data/contacto.js`), `TOPE_PRIMERAS` (Task 2).
- Produces:
  - `procesarPago(deps, env, paymentId, { reservaId = null } = {})` → `{ estado: 'confirmada' | 'pagada_sin_hora' | 'monto_invalido' | 'desconocido' | <estado actual>, pago?: string }`
  - `finalizarConfirmacion(deps, env, reserva)` → crea el evento (o marca pendiente) y manda los dos correos.
  - `deps` = `{ db, sendEmail, google, mp, nutricionistas, ahora: () => Date }`

- [ ] **Step 1: Pruebas que fallan**

`server/reservas/confirmar.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1DePrueba } from './d1-prueba.mjs';
import * as repo from './repo.mjs';
import { procesarPago } from './confirmar.mjs';
import { nutricionistas } from '../../src/data/nutricionistas.js';

const t0 = new Date('2026-10-05T15:00:00Z');
const env = { NEWSLETTER_FROM: 'AJL <hola@ajlnutricion.com>', NOTIFICATION_EMAIL: 'equipo@x.pe', PUBLIC_SITE_URL: 'https://www.ajlnutricion.com' };

async function preparar({ pagos = {}, eventosCalendario = [], fallaCalendario = false } = {}) {
  const db = d1DePrueba();
  const correos = [];
  const creados = [];
  let reloj = t0;
  const deps = {
    db, nutricionistas,
    ahora: () => reloj,
    sendEmail: async (m) => { correos.push(m); return true; },
    google: {
      listarEventos: async () => eventosCalendario,
      crearEvento: async (e) => { if (fallaCalendario) throw new Error('google caído'); creados.push(e); return { id: `ev${creados.length}`, meet: e.modalidad === 'video' ? 'https://meet/x' : null }; },
    },
    mp: { obtenerPago: async (id) => pagos[id] },
  };
  await repo.crearRetencion(db, { id: 'r1', token: 'tok1', producto: 'constancia', duracion_meses: 3, monto_centimos: 108000, peso_tope: 1,
    nutricionista_id: 'nico', inicio_utc: '2026-10-06T17:00:00Z', fecha_lima: '2026-10-06', modalidad: 'presencial', primerasManuales: 0, tope: 3, ahora: t0 });
  const r = await repo.reservaPorToken(db, 'tok1');
  await repo.guardarDatosYPagar(db, { reserva: r, cliente: { nombre: 'Ana Pérez', whatsapp: '+51987654321', email: 'ana@x.pe', dni: '12345678' },
    condicionesVersion: 'v', novedades: false, ahora: t0 });
  return { db, deps, correos, creados, mover: (min) => { reloj = new Date(t0.getTime() + min * 60000); } };
}
const aprobado = (o = {}) => ({ id: 555, status: 'approved', external_reference: 'r1', transaction_amount: 1080, currency_id: 'PEN', payment_method_id: 'visa', ...o });

test('aprobado a tiempo: confirma, crea el evento «1ra» y manda dos correos', async () => {
  const { db, deps, correos, creados } = await preparar({ pagos: { 555: aprobado() } });
  assert.deepEqual(await procesarPago(deps, env, '555'), { estado: 'confirmada' });
  const r = await repo.reservaPorId(db, 'r1');
  assert.equal(r.estado, 'confirmada');
  assert.equal(r.google_event_id, 'ev1');
  assert.match(creados[0].titulo, /^1ra · Ana Pérez · 2 sesiones al mes · 3 meses$/);
  assert.deepEqual(correos.map((c) => c.to).sort(), ['ana@x.pe', 'equipo@x.pe']);
});

test('procesar dos veces el mismo pago: un solo evento y un solo par de correos', async () => {
  const { deps, correos, creados } = await preparar({ pagos: { 555: aprobado() } });
  await Promise.all([procesarPago(deps, env, '555'), procesarPago(deps, env, '555')]);
  await procesarPago(deps, env, '555');
  assert.equal(creados.length, 1);
  assert.equal(correos.length, 2);
});

test('pendiente o rechazado: no confirma ni manda correos', async () => {
  const { db, deps, correos } = await preparar({ pagos: { 1: aprobado({ id: 1, status: 'pending' }), 2: aprobado({ id: 2, status: 'rejected' }) } });
  assert.equal((await procesarPago(deps, env, '1')).pago, 'pending');
  assert.equal((await procesarPago(deps, env, '2')).pago, 'rejected');
  assert.equal((await repo.reservaPorId(db, 'r1')).estado, 'pagando');
  assert.equal(correos.length, 0);
});

test('monto distinto: no confirma y alerta al equipo', async () => {
  const { db, deps, correos } = await preparar({ pagos: { 555: aprobado({ transaction_amount: 10 }) } });
  assert.deepEqual(await procesarPago(deps, env, '555'), { estado: 'monto_invalido' });
  assert.equal((await repo.reservaPorId(db, 'r1')).estado, 'pagando');
  assert.equal(correos[0].to, 'equipo@x.pe');
});

test('aprobado tarde con la hora tomada: pagada_sin_hora y link para reubicar', async () => {
  const { db, deps, correos, mover } = await preparar({ pagos: { 555: aprobado() } });
  mover(40);
  await repo.crearRetencion(db, { id: 'otro', token: 'tok2', producto: 'basico', duracion_meses: 1, monto_centimos: 25000, peso_tope: 1,
    nutricionista_id: 'jussara', inicio_utc: '2026-10-06T17:00:00Z', fecha_lima: '2026-10-06', modalidad: 'presencial', primerasManuales: 0, tope: 3, ahora: deps.ahora() });
  assert.deepEqual(await procesarPago(deps, env, '555'), { estado: 'pagada_sin_hora' });
  assert.equal((await repo.reservaPorId(db, 'r1')).estado, 'pagada_sin_hora');
  const alPaciente = correos.find((c) => c.to === 'ana@x.pe');
  assert.match(alPaciente.html, /\/reservar\/reubicar\/\?r=tok1/);
});

test('aprobado tarde con la hora todavía libre: confirma igual', async () => {
  const { db, deps, mover } = await preparar({ pagos: { 555: aprobado() } });
  mover(40);
  await repo.crearRetencion(db, { id: 'x', token: 'tx', producto: 'basico', duracion_meses: 1, monto_centimos: 25000, peso_tope: 1,
    nutricionista_id: 'paolo', inicio_utc: '2026-10-07T19:00:00Z', fecha_lima: '2026-10-07', modalidad: 'presencial', primerasManuales: 0, tope: 3, ahora: deps.ahora() });
  assert.deepEqual(await procesarPago(deps, env, '555'), { estado: 'confirmada' });
});

test('si Google falla tras el pago: queda confirmada, marcada pendiente y el equipo lo sabe', async () => {
  const { db, deps, correos } = await preparar({ pagos: { 555: aprobado() }, fallaCalendario: true });
  assert.deepEqual(await procesarPago(deps, env, '555'), { estado: 'confirmada' });
  const r = await repo.reservaPorId(db, 'r1');
  assert.equal(r.calendario_pendiente, 1);
  assert.match(correos.find((c) => c.to === 'equipo@x.pe').html, /a mano/);
});

test('pago de otra reserva o desconocida: no toca nada', async () => {
  const { db, deps } = await preparar({ pagos: { 9: aprobado({ id: 9, external_reference: 'otra' }) } });
  assert.deepEqual(await procesarPago(deps, env, '9'), { estado: 'desconocido' });
  assert.deepEqual(await procesarPago(deps, env, '9', { reservaId: 'r1' }), { estado: 'desconocido' });
  assert.equal((await repo.reservaPorId(db, 'r1')).estado, 'pagando');
});
```

- [ ] **Step 2: Ver que falla**

Run: `npm test`
Expected: FAIL, `Cannot find module '.../confirmar.mjs'`.

- [ ] **Step 3: Implementar**

`server/reservas/confirmar.mjs`:

```js
// Qué pasa cuando Mercado Pago dice que hubo un pago. Lo llaman el webhook y,
// como respaldo, la página de regreso del paciente: los dos pueden llegar a la
// vez, así que todo es idempotente y solo el que confirma en la base crea el
// evento y manda los correos.
import * as repo from './repo.mjs';
import { horasLibres, primerasManuales } from './disponibilidad.mjs';
import { cotizar } from './catalogo.mjs';
import { etiquetaLima, inicioUtc, sumarDias } from './tiempo.mjs';
import { TOPE_PRIMERAS } from './constantes.mjs';
import { correoConfirmacion, correoEquipoConfirmada, correoSinHora, correoEquipoAlerta } from './correos.mjs';
import { siteUrl } from '../http.mjs';
import { contacto } from '../../src/data/contacto.js';

const remitente = (env) => env.NEWSLETTER_FROM || 'AJL Nutrición <hola@ajlnutricion.com>';

async function alertaEquipo(deps, env, asunto, detalle) {
  await deps.sendEmail({ from: remitente(env), to: env.NOTIFICATION_EMAIL, ...correoEquipoAlerta({ asunto, detalle }) });
}

async function sinHora(deps, env, r) {
  await repo.marcarSinHora(deps.db, r.id, deps.ahora());
  const urlReubicar = `${siteUrl(env)}/reservar/reubicar/?r=${r.token}`;
  await Promise.all([
    deps.sendEmail({ from: remitente(env), to: r.email, ...correoSinHora({ nombre: r.nombre, urlReubicar }) }),
    alertaEquipo(deps, env, 'Pago sin hora', `${r.nombre} (${r.whatsapp}) pagó pero su hora se ocupó. Se le pidió elegir otra: ${urlReubicar}`),
  ]);
  return { estado: 'pagada_sin_hora' };
}

export async function finalizarConfirmacion(deps, env, r) {
  const nutricionista = deps.nutricionistas.find((n) => n.id === r.nutricionista_id);
  const precio = cotizar(r.producto, r.duracion_meses);
  const titulo = precio ? precio.titulo : r.producto;
  const etiqueta = etiquetaLima(r.inicio_utc);
  const prefijo = r.producto === 'evaluacion' ? 'Eval' : '1ra';
  let meet = null;
  let pendiente = false;
  try {
    const ev = await deps.google.crearEvento({
      reservaId: r.id,
      titulo: `${prefijo} · ${r.nombre} · ${titulo}`,
      descripcion: `WhatsApp: ${r.whatsapp}\nCorreo: ${r.email}\nPlan: ${titulo}\nNutricionista: ${nutricionista.nombre}\nReservado y pagado en la web (${r.id}).`,
      inicioUtc: r.inicio_utc,
      finUtc: new Date(Date.parse(r.inicio_utc) + 3600 * 1000).toISOString(),
      modalidad: r.modalidad,
      direccion: contacto.direccion,
      invitado: { email: r.email, nombre: r.nombre },
    });
    meet = ev.meet;
    await repo.guardarEvento(deps.db, r.id, ev.id, meet, deps.ahora());
  } catch (e) {
    console.error('crearEvento', e);
    pendiente = true;
    await repo.marcarCalendarioPendiente(deps.db, r.id, deps.ahora());
  }
  await Promise.all([
    deps.sendEmail({
      from: remitente(env), to: r.email,
      ...correoConfirmacion({ nombre: r.nombre, titulo, etiqueta, modalidad: r.modalidad, direccion: contacto.direccion, meet,
        nutricionista: nutricionista.nombre, urlIcs: `${siteUrl(env)}/api/reservas/ics?r=${r.token}` }),
    }),
    deps.sendEmail({
      from: remitente(env), to: env.NOTIFICATION_EMAIL,
      ...correoEquipoConfirmada({ nombre: r.nombre, whatsapp: r.whatsapp, email: r.email, dni: r.dni, titulo, etiqueta,
        modalidad: r.modalidad, nutricionista: nutricionista.nombre, monto: r.monto_centimos / 100,
        calendarioPendiente: pendiente, novedades: Boolean(r.novedades_optin) }),
    }),
  ]);
}

export async function procesarPago(deps, env, paymentId, { reservaId = null } = {}) {
  const pago = await deps.mp.obtenerPago(paymentId);
  const id = pago?.external_reference;
  if (!id || (reservaId && id !== reservaId)) return { estado: 'desconocido' };
  let r = await repo.reservaPorId(deps.db, id);
  if (!r) return { estado: 'desconocido' };

  const montoPagado = Math.round(Number(pago.transaction_amount) * 100);
  await repo.registrarPago(deps.db, { reserva_id: r.id, mp_payment_id: String(pago.id), estado: pago.status,
    monto_centimos: montoPagado, metodo: pago.payment_method_id || null, ahora: deps.ahora() });

  if (pago.status !== 'approved') return { estado: r.estado, pago: pago.status };
  if (r.estado === 'confirmada' || r.estado === 'pagada_sin_hora') return { estado: r.estado };
  if (pago.currency_id !== 'PEN' || montoPagado !== r.monto_centimos) {
    await alertaEquipo(deps, env, 'Pago con monto distinto',
      `Reserva ${r.id}: Mercado Pago cobró ${pago.transaction_amount} ${pago.currency_id}; se esperaba ${r.monto_centimos / 100} PEN. Pago ${pago.id}.`);
    return { estado: 'monto_invalido' };
  }

  let manuales = 0;
  if (r.estado === 'expirada') {
    // Pagó tarde: solo se revive si la hora sigue libre de verdad.
    try {
      const eventos = await deps.google.listarEventos(inicioUtc(r.fecha_lima, 0), inicioUtc(sumarDias(r.fecha_lima, 1), 0));
      const reservas = await repo.reservasActivasEntre(deps.db, r.fecha_lima, sumarDias(r.fecha_lima, 1), deps.ahora());
      manuales = primerasManuales(eventos, r.fecha_lima);
      const sigue = horasLibres({ fecha: r.fecha_lima, modalidad: r.modalidad, peso: r.peso_tope, nutricionistas: deps.nutricionistas,
        eventos, reservas, ahora: deps.ahora(), filtroNutricionista: r.nutricionista_id, tope: TOPE_PRIMERAS, desdeDias: 0 })
        .some((h) => h.inicio === r.inicio_utc);
      if (!sigue) return sinHora(deps, env, r);
    } catch (e) {
      console.error('verificar hora vencida', e);
      return sinHora(deps, env, r);
    }
  }

  const res = await repo.confirmarReserva(deps.db, { id: r.id, fecha_lima: r.fecha_lima, primerasManuales: manuales, tope: TOPE_PRIMERAS, ahora: deps.ahora() });
  if (!res.ok) {
    if (res.motivo === 'ya_confirmada') return { estado: 'confirmada' };
    return sinHora(deps, env, r);
  }
  r = await repo.reservaPorId(deps.db, r.id);
  await finalizarConfirmacion(deps, env, r);
  return { estado: 'confirmada' };
}
```

- [ ] **Step 4: Correr**

Run: `npm test`
Expected: PASS, 86 pruebas.

- [ ] **Step 5: Commit**

```bash
git add server/reservas/confirmar.mjs server/reservas/confirmar.test.mjs
git commit -m "reservas: confirmación idempotente del pago, pago tardío y calendario caído"
```

---

### Task 7: Handlers y rutas `/api/reservas/*`

**Files:**
- Create: `server/reservas/deps.mjs`, `server/handlers/reservas.mjs`, `server/handlers/reservas.test.mjs`, `functions/api/reservas/horas.js`, `functions/api/reservas/apartar.js`, `functions/api/reservas/pagar.js`, `functions/api/reservas/estado.js`, `functions/api/reservas/webhook-mp.js`, `functions/api/reservas/ics.js`, `functions/api/reservas/reubicar.js`

**Interfaces:**
- Consumes: todo lo anterior; `json`, `readJson`, `siteUrl` (`server/http.mjs`); `randomToken` (`server/tokens.mjs`).
- Produces (handlers `(request, env, deps) => Promise<Response>`):
  - `handleHoras`: GET `?desde&modalidad&producto&duracion[&nutricionista]` → `{ ok, dias: [{ fecha, horas: [{ inicio, hora, nutricionista_id }] }], nutricionistas: [{ id, nombre, foto }] }`
  - `handleApartar`: POST `{ producto, duracion, modalidad, inicio, nutricionista? }` → `{ ok, token, retencion_hasta, titulo, monto_centimos, requiere_dni, inicio, etiqueta, modalidad, nutricionista: { id, nombre } }`. Si la hora se ocupó o se llenó el tope: 409 `{ ok: false, motivo }`.
  - `handlePagar`: POST `{ token, nombre, whatsapp, email, dni?, acepto, novedades }` → `{ ok, url }`. Datos inválidos: 400. Retención vencida: 410.
  - `handleEstado`: GET `?r=token[&payment_id]` → `vista(reserva)`.
  - `handleWebhookMp`: POST, firma obligatoria. Responde 200, 401, 500 o 503.
  - `handleIcs`: GET `?r=token`, solo si está confirmada.
  - `handleReubicar`: POST `{ token, inicio, modalidad, nutricionista? }`, solo si está `pagada_sin_hora`.
  - `vista(r)`: `{ ok, estado, titulo, monto_centimos, requiere_dni, retencion_hasta, inicio, etiqueta, modalidad, producto, duracion_meses, nutricionista: { id, nombre }, nombre, meet, ultimo_pago }`. El estado sale `expirada` si la retención ya venció. `nombre` es solo el primer nombre.
  - `makeReservasDeps(env)` → deps reales.

- [ ] **Step 1: Pruebas que fallan**

`server/handlers/reservas.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { d1DePrueba } from '../reservas/d1-prueba.mjs';
import { nutricionistas } from '../../src/data/nutricionistas.js';
import { handleHoras, handleApartar, handlePagar, handleEstado, handleWebhookMp, handleIcs } from './reservas.mjs';

const t0 = new Date('2026-10-05T15:00:00Z');
const env = { PUBLIC_SITE_URL: 'https://www.ajlnutricion.com', NOTIFICATION_EMAIL: 'equipo@x.pe', MP_WEBHOOK_SECRET: 'sec' };
function deps(extra = {}) {
  const pagos = {};
  return {
    db: d1DePrueba(), nutricionistas, ahora: () => t0, sendEmail: async () => true, pagos,
    google: { listarEventos: async () => [], crearEvento: async () => ({ id: 'ev', meet: null }) },
    mp: { crearPreferencia: async () => ({ id: 'pref', init_point: 'https://mp/pagar' }), obtenerPago: async (id) => pagos[id] },
    ...extra,
  };
}
const get = (ruta) => new Request(`https://x.test${ruta}`);
const post = (ruta, cuerpo, headers = {}) => new Request(`https://x.test${ruta}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(cuerpo) });
const apartar = (d, o = {}) => handleApartar(post('/api/reservas/apartar', { producto: 'constancia', duracion: 3, modalidad: 'presencial', inicio: '2026-10-06T17:00:00Z', ...o }), env, d);
const datos = { nombre: 'Ana Pérez', whatsapp: '987 654 321', email: 'ana@x.pe', dni: '12345678', acepto: true, novedades: false };

test('horas: 7 días y el equipo, sin datos privados', async () => {
  const r = await handleHoras(get('/api/reservas/horas?desde=2026-10-06&modalidad=presencial&producto=constancia&duracion=3'), env, deps());
  const d = await r.json();
  assert.equal(r.status, 200);
  assert.equal(d.dias.length, 7);
  assert.equal(d.dias[0].horas[0].inicio, '2026-10-06T15:00:00Z');
  assert.deepEqual(Object.keys(d.nutricionistas[0]).sort(), ['foto', 'id', 'nombre']);
});

test('horas: parámetros inválidos dan 400', async () => {
  for (const q of ['desde=hoy&modalidad=presencial&producto=constancia&duracion=3', 'desde=2026-10-06&modalidad=casa&producto=constancia&duracion=3',
    'desde=2026-10-06&modalidad=video&producto=constancia&duracion=6', 'desde=2026-10-06&modalidad=video&producto=constancia&duracion=3&nutricionista=zzz']) {
    assert.equal((await handleHoras(get(`/api/reservas/horas?${q}`), env, deps())).status, 400, q);
  }
});

test('horas: si Google falla, 503', async () => {
  const d = deps({ google: { listarEventos: async () => { throw new Error('x'); } } });
  assert.equal((await handleHoras(get('/api/reservas/horas?desde=2026-10-06&modalidad=presencial&producto=constancia&duracion=3'), env, d)).status, 503);
});

test('apartar: devuelve token, monto del servidor y la nutricionista asignada', async () => {
  const r = await apartar(deps());
  const d = await r.json();
  assert.equal(r.status, 200);
  assert.equal(d.monto_centimos, 108000);
  assert.equal(d.requiere_dni, true);
  assert.equal(d.nutricionista.id, 'nico'); // empate de carga: gana el orden del equipo
  assert.ok(d.token.length >= 32);
});

test('apartar dos veces la misma hora presencial: la segunda da 409', async () => {
  const d = deps();
  assert.equal((await apartar(d)).status, 200);
  const r = await apartar(d);
  assert.equal(r.status, 409);
  assert.equal((await r.json()).motivo, 'ocupada');
});

test('apartar una hora que no se ofrece da 409', async () => {
  assert.equal((await apartar(deps(), { inicio: '2026-10-06T03:00:00Z' })).status, 409);
});

test('pagar: valida datos, exige DNI arriba de S/700 y aceptar condiciones', async () => {
  const d = deps();
  const { token } = await (await apartar(d)).json();
  const pagar = (o) => handlePagar(post('/api/reservas/pagar', { ...datos, token, ...o }), env, d);
  assert.equal((await pagar({ email: 'malo' })).status, 400);
  assert.equal((await pagar({ dni: '' })).status, 400);
  assert.equal((await pagar({ acepto: false })).status, 400);
  const ok = await pagar({});
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { ok: true, url: 'https://mp/pagar' });
});

test('pagar con token inexistente: 404', async () => {
  assert.equal((await handlePagar(post('/api/reservas/pagar', { ...datos, token: 'nope' }), env, deps())).status, 404);
});

test('estado con payment_id aprobado confirma como respaldo del webhook', async () => {
  const d = deps();
  const ap = await (await apartar(d)).json();
  await handlePagar(post('/api/reservas/pagar', { ...datos, token: ap.token }), env, d);
  const { id } = await d.db.prepare('SELECT id FROM reservas WHERE token = ?1').bind(ap.token).first();
  d.pagos['77'] = { id: 77, status: 'approved', external_reference: id, transaction_amount: 1080, currency_id: 'PEN' };
  const v = await (await handleEstado(get(`/api/reservas/estado?r=${ap.token}&payment_id=77`), env, d)).json();
  assert.equal(v.estado, 'confirmada');
  assert.equal(v.nombre, 'Ana');
  assert.equal(v.email, undefined);
});

test('webhook con firma inválida: 401 y nada cambia', async () => {
  const d = deps();
  const r = await handleWebhookMp(post('/api/reservas/webhook-mp?type=payment&data.id=77', { type: 'payment', data: { id: '77' } }, { 'x-signature': 'ts=1,v1=00', 'x-request-id': 'q' }), env, d);
  assert.equal(r.status, 401);
});

test('webhook firmado procesa el pago', async () => {
  const d = deps();
  const ap = await (await apartar(d)).json();
  await handlePagar(post('/api/reservas/pagar', { ...datos, token: ap.token }), env, d);
  const { id } = await d.db.prepare('SELECT id FROM reservas WHERE token = ?1').bind(ap.token).first();
  d.pagos['88'] = { id: 88, status: 'approved', external_reference: id, transaction_amount: 1080, currency_id: 'PEN' };
  const v1 = createHmac('sha256', 'sec').update('id:88;request-id:q;ts:9;').digest('hex');
  const r = await handleWebhookMp(post('/api/reservas/webhook-mp?type=payment&data.id=88', { type: 'payment', data: { id: '88' } }, { 'x-signature': `ts=9,v1=${v1}`, 'x-request-id': 'q' }), env, d);
  assert.equal(r.status, 200);
  const ics = await handleIcs(get(`/api/reservas/ics?r=${ap.token}`), env, d);
  assert.equal(ics.status, 200);
  assert.match(ics.headers.get('Content-Type'), /text\/calendar/);
});

test('webhook de otro tipo se ignora con 200; sin secreto configurado, 503', async () => {
  assert.equal((await handleWebhookMp(post('/api/reservas/webhook-mp?type=merchant_order&data.id=1', {}), env, deps())).status, 200);
  assert.equal((await handleWebhookMp(post('/api/reservas/webhook-mp?type=payment&data.id=1', {}), { ...env, MP_WEBHOOK_SECRET: '' }, deps())).status, 503);
});
```

- [ ] **Step 2: Ver que falla**

Run: `npm test`
Expected: FAIL, `Cannot find module '.../handlers/reservas.mjs'`.

- [ ] **Step 3: Implementar**

`server/reservas/deps.mjs`:

```js
// Dependencias reales de las funciones de reservas, desde context.env.
import { crearSendEmail } from '../correo.mjs';
import { crearGoogle } from './google.mjs';
import { crearMp } from './mercadopago.mjs';
import { nutricionistas } from '../../src/data/nutricionistas.js';

export function makeReservasDeps(env) {
  return {
    db: env.DB,
    sendEmail: crearSendEmail(env),
    google: crearGoogle(env),
    mp: crearMp(env),
    nutricionistas,
    ahora: () => new Date(),
  };
}
```

`server/handlers/reservas.mjs`:

```js
// ─── API de reservas y pago · AJL Nutrición ─────────────────────────────────
// GET  /api/reservas/horas      horas libres de una semana
// POST /api/reservas/apartar    aparta una hora 15 min
// POST /api/reservas/pagar      guarda los datos y crea el pago en Mercado Pago
// GET  /api/reservas/estado     estado de la reserva (y respaldo del webhook)
// POST /api/reservas/webhook-mp aviso firmado de Mercado Pago
// GET  /api/reservas/ics        archivo para «Agregar a mi calendario»
// POST /api/reservas/reubicar   nueva hora para quien pagó y perdió la suya
import { json, readJson, siteUrl } from '../http.mjs';
import { randomToken } from '../tokens.mjs';
import { inicioUtc, sumarDias, fechaLima, etiquetaLima } from '../reservas/tiempo.mjs';
import { horasLibres, primerasManuales } from '../reservas/disponibilidad.mjs';
import { cotizar } from '../reservas/catalogo.mjs';
import { TOPE_PRIMERAS, DESDE_DIAS, HASTA_DIAS } from '../reservas/constantes.mjs';
import * as repo from '../reservas/repo.mjs';
import { procesarPago, finalizarConfirmacion } from '../reservas/confirmar.mjs';
import { firmaValida } from '../reservas/mercadopago.mjs';
import { icsDeReserva } from '../reservas/ics.mjs';
import { CONDICIONES_VERSION } from '../../src/data/condiciones.js';
import { contacto } from '../../src/data/contacto.js';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const INICIO = /^\d{4}-\d{2}-\d{2}T\d{2}:00:00Z$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MODALIDADES = new Set(['presencial', 'video']);
const bad = (status, error, extra = {}) => json(status, { ok: false, error, ...extra });
const MSJ_OCUPADA = 'Esa hora acaba de ocuparse. Elige otra.';
const MSJ_TOPE = 'Ese día ya no tiene cupos para primeras sesiones. Elige otro día.';

const nutriValida = (deps, id) => !id || deps.nutricionistas.some((n) => n.id === id);

async function contexto(deps, desde, dias) {
  const eventos = await deps.google.listarEventos(inicioUtc(desde, 0), inicioUtc(sumarDias(desde, dias), 0));
  const reservas = await repo.reservasActivasEntre(deps.db, desde, sumarDias(desde, dias), deps.ahora());
  return { eventos, reservas };
}

function libresDelDia(deps, ctx, { fecha, modalidad, peso, filtro }) {
  return horasLibres({ fecha, modalidad, peso, nutricionistas: deps.nutricionistas, eventos: ctx.eventos, reservas: ctx.reservas,
    ahora: deps.ahora(), filtroNutricionista: filtro || null, tope: TOPE_PRIMERAS, desdeDias: DESDE_DIAS, hastaDias: HASTA_DIAS });
}

export function vista(r, deps, ultimo = null) {
  const precio = cotizar(r.producto, r.duracion_meses);
  const n = deps.nutricionistas.find((x) => x.id === r.nutricionista_id);
  const vencida = ['apartada', 'pagando'].includes(r.estado) && Date.parse(r.retencion_hasta) < deps.ahora().getTime();
  return {
    ok: true,
    estado: vencida ? 'expirada' : r.estado,
    titulo: precio?.titulo ?? r.producto,
    producto: r.producto,
    duracion_meses: r.duracion_meses,
    monto_centimos: r.monto_centimos,
    requiere_dni: Boolean(precio?.requiereDni),
    retencion_hasta: r.retencion_hasta,
    inicio: r.inicio_utc,
    etiqueta: etiquetaLima(r.inicio_utc),
    modalidad: r.modalidad,
    nutricionista: n ? { id: n.id, nombre: n.nombre } : null,
    nombre: r.nombre ? r.nombre.split(' ')[0] : null,
    meet: r.meet_url || null,
    ultimo_pago: ultimo?.estado ?? null,
  };
}

export async function handleHoras(request, env, deps) {
  if (request.method !== 'GET') return bad(405, 'Método no permitido');
  const q = new URL(request.url).searchParams;
  const desde = q.get('desde') || '';
  const modalidad = q.get('modalidad');
  const precio = cotizar(q.get('producto'), Number(q.get('duracion')));
  const filtro = q.get('nutricionista') || '';
  if (!FECHA.test(desde) || !MODALIDADES.has(modalidad) || !precio || !nutriValida(deps, filtro)) return bad(400, 'Parámetros inválidos');
  try {
    const ctx = await contexto(deps, desde, 7);
    const dias = [];
    for (let i = 0; i < 7; i++) {
      const fecha = sumarDias(desde, i);
      dias.push({ fecha, horas: libresDelDia(deps, ctx, { fecha, modalidad, peso: precio.peso, filtro }) });
    }
    return json(200, { ok: true, dias, nutricionistas: deps.nutricionistas.map(({ id, nombre, foto }) => ({ id, nombre, foto })) });
  } catch (e) {
    console.error('horas', e);
    return bad(503, 'No pudimos consultar la agenda. Intenta en un momento.');
  }
}

export async function handleApartar(request, env, deps) {
  if (request.method !== 'POST') return bad(405, 'Método no permitido');
  const d = await readJson(request);
  const precio = cotizar(d.producto, Number(d.duracion));
  if (!precio || !MODALIDADES.has(d.modalidad) || !INICIO.test(d.inicio || '') || !nutriValida(deps, d.nutricionista)) return bad(400, 'Datos inválidos');
  const ahora = deps.ahora();
  const fecha = fechaLima(new Date(d.inicio));
  try {
    const ctx = await contexto(deps, fecha, 1);
    const hora = libresDelDia(deps, ctx, { fecha, modalidad: d.modalidad, peso: precio.peso, filtro: d.nutricionista }).find((h) => h.inicio === d.inicio);
    if (!hora) return bad(409, MSJ_OCUPADA, { motivo: 'ocupada' });
    const token = randomToken();
    const res = await repo.crearRetencion(deps.db, {
      id: crypto.randomUUID(), token, producto: d.producto, duracion_meses: precio.duracion_meses, monto_centimos: precio.monto_centimos,
      peso_tope: precio.peso, nutricionista_id: hora.nutricionista_id, inicio_utc: hora.inicio, fecha_lima: fecha, modalidad: d.modalidad,
      primerasManuales: primerasManuales(ctx.eventos, fecha), tope: TOPE_PRIMERAS, ahora,
    });
    if (!res.ok) return bad(409, res.motivo === 'tope' ? MSJ_TOPE : MSJ_OCUPADA, { motivo: res.motivo });
    repo.purgarNoPagadas(deps.db, ahora).catch((e) => console.error('purga', e));
    const n = deps.nutricionistas.find((x) => x.id === hora.nutricionista_id);
    return json(200, {
      ok: true, token, retencion_hasta: res.retencion_hasta, titulo: precio.titulo, monto_centimos: precio.monto_centimos,
      requiere_dni: precio.requiereDni, inicio: hora.inicio, etiqueta: etiquetaLima(hora.inicio), modalidad: d.modalidad,
      nutricionista: { id: n.id, nombre: n.nombre },
    });
  } catch (e) {
    console.error('apartar', e);
    return bad(503, 'No pudimos apartar la hora. Intenta en un momento.');
  }
}

export async function handlePagar(request, env, deps) {
  if (request.method !== 'POST') return bad(405, 'Método no permitido');
  const d = await readJson(request);
  const r = await repo.reservaPorToken(deps.db, String(d.token || ''));
  if (!r) return bad(404, 'No encontramos tu reserva. Vuelve a elegir tu hora.');
  const precio = cotizar(r.producto, r.duracion_meses);
  const nombre = String(d.nombre || '').trim();
  const email = String(d.email || '').trim().toLowerCase();
  const whatsapp = String(d.whatsapp || '').replace(/[^\d+]/g, '');
  const dni = String(d.dni || '').trim();
  if (nombre.length < 3 || nombre.length > 120) return bad(400, 'Escribe tu nombre y apellido.');
  if (!EMAIL.test(email)) return bad(400, 'Revisa tu correo.');
  if (!/^\+?\d{9,15}$/.test(whatsapp)) return bad(400, 'Revisa tu número de WhatsApp.');
  if (precio.requiereDni && !/^\d{8}$/.test(dni)) return bad(400, 'Escribe tu DNI (8 dígitos) para tu comprobante.');
  if (d.acepto !== true) return bad(400, 'Para continuar, acepta las condiciones del servicio.');

  const ahora = deps.ahora();
  const res = await repo.guardarDatosYPagar(deps.db, {
    reserva: r, cliente: { nombre, whatsapp, email, dni: precio.requiereDni ? dni : null },
    condicionesVersion: CONDICIONES_VERSION, novedades: d.novedades === true, ahora,
  });
  if (!res.ok) return bad(410, 'Se venció el tiempo para pagar. Elige tu hora de nuevo.', { motivo: 'vencida' });
  try {
    const pref = await deps.mp.crearPreferencia({
      reservaId: r.id, titulo: precio.titulo, montoCentimos: r.monto_centimos, email, nombre,
      venceEn: new Date(res.retencion_hasta), ahora, urlRetorno: `${siteUrl(env)}/reservar/listo/?r=${r.token}`,
    });
    await repo.guardarPreferencia(deps.db, r.id, pref.id, ahora);
    return json(200, { ok: true, url: pref.init_point });
  } catch (e) {
    console.error('preferencia', e);
    return bad(503, 'No pudimos abrir Mercado Pago. Intenta de nuevo.');
  }
}

export async function handleEstado(request, env, deps) {
  if (request.method !== 'GET') return bad(405, 'Método no permitido');
  const q = new URL(request.url).searchParams;
  let r = await repo.reservaPorToken(deps.db, q.get('r') || '');
  if (!r) return bad(404, 'No encontramos tu reserva.');
  const paymentId = q.get('payment_id');
  if (paymentId && /^\d+$/.test(paymentId) && !['confirmada', 'pagada_sin_hora'].includes(r.estado)) {
    try {
      await procesarPago(deps, env, paymentId, { reservaId: r.id });
      r = await repo.reservaPorToken(deps.db, r.token);
    } catch (e) {
      console.error('estado/procesarPago', e);
    }
  }
  return json(200, vista(r, deps, await repo.ultimoPago(deps.db, r.id)));
}

export async function handleWebhookMp(request, env, deps) {
  if (request.method !== 'POST') return bad(405, 'Método no permitido');
  const q = new URL(request.url).searchParams;
  const cuerpo = await readJson(request);
  const tipo = q.get('type') || cuerpo.type;
  const dataId = String(q.get('data.id') || cuerpo?.data?.id || '');
  if (tipo !== 'payment' || !dataId) return json(200, { ok: true, ignorado: true });
  if (!env.MP_WEBHOOK_SECRET) {
    console.error('Falta MP_WEBHOOK_SECRET');
    return bad(503, 'Webhook sin configurar');
  }
  const valida = await firmaValida({ xSignature: request.headers.get('x-signature'), xRequestId: request.headers.get('x-request-id'),
    dataId, secreto: env.MP_WEBHOOK_SECRET });
  if (!valida) return bad(401, 'Firma inválida');
  try {
    await procesarPago(deps, env, dataId);
    return json(200, { ok: true });
  } catch (e) {
    console.error('webhook', e);
    return bad(500, 'Error procesando el pago'); // Mercado Pago reintenta
  }
}

export async function handleIcs(request, env, deps) {
  const r = await repo.reservaPorToken(deps.db, new URL(request.url).searchParams.get('r') || '');
  if (!r || r.estado !== 'confirmada') return bad(404, 'No encontramos tu reserva.');
  const precio = cotizar(r.producto, r.duracion_meses);
  const texto = icsDeReserva({
    uid: r.id,
    titulo: `Tu sesión en AJL Nutrición · ${precio?.titulo ?? ''}`,
    inicioUtc: r.inicio_utc,
    finUtc: new Date(Date.parse(r.inicio_utc) + 3600 * 1000).toISOString(),
    ubicacion: r.modalidad === 'presencial' ? contacto.direccion : (r.meet_url || 'Videollamada (enlace en tu invitación)'),
    descripcion: 'Si necesitas mover tu cita, escríbenos por WhatsApp: +51 919 151 237.',
    ahora: deps.ahora(),
  });
  return new Response(texto, { status: 200, headers: { 'Content-Type': 'text/calendar; charset=utf-8',
    'Content-Disposition': 'attachment; filename="sesion-ajl.ics"', 'Cache-Control': 'no-store' } });
}

export async function handleReubicar(request, env, deps) {
  if (request.method !== 'POST') return bad(405, 'Método no permitido');
  const d = await readJson(request);
  const r = await repo.reservaPorToken(deps.db, String(d.token || ''));
  if (!r) return bad(404, 'No encontramos tu reserva.');
  if (r.estado !== 'pagada_sin_hora') return bad(409, 'Esta reserva ya tiene hora.', { motivo: 'estado' });
  if (!MODALIDADES.has(d.modalidad) || !INICIO.test(d.inicio || '') || !nutriValida(deps, d.nutricionista)) return bad(400, 'Datos inválidos');
  const fecha = fechaLima(new Date(d.inicio));
  try {
    const ctx = await contexto(deps, fecha, 1);
    const hora = libresDelDia(deps, ctx, { fecha, modalidad: d.modalidad, peso: r.peso_tope, filtro: d.nutricionista }).find((h) => h.inicio === d.inicio);
    if (!hora) return bad(409, MSJ_OCUPADA, { motivo: 'ocupada' });
    const res = await repo.reubicar(deps.db, { id: r.id, nutricionista_id: hora.nutricionista_id, inicio_utc: hora.inicio, fecha_lima: fecha,
      modalidad: d.modalidad, primerasManuales: primerasManuales(ctx.eventos, fecha), tope: TOPE_PRIMERAS, ahora: deps.ahora() });
    if (!res.ok) return bad(409, res.motivo === 'tope' ? MSJ_TOPE : MSJ_OCUPADA, { motivo: res.motivo });
    const actual = await repo.reservaPorToken(deps.db, r.token);
    await finalizarConfirmacion(deps, env, actual);
    return json(200, vista(await repo.reservaPorToken(deps.db, r.token), deps));
  } catch (e) {
    console.error('reubicar', e);
    return bad(503, 'No pudimos guardar tu nueva hora. Intenta en un momento.');
  }
}
```

Rutas (cada archivo, cambiando solo el nombre del handler):

`functions/api/reservas/horas.js`:

```js
import { handleHoras } from '../../../server/handlers/reservas.mjs';
import { makeReservasDeps } from '../../../server/reservas/deps.mjs';

export const onRequest = ({ request, env }) => handleHoras(request, env, makeReservasDeps(env));
```

`functions/api/reservas/apartar.js`:

```js
import { handleApartar } from '../../../server/handlers/reservas.mjs';
import { makeReservasDeps } from '../../../server/reservas/deps.mjs';

export const onRequest = ({ request, env }) => handleApartar(request, env, makeReservasDeps(env));
```

`functions/api/reservas/pagar.js`:

```js
import { handlePagar } from '../../../server/handlers/reservas.mjs';
import { makeReservasDeps } from '../../../server/reservas/deps.mjs';

export const onRequest = ({ request, env }) => handlePagar(request, env, makeReservasDeps(env));
```

`functions/api/reservas/estado.js`:

```js
import { handleEstado } from '../../../server/handlers/reservas.mjs';
import { makeReservasDeps } from '../../../server/reservas/deps.mjs';

export const onRequest = ({ request, env }) => handleEstado(request, env, makeReservasDeps(env));
```

`functions/api/reservas/webhook-mp.js`:

```js
import { handleWebhookMp } from '../../../server/handlers/reservas.mjs';
import { makeReservasDeps } from '../../../server/reservas/deps.mjs';

export const onRequest = ({ request, env }) => handleWebhookMp(request, env, makeReservasDeps(env));
```

`functions/api/reservas/ics.js`:

```js
import { handleIcs } from '../../../server/handlers/reservas.mjs';
import { makeReservasDeps } from '../../../server/reservas/deps.mjs';

export const onRequest = ({ request, env }) => handleIcs(request, env, makeReservasDeps(env));
```

`functions/api/reservas/reubicar.js`:

```js
import { handleReubicar } from '../../../server/handlers/reservas.mjs';
import { makeReservasDeps } from '../../../server/reservas/deps.mjs';

export const onRequest = ({ request, env }) => handleReubicar(request, env, makeReservasDeps(env));
```

- [ ] **Step 4: Correr**

Run: `npm test`
Expected: PASS, 98 pruebas.

Run: `npx wrangler pages functions build --outdir /tmp/fnbuild-reservas`
Expected: compila sin errores (las funciones empaquetan `src/data/*.js`).

- [ ] **Step 5: Commit**

```bash
git add server/reservas/deps.mjs server/handlers/reservas.mjs server/handlers/reservas.test.mjs functions/api/reservas
git commit -m "reservas: API de horas, retención, pago, estado, webhook firmado, ics y reubicación"
```

---

### Task 8: Páginas del flujo (P1–P6 y reubicar)

**Files:**
- Create: `src/scripts/selector-horas.js`, `src/scripts/reservar.js`, `src/pages/reservar/index.astro`, `src/pages/reservar/listo.astro`, `src/pages/reservar/reubicar.astro`, `src/styles/reservar.css`

**Interfaces:**
- Consumes: la API de Task 7; `plans`, `monthlyPlans` (`src/data/plans.js`); `NOVEDADES_TEXTO` (`src/data/condiciones.js`); `Layout` con `noindex`.
- Produces: `montarSelector(raiz, { producto, duracion, onElegir })` → `{ recargar() }`. `onElegir({ inicio, nutricionista, modalidad, nutricionistaNombre })`.

Sin pruebas automáticas de interfaz: se verifica en navegador contra `wrangler pages dev` con dependencias de prueba (Step 5) y luego en el preview real (Task 10).

- [ ] **Step 1: Estilos del flujo**

`src/styles/reservar.css`:

```css
/* Flujo de reserva: pantallas completas, una decisión por pantalla (mockup P1–P6). */
.rs { max-width: 560px; margin: 0 auto; padding: 24px 16px 64px; }
.rs-paso[hidden] { display: none; }
.rs-progreso { font-size: .8rem; color: var(--gris); margin-bottom: 8px; display: flex; justify-content: space-between; }
.rs h1 { font-family: var(--font-head); color: var(--verde-osc); font-size: clamp(1.5rem, 5vw, 2rem); line-height: 1.15; margin-bottom: 8px; }
.rs-lead { color: var(--gris); margin-bottom: 20px; line-height: 1.5; }
.rs-op { display: block; width: 100%; text-align: left; background: #fff; border: 1.5px solid #e6e2d9; border-radius: 16px; padding: 16px; margin-bottom: 12px; cursor: pointer; font: inherit; color: var(--ink); }
.rs-op:hover, .rs-op:focus-visible { border-color: var(--dorado); outline: none; }
.rs-op--star { border-color: var(--dorado); background: var(--dorado-claro); }
.rs-op b { display: block; font-size: 1.05rem; }
.rs-op .rs-precio { font-family: var(--font-head); font-size: 1.6rem; color: var(--verde-osc); }
.rs-op small { color: var(--gris); }
.rs-badge { display: inline-block; font-size: .72rem; font-weight: 700; color: #fff; background: var(--dorado); border-radius: 999px; padding: 2px 10px; margin-bottom: 6px; }
.rs-secundario { margin-top: 24px; padding-top: 16px; border-top: 1px solid #e6e2d9; }
.rs-nota { font-size: .85rem; color: var(--gris); line-height: 1.5; margin: 12px 0; }
.rs-btn { display: block; width: 100%; background: var(--dorado); color: #fff; border: 0; border-radius: 999px; padding: 15px; font: inherit; font-weight: 700; cursor: pointer; margin-top: 16px; }
.rs-btn:disabled { opacity: .6; cursor: wait; }
.rs-volver { background: none; border: 0; color: var(--dorado-osc); font: inherit; cursor: pointer; padding: 0; margin-bottom: 12px; }
.rs-error { color: #b00020; font-size: .9rem; min-height: 1.2em; margin-top: 8px; }
.rs-resumen { background: var(--verde-claro); border-radius: 14px; padding: 12px 14px; margin-bottom: 16px; font-size: .92rem; }
.rs-reloj { font-weight: 700; color: var(--verde-osc); }
.rs label { display: block; font-size: .85rem; font-weight: 600; margin: 12px 0 4px; }
.rs input[type=text], .rs input[type=email], .rs input[type=tel] { width: 100%; border: 1.5px solid #e6e2d9; border-radius: 12px; padding: 12px; font: inherit; }
.rs .rs-check { display: flex; gap: 8px; align-items: flex-start; font-weight: 400; }
.rs .rs-check input { margin-top: 3px; accent-color: var(--dorado); }
.rs-aviso { background: #fff7e6; border-radius: 12px; padding: 10px 12px; font-size: .85rem; margin-top: 12px; }
.sel-modalidad, .sel-nutris { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
.sel-modalidad button, .sel-nutris button, .sel-dias button { border: 1.5px solid #e6e2d9; background: #fff; border-radius: 999px; padding: 8px 14px; font: inherit; font-size: .88rem; cursor: pointer; }
.sel-modalidad button[aria-pressed=true], .sel-nutris button[aria-pressed=true], .sel-dias button[aria-pressed=true] { background: var(--verde-osc); color: #fff; border-color: var(--verde-osc); }
.sel-semana { display: flex; align-items: center; gap: 6px; margin-bottom: 12px; }
.sel-dias { display: flex; gap: 6px; overflow-x: auto; flex: 1; padding-bottom: 4px; }
.sel-dias button:disabled { opacity: .35; cursor: default; }
.sel-prev, .sel-next { border: 0; background: none; font-size: 1.4rem; cursor: pointer; color: var(--verde-osc); }
.sel-prev:disabled, .sel-next:disabled { opacity: .3; cursor: default; }
.sel-horas { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 8px; }
.sel-hora { border: 1.5px solid #e6e2d9; background: #fff; border-radius: 12px; padding: 10px; font: inherit; cursor: pointer; text-align: center; }
.sel-hora:hover { border-color: var(--dorado); }
.sel-hora small { display: block; color: var(--gris); font-size: .75rem; }
.sel-msg { grid-column: 1 / -1; color: var(--gris); }
```

- [ ] **Step 2: Selector de horas compartido**

`src/scripts/selector-horas.js`:

```js
// Selector de primera hora (P3). Lo usan /reservar/ y /reservar/reubicar/.
// La disponibilidad la decide el servidor; aquí solo se pinta y se elige.
const formatoDia = new Intl.DateTimeFormat('es-PE', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const hoyLima = () => new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
const sumarDias = (f, n) => { const d = new Date(`${f}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const hora12 = (h) => { const n = parseInt(h, 10); return `${n % 12 || 12}:00 ${n >= 12 ? 'p. m.' : 'a. m.'}`; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function montarSelector(raiz, { producto, duracion, onElegir }) {
  const manana = sumarDias(hoyLima(), 1);
  const limite = sumarDias(hoyLima(), 21);
  const estado = { modalidad: 'presencial', nutricionista: '', desde: manana, fecha: null, datos: null };
  raiz.innerHTML = `
    <div class="sel-modalidad">
      <button type="button" data-modalidad="presencial">En Lince</button>
      <button type="button" data-modalidad="video">Por videollamada</button>
    </div>
    <div class="sel-nutris"></div>
    <div class="sel-semana">
      <button type="button" class="sel-prev" aria-label="Semana anterior">‹</button>
      <div class="sel-dias"></div>
      <button type="button" class="sel-next" aria-label="Semana siguiente">›</button>
    </div>
    <div class="sel-horas" aria-live="polite"></div>`;
  const $ = (s) => raiz.querySelector(s);

  async function cargar() {
    $('.sel-horas').innerHTML = '<p class="sel-msg">Buscando horarios…</p>';
    const p = new URLSearchParams({ desde: estado.desde, modalidad: estado.modalidad, producto, duracion: String(duracion) });
    if (estado.nutricionista) p.set('nutricionista', estado.nutricionista);
    try {
      const r = await fetch(`/api/reservas/horas?${p}`);
      if (!r.ok) throw new Error(String(r.status));
      estado.datos = await r.json();
    } catch {
      $('.sel-horas').innerHTML = '<p class="sel-msg">No pudimos cargar los horarios. Intenta de nuevo en un momento.</p>';
      return;
    }
    const sigueValida = estado.datos.dias.some((d) => d.fecha === estado.fecha && d.horas.length);
    if (!sigueValida) estado.fecha = estado.datos.dias.find((d) => d.horas.length)?.fecha ?? null;
    pintar();
  }

  function pintar() {
    raiz.querySelectorAll('[data-modalidad]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.modalidad === estado.modalidad)));
    const equipo = estado.datos.nutricionistas;
    const nombre = Object.fromEntries(equipo.map((n) => [n.id, n.nombre]));
    $('.sel-nutris').innerHTML = `<button type="button" data-filtro="" aria-pressed="${!estado.nutricionista}">Todo el equipo</button>`
      + equipo.map((n) => `<button type="button" data-filtro="${esc(n.id)}" aria-pressed="${estado.nutricionista === n.id}">${esc(n.nombre)}</button>`).join('');
    $('.sel-dias').innerHTML = estado.datos.dias.map((d) => `<button type="button" data-fecha="${d.fecha}" ${d.horas.length ? '' : 'disabled'} aria-pressed="${d.fecha === estado.fecha}">${formatoDia.format(new Date(`${d.fecha}T12:00:00Z`))}</button>`).join('');
    const dia = estado.datos.dias.find((d) => d.fecha === estado.fecha);
    $('.sel-horas').innerHTML = dia
      ? dia.horas.map((h) => `<button type="button" class="sel-hora" data-inicio="${h.inicio}" data-nutri="${esc(h.nutricionista_id)}">${hora12(h.hora)}<small>${esc(nombre[h.nutricionista_id] ?? '')}</small></button>`).join('')
      : '<p class="sel-msg">No hay horas libres esta semana con estos filtros. Prueba la semana siguiente u otra modalidad.</p>';
    $('.sel-prev').disabled = estado.desde <= manana;
    $('.sel-next').disabled = sumarDias(estado.desde, 7) > limite;
  }

  raiz.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    if (b.classList.contains('sel-hora')) {
      onElegir({ inicio: b.dataset.inicio, nutricionista: b.dataset.nutri, modalidad: estado.modalidad, nutricionistaNombre: b.querySelector('small').textContent });
    } else if (b.dataset.modalidad) {
      estado.modalidad = b.dataset.modalidad; estado.fecha = null; cargar();
    } else if ('filtro' in b.dataset) {
      estado.nutricionista = b.dataset.filtro; estado.fecha = null; cargar();
    } else if (b.dataset.fecha) {
      estado.fecha = b.dataset.fecha; pintar();
    } else if (b.classList.contains('sel-prev')) {
      estado.desde = sumarDias(estado.desde, -7); estado.fecha = null; cargar();
    } else if (b.classList.contains('sel-next')) {
      estado.desde = sumarDias(estado.desde, 7); estado.fecha = null; cargar();
    }
  });

  cargar();
  return { recargar: cargar };
}
```

- [ ] **Step 3: Controlador P1–P4**

`src/scripts/reservar.js`:

```js
// Controlador del flujo /reservar/: P1 acompañamiento → P2 duración → P3 hora
// → P4 datos → Mercado Pago. Montos, disponibilidad y vencimientos los decide
// el servidor; esta página solo guía.
import { montarSelector } from './selector-horas.js';

const catalogo = JSON.parse(document.getElementById('catalogo').textContent);
const $ = (s) => document.querySelector(s);
const soles = (c) => `S/${(c / 100).toLocaleString('es-PE', { maximumFractionDigits: 2 })}`;
const estado = { producto: null, duracion: null, reserva: null, reloj: null, selector: null };
const params = new URLSearchParams(location.search);

function irA(paso) {
  document.querySelectorAll('.rs-paso').forEach((s) => { s.hidden = s.dataset.paso !== paso; });
  window.scrollTo(0, 0);
}

function medir(evento, extra = {}) {
  try {
    if (typeof window.gtag === 'function') window.gtag('event', evento.ga, extra.ga || {});
    if (typeof window.fbq === 'function') window.fbq('track', evento.meta, extra.meta || {});
  } catch {}
}

function elegirProducto(id) {
  estado.producto = id;
  const plan = catalogo[id];
  if (plan.mensual) {
    $('#p2-plan').textContent = plan.nombre;
    $('#p2-3m').querySelector('.rs-precio').textContent = `S/${plan.total3m.toLocaleString('es-PE')}`;
    $('#p2-3m').querySelector('small').textContent = plan.perMes3m;
    $('#p2-1m').querySelector('.rs-precio').textContent = `S/${plan.precio}`;
    $('#p2-1m').querySelector('small').textContent = `son S/${plan.precio - plan.perMes3mSoles} más cada mes`;
    irA('p2');
  } else {
    estado.duracion = 1;
    abrirP3();
  }
}

function abrirP3(mensaje = '') {
  $('#p3-error').textContent = mensaje;
  irA('p3');
  if (estado.selector) { estado.selector.recargar(); return; }
  estado.selector = montarSelector($('#p3-selector'), { producto: estado.producto, duracion: estado.duracion, onElegir: apartar });
}

async function apartar(eleccion) {
  $('#p3-error').textContent = 'Apartando tu hora…';
  try {
    const r = await fetch('/api/reservas/apartar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ producto: estado.producto, duracion: estado.duracion, ...eleccion }),
    });
    const d = await r.json();
    if (!r.ok) { $('#p3-error').textContent = d.error || 'Esa hora ya no está disponible.'; estado.selector.recargar(); return; }
    abrirP4(d);
  } catch {
    $('#p3-error').textContent = 'No pudimos apartar la hora. Revisa tu conexión e intenta de nuevo.';
  }
}

function abrirP4(reserva) {
  estado.reserva = reserva;
  $('#p4-resumen').innerHTML = '';
  const linea = (t) => { const p = document.createElement('div'); p.textContent = t; $('#p4-resumen').append(p); };
  linea(`${reserva.titulo} · ${soles(reserva.monto_centimos)}`);
  linea(`${reserva.etiqueta} · ${reserva.modalidad === 'video' ? 'Videollamada' : 'En Lince'} · con ${reserva.nutricionista.nombre}`);
  $('#p4-dni').hidden = !reserva.requiere_dni;
  $('#f-dni').required = reserva.requiere_dni;
  $('#p4-yape').hidden = reserva.monto_centimos <= 50000;
  $('#p4-pagar').textContent = `Pagar ${soles(reserva.monto_centimos)}`;
  $('#p4-error').textContent = '';
  clearInterval(estado.reloj);
  const tick = () => {
    const resta = Date.parse(reserva.retencion_hasta) - Date.now();
    if (resta <= 0) { clearInterval(estado.reloj); abrirP3('Se venció el tiempo para apartar tu hora. Elige otra.'); return; }
    const m = Math.floor(resta / 60000);
    const s = String(Math.floor((resta % 60000) / 1000)).padStart(2, '0');
    $('#p4-reloj').textContent = `${m}:${s}`;
  };
  tick();
  estado.reloj = setInterval(tick, 1000);
  irA('p4');
  medir({ ga: 'begin_checkout', meta: 'InitiateCheckout' }, {
    ga: { currency: 'PEN', value: reserva.monto_centimos / 100, items: [{ item_name: reserva.titulo }] },
    meta: { currency: 'PEN', value: reserva.monto_centimos / 100, content_name: reserva.titulo },
  });
}

async function pagar(e) {
  e.preventDefault();
  const boton = $('#p4-pagar');
  boton.disabled = true;
  $('#p4-error').textContent = '';
  try {
    const r = await fetch('/api/reservas/pagar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: estado.reserva.token, nombre: $('#f-nombre').value, whatsapp: $('#f-whatsapp').value, email: $('#f-email').value,
        dni: $('#f-dni').value, acepto: $('#f-acepto').checked, novedades: $('#f-novedades').checked,
      }),
    });
    const d = await r.json();
    if (r.status === 410) { abrirP3(d.error); return; }
    if (!r.ok) { $('#p4-error').textContent = d.error || 'Revisa tus datos.'; boton.disabled = false; return; }
    location.href = d.url;
  } catch {
    $('#p4-error').textContent = 'No pudimos conectar con Mercado Pago. Intenta de nuevo.';
    boton.disabled = false;
  }
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-producto],[data-duracion],[data-volver]');
  if (!b) return;
  if (b.dataset.producto) elegirProducto(b.dataset.producto);
  else if (b.dataset.duracion) { estado.duracion = Number(b.dataset.duracion); abrirP3(); }
  else if (b.dataset.volver) irA(b.dataset.volver);
});
$('#p4-form').addEventListener('submit', pagar);

// Retomar una reserva apartada (volver desde Mercado Pago tras un rechazo).
async function retomar(token) {
  try {
    const r = await fetch(`/api/reservas/estado?r=${encodeURIComponent(token)}`);
    const d = await r.json();
    if (r.ok && ['apartada', 'pagando'].includes(d.estado)) {
      estado.producto = d.producto;
      estado.duracion = d.duracion_meses;
      abrirP4({ ...d, token });
      return true;
    }
  } catch {}
  return false;
}

(async () => {
  const token = params.get('r');
  if (token && await retomar(token)) return;
  const plan = params.get('plan');
  if (plan && catalogo[plan]) elegirProducto(plan);
  else irA('p1');
})();
```

- [ ] **Step 4: Páginas**

`src/pages/reservar/index.astro`:

```astro
---
import Layout from '../../layouts/Layout.astro';
import { plans, monthlyPlans } from '../../data/plans.js';
import { NOVEDADES_TEXTO } from '../../data/condiciones.js';
import '../../styles/reservar.css';

const catalogo = {};
for (const p of monthlyPlans) {
  const prog = p.programs[0];
  catalogo[p.id] = { nombre: p.name, mensual: true, precio: p.price, total3m: prog.totalSoles, perMes3m: prog.perMes,
    perMes3mSoles: Math.round(prog.totalSoles / 3) };
}
catalogo.basico = { nombre: plans.basico.name, mensual: false, precio: plans.basico.price };
catalogo.evaluacion = { nombre: plans.evaluacion.name, mensual: false, precio: plans.evaluacion.price };
---
<Layout noindex title="Reserva tu primera sesión · AJL Nutrición">
  <main class="rs">
    <script is:inline type="application/json" id="catalogo" set:html={JSON.stringify(catalogo)} />

    <section class="rs-paso" data-paso="p1" hidden>
      <div class="rs-progreso"><span>Paso 1 de 4</span></div>
      <h1>¿Cómo quieres que te acompañemos?</h1>
      <p class="rs-lead">Todos incluyen tu plan en la app, el equipo por WhatsApp y 2 clases en vivo por semana.</p>
      {monthlyPlans.map((p) => (
        <button type="button" class:list={['rs-op', { 'rs-op--star': p.highlight }]} data-producto={p.id}>
          {p.badge && <span class="rs-badge">{p.badge}</span>}
          <b>Acompañamiento continuo + {p.name}</b>
          <span class="rs-precio">{p.programs[0].total}</span> <small>3 meses · {p.programs[0].perMes}</small>
        </button>
      ))}
      <p class="rs-nota">Clases en vivo: miércoles con el equipo, domingos con Alejandro. Tus sesiones 1 a 1 son con una nutricionista del equipo.</p>
      <div class="rs-secundario">
        <button type="button" class="rs-op" data-producto="basico"><b>{plans.basico.name}, sin acompañamiento</b><small>S/{plans.basico.price}</small></button>
        <button type="button" class="rs-op" data-producto="evaluacion"><b>¿Prefieres que te evaluemos antes?</b><small>{plans.evaluacion.name} · S/{plans.evaluacion.price}</small></button>
      </div>
    </section>

    <section class="rs-paso" data-paso="p2" hidden>
      <button type="button" class="rs-volver" data-volver="p1">‹ Cambiar acompañamiento</button>
      <div class="rs-progreso"><span>Paso 2 de 4</span></div>
      <h1>¿Por cuánto tiempo?</h1>
      <p class="rs-lead" id="p2-plan"></p>
      <button type="button" class="rs-op rs-op--star" id="p2-3m" data-duracion="3"><span class="rs-badge">El que recomendamos</span><b>3 meses</b><span class="rs-precio"></span> <small></small></button>
      <button type="button" class="rs-op" id="p2-1m" data-duracion="1"><b>Mes a mes</b><span class="rs-precio"></span> <small></small></button>
      <p class="rs-nota">Tu plazo corre desde que recibes tu plan: 3 meses, y si viajas lo congelas 1 semana. No necesitas agendar todo ahora. Pagas con tarjeta o con Yape, sin recargo.</p>
    </section>

    <section class="rs-paso" data-paso="p3" hidden>
      <button type="button" class="rs-volver" data-volver="p1">‹ Volver</button>
      <div class="rs-progreso"><span>Paso 3 de 4</span></div>
      <h1>Elige tu primera sesión</h1>
      <p class="rs-lead">Tu nutricionista te acompaña durante todo tu plan. Tus siguientes citas las agendas cuando quieras.</p>
      <div id="p3-selector"></div>
      <p class="rs-error" id="p3-error" role="alert"></p>
    </section>

    <section class="rs-paso" data-paso="p4" hidden>
      <button type="button" class="rs-volver" data-volver="p3">‹ Cambiar hora</button>
      <div class="rs-progreso"><span>Paso 4 de 4</span><span>Guardamos tu horario · <span class="rs-reloj" id="p4-reloj"></span></span></div>
      <h1>¿A nombre de quién?</h1>
      <div class="rs-resumen" id="p4-resumen"></div>
      <form id="p4-form" novalidate>
        <label for="f-nombre">Nombre y apellido</label>
        <input type="text" id="f-nombre" autocomplete="name" required>
        <label for="f-whatsapp">WhatsApp · aquí te escribimos si hace falta</label>
        <input type="tel" id="f-whatsapp" autocomplete="tel" inputmode="tel" placeholder="+51 9__ ___ ___" required>
        <label for="f-email">Correo · aquí llega tu invitación</label>
        <input type="email" id="f-email" autocomplete="email" required>
        <div id="p4-dni" hidden>
          <label for="f-dni">DNI · para tu comprobante (compras de más de S/700)</label>
          <input type="text" id="f-dni" inputmode="numeric" maxlength="8">
        </div>
        <label class="rs-check"><input type="checkbox" id="f-acepto" required> <span>Acepto las <a href="/condiciones/" target="_blank" rel="noopener">condiciones del servicio</a> y he leído la <a href="/privacidad/" target="_blank" rel="noopener">política de privacidad</a>.</span></label>
        <label class="rs-check"><input type="checkbox" id="f-novedades"> <span>{NOVEDADES_TEXTO.replace(/ \(v[\d-]+\)$/, '')} (opcional)</span></label>
        <p class="rs-nota">Mover tu cita es gratis hasta 48 h antes; después cuesta S/80.</p>
        <p class="rs-aviso" id="p4-yape" hidden>¿Pagarás con Yape? Revisa tu límite en la app: este monto puede superarlo. Con tarjeta no hay límite.</p>
        <button type="submit" class="rs-btn" id="p4-pagar">Pagar</button>
        <p class="rs-error" id="p4-error" role="alert"></p>
      </form>
    </section>
  </main>
</Layout>

<script>
  import '../../scripts/reservar.js';
</script>
```

`src/pages/reservar/listo.astro`:

```astro
---
import Layout from '../../layouts/Layout.astro';
import '../../styles/reservar.css';
---
<Layout noindex title="Tu reserva · AJL Nutrición">
  <main class="rs">
    <section id="listo" aria-live="polite">
      <h1>Estamos confirmando tu pago…</h1>
      <p class="rs-lead">Esto toma unos segundos. No cierres esta página.</p>
    </section>
  </main>
</Layout>

<script>
  const raiz = document.getElementById('listo');
  const q = new URLSearchParams(location.search);
  const token = q.get('r');
  const paymentId = q.get('payment_id');
  const soles = (c) => `S/${(c / 100).toLocaleString('es-PE', { maximumFractionDigits: 2 })}`;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function pintar(d) {
    if (d.estado === 'confirmada') {
      raiz.innerHTML = `
        <h1>Listo${d.nombre ? `, ${esc(d.nombre)}` : ''}. Tu primera sesión está reservada.</h1>
        <div class="rs-resumen"><div>${esc(d.etiqueta)}</div><div>${d.modalidad === 'video' ? 'Videollamada' : 'En Lince'} · con ${esc(d.nutricionista?.nombre)}</div><div>${esc(d.titulo)} · ${soles(d.monto_centimos)}</div></div>
        <a class="rs-btn" href="/api/reservas/ics?r=${encodeURIComponent(token)}" style="text-align:center;text-decoration:none">Agregar a mi calendario</a>
        <p class="rs-nota">Te enviamos la invitación y la confirmación a tu correo. Si necesitas mover tu cita, escríbenos por WhatsApp.</p>`;
      try {
        const clave = `ajl_compra_${token}`;
        if (!sessionStorage.getItem(clave)) {
          sessionStorage.setItem(clave, '1');
          if (typeof window.gtag === 'function') window.gtag('event', 'purchase', { transaction_id: token, currency: 'PEN', value: d.monto_centimos / 100, items: [{ item_name: d.titulo }] });
          if (typeof window.fbq === 'function') window.fbq('track', 'Purchase', { currency: 'PEN', value: d.monto_centimos / 100, content_name: d.titulo });
        }
      } catch {}
      return true;
    }
    if (d.estado === 'pagada_sin_hora') {
      raiz.innerHTML = `<h1>Tu pago está confirmado.</h1><p class="rs-lead">La hora que elegiste se ocupó mientras pagabas. No tienes que pagar de nuevo.</p><a class="rs-btn" href="/reservar/reubicar/?r=${encodeURIComponent(token)}" style="text-align:center;text-decoration:none">Elegir otra hora</a>`;
      return true;
    }
    if (d.ultimo_pago === 'rejected' || d.estado === 'expirada') {
      const vigente = d.estado !== 'expirada';
      raiz.innerHTML = `<h1>El pago no se completó.</h1><p class="rs-lead">${vigente ? 'Tu horario sigue guardado unos minutos. Puedes intentar con otro medio de pago.' : 'Se venció el tiempo para pagar. Elige tu hora de nuevo.'}</p><a class="rs-btn" href="/reservar/${vigente ? `?r=${encodeURIComponent(token)}` : ''}" style="text-align:center;text-decoration:none">${vigente ? 'Intentar de nuevo' : 'Elegir mi hora'}</a>`;
      return true;
    }
    return false;
  }

  async function consultar(intento) {
    const extra = paymentId && intento === 0 ? `&payment_id=${encodeURIComponent(paymentId)}` : '';
    try {
      const r = await fetch(`/api/reservas/estado?r=${encodeURIComponent(token)}${extra}`);
      if (r.ok && pintar(await r.json())) return;
    } catch {}
    if (intento < 40) setTimeout(() => consultar(intento + 1), 3000);
    else raiz.innerHTML = '<h1>Estamos confirmando tu pago.</h1><p class="rs-lead">Apenas Mercado Pago lo confirme te llegará un correo. Si tienes dudas, escríbenos por WhatsApp.</p>';
  }

  if (token) consultar(0);
  else raiz.innerHTML = '<h1>No encontramos tu reserva.</h1><p class="rs-lead"><a href="/reservar/">Empezar de nuevo</a></p>';
</script>
```

`src/pages/reservar/reubicar.astro`:

```astro
---
import Layout from '../../layouts/Layout.astro';
import '../../styles/reservar.css';
---
<Layout noindex title="Elige tu nueva hora · AJL Nutrición">
  <main class="rs">
    <h1>Elige tu hora</h1>
    <p class="rs-lead">Tu pago ya está confirmado. Solo falta la hora.</p>
    <div id="selector"></div>
    <p class="rs-error" id="error" role="alert"></p>
  </main>
</Layout>

<script>
  import { montarSelector } from '../../scripts/selector-horas.js';
  const token = new URLSearchParams(location.search).get('r');
  const error = document.getElementById('error');

  (async () => {
    const r = await fetch(`/api/reservas/estado?r=${encodeURIComponent(token)}`);
    const d = await r.json();
    if (!r.ok || d.estado !== 'pagada_sin_hora') {
      location.href = `/reservar/listo/?r=${encodeURIComponent(token)}`;
      return;
    }
    const selector = montarSelector(document.getElementById('selector'), {
      producto: d.producto, duracion: d.duracion_meses,
      onElegir: async (eleccion) => {
        error.textContent = 'Guardando tu hora…';
        const res = await fetch('/api/reservas/reubicar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, ...eleccion }) });
        const out = await res.json();
        if (!res.ok) { error.textContent = out.error || 'Esa hora ya no está disponible.'; selector.recargar(); return; }
        location.href = `/reservar/listo/?r=${encodeURIComponent(token)}`;
      },
    });
  })();
</script>
```

- [ ] **Step 5: Verificar en local**

`.dev.vars` local solo necesita lo mínimo: los Google y MP reales no se usan aquí. Para probar sin servicios externos, levantar con la base D1 local y los secretos de prueba que existan:

```bash
npx wrangler d1 migrations apply ajl-reservas --local
npm run build && npx wrangler pages dev dist --port 8788
```

Expected en `http://localhost:8788/reservar/`:
- P1 muestra los tres acompañamientos (2 sesiones marcado) y abajo la sesión única y la evaluación.
- Elegir «2 sesiones» lleva a P2 con S/1.080 y S/440 («son S/80 más cada mes»).
- P3 muestra error amable si Google no está configurado («No pudimos cargar los horarios»). Es lo esperado en local sin credenciales: el flujo completo se prueba en el preview (Task 10).
- `npm test` sigue en PASS.

- [ ] **Step 6: Commit**

```bash
git add src/scripts src/styles/reservar.css src/pages/reservar
git commit -m "reservas: páginas del flujo P1–P6 y reubicación"
```

---

### Task 9: Condiciones del servicio y política de privacidad v1.4

**Files:**
- Create: `src/pages/condiciones.astro`
- Modify: `public/privacidad/index.html` (cabecera, 2.3, 2.4, nueva 2.6, tabla 3, tabla 4, sección 5, sección 11), `docs/legal/checklist-nuevo-procesador.md` (anexo)

- [ ] **Step 1: Página de condiciones**

`src/pages/condiciones.astro`:

```astro
---
import Layout from '../layouts/Layout.astro';
import { contacto } from '../data/contacto.js';
import { CONDICIONES_VERSION } from '../data/condiciones.js';
---
<Layout title="Condiciones del servicio · AJL Nutrición" description="Condiciones para contratar y reservar sesiones de AJL Nutrición en la web.">
  <main class="cond">
    <div class="container">
      <h1>Condiciones del servicio</h1>
      <p class="cond-meta">Versión {CONDICIONES_VERSION}. Aplican a las compras y reservas hechas en ajlnutricion.com.</p>

      <h2>1. Quién te atiende</h2>
      <p>AJL Nutrición es una marca de FJ INVESTMENTS S.A.C., RUC 20609894963, con consultorio en {contacto.direccion}. Puedes escribirnos por WhatsApp al +51 919 151 237.</p>

      <h2>2. Qué contratas</h2>
      <p>Cada acompañamiento incluye las sesiones al mes que elegiste con una nutricionista del equipo, tu plan en la app, el equipo respondiéndote por WhatsApp y 2 clases grupales en vivo por semana. La sesión única es una sola sesión, sin acompañamiento continuo. La evaluación es una consulta de 30 minutos; si contratas un plan el mismo día, sus S/80 se descuentan del plan.</p>

      <h2>3. Precio y pago</h2>
      <p>Los precios están en soles e incluyen todo: no cobramos recargo por pagar con tarjeta. El pago se hace en Mercado Pago, con tarjeta, Yape o dinero en tu cuenta. Te enviamos tu comprobante al correo que nos diste.</p>

      <h2>4. Tu primera sesión y las siguientes</h2>
      <p>Al comprar eliges tu primera sesión. Las siguientes las coordinas con tu nutricionista cuando quieras, dentro del plazo de tu plan. Buscamos que la misma nutricionista te acompañe todo el plan; si prefieres cambiar, nos lo pides.</p>

      <h2>5. Plazo de tu plan</h2>
      <p>El plazo empieza cuando recibes tu plan. El paquete de 3 meses se usa en 3 meses y puedes congelarlo 1 semana, por ejemplo si viajas. El plan mes a mes se usa en el mes. Las sesiones que no agendes dentro del plazo no se acumulan.</p>

      <h2>6. Mover o cancelar una cita</h2>
      <p>Mover una cita es gratis si nos avisas hasta 48 horas antes, según la disponibilidad del equipo. Si nos avisas con menos de 48 horas o no vienes, esa sesión se pierde; puedes recuperarla pagando S/80. Si hubo una razón de fuerza mayor, cuéntanos: el equipo puede exonerarte.</p>

      <h2>7. Si no podemos atenderte</h2>
      <p>Si AJL no puede prestarte el servicio, te devolvemos lo que no usaste. Si pagaste y la hora que elegiste se ocupó mientras pagabas, eliges otra hora sin volver a pagar; si ninguna te acomoda, te devolvemos el pago completo.</p>

      <h2>8. Lo que sí prometemos</h2>
      <p>Un plan hecho para tu vida real y un equipo que te acompaña. No prometemos una cantidad de kilos: los resultados dependen de cada persona.</p>

      <h2>9. Tus datos</h2>
      <p>Usamos tus datos solo para atenderte, según nuestra <a href="/privacidad/">política de privacidad</a>.</p>

      <h2>10. Reclamos</h2>
      <p>Si algo no salió bien, escríbenos por WhatsApp. También puedes usar nuestro <a href="/reclamaciones/">Libro de Reclamaciones</a>. Estas condiciones no limitan los derechos que te reconoce el Código de Protección y Defensa del Consumidor.</p>
    </div>
  </main>
</Layout>

<style>
  .cond { padding-block: clamp(2rem, 6vw, 4rem); }
  .cond .container { max-width: 720px; }
  .cond h1 { font-family: var(--font-head); color: var(--verde-osc); margin-bottom: .5rem; }
  .cond h2 { font-size: 1.1rem; color: var(--verde-osc); margin: 1.6rem 0 .4rem; }
  .cond p { line-height: 1.65; color: var(--ink); }
  .cond-meta { color: var(--gris); font-size: .9rem; }
  .cond a { color: var(--dorado-osc); text-decoration: underline; }
</style>
```

Agregar `/condiciones/` a `public/sitemap.xml`, copiando el bloque `<url>` de `/privacidad/` y cambiando la ruta.

- [ ] **Step 2: Política v1.4**

En `public/privacidad/index.html`:

1. Cabecera: `Versión 1.3` → `Versión 1.4`, y la fecha → la fecha del día en que se hace este paso (se vuelve a ajustar al lanzar, Task 11).
2. En 2.3, `inicio de checkout)` → `inicio de checkout y compra completada)`.
3. Reemplazar el párrafo de 2.4 por:

```html
      <p>Si contratas un plan o la Evaluación desde la web, el pago se procesa en la plataforma de <strong>Mercado Pago</strong>: tus datos de tarjeta o de Yape no pasan por nuestros servidores. De Mercado Pago recibimos solo la confirmación del pago (número de operación, monto, medio usado y estado). Si pagas por otro canal, como un enlace de pago o una transferencia coordinada por WhatsApp, esos datos se tratan fuera de este sitio.</p>
```

4. Después del bloque 2.5, agregar:

```html
      <h3>2.6. Datos de tu reserva</h3>

      <p>Para reservar tu primera sesión desde la web recolectamos tu <strong>nombre</strong>, tu <strong>WhatsApp</strong>, tu <strong>correo</strong> y, si el total supera S/700, tu <strong>DNI</strong> para el comprobante. Registramos además el plan elegido, la fecha, hora y modalidad de tu sesión, la nutricionista asignada, la versión de las condiciones que aceptaste y, si la marcas, tu autorización para recibir novedades. Tu nombre y tu correo van en la invitación de Google Calendar que te enviamos. Si no completas el pago, borramos tus datos de contacto a los 30 días.</p>
```

5. En la tabla de la sección 3, antes de la fila de comunicaciones comerciales:

```html
          <tr>
            <td>Gestionar tu reserva y tu pago, y enviarte la confirmación e invitación de tu sesión</td>
            <td>2.4 y 2.6</td>
            <td>Ejecución del contrato que celebras con nosotros</td>
          </tr>
          <tr>
            <td>Emitir tu comprobante de pago</td>
            <td>Nombre, DNI, monto</td>
            <td>Cumplimiento de obligación legal (normativa tributaria)</td>
          </tr>
```

y en la fila de comunicaciones comerciales, la columna de datos `Email` → `Email (newsletter o casilla de novedades al reservar)`.

6. En la tabla de la sección 4:
   - En la fila de Cloudflare, la columna de datos queda `Datos del formulario en tránsito, IP, User-Agent, logs técnicos; datos de reservas (2.6) guardados en su base de datos D1`.
   - Después de la fila de Culqi, agregar las dos filas de abajo. Antes de escribir la de Mercado Pago, abrir `https://www.mercadopago.com.pe/privacidad`, copiar la razón social exacta del responsable en Perú y usarla en lugar de «Mercado Pago».

```html
          <tr>
            <td>Mercado Pago</td>
            <td>Procesamiento de pagos de la web (tarjeta, Yape, dinero en cuenta)</td>
            <td>Perú y países donde opera su infraestructura</td>
            <td>Datos de pago (no pasan por nuestros servidores), nombre y correo del pagador</td>
          </tr>
          <tr>
            <td>Google LLC (Google Calendar)</td>
            <td>Agenda del equipo e invitación de tu sesión</td>
            <td>Estados Unidos</td>
            <td>Nombre, correo, fecha, hora y modalidad de tu sesión</td>
          </tr>
```

7. En la sección 5, antes de la línea de marketing:

```html
        <li><strong>Datos de reservas pagadas:</strong> mientras dure tu acompañamiento y, después, el plazo que exige la normativa tributaria para sustentar los comprobantes.</li>
        <li><strong>Reservas no pagadas:</strong> borramos tus datos de contacto a los 30 días.</li>
```

8. En la sección 11, `otorgado en un acto separado del envío del formulario del Libro de Reclamaciones.` → `otorgado en un acto separado: la suscripción al newsletter o la casilla opcional de novedades al reservar, nunca junto con el Libro de Reclamaciones.`

Run: `grep -c "Versión 1.4\|2.6. Datos de tu reserva\|Google LLC (Google Calendar)" public/privacidad/index.html`
Expected: `3`.

- [ ] **Step 3: Anexo de procesadores**

En `docs/legal/checklist-nuevo-procesador.md`, anexo de procesadores, agregar:

```
| Mercado Pago | Pagos de la web | Perú / otros | Datos de pago (no pasan por nosotros), nombre y correo del pagador | Términos y política de Mercado Pago | 2026-10-01 |
| Google (Calendar) | Agenda e invitaciones de sesiones | EE.UU. | Nombre, correo, fecha y modalidad de la sesión | Google Workspace/Cloud DPA no aplica a Gmail personal: términos de Google | 2026-10-01 |
```

- [ ] **Step 4: Verificar y commit**

Run: `npm run build && npm test`
Expected: build sin errores, `dist/condiciones/index.html` existe; pruebas PASS.

```bash
git add src/pages/condiciones.astro public/privacidad/index.html public/sitemap.xml docs/legal/checklist-nuevo-procesador.md
git commit -m "legal: condiciones del servicio y política de privacidad v1.4 para reservas web"
```

---

### Task 10: Credenciales de prueba y pruebas en el preview

Task con Joaquín y Alejandro: cuentas, autorizaciones y pagos de prueba. Claude guía y verifica.

**Files:**
- Create: `scripts/google-oauth.mjs`

- [ ] **Step 1: Script de autorización de Google**

`scripts/google-oauth.mjs`:

```js
// Autorización única de Google Calendar para la agenda web.
// Uso: GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... node scripts/google-oauth.mjs
// Abre el enlace que imprime, inicia sesión con la cuenta DUEÑA del calendario
// y acepta. El refresh token se guarda directo como secreto en Cloudflare
// (producción y preview): nunca se imprime ni se pega en un chat.
import http from 'node:http';
import { execFileSync } from 'node:child_process';

const PUERTO = 53682;
const REDIRECT = `http://localhost:${PUERTO}/callback`;
const { GOOGLE_CLIENT_ID: id, GOOGLE_CLIENT_SECRET: secreto } = process.env;
if (!id || !secreto) { console.error('Faltan GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET'); process.exit(2); }

const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
url.search = new URLSearchParams({
  client_id: id, redirect_uri: REDIRECT, response_type: 'code', access_type: 'offline', prompt: 'consent',
  scope: 'https://www.googleapis.com/auth/calendar.events',
});
console.log(`Abre este enlace con la cuenta dueña del calendario:\n\n${url}\n`);

http.createServer(async (req, res) => {
  const u = new URL(req.url, REDIRECT);
  if (u.pathname !== '/callback') { res.end(); return; }
  const code = u.searchParams.get('code');
  if (!code) { res.end(`Google no devolvió código: ${u.search}`); return; }
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: id, client_secret: secreto, redirect_uri: REDIRECT, grant_type: 'authorization_code' }),
  });
  const d = await r.json();
  if (!d.refresh_token) { res.end('Error: mira la terminal.'); console.error(d); process.exit(1); }
  for (const extra of [[], ['--env', 'preview']]) {
    execFileSync('npx', ['wrangler', 'pages', 'secret', 'put', 'GOOGLE_REFRESH_TOKEN', '--project-name', 'ajl-landing', ...extra],
      { input: d.refresh_token, stdio: ['pipe', 'inherit', 'inherit'] });
  }
  res.end('Listo. Puedes cerrar esta pestaña.');
  console.log('Refresh token guardado en producción y preview.');
  process.exit(0);
}).listen(PUERTO);
```

Commit:

```bash
git add scripts/google-oauth.mjs
git commit -m "reservas: script de autorización única de Google Calendar"
git push -u origin reservas-pago
```

- [ ] **Step 2: Proyecto de Google Cloud (Joaquín, con `ajlnutricion@gmail.com`)**

1. En console.cloud.google.com, crear el proyecto `ajl-reservas` y habilitar **Google Calendar API**.
2. **Pantalla de consentimiento de OAuth:**
   - Tipo Externo, nombre «AJL Nutrición reservas».
   - Scope `.../auth/calendar.events`.
   - **Publicar en producción.** En modo Prueba, el token caduca a los 7 días.
3. **Credenciales → ID de cliente OAuth → App de escritorio.** Guardar el ID y el secreto.
4. Cargar los secretos en ambos entornos, cada comando pide el valor:

```bash
npx wrangler pages secret put GOOGLE_CLIENT_ID --project-name ajl-landing
npx wrangler pages secret put GOOGLE_CLIENT_ID --project-name ajl-landing --env preview
npx wrangler pages secret put GOOGLE_CLIENT_SECRET --project-name ajl-landing
npx wrangler pages secret put GOOGLE_CLIENT_SECRET --project-name ajl-landing --env preview
```

- [ ] **Step 3: Calendarios y autorización (Alejandro)**

1. En la cuenta de Alejandro, crear el calendario **«AJL Reservas (pruebas)»**.
2. De cada calendario («AlejandroJLoayza Nutrición» y el de pruebas), copiar el **ID** que aparece en Configuración → Integrar el calendario.
3. Cargar el de producción y el de pruebas:

```bash
npx wrangler pages secret put GOOGLE_CALENDAR_ID --project-name ajl-landing                 # el real
npx wrangler pages secret put GOOGLE_CALENDAR_ID --project-name ajl-landing --env preview   # el de pruebas
```

4. En la computadora de Joaquín, Alejandro inicia sesión en una ventana de incógnito y se corre:

```bash
GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... node scripts/google-oauth.mjs
```

Expected:
- Google avisa «app no verificada». Alejandro va a Avanzado → continuar y acepta.
- La terminal dice `Refresh token guardado en producción y preview.`

- [ ] **Step 4: Mercado Pago, credenciales de prueba (Joaquín)**

1. En mercadopago.com.pe/developers → **Tus integraciones → Crear aplicación** «AJL Reservas web», tipo Checkout Pro.
2. Copiar el **Access Token de prueba** y cargarlo **solo en preview**:

```bash
npx wrangler pages secret put MP_ACCESS_TOKEN --project-name ajl-landing --env preview
```

3. **Webhooks**, en modo prueba:
   - URL `https://reservas-pago.ajl-landing.pages.dev/api/reservas/webhook-mp`, evento **Pagos**.
   - Guardar y copiar la **clave secreta**.

```bash
npx wrangler pages secret put MP_WEBHOOK_SECRET --project-name ajl-landing --env preview
```

4. Crear **cuentas de prueba** (vendedor y comprador) en la misma sección. Los pagos de prueba se hacen con la cuenta compradora y las tarjetas de prueba de la documentación de Mercado Pago Perú. Los datos de tarjeta los escribe Joaquín, nunca en el chat.

- [ ] **Step 5: Redeploy del preview y smoke**

```bash
git commit --allow-empty -m "reservas: redeploy del preview con credenciales de prueba"
git push
```

Esperar el deploy y correr:

```bash
npm run smoke -- https://reservas-pago.ajl-landing.pages.dev
curl -s "https://reservas-pago.ajl-landing.pages.dev/api/reservas/horas?desde=$(date -v+1d +%F)&modalidad=presencial&producto=constancia&duracion=3" | head -c 300
```

Expected: smoke `17/17 OK`; `horas` devuelve `{"ok":true,"dias":[...` con horas.

- [ ] **Step 6: Pruebas del handoff en el preview (Joaquín en el navegador, Claude verifica en D1 y en el calendario de pruebas)**

Para revisar en D1:

```bash
npx wrangler d1 execute ajl-reservas-preview --remote --env preview --command "SELECT token, estado, nutricionista_id, inicio_utc, google_event_id FROM reservas ORDER BY creado_en DESC LIMIT 5"
```

1. **Flujo feliz con tarjeta:**
   - Elegir 2 sesiones · 3 meses → hora presencial → datos → pagar con tarjeta de prueba aprobada.
   - Llega a «Listo».
   - La reserva queda `confirmada`.
   - Aparece el evento `1ra · …` en el calendario de pruebas.
   - Llegan el correo al paciente y el aviso al equipo.
2. **Video:** igual, por videollamada. El evento tiene Meet y el correo lo incluye.
3. **Yape con más de S/500:** se ve el aviso en P4. En el checkout de MP, Yape aparece como medio de pago. Anotar si MP rechaza el monto: es lo que se quería saber.
4. **Doble venta:**
   - Dos navegadores en la misma hora presencial.
   - El primero aparta; el segundo ve «Esa hora acaba de ocuparse» y se le recargan las horas.
5. **Pago rechazado:**
   - Tarjeta de prueba que rechaza.
   - «El pago no se completó» → «Intentar de nuevo» vuelve a P4 con el horario guardado.
6. **Pago tardío:** apartar, esperar 31 minutos, intentar pagar. MP no deja (la preferencia venció) o, si lo deja, la reserva queda `pagada_sin_hora` o `confirmada`, nunca con doble cobro ni dos eventos.
7. **Webhook que no llega:**
   - Desactivar temporalmente el webhook en el panel de MP y pagar.
   - Al volver a «Listo», la reserva igual se confirma (respaldo por `payment_id`).
   - Reactivar el webhook.
8. **Consentimiento:** sin marcar «Acepto» no deja pagar. La reserva guarda `acepto_condiciones_version = 2026-10-01`.

Limpieza: en el calendario de pruebas se pueden dejar o borrar los eventos; la base de preview no toca producción.

---

### Task 11: Lanzamiento

- [ ] **Step 1: Credenciales de producción de Mercado Pago (Joaquín)**

1. En la aplicación «AJL Reservas web», activar las **credenciales de producción**. MP pide los datos del negocio.
2. Cargar el token real y configurar el webhook de **producción**: URL `https://www.ajlnutricion.com/api/reservas/webhook-mp`, evento Pagos.

```bash
npx wrangler pages secret put MP_ACCESS_TOKEN --project-name ajl-landing
npx wrangler pages secret put MP_WEBHOOK_SECRET --project-name ajl-landing
npx wrangler pages secret list --project-name ajl-landing
```

Expected: la lista de producción incluye `GOOGLE_CALENDAR_ID`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `RESEND_API_KEY`, `SUPABASE_SERVICE_KEY` y `SUPABASE_URL`.

- [ ] **Step 2: Encender las entradas al flujo**

- `src/components/Plans.astro`: las dos `href={`/checkout/${...}`}` → `href={`/reservar/?plan=${p.id}`}` y `href={`/reservar/?plan=${singlePlan.id}`}`.
- `src/components/Evaluation.astro:50`: `href={`/checkout/${evaluacion.id}`}` → `href={`/reservar/?plan=${evaluacion.id}`}`.
- Borrar `src/pages/checkout/[slug].astro` y crear `public/_redirects`:

```
/checkout/:slug/ /reservar/?plan=:slug 301
/checkout/:slug /reservar/?plan=:slug 301
```

- En `src/data/plans.js`, la nota de recargo de la tarjeta (`note: '5% de recargo'`) → `note: null`, y su comentario «La tarjeta lleva recargo porque la pasarela cobra comisión.» → «Sin recargo por tarjeta en ningún canal (D7.1, 30-sep-2026).».
- En `public/privacidad/index.html`, la fecha de la cabecera → la de hoy.

Run: `npm run build && npm test && grep -rn "checkout/" src/components`
Expected: build y pruebas OK; el `grep` no encuentra enlaces a `/checkout/`.

- [ ] **Step 3: Merge y deploy**

```bash
git fetch origin && git merge origin/main
npm test
git checkout --detach origin/main && git merge --no-ff reservas-pago -m "reserva y pago en la web (V1)"
git push origin HEAD:main
git checkout reservas-pago
```

Esperar el deploy de producción y correr:

```bash
npm run smoke -- https://www.ajlnutricion.com
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://www.ajlnutricion.com/checkout/constancia/
```

Expected: `17/17 OK`; `/checkout/constancia/` → `301 https://www.ajlnutricion.com/reservar/?plan=constancia`.

- [ ] **Step 4: Pago real de bajo monto**

1. Joaquín reserva una **evaluación (S/80)** con su tarjeta real, en una hora real que el equipo sepa que es prueba.
2. Verificar:
   - «Listo».
   - El evento `Eval · …` en el calendario real.
   - Los dos correos.
   - El pago en el panel de MP.
3. **Devolver** el pago desde el panel de Mercado Pago y borrar el evento del calendario.

- [ ] **Step 5: Documentación interna**

- `~/ajl/CLAUDE.md`, línea del sitio: agregar «Reservas y pago en `/reservar/` (D1 `ajl-reservas`, Mercado Pago, Google Calendar).»
- Memoria `landing-ajl-deploy-arch.md`: secretos nuevos, bases D1 (producción y preview), calendario de pruebas, webhook de MP, script `scripts/google-oauth.mjs`, y la convención del equipo («1ra» en primeras sesiones manuales; ausencias como evento de día completo con el nombre o apodo).
- Avisar al equipo de la convención (Joaquín, por el canal interno).
