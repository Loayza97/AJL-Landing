# Reservas fase 1 del rediseño · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Llevar a `/reservar/` el flujo rediseñado (opción B, paquete de 6 meses, datos completos del paciente, ventanas de condiciones y privacidad, resumen diario de quienes no pagaron), sin fallas.

**Architecture:** Los precios salen de `src/data/plans.js`; un módulo nuevo `src/data/duraciones.js` calcula las duraciones y el ahorro, y lo usan el servidor (`catalogo.mjs`), la página y la landing. La validación del paso 4 vive en `src/data/validar-datos.js`, compartida por el navegador y `handlePagar`. Una migración D1 agrega columnas sin tocar lo existente. Un endpoint protegido arma el resumen diario y un Worker con cron lo dispara.

**Tech Stack:** Astro 4 estático, Cloudflare Pages Functions, D1 (SQLite), `node:test` con `node:sqlite` (Node ≥ 22.5), Resend, Mercado Pago Checkout Pro, Wrangler 4.

**Spec:** `docs/superpowers/specs/2026-10-09-reservas-fase1-rediseno-design.md` (y el anterior `2026-10-01-reservas-y-pago-design.md` en lo que este no cambia).

## Global Constraints

- Rama `reservas-pago` en `~/ajl/ajl-landing-cloudflare`. Nunca push ni merge a `main` (publica producción) sin autorización de Joaquín.
- Sin dependencias nuevas. ESM. Node ≥ 22.5.
- El repo `Loayza97/AJL-Landing` es público: ningún secreto en archivos versionados. Secretos solo con `npx wrangler pages secret put <NOMBRE> --project-name ajl-landing [--env preview]` o `wrangler secret put` del Worker, leyendo el valor de un archivo `.env` local ignorado por git.
- Precios únicamente desde `src/data/plans.js`. El servidor cotiza siempre; nunca usa un monto enviado por el navegador.
- Montos visibles con punto de miles: `S/1.950`, `S/2.808`.
- Copy en español peruano, tuteo, sin rayas ni guiones como inciso; alineado al ADN de marca (Preciso · Real · Liberador).
- Colores de `/reservar/`: tinta `#111111`, gris `#6B6B6B`, línea `#E4E4E4`, papel `#FFFFFF`, dorado `#C9A24B`, dorado tinta `#9C7A2B`, fuente Montserrat (ya cargada en `Layout.astro`).
- Lo que dice la política de privacidad y lo que hace el código tienen que coincidir.
- `npm test` corre `node --test "server/**/*.test.mjs"`; toda prueba nueva va bajo `server/`.

## Review Focus

1. Nombres reales con tildes, ñ, apóstrofo o guion (María José, O'Brien, Núñez-Ríos) y pacientes sin segundo apellido: deben pasar; un nombre con `<script>` no debe inyectar HTML en los correos. Pruebas en Task 4 y Task 5.
2. Pacientes extranjeros: Carné de Extranjería y pasaporte con letras deben pasar; un DNI de 7 dígitos no. Prueba en Task 4.
3. Quien vuelve de Mercado Pago sin pagar a una reserva creada antes del despliegue (cliente sin columnas nuevas): `retomar` y `estado` deben seguir funcionando. Prueba en Task 3.
4. El cron que corre dos veces el mismo día, o una persona que no pagó y luego sí pagó: un solo correo, y quien pagó no aparece. Prueba en Task 5.
5. Pantalla 2 en celular: 3 meses aparece primero y nada se sale del ancho a 360 px. Revisión visual en Task 10.

---

### Task 1: Precios de 6 meses y duraciones

**Files:**
- Modify: `src/data/plans.js` (bloques `acompanamiento`, `constancia`, `transformacion` y el comentario «Modelo C»)
- Create: `src/data/duraciones.js`
- Modify: `server/reservas/catalogo.mjs`
- Test: `server/reservas/duraciones.test.mjs` (nuevo), `server/reservas/catalogo.test.mjs`, `server/handlers/reservas.test.mjs:33-38`

**Interfaces:**
- Produces: `formatoSoles(n: number) → string` (`1950 → 'S/1.950'`); `duracionesDe(id: string) → Array<{ meses, total, porMes, ahorro, ahorroPct, congelarSemanas }> | null` (orden 1, 3, 6; `null` para `basico`, `evaluacion` o ids desconocidos); `cotizar(producto, duracion)` acepta 6 y siempre devuelve `requiereDni: true`. Cada plan mensual gana `consultasMes: string[]`.

- [ ] **Step 1: Escribir las pruebas que fallan**

`server/reservas/duraciones.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { duracionesDe, formatoSoles } from '../../src/data/duraciones.js';

test('formatoSoles usa punto de miles', () => {
  assert.equal(formatoSoles(80), 'S/80');
  assert.equal(formatoSoles(1950), 'S/1.950');
  assert.equal(formatoSoles(2808), 'S/2.808');
});

test('2 sesiones: mes a mes, 3 y 6 meses con su ahorro', () => {
  assert.deepEqual(duracionesDe('constancia'), [
    { meses: 1, total: 440, porMes: 440, ahorro: 0, ahorroPct: 0, congelarSemanas: 0 },
    { meses: 3, total: 1080, porMes: 360, ahorro: 240, ahorroPct: 18, congelarSemanas: 1 },
    { meses: 6, total: 1950, porMes: 325, ahorro: 690, ahorroPct: 26, congelarSemanas: 2 },
  ]);
});

test('1 y 4 sesiones al mes: precios de la hoja', () => {
  const uno = duracionesDe('acompanamiento');
  assert.deepEqual(uno.map((o) => [o.total, o.porMes, o.ahorro, o.ahorroPct]), [[320, 320, 0, 0], [810, 270, 150, 16], [1500, 250, 420, 22]]);
  const cuatro = duracionesDe('transformacion');
  assert.deepEqual(cuatro.map((o) => [o.total, o.porMes, o.ahorro, o.ahorroPct]), [[600, 600, 0, 0], [1530, 510, 270, 15], [2808, 468, 792, 22]]);
});

test('sin duraciones para sesión única, evaluación o ids raros', () => {
  assert.equal(duracionesDe('basico'), null);
  assert.equal(duracionesDe('evaluacion'), null);
  assert.equal(duracionesDe('__proto__'), null);
  assert.equal(duracionesDe('inventado'), null);
});
```

En `server/reservas/catalogo.test.mjs`, reemplazar las pruebas «mes a mes usa el precio mensual y no pide DNI» y «combinaciones inválidas devuelven null» por:

```js
test('mes a mes usa el precio mensual y también pide DNI', () => {
  const c = cotizar('transformacion', 1);
  assert.equal(c.monto_centimos, 60000);
  assert.equal(c.titulo, '4 sesiones al mes · 1 mes');
  assert.equal(c.requiereDni, true);
});

test('6 meses: S/1.950 para 2 sesiones y S/2.808 para 4', () => {
  assert.deepEqual(cotizar('constancia', 6), {
    titulo: '2 sesiones al mes · 6 meses', monto_centimos: 195000, duracion_meses: 6, peso: 1, requiereDni: true,
  });
  assert.equal(cotizar('transformacion', 6).monto_centimos, 280800);
  assert.equal(cotizar('acompanamiento', 6).monto_centimos, 150000);
});

test('combinaciones inválidas devuelven null', () => {
  assert.equal(cotizar('evaluacion', 3), null);
  assert.equal(cotizar('basico', 6), null);
  assert.equal(cotizar('constancia', 12), null);
  assert.equal(cotizar('constancia', 2), null);
  assert.equal(cotizar('inventado', 1), null);
  assert.equal(cotizar('__proto__', 1), null);
});
```

En `server/handlers/reservas.test.mjs`, en «horas: parámetros inválidos dan 400», cambiar `duracion=6` por `duracion=12`.

- [ ] **Step 2: Correr y ver que fallan**

Run: `npm test 2>&1 | tail -15`
Expected: FAIL. `duraciones.test.mjs` no encuentra `src/data/duraciones.js`; `cotizar('constancia', 6)` devuelve `null`.

- [ ] **Step 3: Implementar**

En `src/data/plans.js`, reemplazar el comentario del bloque «Modelo C» desde «Columnas: 1 mes y 3 meses» hasta «Decisión 1.B.» por:

```js
  // analítica); lo que cambia es `name`. Columnas: 1, 3 y 6 meses (hoja
  // «Paquetes por permanencia», 2026-10-09). En la landing, bajo cada total va
  // su equivalente mensual, sin tachados; el ahorro se muestra solo en /reservar.
```

Y dejar `programs` y `consultasMes` así en cada plan mensual (el resto de cada objeto no cambia):

```js
  // acompanamiento
    programs: [
      { label: '3 meses', months: 3, total: 'S/810', perMes: 'S/270 al mes', totalSoles: 810 },
      { label: '6 meses', months: 6, total: 'S/1.500', perMes: 'S/250 al mes', totalSoles: 1500 },
    ],
    consultasMes: ['1 sesión de 60 min · recibes o actualizas tu plan'],
  // constancia
    programs: [
      { label: '3 meses', months: 3, total: 'S/1.080', perMes: 'S/360 al mes', totalSoles: 1080 },
      { label: '6 meses', months: 6, total: 'S/1.950', perMes: 'S/325 al mes', totalSoles: 1950 },
    ],
    consultasMes: ['1ª sesión de 60 min · recibes o actualizas tu plan', '2ª control de 30 min'],
  // transformacion
    programs: [
      { label: '3 meses', months: 3, total: 'S/1.530', perMes: 'S/510 al mes', totalSoles: 1530 },
      { label: '6 meses', months: 6, total: 'S/2.808', perMes: 'S/468 al mes', totalSoles: 2808 },
    ],
    consultasMes: ['1ª y 3ª sesión de 60 min · recibes o actualizas tu plan', '2ª y 4ª control de 30 min'],
```

`src/data/duraciones.js`:

```js
// Duraciones de cada plan con acompañamiento y su ahorro frente a pagar mes a
// mes. Lo usan el servidor (cotizar), /reservar y la landing: una sola cuenta.
import { plans } from './plans.js';

// Semanas que se puede congelar cada paquete (condiciones del servicio).
const CONGELAR_SEMANAS = { 3: 1, 6: 2 };

export const formatoSoles = (n) => `S/${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;

export function duracionesDe(id) {
  if (!Object.hasOwn(plans, id)) return null;
  const p = plans[id];
  if (p.single || !Array.isArray(p.programs)) return null;
  const mes = { meses: 1, total: p.price, porMes: p.price, ahorro: 0, ahorroPct: 0, congelarSemanas: 0 };
  return [mes, ...p.programs.map((g) => {
    const normal = p.price * g.months;
    const ahorro = normal - g.totalSoles;
    return {
      meses: g.months, total: g.totalSoles, porMes: Math.round(g.totalSoles / g.months),
      ahorro, ahorroPct: Math.round((ahorro * 100) / normal), congelarSemanas: CONGELAR_SEMANAS[g.months],
    };
  })];
}
```

`server/reservas/catalogo.mjs` completo:

```js
// Precio, peso para el tope y título, a partir de src/data/plans.js (la misma
// fuente que pinta la web). El servidor cotiza siempre: nunca confía en un
// monto que mande el navegador. El documento se pide en toda compra.
import { plans } from '../../src/data/plans.js';
import { duracionesDe } from '../../src/data/duraciones.js';
import { PESO_EVALUACION } from './constantes.mjs';

function armar(titulo, soles, duracion_meses, peso) {
  return { titulo, monto_centimos: Math.round(soles * 100), duracion_meses, peso, requiereDni: true };
}

export function cotizar(producto, duracion) {
  if (!Object.hasOwn(plans, producto)) return null;
  const plan = plans[producto];
  const opciones = duracionesDe(producto);
  if (opciones) {
    const o = opciones.find((x) => x.meses === duracion);
    if (!o) return null;
    return armar(`${plan.name} · ${o.meses === 1 ? '1 mes' : `${o.meses} meses`}`, o.total, o.meses, 1);
  }
  if (duracion !== 1) return null;
  if (producto === 'evaluacion') return armar(plan.name, plan.price, 1, PESO_EVALUACION);
  if (producto === 'basico') return armar(plan.name, plan.price, 1, 1);
  return null;
}
```

- [ ] **Step 4: Correr y ver que pasan**

Run: `npm test 2>&1 | tail -8`
Expected: PASS, 0 fallas.

- [ ] **Step 5: Commit**

```bash
git add src/data/plans.js src/data/duraciones.js server/reservas/catalogo.mjs server/reservas/catalogo.test.mjs server/reservas/duraciones.test.mjs server/handlers/reservas.test.mjs
git commit -m "reservas: paquete de 6 meses y ahorro calculado desde plans.js"
```

---

### Task 2: Columna «6 meses» en la tabla de la landing

**Files:**
- Modify: `src/components/Plans.astro` (cabecera de la tabla, celda de 3 meses, grillas `.ap-cab, .ap-fila` y la regla de celular)

**Interfaces:**
- Consumes: `p.programs[1]` (6 meses) de Task 1.

- [ ] **Step 1: Agregar la cabecera y la celda**

En la cabecera, después de `<span role="columnheader">3 meses</span>`, agregar:

```astro
        <span role="columnheader">6 meses</span>
```

Después del `<div class="ap-precio" role="cell">` de 3 meses (el que termina con `{p.programs[0].perMes}</span>` y `</div>`), agregar:

```astro
          <div class="ap-precio" role="cell">
            <span class="ap-lbl">6 meses</span>
            <span class="ap-pr"><span class="ap-cu">S/</span>{p.programs[1].total.replace('S/', '')}</span>
            <span class="ap-eq">{p.programs[1].perMes}</span>
          </div>
```

- [ ] **Step 2: Ajustar las grillas**

Reemplazar `.ap-cab, .ap-fila { display: grid; grid-template-columns: 1.6fr 1fr 1fr 150px;` por `grid-template-columns: 1.5fr 1fr 1fr 1fr 150px;` (resto de la regla igual). Actualizar el comentario de arriba: «el de 1, 3 y 6 meses arrancan a la misma altura».

En `@media (max-width: 640px)`, reemplazar `.ap-fila, .ap-sola { grid-template-columns: 1fr 1fr; row-gap: 12px; align-items: start; }` por:

```css
  .ap-fila { grid-template-columns: repeat(3, minmax(0, 1fr)); row-gap: 12px; align-items: start; }
  .ap-sola { grid-template-columns: 1fr 1fr; row-gap: 12px; align-items: start; }
```

Y `.ap-pr { font-size: 25px; }` por `.ap-pr { font-size: 22px; }`.

- [ ] **Step 3: Construir y comprobar**

Run: `npm run build 2>&1 | tail -3 && grep -o 'S/</span>1.950\|S/</span>2.808\|S/</span>1.500' dist/index.html | sort -u`
Expected: build sin errores y las tres líneas `S/</span>1.500`, `S/</span>1.950`, `S/</span>2.808`.

- [ ] **Step 4: Revisión visual**

Run: `npx astro preview --port 4321` en segundo plano y abrir `http://localhost:4321/#planes` a 1280 px y a 360 px. Expected: tres columnas de precio alineadas; en celular, 1 mes, 3 meses y 6 meses en una fila y el botón debajo, sin desborde horizontal.

- [ ] **Step 5: Commit**

```bash
git add src/components/Plans.astro
git commit -m "landing: columna de 6 meses en la tabla de planes"
```

---

### Task 3: Migración de clientes y guardado de los datos nuevos

**Files:**
- Create: `db/d1/0002_cliente_detalle.sql`
- Modify: `server/reservas/d1-prueba.mjs` (aplicar todas las migraciones)
- Modify: `server/reservas/repo.mjs` (`guardarDatosYPagar`, `purgarNoPagadas`)
- Test: `server/reservas/repo.test.mjs`, `server/reservas/esquema.test.mjs`

**Interfaces:**
- Produces: `guardarDatosYPagar(db, { reserva, cliente, ... })` donde `cliente = { nombre, nombres, apellido_paterno, apellido_materno, fecha_nacimiento, tipo_documento, dni, whatsapp, email }` (`apellido_materno` puede ser `null`); tabla `resumenes_enviados(fecha, enviado_en)`.

- [ ] **Step 1: Escribir las pruebas que fallan**

Al final de `server/reservas/esquema.test.mjs`:

```js
test('migración 0002: columnas nuevas de clientes y tabla de resúmenes', async () => {
  const db = d1DePrueba();
  await db.prepare(`INSERT INTO clientes (id, nombre, nombres, apellido_paterno, apellido_materno, fecha_nacimiento, tipo_documento, dni, creado_en)
    VALUES ('c', 'Ana Pérez', 'Ana', 'Pérez', NULL, '1990-05-04', 'ce', 'X12345678', 'x')`).run();
  const c = await db.prepare('SELECT * FROM clientes').first();
  assert.equal(c.fecha_nacimiento, '1990-05-04');
  assert.equal(c.tipo_documento, 'ce');
  await db.prepare("INSERT INTO resumenes_enviados (fecha, enviado_en) VALUES ('2026-10-09', 'x')").run();
  await assert.rejects(db.prepare("INSERT INTO resumenes_enviados (fecha, enviado_en) VALUES ('2026-10-09', 'y')").run(), /UNIQUE|PRIMARY/);
});
```

En `server/reservas/repo.test.mjs`, agregar una constante después de `ret` y dos pruebas al final:

```js
const cliente = {
  nombre: 'Ana Lucía Pérez Núñez', nombres: 'Ana Lucía', apellido_paterno: 'Pérez', apellido_materno: 'Núñez',
  fecha_nacimiento: '1990-05-04', tipo_documento: 'dni', dni: '12345678', whatsapp: '+51987654321', email: 'a@x.pe',
};

test('guardarDatosYPagar guarda nombres, apellidos, nacimiento y documento', async () => {
  const db = d1DePrueba();
  await ret(db, { id: 'g', token: 'tg' });
  const r = await repo.reservaPorToken(db, 'tg');
  await repo.guardarDatosYPagar(db, { reserva: r, cliente, condicionesVersion: 'v', novedades: false, ahora: mas(1) });
  const c = await db.prepare('SELECT * FROM clientes').first();
  assert.equal(c.nombre, 'Ana Lucía Pérez Núñez');
  assert.equal(c.apellido_materno, 'Núñez');
  assert.equal(c.fecha_nacimiento, '1990-05-04');
  assert.equal(c.tipo_documento, 'dni');
  assert.equal((await repo.reservaPorToken(db, 'tg')).estado, 'pagando');
});

test('purgar también borra las columnas nuevas; una reserva vieja sin ellas sigue leyéndose', async () => {
  const db = d1DePrueba();
  await ret(db, { id: 'p2', token: 'tp2' });
  await repo.guardarDatosYPagar(db, { reserva: await repo.reservaPorToken(db, 'tp2'), cliente, condicionesVersion: 'v', novedades: false, ahora: mas(1) });
  await repo.purgarNoPagadas(db, new Date(t0.getTime() + 31 * 86400000));
  const c = await db.prepare('SELECT * FROM clientes').first();
  assert.deepEqual([c.nombres, c.apellido_paterno, c.apellido_materno, c.fecha_nacimiento, c.tipo_documento, c.dni], [null, null, null, null, null, null]);
  await db.prepare("INSERT INTO clientes (id, nombre, creado_en) VALUES ('viejo', 'Ana Pérez', 'x')").run();
  await ret(db, { id: 'v', token: 'tv', inicio_utc: '2026-10-06T19:00:00Z' });
  await db.prepare("UPDATE reservas SET cliente_id = 'viejo' WHERE id = 'v'").run();
  assert.equal((await repo.reservaPorToken(db, 'tv')).nombre, 'Ana Pérez');
});
```

En la prueba existente «purgar borra datos de contacto…», cambiar `cliente: { nombre: 'Ana', whatsapp: '+51987654321', email: 'a@x.pe', dni: null }` por `cliente: { ...cliente, nombre: 'Ana' }` (y moverla debajo de la constante si queda antes).

- [ ] **Step 2: Correr y ver que fallan**

Run: `npm test 2>&1 | grep -E "^# (pass|fail)|not ok" | head`
Expected: FAIL con `no such column: nombres` / `no such table: resumenes_enviados`.

- [ ] **Step 3: Implementar**

`db/d1/0002_cliente_detalle.sql`:

```sql
-- Datos completos del paciente (rediseño 2026-10-09) y control del resumen
-- diario de quienes no pagaron. Solo agrega: nada existente cambia.
ALTER TABLE clientes ADD COLUMN nombres TEXT;
ALTER TABLE clientes ADD COLUMN apellido_paterno TEXT;
ALTER TABLE clientes ADD COLUMN apellido_materno TEXT;
ALTER TABLE clientes ADD COLUMN fecha_nacimiento TEXT;
ALTER TABLE clientes ADD COLUMN tipo_documento TEXT;

CREATE TABLE resumenes_enviados (
  fecha      TEXT PRIMARY KEY,
  enviado_en TEXT NOT NULL
);
```

En `server/reservas/d1-prueba.mjs`, reemplazar el import de `fs` y la línea `sqlite.exec(readFileSync(...0001_reservas.sql...))` por:

```js
import { readFileSync, readdirSync } from 'node:fs';
```

```js
  // Todas las migraciones, en orden, como las aplica D1.
  const dir = new URL('../../db/d1/', import.meta.url);
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    sqlite.exec(readFileSync(new URL(f, dir), 'utf8'));
  }
```

En `server/reservas/repo.mjs`, en `guardarDatosYPagar`, reemplazar la definición de `guardarCliente` por:

```js
  const c = cliente;
  const campos = [c.nombre, c.whatsapp, c.email, c.dni, c.nombres, c.apellido_paterno, c.apellido_materno ?? null,
    c.fecha_nacimiento, c.tipo_documento];
  const guardarCliente = reserva.cliente_id
    ? db.prepare(`UPDATE clientes SET nombre = ?2, whatsapp = ?3, email = ?4, dni = ?5, nombres = ?6,
        apellido_paterno = ?7, apellido_materno = ?8, fecha_nacimiento = ?9, tipo_documento = ?10 WHERE id = ?1`)
      .bind(clienteId, ...campos)
    : db.prepare(`INSERT INTO clientes (id, nombre, whatsapp, email, dni, nombres, apellido_paterno, apellido_materno,
        fecha_nacimiento, tipo_documento, creado_en) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`)
      .bind(clienteId, ...campos, ahoraIso);
```

En `purgarNoPagadas`, reemplazar `UPDATE clientes SET nombre = NULL, whatsapp = NULL, email = NULL, dni = NULL` por:

```sql
UPDATE clientes SET nombre = NULL, whatsapp = NULL, email = NULL, dni = NULL, nombres = NULL,
       apellido_paterno = NULL, apellido_materno = NULL, fecha_nacimiento = NULL, tipo_documento = NULL
```

- [ ] **Step 4: Correr y ver que pasan**

Run: `npm test 2>&1 | grep -E "^# (pass|fail)|not ok" | head`
Expected: `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add db/d1/0002_cliente_detalle.sql server/reservas/d1-prueba.mjs server/reservas/repo.mjs server/reservas/repo.test.mjs server/reservas/esquema.test.mjs
git commit -m "reservas: migración con nombres, apellidos, nacimiento y documento del paciente"
```

---

### Task 4: Validación compartida del paso 4 y `handlePagar`

**Files:**
- Create: `src/data/validar-datos.js`
- Modify: `server/handlers/reservas.mjs` (`handlePagar`, constante `EMAIL` si queda sin uso)
- Test: `server/reservas/validar-datos.test.mjs` (nuevo), `server/handlers/reservas.test.mjs`

**Interfaces:**
- Produces: `validarDatos(d, hoyLima: 'AAAA-MM-DD') → { ok: false, error: string } | { ok: true, cliente }` con `cliente` en la forma de Task 3; `hoyEnLima(fecha: Date) → 'AAAA-MM-DD'`. El cuerpo de `POST /api/reservas/pagar` pasa a ser `{ token, nombres, apellido_paterno, apellido_materno, whatsapp, email, fecha_nacimiento, tipo_documento, documento, acepto, novedades }`.

- [ ] **Step 1: Escribir las pruebas que fallan**

`server/reservas/validar-datos.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarDatos, hoyEnLima } from '../../src/data/validar-datos.js';

const hoy = '2026-10-09';
const base = {
  nombres: 'María José', apellido_paterno: "O'Brien", apellido_materno: 'Núñez-Ríos', whatsapp: '+51987654321',
  email: 'Ana@X.pe ', fecha_nacimiento: '1990-02-28', tipo_documento: 'dni', documento: '12345678', acepto: true,
};
const v = (o) => validarDatos({ ...base, ...o }, hoy);

test('datos válidos: arma el nombre completo y normaliza el correo', () => {
  const r = v({});
  assert.equal(r.ok, true);
  assert.deepEqual(r.cliente, {
    nombre: "María José O'Brien Núñez-Ríos", nombres: 'María José', apellido_paterno: "O'Brien", apellido_materno: 'Núñez-Ríos',
    fecha_nacimiento: '1990-02-28', tipo_documento: 'dni', dni: '12345678', whatsapp: '+51987654321', email: 'ana@x.pe',
  });
});

test('apellido materno vacío es válido y no deja doble espacio', () => {
  const r = v({ apellido_materno: '  ' });
  assert.equal(r.ok, true);
  assert.equal(r.cliente.apellido_materno, null);
  assert.equal(r.cliente.nombre, "María José O'Brien");
});

test('nombres o paterno vacíos, sin letras o con HTML: error', () => {
  for (const o of [{ nombres: '' }, { nombres: 'A' }, { apellido_paterno: '' }, { nombres: '123' }, { nombres: '<script>' }, { apellido_materno: 'x<b>' }]) {
    assert.equal(v(o).ok, false, JSON.stringify(o));
  }
});

test('documento: DNI 8 dígitos; CE y pasaporte con letras', () => {
  assert.equal(v({ documento: '1234567' }).ok, false);
  assert.equal(v({ documento: '1234567a' }).ok, false);
  assert.equal(v({ tipo_documento: 'ce', documento: 'x0012345' }).ok, false);
  assert.equal(v({ tipo_documento: 'ce', documento: '001234567' }).ok, true);
  assert.equal(v({ tipo_documento: 'pasaporte', documento: 'ab 123456' }).cliente.dni, 'AB123456');
  assert.equal(v({ tipo_documento: 'licencia', documento: '12345678' }).ok, false);
});

test('fecha de nacimiento: real, entre 10 y 100 años', () => {
  assert.equal(v({ fecha_nacimiento: '1990-02-30' }).ok, false);
  assert.equal(v({ fecha_nacimiento: '04/05/1990' }).ok, false);
  assert.equal(v({ fecha_nacimiento: '2000-02-29' }).ok, true);
  assert.equal(v({ fecha_nacimiento: '2016-10-10' }).ok, false); // 9 años
  assert.equal(v({ fecha_nacimiento: '2016-10-09' }).ok, true); // cumple 10 hoy
  assert.equal(v({ fecha_nacimiento: '1926-10-09' }).ok, true); // 100
  assert.equal(v({ fecha_nacimiento: '1925-10-08' }).ok, false); // 101
  assert.equal(v({ fecha_nacimiento: '2030-01-01' }).ok, false);
});

test('correo, WhatsApp y aceptación', () => {
  assert.equal(v({ email: 'malo' }).ok, false);
  assert.equal(v({ whatsapp: '123' }).ok, false);
  assert.equal(v({ acepto: false }).ok, false);
});

test('hoyEnLima usa la hora de Lima', () => {
  assert.equal(hoyEnLima(new Date('2026-10-10T03:00:00Z')), '2026-10-09');
});
```

En `server/handlers/reservas.test.mjs`, reemplazar la constante `datos` por:

```js
const datos = { nombres: 'Ana', apellido_paterno: 'Pérez', apellido_materno: '', whatsapp: '987 654 321', email: 'ana@x.pe',
  fecha_nacimiento: '1990-05-04', tipo_documento: 'dni', documento: '12345678', acepto: true, novedades: false };
```

Y la prueba «pagar: valida datos, exige DNI arriba de S/700 y aceptar condiciones» por:

```js
test('pagar: valida datos, exige documento y aceptar condiciones; guarda el detalle', async () => {
  let pedido;
  const d = deps({ mp: { crearPreferencia: async (p) => { pedido = p; return { id: 'pref', init_point: 'https://mp/pagar' }; } } });
  const { token } = await (await apartar(d, { producto: 'transformacion', duracion: 1 })).json();
  const pagar = (o) => handlePagar(post('/api/reservas/pagar', { ...datos, token, ...o }), env, d);
  assert.equal((await pagar({ email: 'malo' })).status, 400);
  assert.equal((await pagar({ documento: '' })).status, 400);
  assert.equal((await pagar({ fecha_nacimiento: '' })).status, 400);
  assert.equal((await pagar({ acepto: false })).status, 400);
  const ok = await pagar({});
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { ok: true, url: 'https://mp/pagar' });
  assert.equal(pedido.urlNotificacion, 'https://www.ajlnutricion.com/api/reservas/webhook-mp');
  assert.equal(pedido.nombre, 'Ana Pérez');
  const c = await d.db.prepare('SELECT * FROM clientes').first();
  assert.deepEqual([c.nombres, c.apellido_paterno, c.apellido_materno, c.fecha_nacimiento, c.tipo_documento, c.dni],
    ['Ana', 'Pérez', null, '1990-05-04', 'dni', '12345678']);
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npm test 2>&1 | grep -E "^# (pass|fail)|not ok" | head`
Expected: FAIL: no existe `src/data/validar-datos.js`; `handlePagar` responde 400 «Escribe tu nombre y apellido».

- [ ] **Step 3: Implementar**

`src/data/validar-datos.js`:

```js
// Validación de los datos del paso 4 de /reservar. La usan el navegador (para
// avisar antes) y el servidor (que es el que decide). Sin dependencias.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const NOMBRE = /^(?=.*\p{L})[\p{L}\p{M}' .-]{2,60}$/u;
const DOCUMENTO = { dni: /^\d{8}$/, ce: /^[A-Z0-9]{9,12}$/, pasaporte: /^[A-Z0-9]{6,12}$/ };

const limpio = (s) => String(s ?? '').trim().replace(/\s+/g, ' ');
const mal = (error) => ({ ok: false, error });

export const hoyEnLima = (fecha) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(fecha);

function fechaReal(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [a, m, d] = s.split('-').map(Number);
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
}

function edad(nacimiento, hoy) {
  const [a, m, d] = nacimiento.split('-').map(Number);
  const [ha, hm, hd] = hoy.split('-').map(Number);
  return ha - a - (hm < m || (hm === m && hd < d) ? 1 : 0);
}

export function validarDatos(d, hoyLima) {
  const nombres = limpio(d.nombres);
  const paterno = limpio(d.apellido_paterno);
  const materno = limpio(d.apellido_materno);
  if (!NOMBRE.test(nombres)) return mal('Escribe tus nombres.');
  if (!NOMBRE.test(paterno)) return mal('Escribe tu apellido paterno.');
  if (materno && !NOMBRE.test(materno)) return mal('Revisa tu apellido materno.');
  const whatsapp = String(d.whatsapp ?? '').replace(/[^\d+]/g, '');
  if (!/^\+?\d{9,15}$/.test(whatsapp)) return mal('Revisa tu número de WhatsApp.');
  const email = String(d.email ?? '').trim().toLowerCase();
  if (!EMAIL.test(email)) return mal('Revisa tu correo.');
  const nacimiento = String(d.fecha_nacimiento ?? '').trim();
  if (!fechaReal(nacimiento)) return mal('Revisa tu fecha de nacimiento.');
  const anios = edad(nacimiento, hoyLima);
  if (anios < 10 || anios > 100) return mal('Revisa tu fecha de nacimiento.');
  const tipo = String(d.tipo_documento ?? '');
  if (!Object.hasOwn(DOCUMENTO, tipo)) return mal('Elige tu tipo de documento.');
  const documento = String(d.documento ?? '').replace(/\s+/g, '').toUpperCase();
  if (!DOCUMENTO[tipo].test(documento)) {
    return mal(tipo === 'dni' ? 'Escribe tu DNI (8 dígitos).' : 'Revisa el número de tu documento.');
  }
  if (d.acepto !== true) return mal('Para continuar, acepta las condiciones del servicio.');
  return {
    ok: true,
    cliente: {
      nombre: [nombres, paterno, materno].filter(Boolean).join(' '), nombres, apellido_paterno: paterno,
      apellido_materno: materno || null, fecha_nacimiento: nacimiento, tipo_documento: tipo, dni: documento, whatsapp, email,
    },
  };
}
```

En `server/handlers/reservas.mjs`:
- Agregar `import { validarDatos, hoyEnLima } from '../../src/data/validar-datos.js';`.
- En `handlePagar`, reemplazar desde `const nombre = String(d.nombre || '').trim();` hasta la línea `if (d.acepto !== true) …` inclusive por:

```js
  const v = validarDatos(d, hoyEnLima(deps.ahora()));
  if (!v.ok) return bad(400, v.error);
  const { cliente } = v;
```

- En la llamada a `repo.guardarDatosYPagar`, cambiar `cliente: { nombre, whatsapp, email, dni: precio.requiereDni ? dni : null }` por `cliente`.
- En `deps.mp.crearPreferencia`, cambiar `email, nombre,` por `email: cliente.email, nombre: cliente.nombre,`.
- Si `precio` queda sin uso en `handlePagar`, borrar `const precio = cotizar(r.producto, r.duracion_meses);` de esa función. Si `EMAIL` queda sin uso en el archivo, borrarla.

- [ ] **Step 4: Correr y ver que pasan**

Run: `npm test 2>&1 | grep -E "^# (pass|fail)|not ok" | head`
Expected: `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/data/validar-datos.js server/reservas/validar-datos.test.mjs server/handlers/reservas.mjs server/handlers/reservas.test.mjs
git commit -m "reservas: validación compartida de nombres, apellidos, nacimiento y documento"
```

---

### Task 5: Resumen diario de quienes no pagaron (endpoint)

**Files:**
- Modify: `server/reservas/repo.mjs` (funciones nuevas al final)
- Modify: `server/reservas/correos.mjs` (plantilla nueva)
- Modify: `server/handlers/reservas.mjs` (handler nuevo y su línea en el comentario de rutas)
- Create: `functions/api/reservas/resumen-diario.js`
- Test: `server/reservas/repo.test.mjs`, `server/reservas/correos.test.mjs`, `server/handlers/reservas.test.mjs`

**Interfaces:**
- Consumes: tabla `resumenes_enviados` (Task 3); `cliente` de Task 4.
- Produces: `repo.noPagadasEntre(db, desdeIso, hastaIso) → Promise<fila[]>` (fila: `id, producto, duracion_meses, inicio_utc, modalidad, nutricionista_id, nombre, whatsapp, email`); `repo.marcarResumen(db, fecha, ahora) → Promise<boolean>`; `repo.desmarcarResumen(db, fecha)`; `correoResumenNoPagadas({ fecha, personas }) → { subject, html }`; `handleResumenDiario(request, env, deps)`; ruta `POST /api/reservas/resumen-diario` con `Authorization: Bearer <RESUMEN_TOKEN>`.

- [ ] **Step 1: Escribir las pruebas que fallan**

En `server/reservas/repo.test.mjs`:

```js
test('noPagadasEntre: con datos y vencidas en la ventana; excluye a quien pagó después', async () => {
  const db = d1DePrueba();
  // Cada una en otro día: el tope es de 3 primeras sesiones por día.
  const pagando = async (id, dia, email) => {
    await ret(db, { id, token: `t${id}`, inicio_utc: `2026-10-${dia}T17:00:00Z`, fecha_lima: `2026-10-${dia}` });
    await repo.guardarDatosYPagar(db, { reserva: await repo.reservaPorToken(db, `t${id}`), cliente: { ...cliente, email }, condicionesVersion: 'v', novedades: false, ahora: mas(1) });
  };
  await pagando('a', '06', 'a@x.pe');
  await pagando('b', '07', 'b@x.pe');
  await ret(db, { id: 'sin', token: 'tsin', inicio_utc: '2026-10-08T17:00:00Z', fecha_lima: '2026-10-08' });
  await db.prepare("UPDATE reservas SET estado = 'confirmada' WHERE id = 'b'").run();
  await pagando('b2', '09', 'b@x.pe');
  const filas = await repo.noPagadasEntre(db, t0.toISOString(), mas(24 * 60).toISOString());
  assert.deepEqual(filas.map((f) => f.id), ['a']);
  assert.equal(filas[0].whatsapp, '+51987654321');
});

test('marcarResumen es una sola vez por fecha', async () => {
  const db = d1DePrueba();
  assert.equal(await repo.marcarResumen(db, '2026-10-09', t0), true);
  assert.equal(await repo.marcarResumen(db, '2026-10-09', t0), false);
  await repo.desmarcarResumen(db, '2026-10-09');
  assert.equal(await repo.marcarResumen(db, '2026-10-09', t0), true);
});
```

En `server/reservas/correos.test.mjs` (agregar `correoResumenNoPagadas` al import existente):

```js
test('resumen de no pagados: escapa nombres y arma el link de WhatsApp', () => {
  const c = correoResumenNoPagadas({ fecha: '2026-10-09', personas: [
    { nombre: '<b>Ana</b>', whatsapp: '+51987654321', titulo: '2 sesiones al mes · 6 meses', etiqueta: 'martes 6 de octubre · 12:00', modalidad: 'presencial', nutricionista: 'Nico' },
  ] });
  assert.match(c.subject, /1 persona/);
  assert.ok(!c.html.includes('<b>Ana</b>'));
  assert.ok(c.html.includes('&lt;b&gt;Ana&lt;/b&gt;'));
  assert.ok(c.html.includes('https://wa.me/51987654321'));
});
```

En `server/handlers/reservas.test.mjs` (agregar `handleResumenDiario` al import y `RESUMEN_TOKEN: 'tok'` a `env`):

```js
test('resumen diario: token, una sola vez por día y solo con alguien que avisar', async () => {
  const enviados = [];
  const d = deps({ sendEmail: async (m) => { enviados.push(m); return true; } });
  const llamar = (auth) => handleResumenDiario(new Request('https://x.test/api/reservas/resumen-diario', { method: 'POST', headers: auth ? { Authorization: auth } : {} }), env, d);
  assert.equal((await llamar()).status, 401);
  assert.equal((await llamar('Bearer otro')).status, 401);
  assert.deepEqual(await (await llamar('Bearer tok')).json(), { ok: true, enviados: 0 });
  const ap = await (await apartar(d)).json();
  await handlePagar(post('/api/reservas/pagar', { ...datos, token: ap.token }), env, d);
  const d2 = { ...d, ahora: () => new Date(t0.getTime() + 2 * 3600000) };
  const llamar2 = () => handleResumenDiario(new Request('https://x.test/api/reservas/resumen-diario', { method: 'POST', headers: { Authorization: 'Bearer tok' } }), env, d2);
  assert.deepEqual(await (await llamar2()).json(), { ok: true, enviados: 1 });
  assert.deepEqual(await (await llamar2()).json(), { ok: true, enviados: 0, repetido: true });
  assert.equal(enviados.length, 1);
  assert.equal(enviados[0].to, 'equipo@x.pe');
  assert.equal((await handleResumenDiario(new Request('https://x.test/api/reservas/resumen-diario', { method: 'POST', headers: { Authorization: 'Bearer tok' } }), { ...env, RESUMEN_TOKEN: '' }, d2)).status, 503);
});

test('resumen diario: si el correo falla, se puede reintentar el mismo día', async () => {
  let falla = true;
  const d = deps({ sendEmail: async () => !falla });
  const ap = await (await apartar(d)).json();
  await handlePagar(post('/api/reservas/pagar', { ...datos, token: ap.token }), env, d);
  const d2 = { ...d, ahora: () => new Date(t0.getTime() + 2 * 3600000) };
  const llamar = () => handleResumenDiario(new Request('https://x.test/api/reservas/resumen-diario', { method: 'POST', headers: { Authorization: 'Bearer tok' } }), env, d2);
  assert.equal((await llamar()).status, 503);
  falla = false;
  assert.deepEqual(await (await llamar()).json(), { ok: true, enviados: 1 });
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npm test 2>&1 | grep -E "^# (pass|fail)|not ok" | head`
Expected: FAIL: `repo.noPagadasEntre is not a function`, `correoResumenNoPagadas` no exportado, `handleResumenDiario` no exportado.

- [ ] **Step 3: Implementar**

Al final de `server/reservas/repo.mjs`:

```js
// Quienes dejaron sus datos y no pagaron: su plazo para pagar venció dentro de
// la ventana y esa persona (por correo) no tiene ninguna reserva pagada.
export async function noPagadasEntre(db, desdeIso, hastaIso) {
  const { results } = await db.prepare(
    `SELECT r.id, r.producto, r.duracion_meses, r.inicio_utc, r.modalidad, r.nutricionista_id, c.nombre, c.whatsapp, c.email
     FROM reservas r JOIN clientes c ON c.id = r.cliente_id
     WHERE c.nombre IS NOT NULL AND r.estado IN ('apartada', 'pagando', 'expirada')
       AND r.retencion_hasta >= ?1 AND r.retencion_hasta < ?2
       AND NOT EXISTS (SELECT 1 FROM reservas r2 JOIN clientes c2 ON c2.id = r2.cliente_id
                       WHERE c2.email = c.email AND r2.estado IN ('confirmada', 'pagada_sin_hora'))
     ORDER BY r.retencion_hasta`,
  ).bind(desdeIso, hastaIso).all();
  return results;
}

export async function marcarResumen(db, fecha, ahora) {
  const r = await db.prepare('INSERT INTO resumenes_enviados (fecha, enviado_en) VALUES (?1, ?2) ON CONFLICT (fecha) DO NOTHING')
    .bind(fecha, ahora.toISOString()).run();
  return r.meta.changes === 1;
}

export const desmarcarResumen = (db, fecha) => db.prepare('DELETE FROM resumenes_enviados WHERE fecha = ?1').bind(fecha).run();
```

Al final de `server/reservas/correos.mjs`:

```js
export function correoResumenNoPagadas({ fecha, personas }) {
  const n = personas.length;
  const filas = personas.map((p) => {
    const wa = `https://wa.me/${String(p.whatsapp).replace(/\D/g, '')}`;
    return `<li style="margin-bottom:12px"><strong>${esc(p.nombre)}</strong> · <a href="${esc(wa)}">${esc(p.whatsapp)}</a><br>
      ${esc(p.titulo)} · ${esc(p.etiqueta)} · ${p.modalidad === 'video' ? 'Videollamada' : 'Presencial'} · ${esc(p.nutricionista)}</li>`;
  }).join('');
  return {
    subject: `Reservas web: ${n} ${n === 1 ? 'persona no completó' : 'personas no completaron'} el pago (${fecha})`,
    html: marco(`
      <h2 style="color:#9C7A2B">Dejaron sus datos y no pagaron</h2>
      <p>En las últimas 24 horas. Escríbeles por WhatsApp para ayudarles con su reserva; sus datos se borran a los 30 días.</p>
      <ul style="padding-left:18px">${filas}</ul>`),
  };
}
```

En `server/handlers/reservas.mjs`:
- En el comentario de rutas, agregar `// POST /api/reservas/resumen-diario  correo diario al equipo con quienes no pagaron (cron)`.
- Agregar `correoResumenNoPagadas` con `import { correoResumenNoPagadas } from '../reservas/correos.mjs';` y `fechaLima` ya está importado de `tiempo.mjs`.
- Al final del archivo:

```js
// Comparación de tokens en tiempo constante.
async function mismoToken(a, b) {
  const [x, y] = await Promise.all([a, b].map((s) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))));
  const u = new Uint8Array(x);
  const w = new Uint8Array(y);
  let dif = 0;
  for (let i = 0; i < u.length; i++) dif |= u[i] ^ w[i];
  return dif === 0;
}

export async function handleResumenDiario(request, env, deps) {
  if (request.method !== 'POST') return bad(405, 'Método no permitido');
  if (!env.RESUMEN_TOKEN) return bad(503, 'Resumen sin configurar');
  if (!(await mismoToken(request.headers.get('Authorization') || '', `Bearer ${env.RESUMEN_TOKEN}`))) return bad(401, 'No autorizado');
  const ahora = deps.ahora();
  const fecha = fechaLima(ahora);
  const filas = await repo.noPagadasEntre(deps.db, new Date(ahora.getTime() - 86400000).toISOString(), ahora.toISOString());
  const unicas = [...new Map(filas.map((f) => [f.email, f])).values()];
  if (!unicas.length) return json(200, { ok: true, enviados: 0 });
  if (!(await repo.marcarResumen(deps.db, fecha, ahora))) return json(200, { ok: true, enviados: 0, repetido: true });
  const personas = unicas.map((f) => ({
    nombre: f.nombre, whatsapp: f.whatsapp, titulo: cotizar(f.producto, f.duracion_meses)?.titulo ?? f.producto,
    etiqueta: etiquetaLima(f.inicio_utc), modalidad: f.modalidad,
    nutricionista: deps.nutricionistas.find((x) => x.id === f.nutricionista_id)?.nombre ?? 'el equipo',
  }));
  const enviado = await deps.sendEmail({
    from: env.NEWSLETTER_FROM || 'AJL Nutrición <hola@ajlnutricion.com>', to: env.NOTIFICATION_EMAIL,
    ...correoResumenNoPagadas({ fecha, personas }),
  });
  if (!enviado) {
    await repo.desmarcarResumen(deps.db, fecha);
    return bad(503, 'No se pudo enviar el resumen');
  }
  return json(200, { ok: true, enviados: personas.length });
}
```

`functions/api/reservas/resumen-diario.js`:

```js
import { handleResumenDiario } from '../../../server/handlers/reservas.mjs';
import { makeReservasDeps } from '../../../server/reservas/deps.mjs';

export const onRequest = (ctx) => handleResumenDiario(ctx.request, ctx.env, makeReservasDeps(ctx.env, ctx));
```

- [ ] **Step 4: Correr y ver que pasan**

Run: `npm test 2>&1 | grep -E "^# (pass|fail)|not ok" | head`
Expected: `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add server/reservas/repo.mjs server/reservas/repo.test.mjs server/reservas/correos.mjs server/reservas/correos.test.mjs server/handlers/reservas.mjs server/handlers/reservas.test.mjs functions/api/reservas/resumen-diario.js
git commit -m "reservas: resumen diario al equipo con quienes no completaron el pago"
```

---

### Task 6: Worker con cron que dispara el resumen

**Files:**
- Create: `workers/resumen-cron/index.js`, `workers/resumen-cron/wrangler.toml`
- Test: `server/handlers/resumen-cron.test.mjs` (nuevo)

**Interfaces:**
- Consumes: `POST /api/reservas/resumen-diario` (Task 5).
- Produces: `dispararResumen(env, fetchImpl) → Promise<number>`; Worker `ajl-resumen-cron` con cron `0 13 * * *`.

- [ ] **Step 1: Escribir la prueba que falla**

`server/handlers/resumen-cron.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dispararResumen } from '../../workers/resumen-cron/index.js';

test('el cron hace POST con el token y falla si la web responde error', async () => {
  let pedido;
  const ok = async (url, init) => { pedido = { url, init }; return new Response('{}', { status: 200 }); };
  const env = { RESUMEN_URL: 'https://www.ajlnutricion.com/api/reservas/resumen-diario', RESUMEN_TOKEN: 'tok' };
  assert.equal(await dispararResumen(env, ok), 200);
  assert.equal(pedido.init.method, 'POST');
  assert.equal(pedido.init.headers.Authorization, 'Bearer tok');
  await assert.rejects(dispararResumen(env, async () => new Response('', { status: 503 })), /503/);
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npm test 2>&1 | grep -E "^# (pass|fail)|not ok" | head`
Expected: FAIL: no existe `workers/resumen-cron/index.js`.

- [ ] **Step 3: Implementar**

`workers/resumen-cron/index.js`:

```js
// Cron diario (8:00 en Lima): pide a la web que mande al equipo el resumen de
// quienes dejaron sus datos y no pagaron. La lógica vive en la web; este
// Worker solo la dispara con el token compartido.
export async function dispararResumen(env, fetchImpl = fetch) {
  const r = await fetchImpl(env.RESUMEN_URL, { method: 'POST', headers: { Authorization: `Bearer ${env.RESUMEN_TOKEN}` } });
  if (!r.ok) throw new Error(`resumen-diario respondió ${r.status}`);
  return r.status;
}

export default {
  scheduled(_evento, env, ctx) {
    ctx.waitUntil(dispararResumen(env));
  },
};
```

`workers/resumen-cron/wrangler.toml`:

```toml
# Worker aparte: Cloudflare Pages no corre tareas programadas.
# Despliegue: npx wrangler deploy --config workers/resumen-cron/wrangler.toml
# Secreto: npx wrangler secret put RESUMEN_TOKEN --config workers/resumen-cron/wrangler.toml
name = "ajl-resumen-cron"
main = "index.js"
compatibility_date = "2026-10-01"

[triggers]
crons = ["0 13 * * *"] # 13:00 UTC = 8:00 en Lima

[vars]
RESUMEN_URL = "https://www.ajlnutricion.com/api/reservas/resumen-diario"
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npm test 2>&1 | grep -E "^# (pass|fail)|not ok" | head`
Expected: `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add workers/resumen-cron server/handlers/resumen-cron.test.mjs
git commit -m "reservas: worker con cron diario para el resumen de no pagados"
```

---

### Task 7: Pantallas 1 y 2 (opción B) y paleta de la reserva

**Files:**
- Modify: `src/pages/reservar/index.astro` (frontmatter `catalogo`, secciones `p1` y `p2`)
- Modify: `src/scripts/reservar.js` (`elegirProducto`, helpers nuevos, `soles`)
- Modify: `src/styles/reservar.css` (archivo completo)

**Interfaces:**
- Consumes: `duracionesDe`, `formatoSoles` (Task 1); `plans[id].consultasMes`, `firstMonthEval`, `sessionsPerMonth`, `highlight`.
- Produces: JSON `#catalogo` con `{ [id]: { nombre, mensual, duraciones?, consultas?, regalo? , precio? } }`; botones con `data-duracion="1|3|6"`.

- [ ] **Step 1: Frontmatter y pantalla 1**

En `index.astro`, reemplazar la construcción de `catalogo` por:

```js
import { duracionesDe } from '../../data/duraciones.js';

const catalogo = {};
for (const p of monthlyPlans) {
  catalogo[p.id] = { nombre: p.name, mensual: true, duraciones: duracionesDe(p.id), consultas: p.consultasMes, regalo: !!p.firstMonthEval };
}
catalogo.basico = { nombre: plans.basico.name, mensual: false, precio: plans.basico.price };
catalogo.evaluacion = { nombre: plans.evaluacion.name, mensual: false, precio: plans.evaluacion.price };
```

Reemplazar la sección `p1` completa por:

```astro
    <section class="rs-paso" data-paso="p1" hidden>
      <div class="rs-progreso"><span>Paso 1 de 4</span></div>
      <h1>¿Cómo quieres que te acompañemos?</h1>
      <p class="rs-lead">Elige cada cuánto te vemos. Entre sesión y sesión, nunca te quedas solo.</p>
      <div class="rs-bloque">
        <p class="rs-k">Planes con seguimiento continuo</p>
        <div class="rs-incluye">
          <b>Todos incluyen tu seguimiento entre sesiones</b>
          <ul>
            <li><b>Tu plan en la app</b><span>Ajustado a tu día a día, con opciones para comer fuera.</span></li>
            <li><b>Equipo por WhatsApp</b><span>Nutricionistas que te responden entre sesiones.</span></li>
            <li><b>2 clases en vivo por semana</b><span>Miércoles con el equipo, domingos con Alejandro.</span></li>
          </ul>
        </div>
        <div class="rs-planes">
          {monthlyPlans.map((p) => (
            <article class:list={['rs-plan', { 'rs-plan--star': p.highlight }]}>
              <header><b>{p.name}</b>{p.highlight && <span class="rs-badge">Recomendado</span>}</header>
              <ul class="rs-lista">
                <li>{p.sessionsPerMonth === 1 ? '1 sesión' : `${p.sessionsPerMonth} sesiones`} al mes con tu nutricionista</li>
                <li>Tu plan ajustado a tu día a día</li>
                <li>Tu seguimiento entre sesiones</li>
              </ul>
              {p.firstMonthEval && <p class="rs-regalo">De regalo: evaluación de cierre del primer mes</p>}
              <button type="button" class:list={['rs-btn', { 'rs-btn--ghost': !p.highlight }]} data-producto={p.id}>Elegir y ver precios</button>
            </article>
          ))}
        </div>
      </div>
      <p class="rs-k">Sin seguimiento continuo</p>
      <div class="rs-sueltas">
        <button type="button" class="rs-suelta" data-producto="basico"><span><b>Una sola sesión</b><small>Tu sesión y tu plan, sin seguimiento</small></span><span class="rs-ir">Elegir ›</span></button>
        <button type="button" class="rs-suelta" data-producto="evaluacion"><span><b>¿Prefieres que te evaluemos antes?</b><small>Se descuenta si eliges un plan ese día</small></span><span class="rs-ir">Elegir ›</span></button>
      </div>
    </section>
```

- [ ] **Step 2: Pantalla 2**

Reemplazar la sección `p2` completa por:

```astro
    <section class="rs-paso" data-paso="p2" hidden>
      <button type="button" class="rs-volver" data-volver="p1">‹ Cambiar acompañamiento</button>
      <div class="rs-progreso"><span>Paso 2 de 4</span></div>
      <h1>¿Por cuánto tiempo?</h1>
      <p class="rs-lead" id="p2-plan"></p>
      <div class="rs-duraciones" id="p2-opciones"></div>
      <div class="rs-consultas" id="p2-consultas"></div>
      <p class="rs-nota">Tu plazo empieza cuando recibes tu plan, no cuando pagas. No necesitas agendar todo ahora: eliges la primera cita y las demás las coordinas con tu nutricionista. Pagas con tarjeta o con Yape, sin recargo. Con tarjeta de crédito puedes pagar en hasta 12 cuotas; si hay intereses, los cobra tu banco.</p>
    </section>
```

En `reservar.js`:
- Agregar `import { formatoSoles } from '../data/duraciones.js';` y reemplazar `const soles = …` por `const soles = (c) => formatoSoles(Math.round(c / 100));`.
- Agregar tras `const params = …`:

```js
const h = (tag, cls, texto) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (texto != null) e.textContent = texto;
  return e;
};

function tarjetaDuracion(o, precioMes) {
  const b = h('button', o.meses === 3 ? 'rs-dur rs-dur--star' : 'rs-dur');
  b.type = 'button';
  b.dataset.duracion = String(o.meses);
  if (o.meses === 3) b.append(h('span', 'rs-badge', 'Recomendado'));
  b.append(h('b', 'rs-dur-t', o.meses === 1 ? 'Mes a mes' : `${o.meses} meses`));
  const precio = h('span', 'rs-dur-p');
  if (o.ahorro) precio.append(h('s', null, formatoSoles(precioMes)));
  precio.append(h('strong', null, formatoSoles(o.porMes)), h('small', null, 'al mes'));
  b.append(precio);
  if (o.meses === 1) {
    b.append(h('span', 'rs-dur-d', 'Pagas cada mes, sin compromiso'));
  } else {
    b.append(h('span', 'rs-dur-d', `${formatoSoles(o.total)} en total · puedes pagarlo en cuotas`));
    b.append(h('span', 'rs-dur-d', `Si viajas, puedes congelarlo ${o.congelarSemanas} ${o.congelarSemanas === 1 ? 'semana' : 'semanas'}`));
    b.append(h('span', 'rs-ahorro', `Ahorras ${formatoSoles(o.ahorro)} (${o.ahorroPct}%)`));
  }
  b.append(h('span', 'rs-btn rs-dur-cta', 'Elegir'));
  return b;
}
```

- Reemplazar el bloque `if (plan.mensual) { … irA('p2'); }` de `elegirProducto` por:

```js
  if (plan.mensual) {
    $('#p2-plan').textContent = `${plan.nombre}, con tu plan y tu seguimiento entre sesiones.`;
    const precioMes = plan.duraciones[0].porMes;
    $('#p2-opciones').replaceChildren(...plan.duraciones.map((o) => tarjetaDuracion(o, precioMes)));
    const caja = $('#p2-consultas');
    caja.replaceChildren(h('b', null, 'Así son tus consultas cada mes'), ...plan.consultas.map((t) => h('span', null, t)));
    if (plan.regalo) caja.append(h('span', 'rs-regalo', 'De regalo: evaluación de cierre del primer mes'));
    irA('p2');
  }
```

- [ ] **Step 3: Estilos**

Reemplazar `src/styles/reservar.css` completo por:

```css
/* Flujo de reserva. Paleta blanco, negro y oro de la tabla de planes de la web
   (src/components/Plans.astro), con Montserrat. */
.rs {
  --ink: #111111; --muted: #6B6B6B; --hair: #E4E4E4; --paper: #FFFFFF;
  --gold: #C9A24B; --gold-ink: #9C7A2B; --gold-pale: #F8F3E6;
  font-family: "Montserrat", "Helvetica Neue", Arial, sans-serif; color: var(--ink); background: var(--paper);
  max-width: 1040px; margin: 0 auto; padding: 24px 16px 64px;
}
.rs * { box-sizing: border-box; }
.rs-paso[hidden] { display: none; }
.rs-paso[data-paso="p3"], .rs-paso[data-paso="p4"] { max-width: 560px; margin: 0 auto; }
.rs-progreso { font-size: .8rem; color: var(--muted); margin-bottom: 8px; display: flex; justify-content: space-between; }
.rs h1 { font-family: inherit; font-weight: 800; letter-spacing: -.03em; color: var(--ink); font-size: clamp(1.5rem, 4.5vw, 2.2rem); line-height: 1.12; margin: 0 0 8px; }
.rs-lead { color: var(--muted); margin: 0 0 20px; line-height: 1.5; }
.rs-k { font-size: 11px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: var(--gold-ink); margin: 24px 0 10px; }
.rs-badge { display: inline-block; font-size: .72rem; font-weight: 700; color: #fff; background: var(--gold-ink); border-radius: 999px; padding: 3px 10px; }
.rs-nota { font-size: .85rem; color: var(--muted); line-height: 1.5; margin: 12px 0; }
.rs-btn { display: block; width: 100%; text-align: center; background: var(--gold-ink); color: #fff; border: 1.5px solid var(--gold-ink); border-radius: 10px; padding: 14px; font: inherit; font-weight: 700; cursor: pointer; margin-top: 16px; text-decoration: none; }
.rs-btn--ghost { background: var(--paper); color: var(--ink); border-color: var(--ink); }
.rs-btn:disabled { opacity: .6; cursor: wait; }
.rs-btn:focus-visible, .rs button:focus-visible { outline: 3px solid var(--gold); outline-offset: 2px; }
.rs-volver { background: none; border: 0; color: var(--gold-ink); font: inherit; font-weight: 600; cursor: pointer; padding: 0; margin-bottom: 12px; }
.rs-error { color: #b00020; font-size: .9rem; min-height: 1.2em; margin-top: 8px; }

/* Pantalla 1 */
.rs-bloque { background: var(--gold-pale); border-radius: 14px; padding: 4px 16px 16px; }
.rs-bloque > .rs-k { margin-top: 14px; }
.rs-incluye { background: var(--paper); border-radius: 12px; padding: 14px 16px; margin-bottom: 14px; }
.rs-incluye ul { list-style: none; margin: 10px 0 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
.rs-incluye li b { display: block; font-size: .9rem; }
.rs-incluye li span { font-size: .82rem; color: var(--muted); }
.rs-planes { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
.rs-plan { background: var(--paper); border: 1px solid var(--hair); border-radius: 12px; padding: 18px; display: flex; flex-direction: column; gap: 10px; }
.rs-plan--star { border: 1.5px solid var(--gold); }
.rs-plan header { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 1.05rem; }
.rs-lista { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; font-size: .88rem; }
.rs-lista li::before { content: "✓"; color: var(--gold-ink); font-weight: 700; margin-right: 8px; }
.rs-regalo { background: var(--gold-pale); color: var(--gold-ink); font-weight: 700; font-size: .85rem; border-radius: 8px; padding: 8px 10px; margin: 0; }
.rs-plan .rs-btn { margin-top: auto; }
.rs-sueltas { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.rs-suelta { display: flex; justify-content: space-between; align-items: center; gap: 12px; text-align: left; background: var(--paper); border: 1px solid var(--hair); border-radius: 12px; padding: 14px 16px; font: inherit; color: var(--ink); cursor: pointer; }
.rs-suelta b { display: block; }
.rs-suelta small { color: var(--muted); }
.rs-ir { color: var(--gold-ink); font-weight: 700; white-space: nowrap; }

/* Pantalla 2 · opción B */
.rs-duraciones { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
.rs-dur { display: flex; flex-direction: column; gap: 8px; text-align: left; background: var(--paper); border: 1px solid var(--hair); border-radius: 14px; padding: 20px; font: inherit; color: var(--ink); cursor: pointer; }
.rs-dur--star { border: 1.5px solid var(--gold); box-shadow: 0 12px 32px rgba(17, 17, 17, .08); }
.rs-dur .rs-badge { align-self: flex-start; }
.rs-dur-t { font-size: 1.15rem; }
.rs-dur-p { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.rs-dur-p s { color: #8A8A8A; }
.rs-dur-p strong { font-size: 2rem; font-weight: 800; letter-spacing: -.02em; }
.rs-dur-p small, .rs-dur-d { color: var(--muted); font-size: .85rem; }
.rs-ahorro { align-self: flex-start; font-size: .82rem; font-weight: 700; color: var(--gold-ink); background: var(--gold-pale); border-radius: 8px; padding: 4px 9px; }
.rs-dur-cta { margin-top: auto; }
.rs-dur:not(.rs-dur--star) .rs-dur-cta { background: var(--paper); color: var(--ink); border-color: var(--ink); }
.rs-consultas { display: flex; flex-direction: column; gap: 6px; border: 1px solid var(--hair); border-radius: 12px; padding: 14px 16px; margin-top: 16px; font-size: .9rem; max-width: 640px; }
.rs-consultas .rs-regalo { background: none; padding: 0; }

/* Pantalla 3 (selector de horas) */
.sel-modalidad, .sel-nutris { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
.sel-modalidad button, .sel-nutris button, .sel-dias button { border: 1px solid var(--hair); background: var(--paper); border-radius: 999px; padding: 8px 14px; font: inherit; font-size: .88rem; cursor: pointer; color: var(--ink); }
.sel-modalidad button[aria-pressed=true], .sel-nutris button[aria-pressed=true], .sel-dias button[aria-pressed=true] { background: var(--ink); color: #fff; border-color: var(--ink); }
.sel-semana { display: flex; align-items: center; gap: 6px; margin-bottom: 12px; }
.sel-dias { display: flex; gap: 6px; overflow-x: auto; flex: 1; padding-bottom: 4px; }
.sel-dias button:disabled { opacity: .35; cursor: default; }
.sel-prev, .sel-next { border: 0; background: none; font-size: 1.4rem; cursor: pointer; color: var(--ink); }
.sel-prev:disabled, .sel-next:disabled { opacity: .3; cursor: default; }
.sel-horas { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 8px; }
.sel-hora { border: 1px solid var(--hair); background: var(--paper); border-radius: 10px; padding: 10px; font: inherit; cursor: pointer; text-align: center; color: var(--ink); }
.sel-hora:hover { border-color: var(--gold); }
.sel-hora small { display: block; color: var(--muted); font-size: .75rem; }
.sel-msg { grid-column: 1 / -1; color: var(--muted); }

/* Pantalla 4 */
.rs-resumen { background: var(--gold-pale); border-radius: 12px; padding: 12px 14px; margin-bottom: 16px; font-size: .92rem; }
.rs-reloj { font-weight: 700; color: var(--ink); }
.rs label { display: block; font-size: .85rem; font-weight: 600; margin: 12px 0 4px; }
.rs label small { font-weight: 400; color: var(--muted); }
.rs input[type=text], .rs input[type=email], .rs input[type=tel], .rs input[type=date], .rs select { width: 100%; border: 1px solid #CFCFCF; border-radius: 10px; padding: 12px; font: inherit; background: var(--paper); color: var(--ink); }
.rs-dos { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.rs-tel, .rs-doc { display: flex; gap: 8px; }
.rs-tel select { width: auto; max-width: 45%; }
.rs-doc select { width: auto; max-width: 50%; }
.rs .rs-check { display: flex; gap: 8px; align-items: flex-start; font-weight: 400; }
.rs .rs-check input { margin-top: 3px; accent-color: var(--gold-ink); }
.rs-link { border: 0; background: none; padding: 0; font: inherit; color: var(--gold-ink); text-decoration: underline; cursor: pointer; }
.rs-cuotas { text-align: center; font-size: .88rem; font-weight: 600; color: var(--gold-ink); margin: 10px 0 0; }
.rs-aviso { background: #FFF7E6; border-radius: 10px; padding: 10px 12px; font-size: .85rem; margin-top: 12px; }

/* Ventanas de condiciones y privacidad */
.rs-modal { width: min(640px, calc(100vw - 32px)); max-height: calc(100vh - 48px); border: 0; border-radius: 16px; padding: 0; color: var(--ink); font-family: "Montserrat", "Helvetica Neue", Arial, sans-serif; }
.rs-modal::backdrop { background: rgba(17, 17, 17, .5); }
.rs-modal-cab { display: flex; justify-content: space-between; align-items: center; padding: 18px 22px; border-bottom: 1px solid var(--hair); }
.rs-modal-cab h2 { margin: 0; font-size: 1.2rem; font-weight: 800; }
.rs-cerrar { width: 40px; height: 40px; border-radius: 50%; border: 0; background: #F2F2F2; font-size: 1.3rem; cursor: pointer; }
.rs-modal-cuerpo { padding: 18px 22px; display: flex; flex-direction: column; gap: 14px; overflow-y: auto; }
.rs-modal-cuerpo p { margin: 4px 0 0; font-size: .9rem; line-height: 1.5; color: #3A3A3A; }
.rs-modal > .rs-btn { width: calc(100% - 44px); margin: 0 22px 18px; }

/* Celular: tarjetas apiladas; en la pantalla 2, 3 meses primero */
@media (max-width: 760px) {
  .rs-planes, .rs-duraciones, .rs-sueltas { grid-template-columns: minmax(0, 1fr); }
  .rs-dur--star { order: -1; }
  .rs-dos { grid-template-columns: minmax(0, 1fr); gap: 0; }
}
```

- [ ] **Step 4: Construir y probar en el navegador**

Run: `npm run build 2>&1 | tail -3`
Expected: sin errores.

Run: `npx astro preview --port 4321` en segundo plano; abrir `http://localhost:4321/reservar/`.
Expected: pantalla 1 sin precios y con las 3 tarjetas; al elegir «2 sesiones al mes», pantalla 2 con Mes a mes S/440, 3 meses (S/440 tachado, S/360, «S/1.080 en total», «Ahorras S/240 (18%)») y 6 meses (S/325, «S/1.950 en total», «Ahorras S/690 (26%)», «congelarlo 2 semanas»); a 360 px las tarjetas apiladas con 3 meses primero. Las llamadas a `/api` fallan en `astro preview` (no hay Functions): basta con revisar las pantallas 1 y 2.

- [ ] **Step 5: Commit**

```bash
git add src/pages/reservar/index.astro src/scripts/reservar.js src/styles/reservar.css
git commit -m "reservar: pantallas 1 y 2 del rediseño (opción B) con la paleta de la web"
```

---

### Task 8: Pantalla 4 con datos completos y ventanas de condiciones y privacidad

**Files:**
- Modify: `src/data/condiciones.js` (resúmenes nuevos)
- Modify: `src/pages/reservar/index.astro` (sección `p4` y ventanas)
- Modify: `src/scripts/reservar.js` (`abrirP4`, `pagar`, eventos de las ventanas)

**Interfaces:**
- Consumes: `validarDatos`, `hoyEnLima` (Task 4) y el cuerpo de `POST /api/reservas/pagar` de Task 4.
- Produces: `RESUMEN_CONDICIONES`, `RESUMEN_PRIVACIDAD` (arrays de `{ t, d }`).

- [ ] **Step 1: Resúmenes en `src/data/condiciones.js`**

Agregar al final:

```js
// Resumen en 5 puntos que se abre en una ventana desde el paso 4. Tiene que
// decir lo mismo que /condiciones/ y /privacidad/.
export const RESUMEN_CONDICIONES = [
  { t: 'Precio y pago', d: 'Los precios están en soles y no tienen recargo por tarjeta. Pagas en Mercado Pago con tarjeta, Yape o dinero en tu cuenta. Con tarjeta de crédito puedes pagar en cuotas; si hay intereses, los cobra tu banco.' },
  { t: 'Tus citas', d: 'Al comprar eliges tu primera sesión. Las siguientes las coordinas con tu nutricionista dentro del plazo de tu plan.' },
  { t: 'Plazo', d: 'El paquete de 3 meses se usa en 3 meses y el de 6 meses en 6, desde que recibes tu plan. Puedes congelarlo 1 semana en el de 3 meses y 2 semanas en el de 6.' },
  { t: 'Mover o cancelar', d: 'Mover una cita es gratis hasta 48 horas antes. Con menos de 48 horas cuesta S/80. Si no vienes, la sesión se pierde.' },
  { t: 'Si no podemos atenderte', d: 'Si AJL no puede darte el servicio, te devolvemos lo que no usaste.' },
];

export const RESUMEN_PRIVACIDAD = [
  { t: 'Qué datos pedimos', d: 'Nombres, apellidos, WhatsApp, correo, fecha de nacimiento y documento de identidad.' },
  { t: 'Para qué', d: 'Para gestionar tu reserva y tu pago, enviarte la confirmación, emitir tu comprobante y preparar tu primera sesión.' },
  { t: 'Si no completas tu pago', d: 'Podemos escribirte por WhatsApp para ayudarte con tu reserva. Si no pagas, borramos tus datos de contacto a los 30 días.' },
  { t: 'Con quién se comparten', d: 'Mercado Pago procesa el pago y Google Calendar guarda tu cita. Tus datos de tarjeta no pasan por nosotros.' },
  { t: 'Tus derechos', d: 'Puedes pedir acceder, corregir o eliminar tus datos escribiendo a reclamos@ajlnutricion.com.' },
];
```

- [ ] **Step 2: Formulario y ventanas en `index.astro`**

Cambiar el import a `import { NOVEDADES_TEXTO, RESUMEN_CONDICIONES, RESUMEN_PRIVACIDAD } from '../../data/condiciones.js';` y agregar en el frontmatter:

```js
const VENTANAS = [
  ['condiciones', 'Condiciones del servicio', RESUMEN_CONDICIONES, '/condiciones/'],
  ['privacidad', 'Política de privacidad', RESUMEN_PRIVACIDAD, '/privacidad/'],
];
```

En la sección `p4`, reemplazar el `<form id="p4-form" …>…</form>` completo por:

```astro
      <form id="p4-form" novalidate>
        <label for="f-nombres">Nombres</label>
        <input type="text" id="f-nombres" autocomplete="given-name" maxlength="60" required>
        <div class="rs-dos">
          <div><label for="f-paterno">Apellido paterno</label><input type="text" id="f-paterno" autocomplete="family-name" maxlength="60" required></div>
          <div><label for="f-materno">Apellido materno <small>(si tienes)</small></label><input type="text" id="f-materno" maxlength="60"></div>
        </div>
        <label for="f-whatsapp">WhatsApp · aquí te escribimos si hace falta</label>
        <div class="rs-tel">
          <select id="f-pais" aria-label="Código de país">
            {PAISES.map(([bandera, nombre, codigo]) => <option value={codigo}>{bandera} {nombre} +{codigo}</option>)}
          </select>
          <input type="tel" id="f-whatsapp" autocomplete="tel-national" inputmode="tel" placeholder="9__ ___ ___" required>
        </div>
        <label for="f-email">Correo · aquí llega tu invitación</label>
        <input type="email" id="f-email" autocomplete="email" required>
        <div class="rs-dos">
          <div><label for="f-nacimiento">Fecha de nacimiento</label><input type="date" id="f-nacimiento" autocomplete="bday" min="1920-01-01" required></div>
          <div>
            <label for="f-doc">Documento · para tu comprobante</label>
            <div class="rs-doc">
              <select id="f-tipo-doc" aria-label="Tipo de documento">
                <option value="dni">DNI</option><option value="ce">Carné de Extranjería</option><option value="pasaporte">Pasaporte</option>
              </select>
              <input type="text" id="f-doc" inputmode="numeric" maxlength="12" required>
            </div>
          </div>
        </div>
        <label class="rs-check"><input type="checkbox" id="f-acepto" required> <span>Acepto las <button type="button" class="rs-link" data-ventana="condiciones">condiciones del servicio</button> y he leído la <button type="button" class="rs-link" data-ventana="privacidad">política de privacidad</button>.</span></label>
        <label class="rs-check"><input type="checkbox" id="f-novedades"> <span>{NOVEDADES_TEXTO.replace(/ \(v[\d-]+\)$/, '')} (opcional)</span></label>
        <p class="rs-nota">Mover tu cita es gratis hasta 48 h antes; después cuesta S/80.</p>
        <p class="rs-aviso" id="p4-yape" hidden>¿Pagarás con Yape? Revisa tu límite en la app: este monto puede superarlo. Con tarjeta no hay límite.</p>
        <button type="submit" class="rs-btn" id="p4-pagar">Pagar</button>
        <p class="rs-cuotas">Con tarjeta de crédito, en hasta 12 cuotas</p>
        <p class="rs-error" id="p4-error" role="alert"></p>
      </form>
```

Justo antes de `</main>`, agregar:

```astro
    {VENTANAS.map(([id, titulo, puntos, ruta]) => (
      <dialog class="rs-modal" id={`ventana-${id}`} aria-labelledby={`ventana-${id}-t`}>
        <div class="rs-modal-cab">
          <h2 id={`ventana-${id}-t`}>{titulo}</h2>
          <button type="button" class="rs-cerrar" data-cerrar aria-label="Cerrar">×</button>
        </div>
        <div class="rs-modal-cuerpo">
          {puntos.map((p) => <div><b>{p.t}</b><p>{p.d}</p></div>)}
          <p>Versión completa: <a href={ruta} target="_blank" rel="noopener">ajlnutricion.com{ruta}</a></p>
        </div>
        <button type="button" class="rs-btn" data-cerrar>Entendido, volver a mis datos</button>
      </dialog>
    ))}
```

- [ ] **Step 3: `reservar.js`**

- Agregar `import { validarDatos, hoyEnLima } from '../data/validar-datos.js';`.
- En `abrirP4`, borrar las dos líneas `$('#p4-dni').hidden = …` y `$('#f-dni').required = …`.
- Agregar, junto al listener de `#f-pais`:

```js
$('#f-tipo-doc').addEventListener('change', () => {
  const dni = $('#f-tipo-doc').value === 'dni';
  $('#f-doc').inputMode = dni ? 'numeric' : 'text';
  $('#f-doc').maxLength = dni ? 8 : 12;
});
```

- En `pagar`, reemplazar el `body: JSON.stringify({ … })` por una validación previa y el cuerpo nuevo. Justo después de `$('#p4-error').textContent = '';`:

```js
  const datos = {
    token: estado.reserva.token, nombres: $('#f-nombres').value, apellido_paterno: $('#f-paterno').value,
    apellido_materno: $('#f-materno').value, whatsapp: telefonoCompleto(), email: $('#f-email').value,
    fecha_nacimiento: $('#f-nacimiento').value, tipo_documento: $('#f-tipo-doc').value, documento: $('#f-doc').value,
    acepto: $('#f-acepto').checked, novedades: $('#f-novedades').checked,
  };
  const previa = validarDatos(datos, hoyEnLima(new Date()));
  if (!previa.ok) { $('#p4-error').textContent = previa.error; boton.disabled = false; return; }
```

y en el `fetch`, `body: JSON.stringify(datos),`.

- En el listener de `click` del documento, antes de `const b = e.target.closest(…)`:

```js
  const abrir = e.target.closest('[data-ventana]');
  if (abrir) { e.preventDefault(); document.getElementById(`ventana-${abrir.dataset.ventana}`).showModal(); return; }
  const cerrar = e.target.closest('[data-cerrar]');
  if (cerrar) { cerrar.closest('dialog').close(); return; }
```

- [ ] **Step 4: Construir, probar y revisar**

Run: `npm run build 2>&1 | tail -3 && npm test 2>&1 | grep -E "^# (pass|fail)"`
Expected: build sin errores; `# fail 0`.

Run: `npx astro preview --port 4321` en segundo plano y abrir `http://localhost:4321/reservar/?plan=constancia`, forzar `p4` desde la consola con `document.querySelectorAll('.rs-paso').forEach(s => s.hidden = s.dataset.paso !== 'p4')`.
Expected: campos en el orden del spec; «condiciones del servicio» abre la ventana sin marcar la casilla y sin perder lo escrito; Esc y «Entendido» la cierran; «Pagar» con DNI de 7 dígitos muestra «Escribe tu DNI (8 dígitos).» sin llamar al servidor.

- [ ] **Step 5: Commit**

```bash
git add src/data/condiciones.js src/pages/reservar/index.astro src/scripts/reservar.js
git commit -m "reservar: paso 4 con datos completos y ventanas de condiciones y privacidad"
```

---

### Task 9: Condiciones y política de privacidad

**Files:**
- Modify: `src/pages/condiciones.astro`
- Modify: `src/data/condiciones.js` (`CONDICIONES_VERSION`)
- Modify: `public/privacidad/index.html` (fecha y versión, 2.6, tabla de finalidades)

- [ ] **Step 1: Condiciones**

En `src/pages/condiciones.astro`, reemplazar el párrafo que empieza «En el paquete de 3 meses, el plazo empieza…» por:

```html
      <p>En los paquetes de 3 y 6 meses, el plazo empieza cuando recibes tu plan: el de 3 meses lo usas en 3 meses y puedes congelarlo 1 semana; el de 6 meses lo usas en 6 meses y puedes congelarlo 2 semanas, por ejemplo si viajas. Las sesiones que no agendes dentro del plazo no se acumulan.</p>
```

En `src/data/condiciones.js`: `export const CONDICIONES_VERSION = '2026-10-09';`.

- [ ] **Step 2: Política de privacidad**

En `public/privacidad/index.html`:
- Cambiar `Última actualización: <strong>1 de octubre de 2026</strong> · Versión 1.4` por `Última actualización: <strong>9 de octubre de 2026</strong> · Versión 1.5`.
- En 2.6, reemplazar la primera oración «Para reservar tu primera sesión desde la web recolectamos tu <strong>nombre</strong>, tu <strong>WhatsApp</strong>, tu <strong>correo</strong> y, si el total supera S/700, tu <strong>DNI</strong> para el comprobante.» por:

```html
Para reservar tu primera sesión desde la web recolectamos tus <strong>nombres y apellidos</strong>, tu <strong>WhatsApp</strong>, tu <strong>correo</strong>, tu <strong>fecha de nacimiento</strong> (para preparar tu primera sesión) y tu <strong>documento de identidad</strong> (DNI, Carné de Extranjería o pasaporte) para el comprobante.
```

- En 2.6, reemplazar la última oración «Si no completas el pago, borramos tus datos de contacto a los 30 días.» por:

```html
Si dejas tus datos y no completas el pago, el equipo recibe un resumen interno y puede escribirte por WhatsApp para ayudarte con tu reserva; si no pagas, borramos tus datos de contacto a los 30 días.
```

- En la tabla de finalidades, en la fila cuyo texto es «Gestionar tu reserva y tu pago, y enviarte la confirmación e invitación de tu sesión», cambiar ese texto por «Gestionar tu reserva y tu pago, enviarte la confirmación e invitación de tu sesión y, si no completaste el pago, escribirte para ayudarte con tu reserva».
- En la fila cuyo dato es «Nombre, DNI, monto», cambiar por «Nombre, documento de identidad, monto».

- [ ] **Step 3: Verificar coherencia**

Run: `grep -n "S/700\|Versión 1.5\|fecha de nacimiento\|documento de identidad" public/privacidad/index.html; grep -n "6 meses" src/pages/condiciones.astro; npm run build 2>&1 | tail -2`
Expected: ninguna línea con `S/700`; aparecen `Versión 1.5`, `fecha de nacimiento`, `documento de identidad` y `6 meses`; build sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/pages/condiciones.astro src/data/condiciones.js public/privacidad/index.html
git commit -m "legal: condiciones con 6 meses y privacidad v1.5 con los datos nuevos de la reserva"
```

---

### Task 10: Versión de prueba de punta a punta

Requiere a Joaquín para el pago con el comprador de prueba. Nada de esto toca producción.

**Files:**
- Create (no versionado): `.env.resumen` con `RESUMEN_TOKEN=<valor>` (cubierto por `.env.*` en `.gitignore`)

- [ ] **Step 1: Migración en la base de prueba**

Run: `npx wrangler d1 execute ajl-reservas-preview --remote --env preview --file db/d1/0002_cliente_detalle.sql`
Expected: «Executed … commands» sin error.

Run: `npx wrangler d1 execute ajl-reservas-preview --remote --env preview --command "PRAGMA table_info(clientes)" | grep -c "tipo_documento\|fecha_nacimiento"`
Expected: `2`.

- [ ] **Step 2: Secreto del resumen en preview**

Run:

```bash
[ -f .env.resumen ] || echo "RESUMEN_TOKEN=$(openssl rand -hex 32)" > .env.resumen
git check-ignore .env.resumen
cut -d= -f2 .env.resumen | npx wrangler pages secret put RESUMEN_TOKEN --project-name ajl-landing --env preview
```

Expected: `git check-ignore` imprime `.env.resumen`; wrangler responde «Success».

- [ ] **Step 3: Pruebas, push y smoke**

Run: `npm test 2>&1 | grep -E "^# (pass|fail)" && npm run build 2>&1 | tail -1 && git push origin reservas-pago`
Expected: `# fail 0`, build OK, push aceptado. Esperar el despliegue de Pages de la rama.

Run: `npm run smoke -- https://reservas-pago.ajl-landing.pages.dev`
Expected: todas las comprobaciones OK.

- [ ] **Step 4: Pago de prueba con Joaquín**

En Chrome, en `https://reservas-pago.ajl-landing.pages.dev/reservar/`: «2 sesiones al mes» → 6 meses → una hora → datos con apellido materno vacío y Carné de Extranjería → Pagar. En Mercado Pago, entrar con el comprador de prueba (`TESTUSER7942961276187569905`) y pagar con tarjeta de crédito de prueba en 3 cuotas.
Expected: Mercado Pago ofrece cuotas; vuelve a «Listo»; en `ajl-reservas-preview` la reserva queda `confirmada` con monto `195000`; llegan los 3 correos; el evento aparece en el calendario real (borrarlo a mano después).

- [ ] **Step 5: Resumen a mano**

Hacer una segunda reserva hasta el paso 4, pulsar «Pagar» y cerrar Mercado Pago sin pagar. Esperar 31 minutos (vence el plazo de pago) y llamar:

```bash
curl -s -X POST -H "Authorization: Bearer $(cut -d= -f2 .env.resumen)" https://reservas-pago.ajl-landing.pages.dev/api/reservas/resumen-diario
```

Expected: `{"ok":true,"enviados":1}` y llega a `ajlnutricion@gmail.com` el correo con esa persona y su link de WhatsApp; repetir el `curl` da `"repetido":true`.

- [ ] **Step 6: Revisión visual**

En celular real (o 360 px en Chrome) y en computadora: pantallas 1, 2 y 4 con la paleta negra y dorada, sin desborde horizontal, 3 meses primero en celular, ventanas que se cierran con Esc y con «Entendido».

- [ ] **Step 7: Registrar**

Anotar en la bitácora de `~/ajl/memoria` el resultado de la prueba (IDs de reserva, correos recibidos, cualquier falla).

## Al lanzar a producción (fuera de este plan, con autorización de Joaquín)

1. `npx wrangler d1 execute ajl-reservas --remote --file db/d1/0002_cliente_detalle.sql`.
2. `cut -d= -f2 .env.resumen | npx wrangler pages secret put RESUMEN_TOKEN --project-name ajl-landing`.
3. Credenciales de producción de Mercado Pago, merge a `main`, pago real de S/80 y su devolución (Task 11 del plan anterior).
4. Desplegar el cron: `npx wrangler deploy --config workers/resumen-cron/wrangler.toml` y `cut -d= -f2 .env.resumen | npx wrangler secret put RESUMEN_TOKEN --config workers/resumen-cron/wrangler.toml`.
