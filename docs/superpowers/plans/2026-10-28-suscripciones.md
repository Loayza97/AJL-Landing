# Pagos con suscripción · plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el paciente pague un plan mensual o un paquete de 3 o 6 meses en cuotas mensuales automáticas de Mercado Pago, sin renovación, con un botón «Cancelar mi plan» que cobra la penalidad al darse de baja.

**Architecture:** Suscripción de Mercado Pago sin plan asociado (`POST /preapproval`, el paciente autoriza en `init_point`). Nuestra base (`suscripciones`, `suscripcion_cobros`) cuenta los cobros, confirma la cita con el primero y corta la suscripción con el último. Los avisos de Mercado Pago (`subscription_preapproval`, `subscription_authorized_payment`, `payment`) entran por el webhook que ya existe. La penalidad se cobra con una preferencia de Checkout Pro de pago único (`external_reference` = `pen-<id>`).

**Tech Stack:** Astro + Cloudflare Pages Functions (`functions/api` → `server/handlers`), D1 (SQLite), Mercado Pago REST, Resend, `node:test` con `d1DePrueba` (node:sqlite).

**Spec:** `docs/superpowers/specs/2026-10-27-suscripciones-design.md` · Diseño visual: https://claude.ai/artifact/CgmKB9PL2wXVqCN3C9osCy

## Global Constraints

- Todo se trabaja en la rama `reservas-pago` (worktree `~/ajl/ajl-landing-cloudflare`). Nada va a `main` ni a la base de producción sin autorización de Joaquín.
- El repo es público: ningún secreto en el código ni en `wrangler.toml`. Los secretos se cargan con `npx wrangler pages secret put`.
- Montos siempre en céntimos en la base y calculados en el servidor desde `src/data/plans.js` / `src/data/duraciones.js`. El navegador nunca manda un monto.
- Cuota = `porMes` de la duración. Penalidad al cancelar con N cobros pagados (1 ≤ N < duración): `(bloque × porMes del paquete de 3) + ((N − bloque) × porMes de mes a mes) − N × cuota`, con `bloque = 3` si el paquete es de 6 meses y N ≥ 3, si no `0`. Mes a mes: 0. Los precios de referencia se congelan al suscribirse (`precio_mes_centimos`, `precio_3m_centimos`).
- Sin renovación: el paquete termina con su cobro número `duracion_meses`. Mes a mes no termina solo.
- Darse de baja nunca depende de pagar: siempre existe «Cancelar sin pagar ahora».
- Freno: un DNI con `penalidad_estado = 'pendiente'` no puede pagar en `/reservar/` ni activar un link de suscripción hasta pagarla. Los links de agenda del equipo no se frenan.
- Webhooks: firma verificada con `firmaValida` como hoy; el estado siempre se vuelve a consultar en la API de Mercado Pago, nunca se confía en el cuerpo.
- Quien gana el `UPDATE` (`meta.changes === 1`) manda los correos; los demás caminos no mandan nada (webhook y página de regreso llegan a la vez).
- Texto de cara al paciente en español de Perú, sin rayas como inciso. Marca: «AJL Nutrición».
- Tests: `npm test` (todos verdes). Build: `npm run build`. Prueba de humo: `npm run smoke -- <url>`.
- Cambios visibles en `CHANGELOG.md` bajo «Pendiente de publicar».

## Rulings tomados al escribir el plan

- **Sin cron:** el aviso «entra a su último mes» se manda al aprobarse el último cobro, y el cobro fallido se detecta en el webhook del cobro. No hace falta tocar `workers/resumen-cron`. Costo si está mal: si Mercado Pago no avisa el fallo definitivo (Task 1 lo verifica), se agrega una tarea diaria.
- **Cobros 2 en adelante no aparecen en «Reservas»** (esa lista es de citas). Se ven en «Suscripciones». El primer cobro sí va a `pagos` de su reserva, así el neto de la columna P sigue funcionando.
- **El link de suscripción pide correo, DNI y WhatsApp** (el correo lo exige Mercado Pago, el DNI hace falta para el freno, el WhatsApp para el botón del panel).
- **Links de reserva web:** siguen abriendo el calendario con pago completo. `&forma=mensual` abre el calendario con pago mensual. En el panel, cada fila de plan mensual tiene un segundo botón «Copiar (mensual)».
- **Datos del paciente en la suscripción:** `nombre`, `email`, `dni`, `whatsapp` se copian a la fila de `suscripciones` (de la ficha en la web, del formulario en el link). Así el panel y el freno no dependen de `clientes`.

## Review Focus

1. El webhook del cobro y la página de regreso procesan el mismo primer cobro a la vez: la cita se confirma una sola vez y `cobros_aprobados` sube a 1, no a 2. (Test en Task 6.)
2. Un paciente cancela desde su cuenta de Mercado Pago mientras paga la penalidad con el botón: una sola baja, un solo juego de correos, la penalidad queda `pagada`. (Test en Task 7.)
3. Mercado Pago vuelve a mandar el aviso del último cobro: no se manda dos veces «terminó su plan» ni se intenta cancelar dos veces. (Test en Task 6.)
4. Una persona con penalidad pendiente usa otro tipo de documento con el mismo número (CE vs DNI): el freno compara el número normalizado. (Test en Task 7.)
5. El link de suscripción se abre después de vencer o después de usarse: responde 410 y no crea una segunda suscripción en Mercado Pago. (Test en Task 8.)

---

### Task 1: Prueba en el modo de prueba de Mercado Pago (manual, con Joaquín)

Responde los riesgos de la spec antes de depender de ellos. No se escribe código del producto.

**Files:**
- Create: `scripts/mp-suscripcion-prueba.mjs`
- Create: `docs/superpowers/notas/2026-10-28-mp-suscripciones-prueba.md`

**Interfaces:**
- Produces: los nombres reales de estados (`status` del preapproval y del authorized payment) que usan las Tasks 6 y 7. Si difieren de los de este plan, se corrigen las constantes `ESTADO_COBRO_FALLIDO` y `ESTADO_PREAPPROVAL` de `server/suscripciones/procesar.mjs`.

- [ ] **Step 1: Escribir el script**

```js
// Prueba manual de suscripciones de Mercado Pago (modo de prueba). No es parte del sitio.
// Uso: MP_ACCESS_TOKEN=TEST-... EMAIL=comprador_de_prueba@testuser.com node scripts/mp-suscripcion-prueba.mjs crear
//      MP_ACCESS_TOKEN=TEST-... node scripts/mp-suscripcion-prueba.mjs ver <preapproval_id>
//      MP_ACCESS_TOKEN=TEST-... node scripts/mp-suscripcion-prueba.mjs cobros <preapproval_id>
//      MP_ACCESS_TOKEN=TEST-... node scripts/mp-suscripcion-prueba.mjs cancelar <preapproval_id>
const API = 'https://api.mercadopago.com';
const auth = { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' };
const [accion, id] = process.argv.slice(2);
const mostrar = async (r) => console.log(r.status, JSON.stringify(await r.json(), null, 2));

if (accion === 'crear') {
  const fin = new Date(Date.now() + 75 * 86400000).toISOString();
  await mostrar(await fetch(`${API}/preapproval`, { method: 'POST', headers: auth, body: JSON.stringify({
    reason: 'AJL Nutrición · prueba de suscripción', external_reference: `prueba-${Date.now()}`,
    payer_email: process.env.EMAIL, back_url: 'https://reservas-pago.ajl-landing.pages.dev/reservar/listo/',
    status: 'pending', auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: 10, currency_id: 'PEN', end_date: fin },
  }) }));
} else if (accion === 'ver') {
  await mostrar(await fetch(`${API}/preapproval/${id}`, { headers: auth }));
} else if (accion === 'cobros') {
  await mostrar(await fetch(`${API}/authorized_payments/search?preapproval_id=${id}`, { headers: auth }));
} else if (accion === 'cancelar') {
  await mostrar(await fetch(`${API}/preapproval/${id}`, { method: 'PUT', headers: auth, body: JSON.stringify({ status: 'cancelled' }) }));
} else {
  console.log('Acción: crear | ver <id> | cobros <id> | cancelar <id>');
}
```

- [ ] **Step 2: Correr con Joaquín**

Joaquín pone el access token de prueba (cuenta vendedor de prueba) y el correo de un comprador de prueba; nunca se pegan en el chat. En orden:
1. `crear` → abrir `init_point` con el comprador de prueba y autorizar con tarjeta de prueba. Anotar cuánto tarda en aparecer el cobro con `cobros`.
2. Repetir `crear` y autorizar con Yape de prueba y con tarjeta de débito de prueba, si el modo de prueba lo permite.
3. `crear` con un `EMAIL` distinto al del comprador que paga: anotar si Mercado Pago lo rechaza.
4. `ver` y `cobros`: anotar los valores exactos de `status` del preapproval y de cada authorized payment, y si el pago (`payment.id`) trae `external_reference`.
5. `cancelar` → `ver`: confirmar `status: "cancelled"`.
6. Con una tarjeta de prueba que rechace (`OTHE`), anotar qué `status` toma el authorized payment mientras reintenta y al rendirse.
7. En el panel de Mercado Pago (Tus integraciones → Webhooks) activar los eventos «Planes y suscripciones» en modo de prueba y en producción, con la misma URL `/api/reservas/webhook-mp`, y anotar el `type` y el `data.id` de un aviso real.

- [ ] **Step 3: Escribir la nota con lo observado**

`docs/superpowers/notas/2026-10-28-mp-suscripciones-prueba.md`: una línea por punto del Step 2 con el resultado real. Si algún estado difiere de lo que asume este plan (`authorized`, `cancelled`, cobro `processed`/`approved`, fallo definitivo `cancelled`), anotar el valor real y la constante que hay que cambiar.

- [ ] **Step 4: Commit**

```bash
git add scripts/mp-suscripcion-prueba.mjs docs/superpowers/notas/2026-10-28-mp-suscripciones-prueba.md
git commit -m "Suscripciones: prueba en el modo de prueba de Mercado Pago"
```

---

### Task 2: Migración y cálculo de cuota y penalidad

**Files:**
- Create: `db/d1/0016_suscripciones.sql`
- Create: `server/suscripciones/calculo.mjs`
- Test: `server/suscripciones/calculo.test.mjs`

**Interfaces:**
- Produces:
  - `condicionesSuscripcion(producto: string, meses: number) → { producto, duracion_meses, cuota_centimos, precio_mes_centimos, precio_3m_centimos: number|null, ahorro_mes_centimos, cobros: number|null, titulo } | null`
  - `penalidadAlCancelar({ duracion_meses, cobros_aprobados, cuota_centimos, precio_mes_centimos, precio_3m_centimos }) → number` (céntimos)
  - `detallePenalidad(mismo objeto) → string` (por ejemplo «3 meses a S/270 + 1 mes a S/320, menos los S/1.000 que pagaste»; vacío si no hay penalidad)
  - `finDeCobros(desde: Date, cobros: number|null) → string|null` (ISO)
  - `esUltimoCobro({ duracion_meses }, numero: number) → boolean`
  - Tablas `suscripciones`, `suscripcion_cobros` y columna `reservas.forma_pago`.

- [ ] **Step 1: Escribir la migración**

```sql
-- Pagos con suscripción (spec 2026-10-27). Una fila por suscripción de Mercado Pago
-- (preapproval). Sin renovación: el paquete termina con su cobro número duracion_meses.
-- Los datos del paciente se copian aquí (web: de su ficha; link: del formulario) para
-- el panel y para el freno por DNI.
ALTER TABLE reservas ADD COLUMN forma_pago TEXT NOT NULL DEFAULT 'completo';

CREATE TABLE suscripciones (
  id                         TEXT PRIMARY KEY,
  token                      TEXT NOT NULL UNIQUE,   -- va en cada recibo («Cancelar mi plan»)
  link_token_hash            TEXT UNIQUE,            -- solo las creadas con link del panel
  link_usado_en              TEXT,
  vence_en                   TEXT,                   -- link sin usar
  reserva_id                 TEXT REFERENCES reservas(id),
  nombre                     TEXT,
  email                      TEXT,
  dni                        TEXT,
  whatsapp                   TEXT,
  producto                   TEXT NOT NULL,
  duracion_meses             INTEGER NOT NULL CHECK (duracion_meses IN (1, 3, 6)),
  cuota_centimos             INTEGER NOT NULL,
  precio_mes_centimos        INTEGER NOT NULL,       -- precio mes a mes al suscribirse (referencia de la penalidad)
  precio_3m_centimos         INTEGER,                -- porMes del paquete de 3 al suscribirse; solo en paquetes de 6
  penalidad_centimos         INTEGER NOT NULL DEFAULT 0, -- monto calculado al cancelar o al cotizar su pago
  mp_preapproval_id          TEXT UNIQUE,
  estado                     TEXT NOT NULL CHECK (estado IN ('pendiente', 'activa', 'terminada', 'cobro_fallido', 'cancelada')),
  cobros_aprobados           INTEGER NOT NULL DEFAULT 0,
  ultimo_cobro_en            TEXT,
  cancelada_en               TEXT,
  motivo_cancelacion         TEXT CHECK (motivo_cancelacion IN ('paciente_boton', 'paciente_mp', 'cobro_fallido', 'equipo')),
  penalidad_estado           TEXT NOT NULL DEFAULT 'no_aplica' CHECK (penalidad_estado IN ('no_aplica', 'pendiente', 'pagada')),
  penalidad_mp_payment_id    TEXT,
  penalidad_marcada_por      TEXT,
  creado_por                 TEXT,
  acepto_condiciones_version TEXT,
  creado_en                  TEXT NOT NULL,
  actualizado_en             TEXT NOT NULL
);
CREATE INDEX suscripciones_reserva ON suscripciones (reserva_id);
CREATE INDEX suscripciones_deuda ON suscripciones (dni) WHERE penalidad_estado = 'pendiente';

CREATE TABLE suscripcion_cobros (
  id             TEXT PRIMARY KEY,
  suscripcion_id TEXT NOT NULL REFERENCES suscripciones(id),
  mp_payment_id  TEXT NOT NULL UNIQUE,  -- id del pago; si Mercado Pago aún no lo creó, el del authorized payment
  numero         INTEGER NOT NULL,
  estado         TEXT NOT NULL,
  monto_centimos INTEGER NOT NULL,
  neto_centimos  INTEGER,
  metodo         TEXT,
  creado_en      TEXT NOT NULL
);
CREATE INDEX suscripcion_cobros_suscripcion ON suscripcion_cobros (suscripcion_id);
```

- [ ] **Step 2: Escribir el test que falla**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { condicionesSuscripcion, penalidadAlCancelar, detallePenalidad, finDeCobros, esUltimoCobro } from './calculo.mjs';

test('cuotas y precios de referencia de los 9 casos (precios del 28-oct)', () => {
  const casos = [
    ['acompanamiento', 1, 32000, null, null], ['acompanamiento', 3, 27000, null, 3], ['acompanamiento', 6, 25000, 27000, 6],
    ['constancia', 1, 44000, null, null], ['constancia', 3, 36000, null, 3], ['constancia', 6, 32500, 36000, 6],
    ['transformacion', 1, 60000, null, null], ['transformacion', 3, 51000, null, 3], ['transformacion', 6, 46800, 51000, 6],
  ];
  const mes = { acompanamiento: 32000, constancia: 44000, transformacion: 60000 };
  for (const [p, m, cuota, tres, cobros] of casos) {
    const c = condicionesSuscripcion(p, m);
    assert.equal(c.cuota_centimos, cuota, `${p} ${m}`);
    assert.equal(c.precio_mes_centimos, mes[p], `${p} ${m}`);
    assert.equal(c.precio_3m_centimos, tres, `${p} ${m}`);
    assert.equal(c.ahorro_mes_centimos, mes[p] - cuota, `${p} ${m}`);
    assert.equal(c.cobros, cobros, `${p} ${m}`);
  }
});

test('título dice pago mensual; planes de pago único o duraciones raras no aplican', () => {
  assert.equal(condicionesSuscripcion('constancia', 3).titulo, '2 sesiones al mes · 3 meses · pago mensual');
  assert.equal(condicionesSuscripcion('constancia', 1).titulo, '2 sesiones al mes · mes a mes · pago mensual');
  assert.equal(condicionesSuscripcion('basico', 1), null);
  assert.equal(condicionesSuscripcion('evaluacion', 1), null);
  assert.equal(condicionesSuscripcion('constancia', 4), null);
  assert.equal(condicionesSuscripcion('toString', 1), null);
});

test('penalidades de la tabla de la spec (Joaquín, 28-oct)', () => {
  const tabla = {
    acompanamiento: { 3: [50, 100], 6: [70, 140, 60, 130, 200] },
    constancia: { 3: [80, 160], 6: [115, 230, 105, 220, 335] },
    transformacion: { 3: [90, 180], 6: [132, 264, 126, 258, 390] },
  };
  for (const [p, porDur] of Object.entries(tabla)) {
    for (const [m, esperadas] of Object.entries(porDur)) {
      const c = condicionesSuscripcion(p, Number(m));
      esperadas.forEach((soles, i) => {
        assert.equal(penalidadAlCancelar({ ...c, cobros_aprobados: i + 1 }), soles * 100, `${p} ${m} tras ${i + 1}`);
      });
    }
  }
});

test('penalidad 0: sin cobros, con todos los cobros, o en mes a mes', () => {
  const c = condicionesSuscripcion('constancia', 3);
  assert.equal(penalidadAlCancelar({ ...c, cobros_aprobados: 0 }), 0);
  assert.equal(penalidadAlCancelar({ ...c, cobros_aprobados: 3 }), 0);
  assert.equal(penalidadAlCancelar({ ...condicionesSuscripcion('constancia', 1), cobros_aprobados: 5 }), 0);
});

test('detalle de la penalidad para la página de cancelar', () => {
  const seis = condicionesSuscripcion('acompanamiento', 6);
  assert.equal(detallePenalidad({ ...seis, cobros_aprobados: 4 }), '3 meses a S/270 + 1 mes a S/320, menos los S/1.000 que pagaste');
  assert.equal(detallePenalidad({ ...condicionesSuscripcion('constancia', 3), cobros_aprobados: 2 }), '2 meses a S/440, menos los S/720 que pagaste');
  assert.equal(detallePenalidad({ ...seis, cobros_aprobados: 6 }), '');
});

test('fin de cobros: 15 días después del último cobro esperado; mes a mes sin fin', () => {
  assert.equal(finDeCobros(new Date('2026-11-03T15:00:00Z'), 3), '2027-01-18T15:00:00.000Z');
  assert.equal(finDeCobros(new Date('2026-11-03T15:00:00Z'), null), null);
});

test('último cobro: el número duracion_meses; mes a mes nunca', () => {
  assert.equal(esUltimoCobro({ duracion_meses: 3 }, 2), false);
  assert.equal(esUltimoCobro({ duracion_meses: 3 }, 3), true);
  assert.equal(esUltimoCobro({ duracion_meses: 1 }, 1), false);
});

test('la migración crea las tablas', async () => {
  const { d1DePrueba } = await import('../reservas/d1-prueba.mjs');
  const db = d1DePrueba();
  const { n } = await db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name IN ('suscripciones', 'suscripcion_cobros')").first();
  assert.equal(n, 2);
  const col = await db.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('reservas') WHERE name = 'forma_pago'").first();
  assert.equal(col.n, 1);
});
```

- [ ] **Step 3: Correr y ver que falla**

Run: `node --test server/suscripciones/calculo.test.mjs`
Expected: FAIL con `Cannot find module './calculo.mjs'`.

- [ ] **Step 4: Implementar**

```js
// Cuota, penalidad y número de cobros de una suscripción (spec 2026-10-27). Todo sale
// de plans.js / duraciones.js: ningún monto escrito a mano.
// Cuota = porMes de la duración. Sin renovación: el paquete son duracion_meses cobros.
// Penalidad (Joaquín, 28-oct): los meses pagados se recalculan al precio que les habría
// tocado (en el paquete de 6, si ya pasaron 3 meses, esos 3 al precio del paquete de 3;
// los demás a mes a mes) y se paga la diferencia con lo pagado. Mes a mes: 0.
import { plans } from '../../src/data/plans.js';
import { duracionesDe, formatoSoles } from '../../src/data/duraciones.js';

const DIA = 86400000;

export function condicionesSuscripcion(producto, meses) {
  if (!Object.hasOwn(plans, producto)) return null;
  const durs = duracionesDe(producto);
  if (!durs) return null;
  const d = durs.find((x) => x.meses === Number(meses));
  if (!d) return null;
  const unMes = d.meses === 1;
  return {
    producto, duracion_meses: d.meses,
    cuota_centimos: d.porMes * 100,
    precio_mes_centimos: durs[0].porMes * 100,
    precio_3m_centimos: d.meses === 6 ? durs.find((x) => x.meses === 3).porMes * 100 : null,
    ahorro_mes_centimos: (durs[0].porMes - d.porMes) * 100,
    cobros: unMes ? null : d.meses,
    titulo: `${plans[producto].name} · ${unMes ? 'mes a mes' : `${d.meses} meses`} · pago mensual`,
  };
}

// Cuántos de los meses pagados van al precio del paquete de 3 (solo en el de 6, desde el mes 3).
const bloqueDe = (s) => (s.duracion_meses === 6 && s.cobros_aprobados >= 3 && s.precio_3m_centimos ? 3 : 0);
const aplica = (s) => s.duracion_meses > 1 && s.cobros_aprobados >= 1 && s.cobros_aprobados < s.duracion_meses;

// Se paga si ya hubo al menos un cobro y todavía falta alguno del paquete.
export function penalidadAlCancelar(s) {
  if (!aplica(s)) return 0;
  const n = s.cobros_aprobados;
  const b = bloqueDe(s);
  return Math.max(0, b * (s.precio_3m_centimos ?? 0) + (n - b) * s.precio_mes_centimos - n * s.cuota_centimos);
}

const soles = (c) => formatoSoles(Math.round(c / 100));
const meses = (n) => (n === 1 ? '1 mes' : `${n} meses`);
export function detallePenalidad(s) {
  if (!penalidadAlCancelar(s)) return '';
  const n = s.cobros_aprobados;
  const b = bloqueDe(s);
  const partes = [b ? `${meses(b)} a ${soles(s.precio_3m_centimos)}` : null, n - b ? `${meses(n - b)} a ${soles(s.precio_mes_centimos)}` : null].filter(Boolean);
  return `${partes.join(' + ')}, menos los ${soles(n * s.cuota_centimos)} que pagaste`;
}

// end_date para Mercado Pago, de respaldo: el sistema cancela tras el último cobro,
// pero si no pudiera, Mercado Pago tampoco cobra de más.
export function finDeCobros(desde, cobros) {
  if (!cobros) return null;
  const f = new Date(desde.getTime());
  f.setUTCMonth(f.getUTCMonth() + cobros - 1);
  return new Date(f.getTime() + 15 * DIA).toISOString();
}

export const esUltimoCobro = (s, numero) => s.duracion_meses > 1 && numero >= s.duracion_meses;
```

- [ ] **Step 5: Correr y ver que pasa; correr toda la suite**

Run: `node --test server/suscripciones/calculo.test.mjs && npm test`
Expected: PASS, y la suite completa sigue verde (la migración no rompe `esquema.test.mjs`).

- [ ] **Step 6: Commit**

```bash
git add db/d1/0016_suscripciones.sql server/suscripciones/calculo.mjs server/suscripciones/calculo.test.mjs
git commit -m "Suscripciones: migración y cálculo de cuota y penalidad"
```

---

### Task 3: API de suscripciones de Mercado Pago

**Files:**
- Modify: `server/reservas/mercadopago.mjs` (dentro de `crearMp`, y su `return`)
- Test: `server/reservas/mercadopago.test.mjs`

**Interfaces:**
- Consumes: nada nuevo.
- Produces (en el objeto de `crearMp(env, fetchImpl)`):
  - `crearSuscripcion({ suscripcionId, titulo, cuotaCentimos, email, urlRetorno, finEn: string|null }) → { id, init_point }`
  - `obtenerSuscripcion(id) → preapproval JSON`
  - `cancelarSuscripcion(id) → preapproval JSON`
  - `obtenerCobroSuscripcion(id) → authorized payment JSON`
  - `buscarCobrosSuscripcion(preapprovalId) → Array<authorized payment>`

- [ ] **Step 1: Escribir los tests que fallan** (agregar al final de `server/reservas/mercadopago.test.mjs`)

```js
test('crearSuscripcion: mensual en soles, pendiente, con fin y referencia', async () => {
  let pedido;
  const f = async (url, init) => { pedido = { url, init }; return new Response(JSON.stringify({ id: 'pre1', init_point: 'https://mp/sus' })); };
  const mp = crearMp({ MP_ACCESS_TOKEN: 'TEST-1' }, f);
  const r = await mp.crearSuscripcion({ suscripcionId: 's1', titulo: '2 sesiones al mes · 3 meses · pago mensual', cuotaCentimos: 36000,
    email: 'a@x.pe', urlRetorno: 'https://w/reservar/listo/?r=t', finEn: '2027-01-18T15:00:00.000Z' });
  assert.deepEqual(r, { id: 'pre1', init_point: 'https://mp/sus' });
  assert.equal(pedido.url, 'https://api.mercadopago.com/preapproval');
  assert.equal(pedido.init.method, 'POST');
  assert.equal(pedido.init.headers['X-Idempotency-Key'], 'sus-s1');
  const c = JSON.parse(pedido.init.body);
  assert.equal(c.reason, 'AJL Nutrición · 2 sesiones al mes · 3 meses · pago mensual');
  assert.equal(c.external_reference, 's1');
  assert.equal(c.payer_email, 'a@x.pe');
  assert.equal(c.back_url, 'https://w/reservar/listo/?r=t');
  assert.equal(c.status, 'pending');
  assert.deepEqual(c.auto_recurring, { frequency: 1, frequency_type: 'months', transaction_amount: 360, currency_id: 'PEN', end_date: '2027-01-18T15:00:00.000Z' });
});

test('crearSuscripcion de mes a mes va sin end_date', async () => {
  let cuerpo;
  const mp = crearMp({ MP_ACCESS_TOKEN: 'T' }, async (u, i) => { cuerpo = JSON.parse(i.body); return new Response('{"id":"p","init_point":"u"}'); });
  await mp.crearSuscripcion({ suscripcionId: 's', titulo: 't', cuotaCentimos: 44000, email: 'a@x.pe', urlRetorno: 'u', finEn: null });
  assert.equal('end_date' in cuerpo.auto_recurring, false);
});

test('cancelar, obtener y buscar cobros usan las rutas de suscripción', async () => {
  const pedidos = [];
  const f = async (url, init = {}) => { pedidos.push([init.method || 'GET', url, init.body]); return new Response(JSON.stringify(url.includes('search') ? { results: [{ id: 7 }] } : { id: 'x' })); };
  const mp = crearMp({ MP_ACCESS_TOKEN: 'T' }, f);
  await mp.cancelarSuscripcion('pre1');
  await mp.obtenerSuscripcion('pre1');
  await mp.obtenerCobroSuscripcion('77');
  assert.deepEqual(await mp.buscarCobrosSuscripcion('pre1'), [{ id: 7 }]);
  assert.deepEqual(pedidos, [
    ['PUT', 'https://api.mercadopago.com/preapproval/pre1', '{"status":"cancelled"}'],
    ['GET', 'https://api.mercadopago.com/preapproval/pre1', undefined],
    ['GET', 'https://api.mercadopago.com/authorized_payments/77', undefined],
    ['GET', 'https://api.mercadopago.com/authorized_payments/search?preapproval_id=pre1', undefined],
  ]);
});

test('las llamadas de suscripción lanzan si Mercado Pago responde error', async () => {
  const mp = crearMp({ MP_ACCESS_TOKEN: 'T' }, async () => new Response('no', { status: 400 }));
  await assert.rejects(mp.cancelarSuscripcion('p'), /Mercado Pago suscripción 400/);
  await assert.rejects(mp.crearSuscripcion({ suscripcionId: 's', titulo: 't', cuotaCentimos: 1, email: 'a@x.pe', urlRetorno: 'u', finEn: null }), /400/);
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `node --test server/reservas/mercadopago.test.mjs`
Expected: FAIL con `mp.crearSuscripcion is not a function`.

- [ ] **Step 3: Implementar** (dentro de `crearMp`, antes del `return`)

```js
  // Suscripciones sin plan asociado y con pago pendiente: el paciente autoriza en
  // init_point. Mercado Pago pide payer_email (Task 1 verifica si debe coincidir).
  async function pedirSus(ruta, init = {}) {
    const r = await fetchImpl(`${API}${ruta}`, { ...init, headers: { ...auth, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers } });
    if (!r.ok) throw new Error(`Mercado Pago suscripción ${r.status}: ${await r.text()}`);
    return r.json();
  }

  async function crearSuscripcion({ suscripcionId, titulo, cuotaCentimos, email, urlRetorno, finEn }) {
    const d = await pedirSus('/preapproval', {
      method: 'POST', headers: { 'X-Idempotency-Key': `sus-${suscripcionId}` },
      body: JSON.stringify({
        reason: `AJL Nutrición · ${titulo}`, external_reference: suscripcionId, payer_email: email, back_url: urlRetorno, status: 'pending',
        auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: cuotaCentimos / 100, currency_id: 'PEN', ...(finEn ? { end_date: finEn } : {}) },
      }),
    });
    return { id: d.id, init_point: d.init_point };
  }
  const obtenerSuscripcion = (id) => pedirSus(`/preapproval/${encodeURIComponent(id)}`);
  const cancelarSuscripcion = (id) => pedirSus(`/preapproval/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ status: 'cancelled' }) });
  const obtenerCobroSuscripcion = (id) => pedirSus(`/authorized_payments/${encodeURIComponent(id)}`);
  const buscarCobrosSuscripcion = async (id) => (await pedirSus(`/authorized_payments/search?preapproval_id=${encodeURIComponent(id)}`)).results ?? [];
```

Y cambiar el `return` de `crearMp`:

```js
  return { crearPreferencia, obtenerPago, crearSuscripcion, obtenerSuscripcion, cancelarSuscripcion, obtenerCobroSuscripcion, buscarCobrosSuscripcion };
```

Nota: en el test de `cancelarSuscripcion` el método de GET llega como `undefined`; `pedirSus` no pone `method` en los GET, por eso el test usa `init.method || 'GET'`.

- [ ] **Step 4: Correr y ver que pasa**

Run: `node --test server/reservas/mercadopago.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/reservas/mercadopago.mjs server/reservas/mercadopago.test.mjs
git commit -m "Mercado Pago: crear, consultar y cancelar suscripciones"
```

---

### Task 4: Repositorio de suscripciones

**Files:**
- Create: `server/suscripciones/repo.mjs`
- Test: `server/suscripciones/repo.test.mjs`

**Interfaces:**
- Consumes: `penalidadAlCancelar` (Task 2).
- Produces:
  - `crear(db, s)` — inserta; `s` con todas las columnas NOT NULL más las que tenga.
  - `porId(db, id)`, `porToken(db, token)`, `porLinkHash(db, hash)`, `porPreapproval(db, mpId)`, `porReserva(db, reservaId)` → fila o `null`.
  - `guardarPreapproval(db, id, mpId, ahora)`.
  - `usarLink(db, { hash, nombre, email, dni, whatsapp, condicionesVersion, ahora }) → boolean` (true si lo tomó).
  - `registrarCobro(db, { suscripcionId, mpPaymentId, estado, montoCentimos, netoCentimos, metodo, ahora }) → { nuevoAprobado: boolean, numero: number }`.
  - `marcarTerminada(db, id, ahora) → boolean`.
  - `cotizarPenalidad(db, id, montoCentimos, ahora)` — guarda el monto que se va a cobrar (antes de crear la preferencia); no toca una penalidad pagada.
  - `cancelar(db, { id, motivo, ahora }) → { cambio: boolean, penalidad_centimos: number }` — calcula la penalidad con los cobros de ese momento y la guarda en `penalidad_centimos`; `motivo = 'cobro_fallido'` deja `estado = 'cobro_fallido'`, los demás `cancelada`. No toca una penalidad ya `pagada`.
  - `marcarPenalidadPagada(db, { id, mpPaymentId, por, ahora }) → boolean`.
  - `deudaPorDni(db, dni) → fila|null`.
  - `listar(db, { filtro }) → Array<fila>` con `filtro` ∈ `todas | activas | terminan | fallido | penalidad | canceladas`.

- [ ] **Step 1: Escribir el test que falla**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1DePrueba } from '../reservas/d1-prueba.mjs';
import * as sus from './repo.mjs';

const t0 = new Date('2026-11-03T15:00:00Z');
const base = (o = {}) => ({ id: 's1', token: 'tok1', producto: 'constancia', duracion_meses: 3, cuota_centimos: 36000, precio_mes_centimos: 44000,
  estado: 'pendiente', nombre: 'Lucía Ramos', email: 'lucia@x.pe', dni: '70123456', whatsapp: '+51987654321', creado_en: t0.toISOString(), ...o });

test('registrarCobro: el mismo pago dos veces cuenta una sola vez y activa la suscripción', async () => {
  const db = d1DePrueba();
  await sus.crear(db, base());
  const a = await sus.registrarCobro(db, { suscripcionId: 's1', mpPaymentId: 'p1', estado: 'approved', montoCentimos: 36000, ahora: t0 });
  const b = await sus.registrarCobro(db, { suscripcionId: 's1', mpPaymentId: 'p1', estado: 'approved', montoCentimos: 36000, ahora: t0 });
  assert.deepEqual(a, { nuevoAprobado: true, numero: 1 });
  assert.deepEqual(b, { nuevoAprobado: false, numero: 1 });
  const s = await sus.porId(db, 's1');
  assert.equal(s.cobros_aprobados, 1);
  assert.equal(s.estado, 'activa');
  assert.equal(s.ultimo_cobro_en, t0.toISOString());
});

test('registrarCobro: un rechazo no suma y no pisa un aprobado', async () => {
  const db = d1DePrueba();
  await sus.crear(db, base({ estado: 'activa' }));
  assert.deepEqual(await sus.registrarCobro(db, { suscripcionId: 's1', mpPaymentId: 'p1', estado: 'rejected', montoCentimos: 36000, ahora: t0 }), { nuevoAprobado: false, numero: 1 });
  await sus.registrarCobro(db, { suscripcionId: 's1', mpPaymentId: 'p2', estado: 'approved', montoCentimos: 36000, ahora: t0 });
  await sus.registrarCobro(db, { suscripcionId: 's1', mpPaymentId: 'p2', estado: 'rejected', montoCentimos: 36000, ahora: t0 });
  const { estado } = await db.prepare("SELECT estado FROM suscripcion_cobros WHERE mp_payment_id = 'p2'").first();
  assert.equal(estado, 'approved');
  assert.equal((await sus.porId(db, 's1')).cobros_aprobados, 1);
});

test('cancelar a mitad deja la penalidad pendiente; al final no; la segunda vez no cambia nada', async () => {
  const db = d1DePrueba();
  await sus.crear(db, base({ estado: 'activa', cobros_aprobados: 1 }));
  assert.deepEqual(await sus.cancelar(db, { id: 's1', motivo: 'paciente_boton', ahora: t0 }), { cambio: true, penalidad_centimos: 8000 });
  assert.equal((await sus.porId(db, 's1')).penalidad_estado, 'pendiente');
  assert.equal((await sus.porId(db, 's1')).penalidad_centimos, 8000);
  assert.equal((await sus.cancelar(db, { id: 's1', motivo: 'paciente_mp', ahora: t0 })).cambio, false);
  await sus.crear(db, base({ id: 's2', token: 'tok2', estado: 'activa', cobros_aprobados: 3 }));
  assert.deepEqual(await sus.cancelar(db, { id: 's2', motivo: 'paciente_mp', ahora: t0 }), { cambio: true, penalidad_centimos: 0 });
  assert.equal((await sus.porId(db, 's2')).penalidad_estado, 'no_aplica');
});

test('cancelar por cobro fallido deja estado cobro_fallido; una penalidad ya pagada sigue pagada', async () => {
  const db = d1DePrueba();
  await sus.crear(db, base({ estado: 'activa', cobros_aprobados: 2 }));
  assert.equal(await sus.marcarPenalidadPagada(db, { id: 's1', mpPaymentId: 'pen1', ahora: t0 }), true);
  await sus.cancelar(db, { id: 's1', motivo: 'cobro_fallido', ahora: t0 });
  const s = await sus.porId(db, 's1');
  assert.equal(s.estado, 'cobro_fallido');
  assert.equal(s.penalidad_estado, 'pagada');
  assert.equal(await sus.marcarPenalidadPagada(db, { id: 's1', mpPaymentId: 'pen1', ahora: t0 }), false);
});

test('deudaPorDni encuentra la penalidad pendiente sin importar mayúsculas ni espacios', async () => {
  const db = d1DePrueba();
  await sus.crear(db, base({ estado: 'activa', cobros_aprobados: 1, dni: 'CE12345' }));
  await sus.cancelar(db, { id: 's1', motivo: 'paciente_boton', ahora: t0 });
  assert.equal((await sus.deudaPorDni(db, ' ce12345 ')).id, 's1');
  assert.equal(await sus.deudaPorDni(db, '70123456'), null);
});

test('usarLink: solo una vez y solo vigente', async () => {
  const db = d1DePrueba();
  await sus.crear(db, base({ link_token_hash: 'h1', vence_en: '2026-11-10T00:00:00Z', email: null, dni: null }));
  const datos = { hash: 'h1', nombre: 'Lucía Ramos', email: 'l@x.pe', dni: '70123456', whatsapp: '+51987654321', condicionesVersion: 'v', ahora: t0 };
  assert.equal(await sus.usarLink(db, datos), true);
  assert.equal(await sus.usarLink(db, datos), false);
  await sus.crear(db, base({ id: 's2', token: 'tok2', link_token_hash: 'h2', vence_en: '2026-11-01T00:00:00Z' }));
  assert.equal(await sus.usarLink(db, { ...datos, hash: 'h2' }), false);
});

test('listar filtra por estado y por último mes', async () => {
  const db = d1DePrueba();
  await sus.crear(db, base({ id: 'a', token: 'a', estado: 'activa', cobros_aprobados: 1 }));
  await sus.crear(db, base({ id: 'b', token: 'b', estado: 'activa', cobros_aprobados: 2 }));
  await sus.crear(db, base({ id: 'c', token: 'c', estado: 'cancelada', penalidad_estado: 'pendiente' }));
  await sus.crear(db, base({ id: 'd', token: 'd', estado: 'pendiente' }));
  const ids = async (filtro) => (await sus.listar(db, { filtro })).map((s) => s.id).sort();
  assert.deepEqual(await ids('activas'), ['a', 'b']);
  assert.deepEqual(await ids('terminan'), ['b']);
  assert.deepEqual(await ids('penalidad'), ['c']);
  assert.deepEqual(await ids('canceladas'), ['c']);
  assert.deepEqual(await ids('todas'), ['a', 'b', 'c']); // las pendientes sin pagar no se listan
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `node --test server/suscripciones/repo.test.mjs`
Expected: FAIL con `Cannot find module './repo.mjs'`.

- [ ] **Step 3: Implementar**

```js
// Acceso a D1 de las suscripciones. Las reglas que no pueden fallar por concurrencia
// (webhook y página de regreso a la vez) van dentro de la misma sentencia o batch.
import { penalidadAlCancelar } from './calculo.mjs';

const COLUMNAS = ['id', 'token', 'link_token_hash', 'link_usado_en', 'vence_en', 'reserva_id', 'nombre', 'email', 'dni', 'whatsapp',
  'producto', 'duracion_meses', 'cuota_centimos', 'precio_mes_centimos', 'precio_3m_centimos', 'penalidad_centimos', 'mp_preapproval_id', 'estado', 'cobros_aprobados',
  'penalidad_estado', 'creado_por', 'acepto_condiciones_version', 'creado_en'];
const normalDni = (d) => String(d ?? '').replace(/[\s.-]+/g, '').toUpperCase();

export async function crear(db, s) {
  const fila = { cobros_aprobados: 0, penalidad_estado: 'no_aplica', ...s, dni: s.dni ? normalDni(s.dni) : null };
  const cols = COLUMNAS.filter((c) => fila[c] !== undefined);
  await db.prepare(`INSERT INTO suscripciones (${cols.join(', ')}, actualizado_en) VALUES (${cols.map((_, i) => `?${i + 1}`).join(', ')}, ?${cols.length + 1})`)
    .bind(...cols.map((c) => fila[c]), fila.creado_en).run();
}

const una = (campo) => (db, v) => db.prepare(`SELECT * FROM suscripciones WHERE ${campo} = ?1`).bind(v).first();
export const porId = una('id');
export const porToken = una('token');
export const porLinkHash = una('link_token_hash');
export const porPreapproval = una('mp_preapproval_id');
export const porReserva = una('reserva_id');

export const guardarPreapproval = (db, id, mpId, ahora) => db.prepare(
  'UPDATE suscripciones SET mp_preapproval_id = ?2, actualizado_en = ?3 WHERE id = ?1',
).bind(id, mpId, ahora.toISOString()).run();

// El link sirve una vez y solo vigente; quien lo toma escribe sus datos en la misma sentencia.
export async function usarLink(db, { hash, nombre, email, dni, whatsapp, condicionesVersion, ahora }) {
  const a = ahora.toISOString();
  const r = await db.prepare(
    `UPDATE suscripciones SET link_usado_en = ?2, nombre = ?3, email = ?4, dni = ?5, whatsapp = ?6, acepto_condiciones_version = ?7, actualizado_en = ?2
     WHERE link_token_hash = ?1 AND link_usado_en IS NULL AND vence_en > ?2 AND estado = 'pendiente'`,
  ).bind(hash, a, nombre, email, normalDni(dni), whatsapp, condicionesVersion).run();
  return r.meta.changes === 1;
}

// Un cobro aprobado suma una sola vez aunque llegue repetido o por dos caminos a la vez:
// el UPDATE solo pasa si ese pago todavía no figura como aprobado, en el mismo batch.
export async function registrarCobro(db, { suscripcionId, mpPaymentId, estado, montoCentimos, netoCentimos = null, metodo = null, ahora }) {
  const a = ahora.toISOString();
  const aprobado = estado === 'approved';
  const sumar = db.prepare(
    `UPDATE suscripciones SET cobros_aprobados = cobros_aprobados + 1, ultimo_cobro_en = ?3, actualizado_en = ?3,
       estado = CASE WHEN estado = 'pendiente' THEN 'activa' ELSE estado END
     WHERE id = ?1 AND ?4 = 1 AND NOT EXISTS (SELECT 1 FROM suscripcion_cobros WHERE mp_payment_id = ?2 AND estado = 'approved')`,
  ).bind(suscripcionId, mpPaymentId, a, aprobado ? 1 : 0);
  const guardar = db.prepare(
    `INSERT INTO suscripcion_cobros (id, suscripcion_id, mp_payment_id, numero, estado, monto_centimos, neto_centimos, metodo, creado_en)
     VALUES (?1, ?2, ?3, (SELECT cobros_aprobados + ?9 FROM suscripciones WHERE id = ?2), ?4, ?5, ?6, ?7, ?8)
     ON CONFLICT (mp_payment_id) DO UPDATE SET estado = excluded.estado, numero = excluded.numero,
       neto_centimos = COALESCE(excluded.neto_centimos, suscripcion_cobros.neto_centimos)
     WHERE suscripcion_cobros.estado <> 'approved'`,
  ).bind(crypto.randomUUID(), suscripcionId, mpPaymentId, estado, montoCentimos, netoCentimos, metodo, a, aprobado ? 0 : 1);
  const [res] = await db.batch([sumar, guardar]);
  const { numero } = await db.prepare('SELECT numero FROM suscripcion_cobros WHERE mp_payment_id = ?1').bind(mpPaymentId).first();
  return { nuevoAprobado: res.meta.changes === 1, numero };
}

export async function marcarTerminada(db, id, ahora) {
  const r = await db.prepare("UPDATE suscripciones SET estado = 'terminada', actualizado_en = ?2 WHERE id = ?1 AND estado = 'activa'")
    .bind(id, ahora.toISOString()).run();
  return r.meta.changes === 1;
}

// La penalidad se calcula con los cobros de este momento. Una penalidad ya pagada no se toca.
export async function cancelar(db, { id, motivo, ahora }) {
  const s = await porId(db, id);
  if (!s || !['pendiente', 'activa'].includes(s.estado)) return { cambio: false, penalidad_centimos: 0 };
  const pen = penalidadAlCancelar(s);
  const r = await db.prepare(
    `UPDATE suscripciones SET estado = ?2, motivo_cancelacion = ?3, cancelada_en = ?4, actualizado_en = ?4,
       penalidad_centimos = CASE WHEN penalidad_estado = 'pagada' THEN penalidad_centimos ELSE ?5 END,
       penalidad_estado = CASE WHEN penalidad_estado = 'pagada' THEN 'pagada' WHEN ?5 > 0 THEN 'pendiente' ELSE 'no_aplica' END
     WHERE id = ?1 AND estado IN ('pendiente', 'activa') AND cobros_aprobados = ?6`,
  ).bind(id, motivo === 'cobro_fallido' ? 'cobro_fallido' : 'cancelada', motivo, ahora.toISOString(), pen, s.cobros_aprobados).run();
  return { cambio: r.meta.changes === 1, penalidad_centimos: pen };
}

export const cotizarPenalidad = (db, id, monto, ahora) => db.prepare(
  "UPDATE suscripciones SET penalidad_centimos = ?2, actualizado_en = ?3 WHERE id = ?1 AND penalidad_estado <> 'pagada'",
).bind(id, monto, ahora.toISOString()).run();

export async function marcarPenalidadPagada(db, { id, mpPaymentId = null, por = null, ahora }) {
  const r = await db.prepare(
    `UPDATE suscripciones SET penalidad_estado = 'pagada', penalidad_mp_payment_id = ?2, penalidad_marcada_por = ?3, actualizado_en = ?4
     WHERE id = ?1 AND penalidad_estado <> 'pagada'`,
  ).bind(id, mpPaymentId, por, ahora.toISOString()).run();
  return r.meta.changes === 1;
}

export const deudaPorDni = (db, dni) => db.prepare(
  "SELECT * FROM suscripciones WHERE dni = ?1 AND penalidad_estado = 'pendiente' ORDER BY cancelada_en DESC LIMIT 1",
).bind(normalDni(dni)).first();

const FILTROS = {
  todas: "estado <> 'pendiente'",
  activas: "estado = 'activa'",
  terminan: "estado = 'activa' AND duracion_meses > 1 AND cobros_aprobados = duracion_meses - 1",
  fallido: "estado = 'cobro_fallido'",
  penalidad: "penalidad_estado = 'pendiente'",
  canceladas: "estado IN ('cancelada', 'cobro_fallido')",
};
export const FILTROS_SUSCRIPCION = Object.keys(FILTROS);

export async function listar(db, { filtro }) {
  const { results } = await db.prepare(`SELECT * FROM suscripciones WHERE ${FILTROS[filtro]} ORDER BY actualizado_en DESC LIMIT 200`).all();
  return results;
}

export async function conteos(db) {
  const fila = await db.prepare(`SELECT ${Object.entries(FILTROS).map(([k, w]) => `SUM(CASE WHEN ${w} THEN 1 ELSE 0 END) AS ${k}`).join(', ')} FROM suscripciones`).first();
  return Object.fromEntries(Object.keys(FILTROS).map((k) => [k, fila?.[k] ?? 0]));
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `node --test server/suscripciones/repo.test.mjs`
Expected: PASS. Si `registrarCobro` da `nuevoAprobado: false` en el primer cobro, revisar que `sumar` vaya **antes** que `guardar` en el batch (el `NOT EXISTS` mira la tabla antes del INSERT).

- [ ] **Step 5: Commit**

```bash
git add server/suscripciones/repo.mjs server/suscripciones/repo.test.mjs
git commit -m "Suscripciones: repositorio con cobros idempotentes y penalidad"
```

---

### Task 5: Correos de suscripción

**Files:**
- Modify: `server/reservas/correos.mjs` (exportar `esc`, `marco`, `boton`)
- Modify: `server/reservas/aviso-equipo.mjs` (nueva `avisarFijas`)
- Create: `server/suscripciones/correos.mjs`
- Test: `server/suscripciones/correos.test.mjs`

**Interfaces:**
- Produces:
  - `correoRecibo({ nombre, titulo, numero, cobros, cuota, urlCancelar, penalidadHoy }) → { subject, html }` (montos en céntimos; `cobros` null en mes a mes).
  - `correoBaja({ nombre, titulo, penalidad, penalidadPagada }) → { subject, html }`.
  - `correoEquipoSuscripcion(tipo, s, { numero, penalidad } = {}) → { subject, html }` con `tipo` ∈ `nueva | ultimo | cancelada_pagada | cancelada_pendiente | fallido | penalidad_pagada`.
  - `avisarFijas(deps, env, correo)` en `aviso-equipo.mjs`: manda a Romina, Irene y Alejandro; nunca lanza.

- [ ] **Step 1: Exportar los ayudantes**

En `server/reservas/correos.mjs` cambiar las tres declaraciones a `export const esc = …`, `export const marco = …`, `export const boton = …` (sin cambiar su contenido).

En `server/reservas/aviso-equipo.mjs` agregar al final:

```js
// Avisos de suscripciones (spec 2026-10-27): solo a las fijas, no hay nutricionista de cita.
export async function avisarFijas(deps, env, c) {
  const to = destinatarios(env, FIJAS);
  if (!to.length) return;
  try {
    await deps.sendEmail({ from: remitente(env), to, ...c });
  } catch (e) {
    console.error('aviso-equipo suscripción', e);
  }
}
```

- [ ] **Step 2: Escribir el test que falla**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { correoRecibo, correoBaja, correoEquipoSuscripcion } from './correos.mjs';

test('recibo: cobro N de M, último cobro y enlace para cancelar con la penalidad', () => {
  const c = correoRecibo({ nombre: 'Lucía', titulo: '2 sesiones al mes · 3 meses · pago mensual', numero: 2, cobros: 3, cuota: 36000,
    urlCancelar: 'https://w/suscripcion/cancelar/?s=t', penalidadHoy: 16000 });
  assert.equal(c.subject, 'Recibimos tu pago · cobro 2 de 3 · AJL Nutrición');
  assert.match(c.html, /S\/360/);
  assert.match(c.html, /href="https:\/\/w\/suscripcion\/cancelar\/\?s=t"/);
  assert.match(c.html, /hoy serían S\/160/);
});

test('recibo del último cobro: dice que termina y no ofrece penalidad', () => {
  const c = correoRecibo({ nombre: 'Lucía', titulo: 't', numero: 3, cobros: 3, cuota: 36000, urlCancelar: 'u', penalidadHoy: 0 });
  assert.match(c.html, /último cobro/);
  assert.doesNotMatch(c.html, /penalidad/);
});

test('recibo de mes a mes: sin total de cobros ni penalidad', () => {
  const c = correoRecibo({ nombre: 'Ana', titulo: 't', numero: 4, cobros: null, cuota: 44000, urlCancelar: 'u', penalidadHoy: 0 });
  assert.equal(c.subject, 'Recibimos tu pago · AJL Nutrición');
  assert.doesNotMatch(c.html, /penalidad/);
});

test('baja: con penalidad pendiente explica que se paga al volver; escapa el nombre', () => {
  const c = correoBaja({ nombre: '<b>x</b>', titulo: 't', penalidad: 8000, penalidadPagada: false });
  assert.match(c.html, /&lt;b&gt;x&lt;\/b&gt;/);
  assert.match(c.html, /S\/80 quedan pendientes/);
});

test('equipo: asunto según el tipo', () => {
  const s = { nombre: 'Ana Torres', titulo: 'x', producto: 'transformacion', duracion_meses: 3, cobros_aprobados: 2, whatsapp: '+51987654321', dni: '72345678' };
  assert.equal(correoEquipoSuscripcion('fallido', s, { penalidad: 9000 }).subject, 'Cobro fallido: Ana Torres · penalidad S/90');
  assert.equal(correoEquipoSuscripcion('ultimo', s).subject, 'Ana Torres pagó su último cobro: ofrécele seguir');
  assert.equal(correoEquipoSuscripcion('nueva', s).subject, 'Suscripción nueva: Ana Torres');
});
```

- [ ] **Step 3: Correr y ver que falla**

Run: `node --test server/suscripciones/correos.test.mjs`
Expected: FAIL con `Cannot find module './correos.mjs'`.

- [ ] **Step 4: Implementar**

```js
// Correos de suscripciones (spec 2026-10-27). El recibo de cada cobro lleva «Cancelar mi plan».
import { esc, marco, boton } from '../reservas/correos.mjs';
import { formatoSoles } from '../../src/data/duraciones.js';
import { condicionesSuscripcion } from './calculo.mjs';

const soles = (c) => formatoSoles(Math.round(c / 100));

export function correoRecibo({ nombre, titulo, numero, cobros, cuota, urlCancelar, penalidadHoy }) {
  const ultimo = cobros && numero >= cobros;
  const quedan = cobros && !ultimo;
  return {
    subject: `Recibimos tu pago${cobros ? ` · cobro ${numero} de ${cobros}` : ''} · AJL Nutrición`,
    html: marco(`
      <h2 style="font-family:Georgia,serif;color:#173C2C">Gracias, ${esc(nombre)}. Recibimos tu pago</h2>
      <p>${esc(titulo)}</p>
      <p><strong>${soles(cuota)}</strong>${cobros ? ` · cobro ${numero} de ${cobros}` : ''}</p>
      ${ultimo ? '<p>Este fue tu último cobro: tu plan termina sin renovación y no se te cobra nada más.</p>' : ''}
      <p>Escríbenos por WhatsApp para agendar tus sesiones.</p>
      ${ultimo ? '' : `<p style="font-size:13px;color:#5E6B63">¿Quieres dejar tu plan? <a href="${esc(urlCancelar)}">Cancelar mi plan</a>.${quedan && penalidadHoy > 0 ? ` Si cancelas antes del último cobro, pagas la diferencia de los meses usados con el precio mes a mes: hoy serían ${soles(penalidadHoy)}.` : ''}</p>`}`),
  };
}

export function correoBaja({ nombre, titulo, penalidad, penalidadPagada }) {
  return {
    subject: 'Tu plan quedó cancelado · AJL Nutrición',
    html: marco(`
      <h2 style="font-family:Georgia,serif;color:#173C2C">${esc(nombre)}, tu plan quedó cancelado</h2>
      <p>${esc(titulo)}. Ya no se te cobra nada más.</p>
      ${penalidad > 0 && !penalidadPagada ? `<p>Los ${soles(penalidad)} de la penalidad quedan pendientes. Si vuelves a reservar con nosotros, te pediremos pagarlos antes.</p>` : ''}
      ${penalidad > 0 && penalidadPagada ? `<p>Recibimos el pago de la penalidad (${soles(penalidad)}).</p>` : ''}
      <p>Gracias por confiar en AJL Nutrición. Si quieres volver, escríbenos por WhatsApp.</p>`),
  };
}

const ASUNTO = {
  nueva: (s) => `Suscripción nueva: ${s.nombre}`,
  ultimo: (s) => `${s.nombre} pagó su último cobro: ofrécele seguir`,
  cancelada_pagada: (s) => `${s.nombre} canceló su plan y pagó la penalidad`,
  cancelada_pendiente: (s, x) => (x.penalidad > 0 ? `${s.nombre} canceló su plan · penalidad pendiente ${soles(x.penalidad)}` : `${s.nombre} canceló su plan`),
  fallido: (s, x) => `Cobro fallido: ${s.nombre}${x.penalidad > 0 ? ` · penalidad ${soles(x.penalidad)}` : ''}`,
  penalidad_pagada: (s) => `${s.nombre} pagó su penalidad pendiente`,
};

export function correoEquipoSuscripcion(tipo, s, extra = {}) {
  const x = { penalidad: 0, ...extra };
  const titulo = condicionesSuscripcion(s.producto, s.duracion_meses)?.titulo ?? s.producto;
  return {
    subject: ASUNTO[tipo](s, x),
    html: marco(`
      <h2 style="color:${['fallido', 'cancelada_pendiente'].includes(tipo) ? '#9B2C2C' : '#173C2C'}">${esc(ASUNTO[tipo](s, x))}</h2>
      <ul style="padding-left:18px">
        <li>Plan: ${esc(titulo)}</li>
        <li>Cobros pagados: ${s.cobros_aprobados}${s.duracion_meses > 1 ? ` de ${s.duracion_meses}` : ''}</li>
        <li>WhatsApp: ${esc(s.whatsapp ?? '—')} · Documento: ${esc(s.dni ?? '—')}</li>
      </ul>
      ${tipo === 'fallido' || tipo === 'cancelada_pendiente' ? '<p>Si vuelve a reservar, la web le pedirá pagar la penalidad antes. También puedes escribirle.</p>' : ''}
      <p>Detalle en el panel, sección «Suscripciones».</p>`),
  };
}
```

- [ ] **Step 5: Correr y ver que pasa; suite completa**

Run: `node --test server/suscripciones/correos.test.mjs && npm test`
Expected: PASS (los tests de `correos.test.mjs` y `aviso-equipo.test.mjs` de reservas siguen verdes).

- [ ] **Step 6: Commit**

```bash
git add server/reservas/correos.mjs server/reservas/aviso-equipo.mjs server/suscripciones/correos.mjs server/suscripciones/correos.test.mjs
git commit -m "Suscripciones: recibo, baja y avisos al equipo"
```

---

### Task 6: Pago mensual en /reservar/ y procesar los avisos de Mercado Pago

**Files:**
- Modify: `server/reservas/catalogo.mjs` (`cotizar` con `forma`)
- Modify: `server/reservas/repo.mjs` (`crearRetencion` guarda `forma_pago`)
- Modify: `server/reservas/confirmar.mjs` (extraer `confirmarConPago`; `procesarPago` acepta `pago` ya leído)
- Create: `server/suscripciones/procesar.mjs`
- Modify: `server/handlers/reservas.mjs` (`handleApartar`, `handlePagar`, `handleEstado`, `handleWebhookMp`, `vista`)
- Test: `server/reservas/catalogo.test.mjs`, `server/suscripciones/procesar.test.mjs`, `server/handlers/reservas.test.mjs`

**Interfaces:**
- Consumes: Tasks 2 a 5.
- Produces:
  - `cotizar(producto, duracion, forma = 'completo')`: con `'mensual'` devuelve `{ titulo, monto_centimos (cuota), duracion_meses, peso: 1, requiereDni: true, forma: 'mensual', precio_mes_centimos, precio_3m_centimos, cobros }`; `null` si el plan no es mensual.
  - `confirmarConPago(deps, env, r, pago) → { estado }` en `confirmar.mjs` (lo que hoy hace `procesarPago` después de leer el pago).
  - `procesarPreapproval(deps, env, preapprovalId)`, `procesarCobro(deps, env, authorizedPaymentId)`, `sincronizarDeReserva(deps, env, reservaId)` en `server/suscripciones/procesar.mjs`.
  - `vista(r)` suma `forma_pago`.
  - Respuesta de `POST /api/reservas/pagar` con forma mensual: `{ ok: true, url: init_point }`. Con deuda: `409 { ok: false, motivo: 'penalidad', error, url }`.

- [ ] **Step 1: `cotizar` con forma: test que falla** (agregar a `server/reservas/catalogo.test.mjs`)

```js
test('pago mensual: cuota del paquete, penalidad y cobros; no aplica a pago único', () => {
  const c = cotizar('constancia', 3, 'mensual');
  assert.equal(c.monto_centimos, 36000);
  assert.equal(c.titulo, '2 sesiones al mes · 3 meses · pago mensual');
  assert.equal(c.forma, 'mensual');
  assert.equal(c.precio_mes_centimos, 44000);
  assert.equal(c.cobros, 3);
  assert.equal(cotizar('basico', 1, 'mensual'), null);
  assert.equal(cotizar('constancia', 3, 'cuotas'), null);
  assert.deepEqual(cotizar('constancia', 3, 'completo'), cotizar('constancia', 3));
});
```

Run: `node --test server/reservas/catalogo.test.mjs` → FAIL.

- [ ] **Step 2: Implementar `cotizar` con forma**

En `server/reservas/catalogo.mjs`:

```js
import { condicionesSuscripcion } from '../suscripciones/calculo.mjs';
```

y reemplazar la firma de `cotizar` por:

```js
// forma 'mensual' (spec 2026-10-27): la cuota del paquete, cobrada cada mes por Mercado Pago.
export function cotizar(producto, duracion, forma = 'completo') {
  if (forma === 'mensual') {
    const c = condicionesSuscripcion(producto, duracion);
    if (!c) return null;
    return { ...armar(c.titulo, c.cuota_centimos / 100, c.duracion_meses, 1), forma: 'mensual',
      precio_mes_centimos: c.precio_mes_centimos, precio_3m_centimos: c.precio_3m_centimos, cobros: c.cobros };
  }
  if (forma !== 'completo') return null;
```

(el resto del cuerpo de `cotizar` queda igual). Run: `node --test server/reservas/catalogo.test.mjs` → PASS.

- [ ] **Step 3: `crearRetencion` guarda la forma**

En `server/reservas/repo.mjs`, `crearRetencion`: agregar `forma_pago` a la lista de columnas del INSERT, como `?18`, con `r.forma_pago ?? 'completo'`:

```js
    `INSERT INTO reservas (id, token, producto, duracion_meses, monto_centimos, peso_tope, nutricionista_id,
       inicio_utc, fecha_lima, modalidad, estado, retencion_hasta, huella, creado_en, actualizado_en, variante, fin_utc, duracion_min, forma_pago)
     SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'apartada', ?11, ?14, ?12, ?12, ?15, ?16, ?17, ?18
```

y al `.bind(...)` agregar al final `r.forma_pago ?? 'completo'`.

- [ ] **Step 4: Extraer `confirmarConPago`**

En `server/reservas/confirmar.mjs`, partir `procesarPago` en dos. El cuerpo desde `const montoPagado = …` hasta el final pasa a:

```js
// Lo que pasa con un pago ya leído de Mercado Pago y su reserva. Lo usan el pago único
// (procesarPago) y el primer cobro de una suscripción (suscripciones/procesar.mjs).
export async function confirmarConPago(deps, env, r, pago) {
  const montoPagado = Math.round(Number(pago.transaction_amount) * 100);
  // … (el mismo código de hoy, sin cambios, hasta el return { estado: 'confirmada' })
}

export async function procesarPago(deps, env, paymentId, { reservaId = null, pago = null } = {}) {
  pago = pago ?? await deps.mp.obtenerPago(paymentId);
  const id = pago?.external_reference;
  if (!id || (reservaId && id !== reservaId)) return { estado: 'desconocido' };
  const r = await repo.reservaPorId(deps.db, id);
  if (!r) return { estado: 'desconocido' };
  return confirmarConPago(deps, env, r, pago);
}
```

Dentro de `confirmarConPago`, la variable `r` se reasigna (`r = await repo.reservaPorId(...)`): declarar el parámetro como `r` y usar `let actual = r` si el linter se queja; el comportamiento no cambia. En `finalizarConfirmacion`, cambiar `cotizar(r.producto, r.duracion_meses)` por `cotizar(r.producto, r.duracion_meses, r.forma_pago ?? 'completo')`.

Run: `npm test` → PASS (todos los tests de confirmar siguen verdes; es un refactor).

- [ ] **Step 5: Tests de `procesar.mjs` que fallan**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1DePrueba } from '../reservas/d1-prueba.mjs';
import { nutricionistas } from '../../src/data/nutricionistas.js';
import * as sus from './repo.mjs';
import * as repo from '../reservas/repo.mjs';
import { procesarCobro, procesarPreapproval, sincronizarDeReserva } from './procesar.mjs';

const t0 = new Date('2026-10-05T15:00:00Z');
const env = { PUBLIC_SITE_URL: 'https://www.ajlnutricion.com', NOTIFICATION_EMAIL: 'eq@x.pe',
  CORREOS_EQUIPO: JSON.stringify({ romina: 'r@x.pe', irene: 'i@x.pe', alejandro: 'a@x.pe' }) };

function armar({ cobros = {}, pagos = {}, pre = {} } = {}) {
  const correos = [];
  const canceladas = [];
  const d = {
    db: d1DePrueba(), nutricionistas, ahora: () => t0, correos, canceladas,
    sendEmail: async (c) => { correos.push(c); return true; },
    google: { listarEventos: async () => [], crearEvento: async () => ({ id: 'ev', meet: null }) },
    mp: {
      obtenerCobroSuscripcion: async (id) => cobros[id],
      obtenerPago: async (id) => pagos[id],
      obtenerSuscripcion: async (id) => pre[id],
      cancelarSuscripcion: async (id) => { canceladas.push(id); return {}; },
      buscarCobrosSuscripcion: async () => Object.values(cobros),
    },
  };
  return d;
}

async function reservaMensual(d) {
  await repo.crearRetencion(d.db, { id: 'r1', token: 'tr', producto: 'constancia', duracion_meses: 3, monto_centimos: 36000, peso_tope: 1,
    nutricionista_id: 'nico', inicio_utc: '2026-10-06T17:00:00Z', fecha_lima: '2026-10-06', modalidad: 'presencial', tope: 600, ahora: t0, forma_pago: 'mensual' });
  await repo.guardarDatosYPagar(d.db, { reserva: await repo.reservaPorId(d.db, 'r1'), condicionesVersion: 'v', novedades: false, ahora: t0,
    cliente: { nombre: 'Ana Pérez', nombres: 'Ana', apellido_paterno: 'Pérez', whatsapp: '+51987654321', email: 'ana@x.pe', dni: '12345678', tipo_documento: 'dni', fecha_nacimiento: '1990-05-04' } });
  await sus.crear(d.db, { id: 's1', token: 'ts', reserva_id: 'r1', producto: 'constancia', duracion_meses: 3, cuota_centimos: 36000, precio_mes_centimos: 44000,
    estado: 'pendiente', nombre: 'Ana Pérez', email: 'ana@x.pe', dni: '12345678', whatsapp: '+51987654321', mp_preapproval_id: 'pre1', creado_en: t0.toISOString() });
}
const cobro = (id, pagoId, status = 'processed') => ({ id, preapproval_id: 'pre1', status, transaction_amount: 360, currency_id: 'PEN', payment: { id: pagoId, status: 'approved' } });
const pago = (id, status = 'approved') => ({ id, status, transaction_amount: 360, currency_id: 'PEN', payment_method_id: 'visa', transaction_details: { net_received_amount: 345.5 } });

test('primer cobro: confirma la cita una sola vez aunque llegue por webhook y por la página de regreso', async () => {
  const d = armar({ cobros: { a1: cobro('a1', 'p1') }, pagos: { p1: pago('p1') } });
  await reservaMensual(d);
  await Promise.all([procesarCobro(d, env, 'a1'), sincronizarDeReserva(d, env, 'r1')]);
  assert.equal((await repo.reservaPorId(d.db, 'r1')).estado, 'confirmada');
  const s = await sus.porId(d.db, 's1');
  assert.equal(s.cobros_aprobados, 1);
  assert.equal(s.estado, 'activa');
  assert.equal(d.correos.filter((c) => /Recibimos tu pago/.test(c.subject)).length, 1);
  assert.equal(d.correos.filter((c) => /Suscripción nueva/.test(c.subject)).length, 1);
  const { neto_centimos } = await d.db.prepare("SELECT neto_centimos FROM pagos WHERE mp_payment_id = 'p1'").first();
  assert.equal(neto_centimos, 34550);
});

test('último cobro: termina, cancela en Mercado Pago y avisa una sola vez aunque el aviso se repita', async () => {
  const d = armar({ cobros: { a1: cobro('a1', 'p1'), a2: cobro('a2', 'p2'), a3: cobro('a3', 'p3') }, pagos: { p1: pago('p1'), p2: pago('p2'), p3: pago('p3') } });
  await reservaMensual(d);
  for (const id of ['a1', 'a2', 'a3', 'a3']) await procesarCobro(d, env, id);
  const s = await sus.porId(d.db, 's1');
  assert.equal(s.estado, 'terminada');
  assert.equal(s.cobros_aprobados, 3);
  assert.deepEqual(d.canceladas, ['pre1']);
  assert.equal(d.correos.filter((c) => /último cobro: ofrécele/.test(c.subject)).length, 1);
});

test('cobro que Mercado Pago dejó de reintentar: cobro_fallido con penalidad pendiente y aviso', async () => {
  const d = armar({ cobros: { a1: cobro('a1', 'p1'), a2: { ...cobro('a2', 'p2', 'cancelled'), payment: { id: 'p2', status: 'rejected' } } },
    pagos: { p1: pago('p1'), p2: pago('p2', 'rejected') } });
  await reservaMensual(d);
  await procesarCobro(d, env, 'a1');
  await procesarCobro(d, env, 'a2');
  const s = await sus.porId(d.db, 's1');
  assert.equal(s.estado, 'cobro_fallido');
  assert.equal(s.penalidad_estado, 'pendiente');
  assert.deepEqual(d.canceladas, ['pre1']);
  assert.ok(d.correos.some((c) => c.subject === 'Cobro fallido: Ana Pérez · penalidad S/80'));
});

test('el paciente cancela desde Mercado Pago a mitad: penalidad pendiente, baja y aviso', async () => {
  const d = armar({ cobros: { a1: cobro('a1', 'p1') }, pagos: { p1: pago('p1') }, pre: { pre1: { id: 'pre1', status: 'cancelled', external_reference: 's1' } } });
  await reservaMensual(d);
  await procesarCobro(d, env, 'a1');
  await procesarPreapproval(d, env, 'pre1');
  await procesarPreapproval(d, env, 'pre1');
  const s = await sus.porId(d.db, 's1');
  assert.equal(s.motivo_cancelacion, 'paciente_mp');
  assert.equal(s.penalidad_estado, 'pendiente');
  assert.equal(d.correos.filter((c) => /quedó cancelado/.test(c.subject)).length, 1);
});

test('un cobro de una suscripción que no es nuestra se ignora', async () => {
  const d = armar({ cobros: { z: { ...cobro('z', 'pz'), preapproval_id: 'otra' } } });
  assert.deepEqual(await procesarCobro(d, env, 'z'), { estado: 'desconocido' });
});
```

Run: `node --test server/suscripciones/procesar.test.mjs` → FAIL (no existe el módulo).

- [ ] **Step 6: Implementar `server/suscripciones/procesar.mjs`**

```js
// Qué pasa cuando Mercado Pago avisa algo de una suscripción. Lo llaman el webhook
// y, de respaldo, la página de regreso. Todo es idempotente: el que gana el UPDATE
// manda los correos. Los estados de Mercado Pago se confirmaron en la Task 1
// (docs/superpowers/notas/2026-10-28-mp-suscripciones-prueba.md).
import * as sus from './repo.mjs';
import * as repo from '../reservas/repo.mjs';
import { confirmarConPago } from '../reservas/confirmar.mjs';
import { condicionesSuscripcion, esUltimoCobro, penalidadAlCancelar } from './calculo.mjs';
import { correoRecibo, correoBaja, correoEquipoSuscripcion } from './correos.mjs';
import { avisarFijas } from '../reservas/aviso-equipo.mjs';
import { siteUrl } from '../http.mjs';

// authorized payment que Mercado Pago ya no reintentará.
export const ESTADO_COBRO_FALLIDO = 'cancelled';
const remitente = (env) => env.NEWSLETTER_FROM || 'AJL Nutrición <hola@ajlnutricion.com>';
const titulo = (s) => condicionesSuscripcion(s.producto, s.duracion_meses)?.titulo ?? s.producto;
export const urlCancelar = (env, s) => `${siteUrl(env)}/suscripcion/cancelar/?s=${s.token}`;

async function alPaciente(deps, env, s, correo) {
  if (!s.email) return;
  try {
    await deps.sendEmail({ from: remitente(env), to: s.email, ...correo });
  } catch (e) {
    console.error('correo suscripción', e);
  }
}

// Avisos de una baja ya escrita en la base (quien la escribió es quien avisa).
export async function avisarBaja(deps, env, id, { tipoEquipo, penalidad, penalidadPagada = false }) {
  const s = await sus.porId(deps.db, id);
  await Promise.all([
    alPaciente(deps, env, s, correoBaja({ nombre: s.nombre?.split(' ')[0] ?? '', titulo: titulo(s), penalidad, penalidadPagada })),
    avisarFijas(deps, env, correoEquipoSuscripcion(tipoEquipo, s, { penalidad })),
  ]);
}

async function cancelarEnMp(deps, s) {
  try {
    await deps.mp.cancelarSuscripcion(s.mp_preapproval_id);
  } catch (e) {
    console.error('cancelar en Mercado Pago', s.id, e);
  }
}

export async function procesarCobro(deps, env, authorizedId) {
  const ap = await deps.mp.obtenerCobroSuscripcion(authorizedId);
  const s = ap?.preapproval_id ? await sus.porPreapproval(deps.db, String(ap.preapproval_id)) : null;
  if (!s) return { estado: 'desconocido' };
  const pagoId = ap.payment?.id ? String(ap.payment.id) : null;
  const pago = pagoId ? await deps.mp.obtenerPago(pagoId) : null;
  const estado = pago?.status ?? ap.payment?.status ?? 'pending';
  const neto = Number(pago?.transaction_details?.net_received_amount);
  const { nuevoAprobado, numero } = await sus.registrarCobro(deps.db, {
    suscripcionId: s.id, mpPaymentId: pagoId ?? `ap-${ap.id}`, estado, montoCentimos: Math.round(Number(ap.transaction_amount) * 100),
    netoCentimos: neto > 0 ? Math.round(neto * 100) : null, metodo: pago?.payment_method_id ?? null, ahora: deps.ahora(),
  });

  if (nuevoAprobado) {
    const actual = await sus.porId(deps.db, s.id);
    if (numero === 1 && s.reserva_id) {
      const r = await repo.reservaPorId(deps.db, s.reserva_id);
      if (r) await confirmarConPago(deps, env, r, pago);
    }
    await alPaciente(deps, env, actual, correoRecibo({ nombre: actual.nombre?.split(' ')[0] ?? '', titulo: titulo(actual), numero,
      cobros: actual.duracion_meses > 1 ? actual.duracion_meses : null, cuota: actual.cuota_centimos, urlCancelar: urlCancelar(env, actual),
      penalidadHoy: penalidadAlCancelar(actual) }));
    if (numero === 1) await avisarFijas(deps, env, correoEquipoSuscripcion('nueva', actual));
    if (esUltimoCobro(actual, numero) && await sus.marcarTerminada(deps.db, s.id, deps.ahora())) {
      await cancelarEnMp(deps, actual);
      await avisarFijas(deps, env, correoEquipoSuscripcion('ultimo', actual));
    }
    return { estado: 'aprobado', numero };
  }

  if (estado !== 'approved' && ap.status === ESTADO_COBRO_FALLIDO) {
    const res = await sus.cancelar(deps.db, { id: s.id, motivo: 'cobro_fallido', ahora: deps.ahora() });
    if (res.cambio) {
      await cancelarEnMp(deps, s);
      await avisarBaja(deps, env, s.id, { tipoEquipo: 'fallido', penalidad: res.penalidad_centimos });
    }
    return { estado: 'cobro_fallido' };
  }
  return { estado };
}

export async function procesarPreapproval(deps, env, preapprovalId) {
  const p = await deps.mp.obtenerSuscripcion(preapprovalId);
  const s = (await sus.porPreapproval(deps.db, String(p?.id ?? ''))) ?? (p?.external_reference ? await sus.porId(deps.db, p.external_reference) : null);
  if (!s) return { estado: 'desconocido' };
  if (!s.mp_preapproval_id && p.id) await sus.guardarPreapproval(deps.db, s.id, String(p.id), deps.ahora());
  if (p.status === 'cancelled') {
    const res = await sus.cancelar(deps.db, { id: s.id, motivo: 'paciente_mp', ahora: deps.ahora() });
    if (res.cambio) await avisarBaja(deps, env, s.id, { tipoEquipo: 'cancelada_pendiente', penalidad: res.penalidad_centimos });
    return { estado: 'cancelada' };
  }
  return { estado: p.status };
}

// Respaldo de la página de regreso: revisa los cobros de la suscripción de esa reserva.
export async function sincronizarDeReserva(deps, env, reservaId) {
  const s = await sus.porReserva(deps.db, reservaId);
  if (!s?.mp_preapproval_id) return;
  for (const ap of await deps.mp.buscarCobrosSuscripcion(s.mp_preapproval_id)) {
    await procesarCobro(deps, env, String(ap.id));
  }
}
```

Run: `node --test server/suscripciones/procesar.test.mjs` → PASS.

- [ ] **Step 7: Handlers de reservas: tests que fallan** (agregar a `server/handlers/reservas.test.mjs`; `deps()` del archivo suma `crearSuscripcion` al `mp` de prueba)

En la función `deps` del test, dentro de `mp`, agregar:

```js
      crearSuscripcion: async (a) => { creadas.push(a); return { id: 'pre1', init_point: 'https://mp/sus' }; },
```

con `const creadas = [];` al inicio de `deps` y `creadas` en el objeto que devuelve. Tests nuevos:

```js
import * as sus from '../suscripciones/repo.mjs';

test('apartar con pago mensual: cotiza la cuota y guarda la forma', async () => {
  const d = deps();
  const r = await apartar(d, { forma: 'mensual' });
  const j = await r.json();
  assert.equal(j.monto_centimos, 36000);
  assert.equal(j.forma, 'mensual');
  assert.equal(j.precio_mes_centimos, 44000);
  assert.equal((await repo.reservaPorToken(d.db, j.token)).forma_pago, 'mensual');
  assert.equal((await apartar(deps(), { producto: 'basico', duracion: 1, forma: 'mensual' })).status, 400);
});

test('pagar con pago mensual: pide aceptar la suscripción, crea la suscripción y abre Mercado Pago', async () => {
  const d = deps();
  const { token } = await (await apartar(d, { forma: 'mensual' })).json();
  const sin = await handlePagar(post('/api/reservas/pagar', { token, ...datos }), env, d);
  assert.equal(sin.status, 400);
  const r = await handlePagar(post('/api/reservas/pagar', { token, ...datos, acepto_suscripcion: true }), env, d);
  assert.deepEqual(await r.json(), { ok: true, url: 'https://mp/sus' });
  const reserva = await repo.reservaPorToken(d.db, token);
  const s = await sus.porReserva(d.db, reserva.id);
  assert.equal(s.cuota_centimos, 36000);
  assert.equal(s.mp_preapproval_id, 'pre1');
  assert.equal(s.dni, '12345678');
  assert.equal(d.creadas[0].cuotaCentimos, 36000);
  assert.equal(d.creadas[0].urlRetorno, `https://www.ajlnutricion.com/reservar/listo/?r=${token}`);
  assert.ok(d.creadas[0].finEn);
});

test('pagar con una penalidad pendiente en ese documento: 409 con el link para pagarla', async () => {
  const d = deps();
  await sus.crear(d.db, { id: 'old', token: 'told', producto: 'constancia', duracion_meses: 3, cuota_centimos: 36000, precio_mes_centimos: 44000, penalidad_centimos: 8000,
    estado: 'cancelada', penalidad_estado: 'pendiente', dni: '12345678', creado_en: t0.toISOString() });
  const { token } = await (await apartar(d)).json();
  const r = await handlePagar(post('/api/reservas/pagar', { token, ...datos }), env, d);
  const j = await r.json();
  assert.equal(r.status, 409);
  assert.equal(j.motivo, 'penalidad');
  assert.equal(j.url, 'https://www.ajlnutricion.com/suscripcion/cancelar/?s=told');
  assert.match(j.error, /S\/80/);
});

test('webhook de suscripción: verifica firma y despacha por tipo', async () => {
  const llamados = [];
  const d = deps({ mp: { obtenerSuscripcion: async (id) => { llamados.push(['pre', id]); return { id, status: 'authorized' }; },
    obtenerCobroSuscripcion: async (id) => { llamados.push(['ap', id]); return { id, preapproval_id: 'nada' }; } } });
  const firmar = (dataId) => {
    const ts = '1700000000';
    const v1 = createHmac('sha256', 'sec').update(`id:${dataId};request-id:rq;ts:${ts};`).digest('hex');
    return { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': 'rq' };
  };
  for (const [type, id] of [['subscription_preapproval', 'pre9'], ['subscription_authorized_payment', '77']]) {
    const r = await handleWebhookMp(post(`/api/reservas/webhook-mp?type=${type}&data.id=${id}`, { type, data: { id } }, firmar(id)), env, d);
    assert.equal(r.status, 200);
  }
  assert.deepEqual(llamados, [['pre', 'pre9'], ['ap', '77']]);
  const mal = await handleWebhookMp(post('/api/reservas/webhook-mp?type=subscription_preapproval&data.id=x', {}, { 'x-signature': 'ts=1,v1=00' }), env, d);
  assert.equal(mal.status, 401);
});
```

Run: `node --test server/handlers/reservas.test.mjs` → FAIL.

- [ ] **Step 8: Implementar en `server/handlers/reservas.mjs`**

Imports nuevos:

```js
import * as sus from '../suscripciones/repo.mjs';
import { procesarCobro, procesarPreapproval, sincronizarDeReserva } from '../suscripciones/procesar.mjs';
import { procesarPagoPenalidad } from '../suscripciones/penalidad.mjs';
import { finDeCobros } from '../suscripciones/calculo.mjs';
import { formatoSoles } from '../../src/data/duraciones.js';
```

(`procesarPagoPenalidad` lo crea la Task 7; hasta entonces, crear `server/suscripciones/penalidad.mjs` con `export async function procesarPagoPenalidad() { return { estado: 'desconocido' }; }` para que el import no falle, y la Task 7 lo reemplaza.)

En `handleApartar`:

```js
  const forma = d.forma === 'mensual' ? 'mensual' : 'completo';
  const precio = cotizar(d.producto, Number(d.duracion), forma);
```

pasar `forma_pago: forma` a `repo.crearRetencion`, y sumar a la respuesta `forma, precio_mes_centimos: precio.precio_mes_centimos ?? null, precio_3m_centimos: precio.precio_3m_centimos ?? null, cobros: precio.cobros ?? null`.

En `handlePagar`, después de `const { cliente } = v;`:

```js
  if (r.forma_pago === 'mensual' && d.acepto_suscripcion !== true) return bad(400, 'Para continuar, acepta los cobros mensuales automáticos.');
  const deuda = await sus.deudaPorDni(deps.db, cliente.dni);
  if (deuda) {
    return bad(409, `Tienes una penalidad pendiente de ${formatoSoles(deuda.penalidad_centimos / 100)} de tu plan anterior. Págala para continuar.`,
      { motivo: 'penalidad', url: `${siteUrl(env)}/suscripcion/cancelar/?s=${deuda.token}` });
  }
```

y reemplazar el bloque `try { const pref = … }` por:

```js
  try {
    if (r.forma_pago === 'mensual') {
      const precioM = cotizar(r.producto, r.duracion_meses, 'mensual');
      const existente = await sus.porReserva(deps.db, r.id);
      const id = existente?.id ?? crypto.randomUUID();
      if (!existente) {
        await sus.crear(deps.db, { id, token: randomToken(), reserva_id: r.id, nombre: cliente.nombre, email: cliente.email, dni: cliente.dni,
          whatsapp: cliente.whatsapp, producto: r.producto, duracion_meses: r.duracion_meses, cuota_centimos: r.monto_centimos,
          precio_mes_centimos: precioM.precio_mes_centimos, precio_3m_centimos: precioM.precio_3m_centimos, estado: 'pendiente', acepto_condiciones_version: CONDICIONES_VERSION, creado_en: ahora.toISOString() });
      }
      const pre = await deps.mp.crearSuscripcion({ suscripcionId: id, titulo: precioM.titulo, cuotaCentimos: r.monto_centimos, email: cliente.email,
        urlRetorno: `${siteUrl(env)}/reservar/listo/?r=${r.token}`, finEn: finDeCobros(ahora, precioM.cobros) });
      await sus.guardarPreapproval(deps.db, id, pre.id, ahora);
      return json(200, { ok: true, url: pre.init_point });
    }
    const pref = await deps.mp.crearPreferencia({
      // … igual que hoy
    });
    await repo.guardarPreferencia(deps.db, r.id, pref.id, ahora);
    return json(200, { ok: true, url: pref.init_point });
  } catch (e) {
    console.error('pagar', e);
    return bad(503, 'No pudimos abrir Mercado Pago. Intenta de nuevo.');
  }
```

En `handleEstado`, antes del `return`:

```js
  if (r.forma_pago === 'mensual' && !['confirmada', 'pagada_sin_hora'].includes(r.estado) && q.get('preapproval_id')) {
    try {
      await sincronizarDeReserva(deps, env, r.id);
      r = await repo.reservaPorToken(deps.db, r.token);
    } catch (e) {
      console.error('estado/suscripción', e);
    }
  }
```

En `vista`: `const precio = cotizar(r.producto, r.duracion_meses, r.forma_pago ?? 'completo');` y sumar `forma_pago: r.forma_pago ?? 'completo'` al objeto.

En `handleWebhookMp`, reemplazar desde `const tipo = …` hasta el final del `try`:

```js
  const TIPOS = { payment: 'payment', subscription_preapproval: 'preapproval', preapproval: 'preapproval',
    subscription_authorized_payment: 'cobro', authorized_payment: 'cobro' };
  const tipo = TIPOS[q.get('type') || q.get('topic') || cuerpo.type];
  const dataId = String(q.get('data.id') || q.get('id') || cuerpo?.data?.id || '');
  if (!tipo || !dataId) return json(200, { ok: true, ignorado: true });
  if (!env.MP_WEBHOOK_SECRET) {
    console.error('Falta MP_WEBHOOK_SECRET');
    return bad(503, 'Webhook sin configurar');
  }
  const valida = await firmaValida({ xSignature: request.headers.get('x-signature'), xRequestId: request.headers.get('x-request-id'),
    dataId, secreto: env.MP_WEBHOOK_SECRET });
  if (!valida) return bad(401, 'Firma inválida');
  try {
    if (tipo === 'preapproval') await procesarPreapproval(deps, env, dataId);
    else if (tipo === 'cobro') await procesarCobro(deps, env, dataId);
    else {
      const pago = await deps.mp.obtenerPago(dataId);
      if (String(pago?.external_reference ?? '').startsWith('pen-')) await procesarPagoPenalidad(deps, env, pago);
      else await procesarPago(deps, env, dataId, { pago });
    }
    return json(200, { ok: true });
  } catch (e) {
    console.error('webhook', e);
    return bad(500, 'Error procesando el aviso'); // Mercado Pago reintenta
  }
```

Import nuevo: `import { randomToken } from '../tokens.mjs';` ya existe; `CONDICIONES_VERSION` ya se importa.

- [ ] **Step 9: Correr y ver que pasa; suite completa**

Run: `node --test server/handlers/reservas.test.mjs && npm test`
Expected: PASS. Los tests de webhook de pagos únicos siguen verdes (el `type=payment` sigue igual).

- [ ] **Step 10: Commit**

```bash
git add server/reservas/catalogo.mjs server/reservas/catalogo.test.mjs server/reservas/repo.mjs server/reservas/confirmar.mjs \
  server/suscripciones/procesar.mjs server/suscripciones/procesar.test.mjs server/suscripciones/penalidad.mjs \
  server/handlers/reservas.mjs server/handlers/reservas.test.mjs
git commit -m "Suscripciones: pago mensual en /reservar/ y avisos de Mercado Pago"
```

---

### Task 7: «Cancelar mi plan» y pago de la penalidad

**Files:**
- Modify: `server/suscripciones/penalidad.mjs` (reemplaza el marcador de la Task 6)
- Create: `server/handlers/suscripciones.mjs` (`handleSuscripcionCancelar`)
- Create: `functions/api/suscripciones/cancelar.js`
- Test: `server/suscripciones/penalidad.test.mjs`, `server/handlers/suscripciones.test.mjs`

**Interfaces:**
- Consumes: `sus.*` (Task 4), `avisarBaja`, `urlCancelar` (Task 6), `deps.mp.crearPreferencia` (existente), `deps.mp.cancelarSuscripcion` (Task 3).
- Produces:
  - `procesarPagoPenalidad(deps, env, pago) → { estado }`.
  - `GET /api/suscripciones/cancelar?s=<token>` → `{ ok, modo: 'activa'|'deuda'|'cerrada', titulo, cobros_aprobados, duracion_meses, cuota_centimos, penalidad_centimos, detalle }` (la penalidad calculada para hoy y su detalle).
  - `POST /api/suscripciones/cancelar { s, pagar: true }` → `{ ok, url }` (preferencia de la penalidad) o, sin penalidad, cancela y `{ ok, cancelada: true }`.
  - `POST /api/suscripciones/cancelar { s, pagar: false }` → `{ ok, cancelada: true, penalidad_centimos }`.

- [ ] **Step 1: Tests que fallan**

`server/suscripciones/penalidad.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1DePrueba } from '../reservas/d1-prueba.mjs';
import * as sus from './repo.mjs';
import { procesarPagoPenalidad } from './penalidad.mjs';
import { procesarPreapproval } from './procesar.mjs';

const t0 = new Date('2026-11-20T15:00:00Z');
const env = { PUBLIC_SITE_URL: 'https://www.ajlnutricion.com', CORREOS_EQUIPO: JSON.stringify({ romina: 'r@x.pe' }) };
function armar() {
  const correos = []; const canceladas = [];
  return { db: d1DePrueba(), ahora: () => t0, correos, canceladas, sendEmail: async (c) => { correos.push(c); return true; },
    mp: { cancelarSuscripcion: async (id) => { canceladas.push(id); }, obtenerSuscripcion: async (id) => ({ id, status: 'cancelled' }) } };
}
const activa = (o = {}) => ({ id: 's1', token: 'ts', producto: 'constancia', duracion_meses: 3, cuota_centimos: 36000, precio_mes_centimos: 44000, penalidad_centimos: 8000,
  estado: 'activa', cobros_aprobados: 1, nombre: 'Ana Pérez', email: 'ana@x.pe', dni: '12345678', mp_preapproval_id: 'pre1', creado_en: t0.toISOString(), ...o });
const pagoPen = (o = {}) => ({ id: 'pp1', status: 'approved', external_reference: 'pen-s1', transaction_amount: 80, currency_id: 'PEN', ...o });

test('penalidad pagada con el botón: marca pagada, cancela en Mercado Pago y manda una sola baja', async () => {
  const d = armar();
  await sus.crear(d.db, activa());
  await procesarPagoPenalidad(d, env, pagoPen());
  await procesarPagoPenalidad(d, env, pagoPen());
  const s = await sus.porId(d.db, 's1');
  assert.equal(s.estado, 'cancelada');
  assert.equal(s.penalidad_estado, 'pagada');
  assert.equal(s.motivo_cancelacion, 'paciente_boton');
  assert.deepEqual(d.canceladas, ['pre1']);
  assert.equal(d.correos.filter((c) => /quedó cancelado/.test(c.subject)).length, 1);
});

test('el aviso de Mercado Pago de la cancelación llega antes que el del pago: una baja, penalidad pagada', async () => {
  const d = armar();
  await sus.crear(d.db, activa());
  await procesarPreapproval(d, env, 'pre1');
  await procesarPagoPenalidad(d, env, pagoPen());
  const s = await sus.porId(d.db, 's1');
  assert.equal(s.penalidad_estado, 'pagada');
  assert.equal(d.correos.filter((c) => /quedó cancelado/.test(c.subject)).length, 1);
  assert.ok(d.correos.some((c) => /pagó su penalidad pendiente/.test(c.subject)));
});

test('monto distinto o pago no aprobado: no marca nada', async () => {
  const d = armar();
  await sus.crear(d.db, activa());
  await procesarPagoPenalidad(d, env, pagoPen({ transaction_amount: 1 }));
  await procesarPagoPenalidad(d, env, pagoPen({ status: 'rejected' }));
  assert.equal((await sus.porId(d.db, 's1')).penalidad_estado, 'no_aplica');
});
```

`server/handlers/suscripciones.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1DePrueba } from '../reservas/d1-prueba.mjs';
import * as sus from '../suscripciones/repo.mjs';
import { handleSuscripcionCancelar } from './suscripciones.mjs';

const t0 = new Date('2026-11-20T15:00:00Z');
const env = { PUBLIC_SITE_URL: 'https://www.ajlnutricion.com' };
function deps() {
  const prefs = []; const canceladas = [];
  return { db: d1DePrueba(), ahora: () => t0, prefs, canceladas, sendEmail: async () => true,
    mp: { crearPreferencia: async (a) => { prefs.push(a); return { id: 'pref', init_point: 'https://mp/pen' }; }, cancelarSuscripcion: async (id) => { canceladas.push(id); } } };
}
const get = (q) => new Request(`https://x.test/api/suscripciones/cancelar?${q}`);
const post = (b) => new Request('https://x.test/api/suscripciones/cancelar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
const fila = (o = {}) => ({ id: 's1', token: 'ts', producto: 'constancia', duracion_meses: 3, cuota_centimos: 36000, precio_mes_centimos: 44000,
  estado: 'activa', cobros_aprobados: 1, nombre: 'Ana', email: 'a@x.pe', dni: '1', mp_preapproval_id: 'pre1', creado_en: t0.toISOString(), ...o });

test('GET: activa a mitad muestra la penalidad; token desconocido 404', async () => {
  const d = deps();
  await sus.crear(d.db, fila());
  const j = await (await handleSuscripcionCancelar(get('s=ts'), env, d)).json();
  assert.equal(j.modo, 'activa');
  assert.equal(j.penalidad_centimos, 8000);
  assert.equal(j.detalle, '1 mes a S/440, menos los S/360 que pagaste');
  assert.equal((await handleSuscripcionCancelar(get('s=zz'), env, d)).status, 404);
});

test('POST pagar: crea la preferencia de la penalidad con referencia pen-<id>', async () => {
  const d = deps();
  await sus.crear(d.db, fila());
  const j = await (await handleSuscripcionCancelar(post({ s: 'ts', pagar: true }), env, d)).json();
  assert.deepEqual(j, { ok: true, url: 'https://mp/pen' });
  assert.equal(d.prefs[0].reservaId, 'pen-s1');
  assert.equal(d.prefs[0].montoCentimos, 8000);
  assert.equal((await sus.porId(d.db, 's1')).penalidad_centimos, 8000); // queda cotizada para validar el pago
  assert.equal(d.prefs[0].urlRetorno, 'https://www.ajlnutricion.com/suscripcion/cancelar/?s=ts&pago=1');
});

test('POST sin pagar: cancela ya en Mercado Pago y deja la penalidad pendiente', async () => {
  const d = deps();
  await sus.crear(d.db, fila());
  const j = await (await handleSuscripcionCancelar(post({ s: 'ts', pagar: false }), env, d)).json();
  assert.deepEqual(j, { ok: true, cancelada: true, penalidad_centimos: 8000 });
  assert.deepEqual(d.canceladas, ['pre1']);
  assert.equal((await sus.porId(d.db, 's1')).penalidad_estado, 'pendiente');
});

test('si Mercado Pago no cancela, no se marca la baja y se responde 503', async () => {
  const d = deps();
  d.mp.cancelarSuscripcion = async () => { throw new Error('caído'); };
  await sus.crear(d.db, fila());
  assert.equal((await handleSuscripcionCancelar(post({ s: 'ts', pagar: false }), env, d)).status, 503);
  assert.equal((await sus.porId(d.db, 's1')).estado, 'activa');
});

test('deuda: modo deuda y solo se puede pagar; en el último mes no hay penalidad', async () => {
  const d = deps();
  await sus.crear(d.db, fila({ estado: 'cancelada', penalidad_estado: 'pendiente' }));
  assert.equal((await (await handleSuscripcionCancelar(get('s=ts'), env, d)).json()).modo, 'deuda');
  assert.equal((await handleSuscripcionCancelar(post({ s: 'ts', pagar: false }), env, d)).status, 409);
  await sus.crear(d.db, fila({ id: 's2', token: 't2', cobros_aprobados: 3 }));
  assert.equal((await (await handleSuscripcionCancelar(get('s=t2'), env, d)).json()).penalidad_centimos, 0);
});
```

Run: `node --test server/suscripciones/penalidad.test.mjs server/handlers/suscripciones.test.mjs` → FAIL.

- [ ] **Step 2: Implementar `server/suscripciones/penalidad.mjs`**

```js
// Penalidad por cancelar a mitad del paquete (spec 2026-10-27). Se paga con una
// preferencia de pago único cuyo external_reference es «pen-<id de suscripción>».
// Al aprobarse: penalidad pagada y, si la suscripción seguía activa, se cancela.
import * as sus from './repo.mjs';
import { avisarBaja } from './procesar.mjs';
import { avisarFijas } from '../reservas/aviso-equipo.mjs';
import { correoEquipoSuscripcion } from './correos.mjs';

export async function procesarPagoPenalidad(deps, env, pago) {
  const s = await sus.porId(deps.db, String(pago.external_reference).slice(4));
  if (!s || pago.status !== 'approved') return { estado: 'ignorado' };
  if (pago.currency_id !== 'PEN' || Math.round(Number(pago.transaction_amount) * 100) !== s.penalidad_centimos) {
    console.error('penalidad con monto distinto', s.id, pago.id);
    return { estado: 'monto_invalido' };
  }
  if (!(await sus.marcarPenalidadPagada(deps.db, { id: s.id, mpPaymentId: String(pago.id), ahora: deps.ahora() }))) return { estado: 'ya_pagada' };
  if (['pendiente', 'activa'].includes(s.estado)) {
    try {
      await deps.mp.cancelarSuscripcion(s.mp_preapproval_id);
    } catch (e) {
      console.error('cancelar tras penalidad', s.id, e);
    }
    const res = await sus.cancelar(deps.db, { id: s.id, motivo: 'paciente_boton', ahora: deps.ahora() });
    if (res.cambio) {
      await avisarBaja(deps, env, s.id, { tipoEquipo: 'cancelada_pagada', penalidad: s.penalidad_centimos, penalidadPagada: true });
      return { estado: 'cancelada' };
    }
  }
  await avisarFijas(deps, env, correoEquipoSuscripcion('penalidad_pagada', await sus.porId(deps.db, s.id)));
  return { estado: 'pagada' };
}
```

- [ ] **Step 3: Implementar el handler** (`server/handlers/suscripciones.mjs`)

```js
// ─── Suscripciones, lado del paciente ───────────────────────────────────────
// GET  /api/suscripciones/cancelar?s=   datos de «Cancelar mi plan»
// POST /api/suscripciones/cancelar      { s, pagar } paga la penalidad o cancela sin pagar
import { json, readJson, siteUrl } from '../http.mjs';
import * as sus from '../suscripciones/repo.mjs';
import { penalidadAlCancelar, detallePenalidad, condicionesSuscripcion } from '../suscripciones/calculo.mjs';
import { avisarBaja } from '../suscripciones/procesar.mjs';

const bad = (status, error, extra = {}) => json(status, { ok: false, error, ...extra });
const titulo = (s) => condicionesSuscripcion(s.producto, s.duracion_meses)?.titulo ?? s.producto;

function modo(s) {
  if (['pendiente', 'activa'].includes(s.estado)) return 'activa';
  return s.penalidad_estado === 'pendiente' ? 'deuda' : 'cerrada';
}
const penalidadDe = (s) => (modo(s) === 'deuda' ? s.penalidad_centimos : modo(s) === 'activa' ? penalidadAlCancelar(s) : 0);

async function cobrarPenalidad(env, deps, s) {
  const ahora = deps.ahora();
  // En una activa la penalidad se calcula hoy y se guarda: el webhook valida el pago contra ese monto.
  const monto = modo(s) === 'deuda' ? s.penalidad_centimos : penalidadAlCancelar(s);
  if (modo(s) === 'activa') await sus.cotizarPenalidad(deps.db, s.id, monto, ahora);
  const pref = await deps.mp.crearPreferencia({
    reservaId: `pen-${s.id}`, titulo: `Penalidad por cancelar · ${titulo(s)}`, montoCentimos: monto, email: s.email, nombre: s.nombre,
    venceEn: new Date(ahora.getTime() + 24 * 3600000), ahora, urlRetorno: `${siteUrl(env)}/suscripcion/cancelar/?s=${s.token}&pago=1`,
    urlNotificacion: `${siteUrl(env)}/api/reservas/webhook-mp`,
  });
  return json(200, { ok: true, url: pref.init_point });
}

async function cancelarYa(env, deps, s) {
  try {
    if (s.mp_preapproval_id) await deps.mp.cancelarSuscripcion(s.mp_preapproval_id);
  } catch (e) {
    console.error('cancelar en Mercado Pago', s.id, e);
    return bad(503, 'No pudimos cancelar en este momento. Intenta de nuevo en unos minutos o escríbenos por WhatsApp.');
  }
  const res = await sus.cancelar(deps.db, { id: s.id, motivo: 'paciente_boton', ahora: deps.ahora() });
  if (res.cambio) await avisarBaja(deps, env, s.id, { tipoEquipo: 'cancelada_pendiente', penalidad: res.penalidad_centimos });
  return json(200, { ok: true, cancelada: true, penalidad_centimos: res.penalidad_centimos });
}

export async function handleSuscripcionCancelar(request, env, deps) {
  if (!['GET', 'POST'].includes(request.method)) return bad(405, 'Método no permitido');
  const d = request.method === 'POST' ? await readJson(request) : Object.fromEntries(new URL(request.url).searchParams);
  const s = typeof d.s === 'string' && d.s ? await sus.porToken(deps.db, d.s) : null;
  if (!s) return bad(404, 'No encontramos tu plan.');
  const m = modo(s);
  const penalidad = penalidadDe(s);
  if (request.method === 'GET') {
    return json(200, { ok: true, modo: m, titulo: titulo(s), cobros_aprobados: s.cobros_aprobados, duracion_meses: s.duracion_meses,
      cuota_centimos: s.cuota_centimos, penalidad_centimos: penalidad, detalle: m === 'activa' ? detallePenalidad(s) : '' });
  }
  try {
    if (m === 'cerrada') return bad(409, 'Tu plan ya está cerrado. No tienes nada pendiente.');
    if (m === 'deuda') return d.pagar === true ? await cobrarPenalidad(env, deps, s) : bad(409, 'Tu plan ya está cancelado. Solo queda pagar la penalidad.');
    if (d.pagar === true && penalidad > 0) return await cobrarPenalidad(env, deps, s);
    return await cancelarYa(env, deps, s);
  } catch (e) {
    console.error('cancelar plan', e);
    return bad(503, 'No pudimos abrir Mercado Pago. Intenta de nuevo.');
  }
}
```

`functions/api/suscripciones/cancelar.js`:

```js
import { handleSuscripcionCancelar } from '../../../server/handlers/suscripciones.mjs';
import { makeReservasDeps } from '../../../server/reservas/deps.mjs';

export const onRequest = (ctx) => handleSuscripcionCancelar(ctx.request, ctx.env, makeReservasDeps(ctx.env, ctx));
```

- [ ] **Step 4: Correr y ver que pasa; suite completa**

Run: `node --test server/suscripciones/penalidad.test.mjs server/handlers/suscripciones.test.mjs && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/suscripciones/penalidad.mjs server/suscripciones/penalidad.test.mjs server/handlers/suscripciones.mjs \
  server/handlers/suscripciones.test.mjs functions/api/suscripciones/cancelar.js
git commit -m "Suscripciones: «Cancelar mi plan» con pago de penalidad"
```

---

### Task 8: Link de suscripción y panel (servidor)

**Files:**
- Modify: `server/handlers/suscripciones.mjs` (`handleSuscripcionLink`, `handleSuscripcionEstado`)
- Create: `server/handlers/equipo-suscripciones.mjs`
- Create: `functions/api/suscripciones/link.js`, `functions/api/suscripciones/estado.js`, `functions/api/equipo/suscripciones.js`, `functions/api/equipo/suscripciones-penalidad.js`
- Test: `server/handlers/suscripciones.test.mjs`, `server/handlers/equipo-suscripciones.test.mjs`

**Interfaces:**
- Consumes: `sus.*`, `condicionesSuscripcion`, `finDeCobros`, `deps.mp.crearSuscripcion`, `sha256Hex`, `randomToken`.
- Produces:
  - `POST /api/equipo/suscripciones { nombre, producto, meses }` → `{ ok, url, vence_en, titulo, cuota_centimos, precio_mes_centimos }`; URL `…/suscribirse/?l=<token>`.
  - `GET /api/equipo/suscripciones?filtro=` → `{ ok, filas: [{ id, nombre, dni, whatsapp, titulo, producto, duracion_meses, cobros_aprobados, cuota_centimos, proximo_cobro, estado, penalidad_estado, penalidad_centimos }], conteos }`.
  - `POST /api/equipo/suscripciones-penalidad { id }` → `{ ok }` (marca pagada a mano).
  - `GET /api/suscripciones/link?l=` → `{ ok, nombre, titulo, cuota_centimos, precio_mes_centimos, cobros, ahorro_centimos }` o 410.
  - `POST /api/suscripciones/link { l, email, documento, tipo_documento, whatsapp, acepto }` → `{ ok, url }` o 409 penalidad / 410.
  - `GET /api/suscripciones/estado?s=` → `{ ok, estado, titulo, nombre }`.

- [ ] **Step 1: Tests que fallan**

`server/handlers/equipo-suscripciones.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1DePrueba } from '../reservas/d1-prueba.mjs';
import * as sus from '../suscripciones/repo.mjs';
import { handleEquipoSuscripciones, handleEquipoSuscripcionPenalidad } from './equipo-suscripciones.mjs';

const t0 = new Date('2026-11-03T15:00:00Z');
const env = { PUBLIC_SITE_URL: 'https://www.ajlnutricion.com' };
const deps = (o = {}) => ({ db: d1DePrueba(), ahora: () => t0, acceso: async () => ({ ok: true, email: 'romi@x.pe' }), ...o });
const post = (ruta, b) => new Request(`https://x.test${ruta}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });

test('crear link: cuota y penalidad del servidor, vence en 7 días, URL de un solo uso', async () => {
  const d = deps();
  const j = await (await handleEquipoSuscripciones(post('/api/equipo/suscripciones', { nombre: 'Lucía Ramos', producto: 'acompanamiento', meses: 6 }), env, d)).json();
  assert.equal(j.cuota_centimos, 25000);
  assert.equal(j.precio_mes_centimos, 32000);
  assert.equal(j.vence_en, '2026-11-10T15:00:00.000Z');
  assert.match(j.url, /^https:\/\/www\.ajlnutricion\.com\/suscribirse\/\?l=[\w-]{32,}$/);
  const { n } = await d.db.prepare("SELECT COUNT(*) AS n FROM suscripciones WHERE creado_por = 'romi@x.pe' AND estado = 'pendiente'").first();
  assert.equal(n, 1);
});

test('crear link: sin acceso 401; plan de pago único o sin nombre 400', async () => {
  assert.equal((await handleEquipoSuscripciones(post('/api/equipo/suscripciones', {}), env, deps({ acceso: async () => ({ ok: false }) }))).status, 401);
  assert.equal((await handleEquipoSuscripciones(post('/api/equipo/suscripciones', { nombre: 'X', producto: 'basico', meses: 1 }), env, deps())).status, 400);
  assert.equal((await handleEquipoSuscripciones(post('/api/equipo/suscripciones', { nombre: ' ', producto: 'constancia', meses: 3 }), env, deps())).status, 400);
});

test('listar y marcar penalidad pagada a mano', async () => {
  const d = deps();
  await sus.crear(d.db, { id: 'a', token: 'a', producto: 'transformacion', duracion_meses: 3, cuota_centimos: 51000, precio_mes_centimos: 60000, penalidad_centimos: 9000,
    estado: 'cobro_fallido', penalidad_estado: 'pendiente', cobros_aprobados: 1, nombre: 'Ana Torres', creado_en: t0.toISOString(), ultimo_cobro_en: undefined });
  const j = await (await handleEquipoSuscripciones(new Request('https://x.test/api/equipo/suscripciones?filtro=penalidad'), env, d)).json();
  assert.equal(j.filas.length, 1);
  assert.equal(j.filas[0].titulo, '4 sesiones al mes · 3 meses · pago mensual');
  assert.equal(j.conteos.penalidad, 1);
  assert.equal((await handleEquipoSuscripcionPenalidad(post('/api/equipo/suscripciones-penalidad', { id: 'a' }), env, d)).status, 200);
  const s = await sus.porId(d.db, 'a');
  assert.equal(s.penalidad_estado, 'pagada');
  assert.equal(s.penalidad_marcada_por, 'romi@x.pe');
});
```

Agregar a `server/handlers/suscripciones.test.mjs`:

```js
import { handleSuscripcionLink, handleSuscripcionEstado } from './suscripciones.mjs';
import { sha256Hex } from '../tokens.mjs';

async function conLink(d, o = {}) {
  await sus.crear(d.db, { id: 'sl', token: 'tsl', link_token_hash: await sha256Hex('L1'), vence_en: '2026-11-27T00:00:00Z', nombre: 'Lucía Ramos',
    producto: 'acompanamiento', duracion_meses: 6, cuota_centimos: 25000, precio_mes_centimos: 32000, precio_3m_centimos: 27000, estado: 'pendiente', creado_por: 'romi@x.pe', creado_en: t0.toISOString(), ...o });
}
const postLink = (b) => new Request('https://x.test/api/suscripciones/link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
const formLink = { l: 'L1', email: 'lucia@x.pe', tipo_documento: 'dni', documento: '70123456', whatsapp: '+51987654321', acepto: true };

test('link: GET muestra el plan; POST crea la suscripción en Mercado Pago una sola vez', async () => {
  const d = deps();
  d.mp.crearSuscripcion = async (a) => { d.creadas = [...(d.creadas ?? []), a]; return { id: 'preL', init_point: 'https://mp/sus' }; };
  await conLink(d);
  const g = await (await handleSuscripcionLink(new Request('https://x.test/api/suscripciones/link?l=L1'), env, d)).json();
  assert.equal(g.cuota_centimos, 25000);
  assert.equal(g.ahorro_centimos, 7000);
  assert.equal(g.nombre, 'Lucía');
  assert.deepEqual(await (await handleSuscripcionLink(postLink(formLink), env, d)).json(), { ok: true, url: 'https://mp/sus' });
  assert.equal(d.creadas[0].urlRetorno, 'https://www.ajlnutricion.com/suscribirse/listo/?s=tsl');
  assert.equal((await handleSuscripcionLink(postLink(formLink), env, d)).status, 410);
  assert.equal(d.creadas.length, 1);
  assert.equal((await sus.porId(d.db, 'sl')).mp_preapproval_id, 'preL');
});

test('link vencido: 410 en GET y en POST', async () => {
  const d = deps();
  await conLink(d, { vence_en: '2026-11-01T00:00:00Z' });
  assert.equal((await handleSuscripcionLink(new Request('https://x.test/api/suscripciones/link?l=L1'), env, d)).status, 410);
  assert.equal((await handleSuscripcionLink(postLink(formLink), env, d)).status, 410);
});

test('link con penalidad pendiente en ese documento: 409 y el link sigue sin usar', async () => {
  const d = deps();
  await conLink(d);
  await sus.crear(d.db, fila({ id: 'old', token: 'told', estado: 'cancelada', penalidad_estado: 'pendiente', dni: '70123456' }));
  const r = await handleSuscripcionLink(postLink(formLink), env, d);
  assert.equal(r.status, 409);
  assert.equal((await sus.porId(d.db, 'sl')).link_usado_en, null);
});

test('estado: devuelve el estado por token', async () => {
  const d = deps();
  await sus.crear(d.db, fila());
  assert.equal((await (await handleSuscripcionEstado(new Request('https://x.test/api/suscripciones/estado?s=ts'), env, d)).json()).estado, 'activa');
});
```

Run: `node --test server/handlers/equipo-suscripciones.test.mjs server/handlers/suscripciones.test.mjs` → FAIL.

- [ ] **Step 2: Implementar el panel** (`server/handlers/equipo-suscripciones.mjs`)

```js
// ─── Panel del equipo · suscripciones ───────────────────────────────────────
// GET  /api/equipo/suscripciones?filtro=     lista y conteos
// POST /api/equipo/suscripciones             crea un link de suscripción (la URL solo se ve aquí)
// POST /api/equipo/suscripciones-penalidad   marca a mano una penalidad como pagada
import { json, readJson, siteUrl } from '../http.mjs';
import { randomToken, sha256Hex } from '../tokens.mjs';
import * as sus from '../suscripciones/repo.mjs';
import { condicionesSuscripcion } from '../suscripciones/calculo.mjs';

const VENCE_DIAS = 7;
const sinAcceso = () => json(401, { ok: false, error: 'Necesitas entrar con un correo autorizado del equipo.' });
const bad = (status, error) => json(status, { ok: false, error });
const MES = 30 * 86400000;

const fila = (s) => ({
  id: s.id, nombre: s.nombre, dni: s.dni, whatsapp: s.whatsapp, producto: s.producto, duracion_meses: s.duracion_meses,
  titulo: condicionesSuscripcion(s.producto, s.duracion_meses)?.titulo ?? s.producto, cobros_aprobados: s.cobros_aprobados,
  cuota_centimos: s.cuota_centimos, estado: s.estado, penalidad_estado: s.penalidad_estado, penalidad_centimos: s.penalidad_centimos,
  proximo_cobro: s.estado === 'activa' && s.ultimo_cobro_en ? new Date(Date.parse(s.ultimo_cobro_en) + MES).toISOString() : null,
  cancelada_en: s.cancelada_en, motivo_cancelacion: s.motivo_cancelacion,
});

async function crearLink(request, env, deps, email) {
  const d = await readJson(request);
  const nombre = String(d.nombre ?? '').trim().slice(0, 120);
  const c = condicionesSuscripcion(d.producto, Number(d.meses));
  if (!nombre) return bad(400, 'Escribe el nombre del paciente.');
  if (!c) return bad(400, 'Elige el plan y el paquete.');
  const token = randomToken();
  const ahora = deps.ahora();
  const vence = new Date(ahora.getTime() + VENCE_DIAS * 86400000).toISOString();
  await sus.crear(deps.db, { id: crypto.randomUUID(), token: randomToken(), link_token_hash: await sha256Hex(token), vence_en: vence, nombre,
    producto: d.producto, duracion_meses: c.duracion_meses, cuota_centimos: c.cuota_centimos, precio_mes_centimos: c.precio_mes_centimos,
    precio_3m_centimos: c.precio_3m_centimos, estado: 'pendiente', creado_por: email, creado_en: ahora.toISOString() });
  return json(200, { ok: true, url: `${siteUrl(env)}/suscribirse/?l=${token}`, vence_en: vence, titulo: c.titulo,
    cuota_centimos: c.cuota_centimos, precio_mes_centimos: c.precio_mes_centimos });
}

export async function handleEquipoSuscripciones(request, env, deps) {
  if (!['GET', 'POST'].includes(request.method)) return bad(405, 'Método no permitido');
  const acceso = await deps.acceso(request, env);
  if (!acceso.ok) return sinAcceso();
  if (request.method === 'POST') return crearLink(request, env, deps, acceso.email);
  const filtro = new URL(request.url).searchParams.get('filtro') || 'todas';
  if (!sus.FILTROS_SUSCRIPCION.includes(filtro)) return bad(400, 'Filtro inválido');
  return json(200, { ok: true, filas: (await sus.listar(deps.db, { filtro })).map(fila), conteos: await sus.conteos(deps.db) });
}

export async function handleEquipoSuscripcionPenalidad(request, env, deps) {
  if (request.method !== 'POST') return bad(405, 'Método no permitido');
  const acceso = await deps.acceso(request, env);
  if (!acceso.ok) return sinAcceso();
  const d = await readJson(request);
  if (typeof d.id !== 'string') return bad(400, 'Datos inválidos');
  const ok = await sus.marcarPenalidadPagada(deps.db, { id: d.id, por: acceso.email, ahora: deps.ahora() });
  return ok ? json(200, { ok: true }) : bad(409, 'Esa penalidad ya estaba pagada.');
}
```

- [ ] **Step 3: Implementar link y estado** (agregar a `server/handlers/suscripciones.mjs`)

```js
import { sha256Hex } from '../tokens.mjs';
import { finDeCobros } from '../suscripciones/calculo.mjs';
import { CONDICIONES_VERSION } from '../../src/data/condiciones.js';
import { formatoSoles } from '../../src/data/duraciones.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOCUMENTO = { dni: /^\d{8}$/, ce: /^[A-Z0-9]{6,12}$/, pasaporte: /^[A-Z0-9]{6,12}$/ };
const MSJ_LINK = 'Este link ya no sirve. Pídele uno nuevo al equipo por WhatsApp.';

async function linkVigente(deps, l) {
  const s = typeof l === 'string' && l ? await sus.porLinkHash(deps.db, await sha256Hex(l)) : null;
  if (!s || s.link_usado_en || s.estado !== 'pendiente' || Date.parse(s.vence_en) <= deps.ahora().getTime()) return null;
  return s;
}

export async function handleSuscripcionLink(request, env, deps) {
  if (!['GET', 'POST'].includes(request.method)) return bad(405, 'Método no permitido');
  if (request.method === 'GET') {
    const s = await linkVigente(deps, new URL(request.url).searchParams.get('l'));
    if (!s) return bad(410, MSJ_LINK);
    const c = condicionesSuscripcion(s.producto, s.duracion_meses);
    return json(200, { ok: true, nombre: s.nombre.split(' ')[0], titulo: c.titulo, cuota_centimos: s.cuota_centimos,
      precio_mes_centimos: s.precio_mes_centimos, cobros: c.cobros, ahorro_centimos: s.precio_mes_centimos - s.cuota_centimos });
  }
  const d = await readJson(request);
  const s = await linkVigente(deps, d.l);
  if (!s) return bad(410, MSJ_LINK);
  const email = String(d.email ?? '').trim();
  const tipo = String(d.tipo_documento ?? '');
  const documento = String(d.documento ?? '').replace(/[\s.-]+/g, '').toUpperCase();
  const whatsapp = String(d.whatsapp ?? '').replace(/[^\d+]/g, '');
  if (!EMAIL.test(email)) return bad(400, 'Revisa tu correo.');
  if (!Object.hasOwn(DOCUMENTO, tipo) || !DOCUMENTO[tipo].test(documento)) return bad(400, 'Revisa tu documento.');
  if (!/^\+?\d{9,15}$/.test(whatsapp)) return bad(400, 'Revisa tu número de WhatsApp.');
  if (d.acepto !== true) return bad(400, 'Para continuar, acepta los cobros mensuales y las condiciones.');
  const deuda = await sus.deudaPorDni(deps.db, documento);
  if (deuda) {
    return bad(409, `Tienes una penalidad pendiente de ${formatoSoles(deuda.penalidad_centimos / 100)} de tu plan anterior. Págala para continuar.`,
      { motivo: 'penalidad', url: `${siteUrl(env)}/suscripcion/cancelar/?s=${deuda.token}` });
  }
  const ahora = deps.ahora();
  if (!(await sus.usarLink(deps.db, { hash: await sha256Hex(d.l), nombre: s.nombre, email, dni: documento, whatsapp, condicionesVersion: CONDICIONES_VERSION, ahora }))) {
    return bad(410, MSJ_LINK);
  }
  try {
    const c = condicionesSuscripcion(s.producto, s.duracion_meses);
    const pre = await deps.mp.crearSuscripcion({ suscripcionId: s.id, titulo: c.titulo, cuotaCentimos: s.cuota_centimos, email,
      urlRetorno: `${siteUrl(env)}/suscribirse/listo/?s=${s.token}`, finEn: finDeCobros(ahora, c.cobros) });
    await sus.guardarPreapproval(deps.db, s.id, pre.id, ahora);
    return json(200, { ok: true, url: pre.init_point });
  } catch (e) {
    console.error('link de suscripción', e);
    return bad(503, 'No pudimos abrir Mercado Pago. Pídele al equipo un link nuevo.');
  }
}

export async function handleSuscripcionEstado(request, env, deps) {
  if (request.method !== 'GET') return bad(405, 'Método no permitido');
  const s = await sus.porToken(deps.db, new URL(request.url).searchParams.get('s') || '');
  if (!s) return bad(404, 'No encontramos tu plan.');
  return json(200, { ok: true, estado: s.estado, titulo: titulo(s), nombre: s.nombre?.split(' ')[0] ?? null });
}
```

Nota: si Mercado Pago falla después de `usarLink`, el link queda usado; el mensaje pide uno nuevo al equipo (el panel crea otro en segundos). Es preferible a arriesgar dos suscripciones con el mismo link.

Las cuatro rutas de `functions/` siguen el mismo molde (los dos del paciente con `makeReservasDeps(ctx.env, ctx)`, los dos del panel con `makeEquipoDeps(ctx.env)`):

```js
// functions/api/suscripciones/link.js
import { handleSuscripcionLink } from '../../../server/handlers/suscripciones.mjs';
import { makeReservasDeps } from '../../../server/reservas/deps.mjs';
export const onRequest = (ctx) => handleSuscripcionLink(ctx.request, ctx.env, makeReservasDeps(ctx.env, ctx));
```

```js
// functions/api/suscripciones/estado.js
import { handleSuscripcionEstado } from '../../../server/handlers/suscripciones.mjs';
import { makeReservasDeps } from '../../../server/reservas/deps.mjs';
export const onRequest = (ctx) => handleSuscripcionEstado(ctx.request, ctx.env, makeReservasDeps(ctx.env, ctx));
```

```js
// functions/api/equipo/suscripciones.js
import { handleEquipoSuscripciones } from '../../../server/handlers/equipo-suscripciones.mjs';
import { makeEquipoDeps } from '../../../server/equipo/deps.mjs';
export const onRequest = (ctx) => handleEquipoSuscripciones(ctx.request, ctx.env, makeEquipoDeps(ctx.env));
```

```js
// functions/api/equipo/suscripciones-penalidad.js
import { handleEquipoSuscripcionPenalidad } from '../../../server/handlers/equipo-suscripciones.mjs';
import { makeEquipoDeps } from '../../../server/equipo/deps.mjs';
export const onRequest = (ctx) => handleEquipoSuscripcionPenalidad(ctx.request, ctx.env, makeEquipoDeps(ctx.env));
```

- [ ] **Step 4: Correr y ver que pasa; suite completa**

Run: `node --test server/handlers/equipo-suscripciones.test.mjs server/handlers/suscripciones.test.mjs && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/handlers/suscripciones.mjs server/handlers/suscripciones.test.mjs server/handlers/equipo-suscripciones.mjs \
  server/handlers/equipo-suscripciones.test.mjs functions/api/suscripciones/link.js functions/api/suscripciones/estado.js \
  functions/api/equipo/suscripciones.js functions/api/equipo/suscripciones-penalidad.js
git commit -m "Suscripciones: link del panel, lista y penalidad marcada a mano"
```

---

### Task 9: /reservar/ con «¿Cómo quieres pagar?»

**Files:**
- Modify: `src/pages/reservar/index.astro` (catálogo con datos mensuales; bloque `#p2-forma`; casilla `#f-acepto-sus`)
- Modify: `src/scripts/reservar.js`
- Modify: `src/pages/reservar/listo.astro` (vuelta de suscripción y mensaje de penalidad)
- Modify: `src/data/links-reserva.js` (`forma` en links) y `src/pages/panel/index.astro` + `src/scripts/panel-links-reserva.js` (botón «Copiar (mensual)»)
- Modify: `src/styles/reservar.css`
- Test: `server/reservas/links-reserva.test.mjs`

**Interfaces:**
- Consumes: `condicionesSuscripcion` (Task 2), respuesta de `apartar` con `forma`, `precio_mes_centimos`, `cobros` (Task 6), `pagar` 409 `motivo: 'penalidad'` (Task 6).
- Produces: `linkReserva(plan, meses, forma)`, `destinoLink(plan, meses, forma) → { paso, plan, meses, forma }`, entradas de `LINKS_RESERVA` con `rutaMensual` en los planes mensuales.

- [ ] **Step 1: Links con forma: test que falla** (agregar a `server/reservas/links-reserva.test.mjs`)

```js
test('links de reserva: forma mensual en el link y en el destino', () => {
  assert.equal(linkReserva('constancia', 3, 'mensual'), '/reservar/?plan=constancia&meses=3&forma=mensual');
  assert.deepEqual(destinoLink('constancia', '3', 'mensual'), { paso: 'p3', plan: 'constancia', meses: 3, forma: 'mensual' });
  assert.deepEqual(destinoLink('constancia', '3', null), { paso: 'p3', plan: 'constancia', meses: 3, forma: 'completo' });
  assert.deepEqual(destinoLink('basico', null, 'mensual'), { paso: 'p3', plan: 'basico', forma: 'completo' });
  const c = LINKS_RESERVA.find((l) => l.ruta === '/reservar/?plan=constancia&meses=3');
  assert.equal(c.rutaMensual, '/reservar/?plan=constancia&meses=3&forma=mensual');
  assert.equal(LINKS_RESERVA.find((l) => l.ruta === '/reservar/?plan=basico').rutaMensual, undefined);
});
```

Ajustar las aserciones existentes de `destinoLink` del mismo archivo para que esperen `forma: 'completo'` en los destinos `p3` (los `p2` y `p1` no cambian).

Run: `node --test server/reservas/links-reserva.test.mjs` → FAIL.

- [ ] **Step 2: Implementar en `src/data/links-reserva.js`**

```js
export const linkReserva = (plan, n, forma) => `/reservar/?plan=${plan}${n ? `&meses=${n}` : ''}${forma === 'mensual' ? '&forma=mensual' : ''}`;

export function destinoLink(plan, n, forma) {
  if (!plan || !Object.hasOwn(plans, plan)) return { paso: 'p1' };
  const durs = duracionesDe(plan);
  if (!durs) return { paso: 'p3', plan, forma: 'completo' };
  const d = durs.find((x) => String(x.meses) === String(n));
  return d ? { paso: 'p3', plan, meses: d.meses, forma: forma === 'mensual' ? 'mensual' : 'completo' } : { paso: 'p2', plan };
}
```

y en `LINKS_RESERVA`, para los planes mensuales, sumar `rutaMensual: linkReserva(p.id, d.meses, 'mensual')`. Run: test → PASS.

- [ ] **Step 3: Catálogo con datos mensuales** (`src/pages/reservar/index.astro`)

```js
import { condicionesSuscripcion } from '../../../server/suscripciones/calculo.mjs';
// …
for (const p of monthlyPlans) {
  catalogo[p.id] = { nombre: p.name, mensual: true, incluye: incluyeDe(p),
    duraciones: duracionesDe(p.id).map((d) => ({ ...d, sus: condicionesSuscripcion(p.id, d.meses) })) };
}
```

Markup nuevo en la sección `p2`, después de `#p2-consultas`:

```html
<div class="rs-forma" id="p2-forma" hidden>
  <h2 id="p2-forma-t">¿Cómo quieres pagar?</h2>
  <div class="rs-formas" role="radiogroup" aria-labelledby="p2-forma-t">
    <label class="rs-forma-op"><input type="radio" name="forma" value="mensual"><span id="p2-mensual"></span></label>
    <label class="rs-forma-op"><input type="radio" name="forma" value="completo"><span id="p2-completo"></span></label>
  </div>
  <button type="button" class="rs-btn" id="p2-seguir" disabled>Elegir mi primera sesión ›</button>
</div>
```

En `p4`, antes de la casilla `#f-acepto`:

```html
<label class="rs-check" id="l-acepto-sus" hidden><input type="checkbox" id="f-acepto-sus"> <span id="t-acepto-sus"></span></label>
```

- [ ] **Step 4: Lógica en `src/scripts/reservar.js`**

`estado` suma `forma: 'completo'`. Al hacer clic en una duración ya no se abre el calendario: se pinta el bloque de forma.

```js
function opcionesForma(d) {
  const s = d.sus;
  const li = (t) => { const e = h('li', null, t); return e; };
  const caja = (titulo, precio, puntos) => {
    const frag = document.createDocumentFragment();
    frag.append(h('b', 'rs-forma-t', titulo), h('strong', 'rs-forma-p', precio));
    const ul = h('ul');
    ul.append(...puntos.map(li));
    frag.append(ul);
    return frag;
  };
  $('#p2-mensual').replaceChildren(caja('Pago mensual automático', `${soles(s.cuota_centimos)} cada mes`, s.cobros
    ? [`Son ${s.cobros} cobros y termina solo, sin renovación`, 'Se cobra solo con tu tarjeta o Yape', 'Cancelas cuando quieras con un botón en cada recibo',
      'Si cancelas antes de terminar, pagas la diferencia de los meses usados con el precio mes a mes']
    : ['Se cobra solo cada mes con tu tarjeta o Yape', 'Cancelas cuando quieras, sin penalidad']));
  $('#p2-completo').replaceChildren(caja(d.meses === 1 ? 'Pagar este mes' : 'Pago completo', soles(d.total * 100),
    d.meses === 1 ? ['Una sola vez, con tarjeta o Yape', 'El próximo mes decides si sigues'] : ['Con tarjeta o Yape', 'Con tarjeta de crédito, hasta 12 cuotas']));
  document.querySelectorAll('[name=forma]').forEach((r) => { r.checked = false; });
  $('#p2-seguir').disabled = true;
  $('#p2-forma').hidden = false;
  $('#p2-forma').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
```

En el `click` global, reemplazar la rama de `data-duracion`:

```js
  else if (b.dataset.duracion) {
    estado.duracion = Number(b.dataset.duracion);
    document.querySelectorAll('[data-duracion]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    opcionesForma(catalogo[estado.producto].duraciones.find((x) => x.meses === estado.duracion));
  }
```

y agregar los manejadores:

```js
document.addEventListener('change', (e) => {
  if (e.target.name !== 'forma') return;
  estado.forma = e.target.value;
  $('#p2-seguir').disabled = false;
});
$('#p2-seguir').addEventListener('click', () => { marcarUrl(estado.producto, estado.duracion, estado.forma); abrirP3(); });
```

`marcarUrl(plan, meses, forma)` suma `forma=mensual` solo si es mensual (y lo borra si no). En el arranque, `destinoLink(params.get('plan'), params.get('meses'), params.get('forma'))` y `estado.forma = d.forma ?? 'completo'` antes de `abrirP3()`. `elegirProducto` oculta `#p2-forma` y pone `estado.forma = 'completo'`. `apartar` manda `forma: estado.forma`.

En `abrirP4(reserva)`:

```js
  const mensual = reserva.forma === 'mensual';
  $('#l-acepto-sus').hidden = !mensual;
  $('#f-acepto-sus').checked = false;
  if (mensual) {
    $('#t-acepto-sus').textContent = reserva.cobros
      ? `Acepto ${reserva.cobros} cobros mensuales automáticos de ${soles(reserva.monto_centimos)} y que, si cancelo antes del último, pago la diferencia de los meses usados con el precio mes a mes${reserva.cobros === 6 ? ' (o con el paquete de 3 meses si ya usé 3)' : ''}.`
      : `Acepto el cobro mensual automático de ${soles(reserva.monto_centimos)} hasta que cancele.`;
  }
  $('#p4-pagar').textContent = mensual ? 'Suscribirme con Mercado Pago' : `Pagar ${soles(reserva.monto_centimos)}`;
```

(la línea de resumen pasa a `linea(`${reserva.titulo} · ${soles(reserva.monto_centimos)}${mensual ? ' al mes' : ''}`)`).

En `pagar`: sumar `acepto_suscripcion: $('#f-acepto-sus').checked` a `datos`; si `estado.reserva.forma === 'mensual'` y no está marcada, mostrar «Para continuar, acepta los cobros mensuales automáticos.» sin llamar al servidor. Si la respuesta es `409` con `d.motivo === 'penalidad'`:

```js
    if (r.status === 409 && d.motivo === 'penalidad') {
      const a = document.createElement('a');
      a.href = d.url; a.textContent = 'Pagar la penalidad';
      $('#p4-error').replaceChildren(document.createTextNode(`${d.error} `), a);
      boton.disabled = false;
      return;
    }
```

- [ ] **Step 5: `listo.astro`**

`const paymentId = q.get('payment_id') || …` sigue igual; sumar `const preapproval = q.get('preapproval_id');` y pasarlo a la consulta de estado (`/api/reservas/estado?r=…&preapproval_id=…` cuando exista). `const pagoReal = /^\d+$/.test(paymentId || '') || Boolean(preapproval);`. En la vista `confirmada`, si `d.forma_pago === 'mensual'`, la línea del resumen dice `${esc(d.titulo)} · ${soles(d.monto_centimos)} al mes` y se agrega `<p class="rs-nota">Te llega un recibo con cada cobro. Desde ese correo puedes cancelar tu plan cuando quieras.</p>`.

- [ ] **Step 6: Panel: «Copiar (mensual)»**

En `src/pages/panel/index.astro`, en la fila de cada link, después del botón «Copiar»:

```astro
{l.rutaMensual && <button type="button" class="lk-btn lk-btn--borde" data-copiar-ruta data-mensual={l.rutaMensual}>Copiar (mensual)</button>}
```

En `src/scripts/panel-links-reserva.js`, al copiar: `const valor = b.dataset.mensual ? location.origin + b.dataset.mensual : u.value;` y escribir `valor` en el portapapeles.

- [ ] **Step 7: Estilos** (`src/styles/reservar.css`)

```css
/* ¿Cómo quieres pagar? (suscripciones, 2026-10-28) */
.rs-forma { margin-top: 24px; }
.rs-forma h2 { font-size: 1.3rem; margin: 0 0 12px; }
.rs-formas { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }
.rs-forma-op { display: flex; gap: 10px; align-items: flex-start; border: 1px solid #E4E4E4; border-radius: 12px; padding: 16px; cursor: pointer; background: #fff; }
.rs-forma-op:has(input:checked) { border: 2px solid #9C7A2B; background: #F8F3E6; padding: 15px; }
.rs-forma-op input { width: 20px; height: 20px; margin: 2px 0 0; accent-color: #806420; flex-shrink: 0; }
.rs-forma-op span { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.rs-forma-t { font-size: 1.05rem; }
.rs-forma-p { font-size: 1.5rem; }
.rs-forma-op ul { margin: 0; padding-left: 18px; font-size: .9rem; color: #2B2B2B; }
#p2-seguir { margin-top: 16px; }
```

- [ ] **Step 8: Build y prueba en el navegador local**

Run: `npm test && npm run build`
Expected: PASS y build completo. Con `npx wrangler pages dev dist` (o la versión de prueba tras el push), revisar a 390 px y a 1280 px: elegir Constancia → 3 meses → aparece «¿Cómo quieres pagar?» con S/360 y S/80 → elegir mensual → calendario → paso 4 con la casilla nueva y el botón «Suscribirme con Mercado Pago». Revisar que `?plan=constancia&meses=3&forma=mensual` abra el calendario y que el paso 4 muestre la casilla.

- [ ] **Step 9: Commit**

```bash
git add src/pages/reservar/index.astro src/scripts/reservar.js src/pages/reservar/listo.astro src/data/links-reserva.js \
  server/reservas/links-reserva.test.mjs src/pages/panel/index.astro src/scripts/panel-links-reserva.js src/styles/reservar.css
git commit -m "/reservar/: elegir pago mensual automático o pago completo"
```

---

### Task 10: Páginas del link de suscripción y de «Cancelar mi plan»

**Files:**
- Create: `src/pages/suscribirse/index.astro`, `src/pages/suscribirse/listo.astro`, `src/pages/suscripcion/cancelar.astro`
- Create: `src/scripts/suscribirse.js`, `src/scripts/cancelar-plan.js`

**Interfaces:**
- Consumes: `GET/POST /api/suscripciones/link`, `GET /api/suscripciones/estado`, `GET/POST /api/suscripciones/cancelar` (Tasks 7 y 8).

- [ ] **Step 1: `/suscribirse/`**

```astro
---
// Link de suscripción que manda el equipo (spec 2026-10-27). Sirve una vez y vence en 7 días.
import Layout from '../../layouts/Layout.astro';
import { PAISES } from '../../data/telefono.js';
import '../../styles/reservar.css';
---
<Layout noindex title="Tu plan · AJL Nutrición">
  <main class="rs">
    <section id="sus" aria-live="polite"><h1>Cargando tu plan…</h1></section>
    <form id="sus-form" hidden novalidate>
      <label for="s-email">Correo · aquí llegan tus recibos</label>
      <input type="email" id="s-email" autocomplete="email" required>
      <label for="s-doc">Documento</label>
      <div class="rs-doc">
        <select id="s-tipo-doc" aria-label="Tipo de documento"><option value="dni">DNI</option><option value="ce">CE</option><option value="pasaporte">Pasaporte</option></select>
        <input type="text" id="s-doc" inputmode="numeric" maxlength="12" required>
      </div>
      <label for="s-whatsapp">WhatsApp</label>
      <div class="rs-tel">
        <select id="s-pais" aria-label="Código de país">{PAISES.map(([bandera, nombre, codigo]) => <option value={codigo}>{bandera} {nombre} +{codigo}</option>)}</select>
        <input type="tel" id="s-whatsapp" inputmode="tel" required>
      </div>
      <label class="rs-check"><input type="checkbox" id="s-acepto"> <span id="s-acepto-t"></span></label>
      <button type="submit" class="rs-btn" id="s-pagar">Suscribirme con Mercado Pago</button>
      <p class="rs-nota" style="text-align:center">Pones tu tarjeta o Yape en Mercado Pago. Nosotros no vemos tus datos.</p>
      <p class="rs-error" id="s-error" role="alert"></p>
    </form>
  </main>
</Layout>
<script>import '../../scripts/suscribirse.js';</script>
```

`src/scripts/suscribirse.js`:

```js
// /suscribirse/?l=…: muestra el plan que armó el equipo y abre Mercado Pago.
import { formatoSoles } from '../data/duraciones.js';
import { telefonoCompleto } from '../data/telefono.js';

const $ = (s) => document.querySelector(s);
const soles = (c) => formatoSoles(Math.round(c / 100));
const l = new URLSearchParams(location.search).get('l') || '';
const h = (tag, texto, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; e.textContent = texto; return e; };

(async () => {
  let r = null;
  try { r = await fetch(`/api/suscripciones/link?l=${encodeURIComponent(l)}`, { cache: 'no-store' }); } catch {}
  const d = await r?.json().catch(() => null);
  if (!r?.ok || !d?.ok) { $('#sus').replaceChildren(h('h1', 'Este link ya no sirve'), h('p', d?.error || 'Pídele uno nuevo al equipo por WhatsApp.', 'rs-lead')); return; }
  const puntos = d.cobros
    ? [`Hoy pagas ${soles(d.cuota_centimos)}; luego se cobra solo cada mes.`, `Son ${d.cobros} cobros y termina, sin renovación.`,
      'Cancelas cuando quieras con el botón de cada recibo.', `Si cancelas antes de terminar, pagas la diferencia de los meses usados con el precio mes a mes (${soles(d.precio_mes_centimos)}).`]
    : [`Hoy pagas ${soles(d.cuota_centimos)}; luego se cobra solo cada mes.`, 'Cancelas cuando quieras, sin penalidad.'];
  const caja = h('div', '', 'rs-resumen');
  caja.append(h('b', d.titulo), h('div', `${soles(d.cuota_centimos)} cada mes`));
  const ul = document.createElement('ul');
  ul.append(...puntos.map((p) => h('li', p)));
  $('#sus').replaceChildren(h('h1', `Hola, ${d.nombre}. Este es tu plan`), caja, ul);
  $('#s-acepto-t').textContent = d.cobros
    ? `Acepto ${d.cobros} cobros mensuales automáticos de ${soles(d.cuota_centimos)}, que si cancelo antes del último pago la diferencia de los meses usados con el precio mes a mes${d.cobros === 6 ? ' (o con el paquete de 3 meses si ya usé 3)' : ''}, y las condiciones del servicio.`
    : `Acepto el cobro mensual automático de ${soles(d.cuota_centimos)} hasta que cancele y las condiciones del servicio.`;
  $('#sus-form').hidden = false;
})();

$('#sus-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const b = $('#s-pagar');
  b.disabled = true;
  $('#s-error').textContent = '';
  try {
    const r = await fetch('/api/suscripciones/link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      l, email: $('#s-email').value, tipo_documento: $('#s-tipo-doc').value, documento: $('#s-doc').value,
      whatsapp: telefonoCompleto($('#s-pais').value, $('#s-whatsapp').value), acepto: $('#s-acepto').checked }) });
    const d = await r.json();
    if (r.ok) { location.href = d.url; return; }
    if (d.motivo === 'penalidad') {
      const a = document.createElement('a'); a.href = d.url; a.textContent = 'Pagar la penalidad';
      $('#s-error').replaceChildren(document.createTextNode(`${d.error} `), a);
    } else $('#s-error').textContent = d.error || 'Revisa tus datos.';
  } catch {
    $('#s-error').textContent = 'No pudimos conectar con Mercado Pago. Intenta de nuevo.';
  }
  b.disabled = false;
});
```

- [ ] **Step 2: `/suscribirse/listo/`**

```astro
---
import Layout from '../../layouts/Layout.astro';
import '../../styles/reservar.css';
---
<Layout noindex title="Tu plan · AJL Nutrición">
  <main class="rs"><section id="listo" aria-live="polite"><h1>Estamos confirmando tu pago…</h1><p class="rs-lead">Esto toma unos segundos.</p></section></main>
</Layout>
<script>
  // Vuelta de Mercado Pago tras autorizar la suscripción del link: espera a que llegue el primer cobro.
  const s = new URLSearchParams(location.search).get('s') || '';
  const raiz = document.getElementById('listo');
  const pintar = (titulo, texto) => { raiz.innerHTML = ''; const h1 = document.createElement('h1'); h1.textContent = titulo; const p = document.createElement('p'); p.className = 'rs-lead'; p.textContent = texto; raiz.append(h1, p); };
  let intentos = 0;
  async function mirar() {
    intentos += 1;
    try {
      const d = await (await fetch(`/api/suscripciones/estado?s=${encodeURIComponent(s)}`, { cache: 'no-store' })).json();
      if (d.estado === 'activa' || d.estado === 'terminada') { pintar('¡Listo! Tu suscripción está activa.', 'Te escribimos por WhatsApp para agendar tu primera sesión. Te llega un recibo con cada cobro.'); return; }
    } catch {}
    if (intentos < 20) setTimeout(mirar, 3000);
    else pintar('Recibimos tu autorización.', 'El primer cobro puede tardar unos minutos. Te llega un correo cuando se confirme; si no llega en una hora, escríbenos por WhatsApp.');
  }
  mirar();
</script>
```

- [ ] **Step 3: `/suscripcion/cancelar/`**

```astro
---
// «Cancelar mi plan» (spec 2026-10-27): llega desde cada recibo con ?s=<token>.
import Layout from '../../layouts/Layout.astro';
import '../../styles/reservar.css';
---
<Layout noindex title="Cancelar mi plan · AJL Nutrición">
  <main class="rs">
    <section id="cp" aria-live="polite"><h1>Cargando tu plan…</h1></section>
    <p class="rs-error" id="cp-error" role="alert"></p>
  </main>
</Layout>
<script>import '../../scripts/cancelar-plan.js';</script>
```

`src/scripts/cancelar-plan.js`:

```js
// /suscripcion/cancelar/?s=…: pagar la penalidad y cancelar, cancelar sin pagar, o seguir.
// Darse de baja nunca depende de pagar (spec 2026-10-27).
import { formatoSoles } from '../data/duraciones.js';

const $ = (s) => document.querySelector(s);
const soles = (c) => formatoSoles(Math.round(c / 100));
const q = new URLSearchParams(location.search);
const s = q.get('s') || '';
const raiz = $('#cp');
const h = (tag, texto, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; if (texto != null) e.textContent = texto; return e; };
const boton = (texto, cls, alClic) => { const b = h('button', texto, cls); b.type = 'button'; b.addEventListener('click', alClic); return b; };

async function enviar(pagar, b) {
  b.disabled = true;
  $('#cp-error').textContent = '';
  try {
    const r = await fetch('/api/suscripciones/cancelar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ s, pagar }) });
    const d = await r.json();
    if (!r.ok) { $('#cp-error').textContent = d.error || 'No pudimos procesarlo. Intenta de nuevo.'; b.disabled = false; return; }
    if (d.url) { location.href = d.url; return; }
    raiz.replaceChildren(h('h1', 'Tu plan quedó cancelado'), h('p', d.penalidad_centimos > 0
      ? `Ya no se te cobra nada más. Los ${soles(d.penalidad_centimos)} de la penalidad quedan pendientes y se pagan si vuelves a reservar.`
      : 'Ya no se te cobra nada más. Te enviamos la confirmación a tu correo.', 'rs-lead'));
  } catch {
    $('#cp-error').textContent = 'Revisa tu conexión e intenta de nuevo.';
    b.disabled = false;
  }
}

function pintar(d) {
  const resumen = h('div', null, 'rs-resumen');
  resumen.append(h('b', d.titulo), h('div', d.duracion_meses > 1 ? `Pagaste ${d.cobros_aprobados} de ${d.duracion_meses} cobros` : `Pagaste ${d.cobros_aprobados} meses`));
  if (d.modo === 'cerrada') { raiz.replaceChildren(h('h1', 'Tu plan ya está cerrado'), h('p', 'No tienes nada pendiente con nosotros.', 'rs-lead')); return; }
  if (d.modo === 'deuda') {
    raiz.replaceChildren(h('h1', 'Tienes una penalidad pendiente'), resumen, h('p', `Para volver a reservar, primero se paga la penalidad de ${soles(d.penalidad_centimos)}.`, 'rs-lead'),
      boton(`Pagar ${soles(d.penalidad_centimos)}`, 'rs-btn', (e) => enviar(true, e.currentTarget)));
    return;
  }
  const hijos = [h('h1', 'Cancelar mi plan'), resumen];
  if (d.penalidad_centimos > 0) {
    hijos.push(h('p', `Cancelar antes del último cobro tiene una penalidad de ${soles(d.penalidad_centimos)}: la diferencia de los meses que usaste con el precio que les correspondía (${d.detalle}). Después ya no se te cobra nada más.`, 'rs-aviso'),
      boton(`Pagar ${soles(d.penalidad_centimos)} y cancelar`, 'rs-btn', (e) => enviar(true, e.currentTarget)),
      h('p', 'Pagas en Mercado Pago con tarjeta o Yape. Al confirmarse, tu plan queda cancelado.', 'rs-nota'),
      boton('Cancelar sin pagar ahora', 'rs-btn rs-btn--ghost', (e) => enviar(false, e.currentTarget)),
      h('p', `Tu plan se cancela igual. Los ${soles(d.penalidad_centimos)} quedan pendientes y se pagan si vuelves a reservar.`, 'rs-nota'));
  } else {
    hijos.push(h('p', 'No tienes penalidad. Al cancelar ya no se te cobra nada más.', 'rs-lead'), boton('Cancelar mi plan', 'rs-btn', (e) => enviar(false, e.currentTarget)));
  }
  const seguir = h('a', 'Prefiero seguir con mi plan', 'rs-link');
  seguir.href = '/';
  hijos.push(seguir);
  raiz.replaceChildren(...hijos);
}

(async () => {
  try {
    const r = await fetch(`/api/suscripciones/cancelar?s=${encodeURIComponent(s)}`, { cache: 'no-store' });
    const d = await r.json();
    if (!r.ok) { raiz.replaceChildren(h('h1', 'No encontramos tu plan'), h('p', 'Escríbenos por WhatsApp y te ayudamos.', 'rs-lead')); return; }
    if (q.get('pago') === '1' && d.modo !== 'cerrada') {
      raiz.replaceChildren(h('h1', 'Estamos confirmando tu pago…'), h('p', 'Esto toma unos segundos. Te llega un correo cuando quede listo.', 'rs-lead'));
      setTimeout(() => location.replace(`?s=${encodeURIComponent(s)}`), 5000);
      return;
    }
    pintar(d);
  } catch {
    raiz.replaceChildren(h('h1', 'No pudimos cargar tu plan'), h('p', 'Revisa tu conexión y recarga la página.', 'rs-lead'));
  }
})();
```

- [ ] **Step 4: Build y revisión**

Run: `npm run build`
Expected: build completo con las tres páginas nuevas (`dist/suscribirse/index.html`, `dist/suscribirse/listo/index.html`, `dist/suscripcion/cancelar/index.html`). Revisar a 390 px que no haya scroll horizontal.

- [ ] **Step 5: Commit**

```bash
git add src/pages/suscribirse src/pages/suscripcion src/scripts/suscribirse.js src/scripts/cancelar-plan.js
git commit -m "Suscripciones: páginas del link y de «Cancelar mi plan»"
```

---

### Task 11: Panel: «Cobrar con suscripción» y lista «Suscripciones»

**Files:**
- Modify: `src/pages/panel/index.astro`
- Create: `src/scripts/panel-suscripciones.js`
- Modify: `src/scripts/panel.js` (cargar la lista)
- Modify: `src/styles/panel.css`

**Interfaces:**
- Consumes: `GET/POST /api/equipo/suscripciones`, `POST /api/equipo/suscripciones-penalidad` (Task 8); `condicionesSuscripcion` para las opciones; `monthlyPlans`.
- Produces: `cargarSuscripciones()` exportada desde `panel-suscripciones.js`.

- [ ] **Step 1: Markup** (en `src/pages/panel/index.astro`, después de la sección «Links de reserva web»)

```astro
---
// (frontmatter, agregar)
import { monthlyPlans } from '../../data/plans.js';
import { duracionesDe } from '../../data/duraciones.js';
import { condicionesSuscripcion } from '../../../server/suscripciones/calculo.mjs';
const paquetes = monthlyPlans.map((p) => ({ id: p.id, nombre: p.internalName,
  opciones: duracionesDe(p.id).map((d) => ({ meses: d.meses, ...condicionesSuscripcion(p.id, d.meses) })) }));
---
```

```astro
<section>
  <details class="lk-plegable">
    <summary><h2>Cobrar con suscripción</h2><span class="lk-nota">link de un solo uso · toca para abrir</span></summary>
    <p class="lk-nota">Para un paciente con quien ya hablaste por WhatsApp. El link sirve una vez y vence en 7 días. No agenda cita: las sesiones se agendan con los links de siempre.</p>
    <div class="lk-tarjeta lk-sus" id="sus-crear">
      <label class="lk-campo">Nombre del paciente<input id="sus-nombre" maxlength="120" autocomplete="off"></label>
      <label class="lk-campo">Plan y paquete
        <select id="sus-plan">
          <option value="">Elige el plan y el paquete</option>
          {paquetes.map((p) => <optgroup label={p.nombre}>{p.opciones.map((o) => (
            <option value={`${p.id}:${o.meses}`}>{o.meses === 1 ? 'Mes a mes' : `${o.meses} meses`} · S/{o.cuota_centimos / 100} al mes · {o.cobros ? 'penalidad: diferencia con mes a mes' : 'sin penalidad'}</option>
          ))}</optgroup>)}
        </select>
      </label>
      <button type="button" class="lk-btn" id="sus-crear-btn" disabled>Crear link de suscripción</button>
      <div id="sus-creado" hidden>
        <input class="lk-url" id="sus-url" readonly aria-label="Link de suscripción">
        <div class="lk-dos"><button type="button" class="lk-btn lk-btn--borde" id="sus-copiar">Copiar</button><a class="lk-btn lk-btn--wa" id="sus-wa" target="_blank" rel="noopener">Enviar por WhatsApp</a></div>
      </div>
    </div>
  </details>
</section>

<section>
  <h2>Suscripciones</h2>
  <div class="lk-barra">
    <div class="lk-grupo" role="group" aria-label="Filtrar suscripciones" id="sus-filtros">
      <button type="button" data-filtro="todas" aria-pressed="true">Todas <span></span></button>
      <button type="button" data-filtro="activas" aria-pressed="false">Activas <span></span></button>
      <button type="button" data-filtro="terminan" aria-pressed="false">Terminan este mes <span></span></button>
      <button type="button" data-filtro="fallido" aria-pressed="false">Cobro fallido <span></span></button>
      <button type="button" data-filtro="penalidad" aria-pressed="false">Penalidad pendiente <span></span></button>
      <button type="button" data-filtro="canceladas" aria-pressed="false">Canceladas <span></span></button>
    </div>
  </div>
  <p class="lk-error" id="sus-msg" role="alert" hidden></p>
  <div class="lk-scroll"><table><thead><tr><th>Paciente</th><th>Plan</th><th>Cobros</th><th>Cuota</th><th>Próximo cobro</th><th>Estado</th><th></th></tr></thead><tbody id="sus-filas"></tbody></table></div>
</section>
```

- [ ] **Step 2: `src/scripts/panel-suscripciones.js`**

```js
// Panel /panel/, suscripciones: crear el link de suscripción y la lista con filtros.
// Todo el texto de la base se pinta con textContent.
import { formatoSoles } from '../data/duraciones.js';

const $ = (s) => document.querySelector(s);
const soles = (c) => formatoSoles(Math.round(c / 100));
const fecha = (iso) => (iso ? new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', day: 'numeric', month: 'short' }).format(new Date(iso)) : '—');
const ESTADO = { activa: 'Activa', terminada: 'Terminó', cobro_fallido: 'Cobro fallido', cancelada: 'Cancelada' };
let filtro = 'todas';

function aviso(t = '') { $('#sus-msg').textContent = t; $('#sus-msg').hidden = !t; }
const celda = (...lineas) => {
  const td = document.createElement('td');
  lineas.filter((l) => l != null && l !== '').forEach((l, i) => {
    if (l instanceof Node) { td.append(l); return; }
    const e = document.createElement(i === 0 ? 'span' : 'small'); e.textContent = l; if (i > 0) e.style.display = 'block'; td.append(e);
  });
  return td;
};

function filaDe(s) {
  const tr = document.createElement('tr');
  const acciones = document.createElement('div');
  if (s.whatsapp) {
    const a = document.createElement('a');
    a.href = `https://wa.me/${s.whatsapp.replace(/\D/g, '')}`; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'WhatsApp';
    acciones.append(a);
  }
  if (s.penalidad_estado === 'pendiente') {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'lk-btn lk-btn--borde lk-btn--mini'; b.textContent = 'Marcar penalidad pagada';
    b.addEventListener('click', () => marcarPagada(s, b));
    acciones.append(b);
  }
  const penalidad = s.penalidad_estado === 'pendiente' ? `Penalidad ${soles(s.penalidad_centimos)} pendiente`
    : s.penalidad_estado === 'pagada' ? `Penalidad ${soles(s.penalidad_centimos)} pagada` : null;
  tr.append(
    celda(s.nombre ?? '—', s.dni ? `Doc. ${s.dni}` : null),
    celda(s.titulo),
    celda(s.duracion_meses > 1 ? `${s.cobros_aprobados} de ${s.duracion_meses}` : String(s.cobros_aprobados)),
    celda(soles(s.cuota_centimos)),
    celda(s.estado === 'activa' ? fecha(s.proximo_cobro) : '—'),
    celda(ESTADO[s.estado] ?? s.estado, penalidad),
    celda(acciones),
  );
  return tr;
}

async function marcarPagada(s, b) {
  if (!confirm(`¿${s.nombre} ya pagó la penalidad de ${soles(s.penalidad_centimos)}?`)) return;
  b.disabled = true;
  const r = await fetch('/api/equipo/suscripciones-penalidad', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: s.id }) }).catch(() => null);
  if (!r?.ok) { b.disabled = false; aviso('No se pudo marcar. Intenta de nuevo.'); return; }
  cargarSuscripciones();
}

export async function cargarSuscripciones() {
  const r = await fetch(`/api/equipo/suscripciones?filtro=${filtro}`, { cache: 'no-store' }).catch(() => null);
  if (r?.status === 401) return false;
  const d = await r?.json().catch(() => null);
  if (!d?.ok) { aviso('No pudimos cargar las suscripciones. Recarga la página.'); return; }
  aviso();
  document.querySelectorAll('#sus-filtros [data-filtro]').forEach((b) => { b.querySelector('span').textContent = d.conteos[b.dataset.filtro] ?? 0; });
  $('#sus-filas').replaceChildren(...(d.filas.length ? d.filas.map(filaDe) : [Object.assign(document.createElement('tr'), { innerHTML: '<td colspan="7">No hay suscripciones con este filtro.</td>' })]));
}

$('#sus-filtros').addEventListener('click', (e) => {
  const b = e.target.closest('[data-filtro]');
  if (!b) return;
  filtro = b.dataset.filtro;
  document.querySelectorAll('#sus-filtros [data-filtro]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  cargarSuscripciones();
});

const revisar = () => { $('#sus-crear-btn').disabled = !$('#sus-nombre').value.trim() || !$('#sus-plan').value; };
$('#sus-nombre').addEventListener('input', revisar);
$('#sus-plan').addEventListener('change', revisar);
$('#sus-crear-btn').addEventListener('click', async () => {
  const [producto, meses] = $('#sus-plan').value.split(':');
  const b = $('#sus-crear-btn');
  b.disabled = true;
  const r = await fetch('/api/equipo/suscripciones', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre: $('#sus-nombre').value, producto, meses: Number(meses) }) }).catch(() => null);
  const d = await r?.json().catch(() => null);
  if (!d?.ok) { alert(d?.error || 'No se pudo crear el link. Intenta de nuevo.'); revisar(); return; }
  $('#sus-url').value = d.url;
  $('#sus-copiar').textContent = 'Copiar';
  $('#sus-wa').href = `https://wa.me/?text=${encodeURIComponent(`Activa tu plan de AJL Nutrición aquí (sirve una sola vez): ${d.url}`)}`;
  $('#sus-creado').hidden = false;
  $('#sus-nombre').value = '';
  $('#sus-plan').value = '';
  revisar();
});
$('#sus-copiar').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('#sus-url').value); $('#sus-copiar').textContent = 'Copiado'; } catch { $('#sus-url').select(); }
});
```

En `src/scripts/panel.js`: `import { cargarSuscripciones } from './panel-suscripciones.js';` y en `cargarTodo` llamar `await cargarSuscripciones()` después de `cargarReservas()`.

En `src/styles/panel.css`:

```css
/* Suscripciones (2026-10-28) */
.lk-sus { max-width: 560px; margin-top: 12px; }
.lk-btn--mini { min-height: 36px; font-size: .8rem; padding: 0 10px; margin-top: 6px; }
```

- [ ] **Step 3: Build y revisión**

Run: `npm test && npm run build`
Expected: PASS y build completo. En la versión de prueba, entrar al panel, crear un link de Acompañamiento 6 meses, copiarlo y abrirlo en otra ventana: debe mostrar «Hola, …» con S/250 y S/70.

- [ ] **Step 4: Commit**

```bash
git add src/pages/panel/index.astro src/scripts/panel-suscripciones.js src/scripts/panel.js src/styles/panel.css
git commit -m "Panel: cobrar con suscripción y lista de suscripciones"
```

---

### Task 12: Condiciones, privacidad y changelog

**Files:**
- Modify: `src/data/condiciones.js` (`CONDICIONES_VERSION = '2026-10-28'` y una línea en `RESUMEN_CONDICIONES`)
- Modify: `src/pages/condiciones.astro` (sección nueva)
- Modify: `public/privacidad/index.html` (si no menciona los datos de suscripción)
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Condiciones**

En `src/pages/condiciones.astro`, después de la sección «3. Precio y pago», agregar:

```html
<h2>3b. Pago mensual automático</h2>
<p>Los planes de 1, 3 y 6 meses se pueden pagar con un cobro mensual automático en Mercado Pago, con tarjeta o Yape. En el paquete de 3 o 6 meses pagas el precio por mes del paquete y son 3 o 6 cobros: el plan termina con el último y no se renueva. En el plan mes a mes, el cobro se repite cada mes hasta que canceles.</p>
<p>Puedes cancelar cuando quieras con el botón «Cancelar mi plan» de cada recibo, desde tu cuenta de Mercado Pago o escribiéndonos. Si cancelas un paquete antes de su último cobro, los meses que ya pagaste se recalculan al precio que les correspondía y pagas la diferencia: en el paquete de 3 meses, cada mes se compara con el precio mes a mes; en el de 6 meses, si ya pasaron 3 meses, esos 3 se comparan con el precio por mes del paquete de 3 y los demás con el precio mes a mes. La página «Cancelar mi plan» te muestra el monto y su detalle antes de confirmar. Puedes pagarla al cancelar; si no, queda pendiente y te pediremos pagarla antes de volver a reservar. El plan mes a mes no tiene penalidad.</p>
```

En `src/data/condiciones.js`: subir `CONDICIONES_VERSION` a `'2026-10-28'` y agregar a `RESUMEN_CONDICIONES` la línea `'Pago mensual automático: sin renovación; si cancelas un paquete antes del último cobro, pagas la diferencia de los meses usados con el precio que les correspondía.'`.

- [ ] **Step 2: Privacidad**

Leer `public/privacidad/index.html`. Si la sección de pagos no cubre «datos de tus cobros mensuales (montos, fechas, estado) y el identificador de tu suscripción en Mercado Pago», agregar esa frase a la lista de datos de pago con la misma finalidad (gestionar el pago) y el mismo plazo de conservación que ya declara para los pagos. No se agregan datos nuevos fuera de esos.

- [ ] **Step 3: Changelog**

Bajo «Pendiente de publicar»:

```markdown
- Pagos con suscripción: en /reservar/ los planes se pueden pagar con «Pago mensual automático» (cuota del paquete cada mes, 3 o 6 cobros sin renovación; mes a mes hasta cancelar) o completos como antes. Cada recibo trae «Cancelar mi plan»: pagar la penalidad (la diferencia de los meses usados con el precio mes a mes, o con el paquete de 3 si ya pasaron 3 en el de 6) y cancelar, o cancelar sin pagar y queda pendiente para cuando vuelva a reservar. El panel tiene «Cobrar con suscripción» (link de un solo uso, 7 días) y la lista «Suscripciones». Condiciones del servicio actualizadas (versión 2026-10-28).
```

- [ ] **Step 4: Tests y build**

Run: `npm test && npm run build`
Expected: PASS (si algún test fija `CONDICIONES_VERSION`, actualizarlo al valor nuevo).

- [ ] **Step 5: Commit**

```bash
git add src/data/condiciones.js src/pages/condiciones.astro public/privacidad/index.html CHANGELOG.md
git commit -m "Condiciones y privacidad: pago mensual automático y penalidad"
```

---

### Task 13: Prueba de punta a punta en la versión de prueba (manual, con Joaquín)

**Files:**
- Modify: `docs/superpowers/notas/2026-10-28-mp-suscripciones-prueba.md` (resultados)

- [ ] **Step 1: Preparar**

1. Aplicar la migración en la base de prueba: `npx wrangler d1 migrations apply ajl-reservas-preview --remote`.
2. Confirmar con Joaquín que la versión de prueba usa el access token de prueba de Mercado Pago y que el webhook de prueba tiene activos los eventos de suscripción (Task 1, Step 2.7).
3. `git push origin reservas-pago` y esperar a que `https://reservas-pago.ajl-landing.pages.dev/reservar/` sirva el texto «¿Cómo quieres pagar?» (`curl -s … | grep -c "Cómo quieres pagar"`).

- [ ] **Step 2: Recorrer con un comprador de prueba**

1. /reservar/ → Constancia → 3 meses → Pago mensual → hora → datos → aceptar → Mercado Pago → autorizar. Esperado: `/reservar/listo/` dice «Tu primera sesión está reservada», llega el recibo «cobro 1 de 3», el panel muestra la cita en «Reservas» y la suscripción «1 de 3» en «Suscripciones». Recordar que la versión de prueba escribe en el Google Calendar real: borrar el evento al terminar, con permiso de Joaquín.
2. Desde el recibo, «Cancelar mi plan» → «Pagar S/80 y cancelar» → pagar. Esperado: «Tu plan quedó cancelado», correo de baja, panel «Cancelada · penalidad pagada», y en Mercado Pago la suscripción cancelada.
3. Repetir 1 y cancelar con «Cancelar sin pagar ahora». Esperado: penalidad pendiente; al volver a /reservar/ con el mismo DNI, el paso 4 pide pagar la penalidad.
4. Panel → «Cobrar con suscripción» → Acompañamiento 6 meses → abrir el link → completar → autorizar. Esperado: `/suscribirse/listo/` dice «¡Listo!», la lista muestra «1 de 6». Abrir el link otra vez: «Este link ya no sirve».

- [ ] **Step 3: Anotar resultados y preguntar si se publica**

Escribir lo observado en la nota de la Task 1. Correr `npm run smoke -- https://reservas-pago.ajl-landing.pages.dev`. Publicar a `main` solo cuando Joaquín lo autorice, aplicando antes la migración en producción (`npx wrangler d1 migrations apply ajl-reservas --remote`), también con su autorización.
