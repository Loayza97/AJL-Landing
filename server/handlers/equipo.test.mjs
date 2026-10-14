import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1DePrueba } from '../reservas/d1-prueba.mjs';
import { nutricionistas } from '../../src/data/nutricionistas.js';
import { handleEquipoReservas, handleEquipoContactado, handleEquipoExcel } from './equipo.mjs';

const ahora = () => new Date('2026-10-12T20:00:00Z');
const dentro = async () => ({ ok: true, email: 'romi@x.pe' });
const fuera = async () => ({ ok: false });

async function base() {
  const db = d1DePrueba();
  const cliente = (id, nombre, email, extra = '') => db.prepare(
    `INSERT INTO clientes (id, nombre, nombres, apellido_paterno, apellido_materno, tipo_documento, dni, fecha_nacimiento, whatsapp, email, creado_en)
     VALUES (?1, ?2, ?2, 'Pérez', NULL, 'dni', '01234567', '1990-05-04', '+51987654321', ?3, 'x')`,
  ).bind(id, nombre, email).run();
  const reserva = (id, cli, estado, retencion, inicio) => db.prepare(
    `INSERT INTO reservas (id, token, cliente_id, producto, duracion_meses, monto_centimos, peso_tope, nutricionista_id, inicio_utc, fecha_lima,
       modalidad, estado, retencion_hasta, creado_en, actualizado_en)
     VALUES (?1, ?1, ?2, 'constancia', 3, 108000, 1, 'nico', ?5, '2026-10-20', 'video', ?3, ?4, '2026-10-10T00:00:00Z', 'x')`,
  ).bind(id, cli, estado, retencion, inicio).run();
  await cliente('c1', 'Ana', 'ana@x.pe');
  await cliente('c2', '=HYPERLINK("x")', 'mal@x.pe');
  await cliente('c3', 'Luis', 'luis@x.pe');
  await reserva('pagada', 'c1', 'confirmada', null, '2026-10-20T15:00:00Z');
  await db.prepare("INSERT INTO pagos (id, reserva_id, mp_payment_id, estado, monto_centimos, metodo, creado_en) VALUES ('p', 'pagada', '9', 'approved', 108000, 'visa', '2026-10-11T22:00:00Z')").run();
  await reserva('nopago', 'c2', 'expirada', '2026-10-11T10:00:00Z', '2026-10-20T16:00:00Z');
  await reserva('viejo', 'c3', 'expirada', '2026-09-01T10:00:00Z', '2026-09-05T16:00:00Z');
  return db;
}
const get = (ruta) => new Request(`https://x.test${ruta}`);
const post = (cuerpo) => new Request('https://x.test/api/equipo/contactado', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });

test('equipo: sin acceso, 401 y no se lee nada', async () => {
  const deps = { db: { prepare() { throw new Error('no debía leer'); } }, ahora, nutricionistas, acceso: fuera };
  for (const r of [await handleEquipoReservas(get('/api/equipo/reservas'), {}, deps), await handleEquipoExcel(get('/api/equipo/excel'), {}, deps),
    await handleEquipoContactado(post({ id: 'x', contactado: true }), {}, deps)]) assert.equal(r.status, 401);
});

test('equipo: lista pagadas y no pagadas de los últimos 30 días, con sus datos', async () => {
  const deps = { db: await base(), ahora, nutricionistas, acceso: dentro };
  const d = await (await handleEquipoReservas(get('/api/equipo/reservas'), {}, deps)).json();
  assert.equal(d.email, 'romi@x.pe');
  assert.deepEqual(d.pagadas.map((r) => [r.id, r.nombre, r.dni, r.pagado_en, r.metodo, r.nutricionista, r.titulo]),
    [['pagada', 'Ana', '01234567', '2026-10-11T22:00:00Z', 'visa', 'Nico', '2 sesiones al mes · 3 meses']]);
  assert.deepEqual(d.no_pagadas.map((r) => r.id), ['nopago']);
  assert.equal(d.no_pagadas[0].contactado_en, null);
});

test('equipo: marcar y desmarcar contactado guarda quién y cuándo', async () => {
  const db = await base();
  const deps = { db, ahora, nutricionistas, acceso: dentro };
  assert.equal((await handleEquipoContactado(post({ id: 'nopago', contactado: true }), {}, deps)).status, 200);
  let r = await db.prepare("SELECT contactado_en, contactado_por FROM reservas WHERE id = 'nopago'").first();
  assert.deepEqual(r, { contactado_en: '2026-10-12T20:00:00.000Z', contactado_por: 'romi@x.pe' });
  await handleEquipoContactado(post({ id: 'nopago', contactado: false }), {}, deps);
  r = await db.prepare("SELECT contactado_en, contactado_por FROM reservas WHERE id = 'nopago'").first();
  assert.deepEqual(r, { contactado_en: null, contactado_por: null });
  assert.equal((await handleEquipoContactado(post({ id: 'no-existe', contactado: true }), {}, deps)).status, 404);
  assert.equal((await handleEquipoContactado(post({ id: 'nopago' }), {}, deps)).status, 400);
});

test('equipo: Excel (CSV) con los dos grupos, sin fórmulas inyectables y con números como texto', async () => {
  const deps = { db: await base(), ahora, nutricionistas, acceso: dentro };
  const r = await handleEquipoExcel(get('/api/equipo/excel'), {}, deps);
  assert.match(r.headers.get('Content-Type'), /text\/csv/);
  assert.match(r.headers.get('Content-Disposition'), /reservas-ajl-2026-10-12\.csv/);
  const bytes = new Uint8Array(await r.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 3)], [0xEF, 0xBB, 0xBF], 'BOM para que Excel lea las tildes');
  const texto = new TextDecoder().decode(bytes);
  assert.ok(texto.startsWith('sep=,\r\n'));
  assert.ok(texto.includes('Pagó'));
  assert.ok(texto.includes('No pagó'));
  assert.ok(!texto.includes(',=HYPERLINK') && !texto.includes(',"=HYPERLINK'), 'fórmula neutralizada');
  assert.ok(texto.includes("\"'=HYPERLINK(\"\"x\"\")\""));
  assert.ok(texto.includes('\t01234567'), 'documento con cero inicial queda como texto');
});

test('equipo: las citas agendadas con link no aparecen en «Pagaron»', async () => {
  const db = await base();
  await db.prepare("UPDATE reservas SET link_id = 'L1' WHERE id = 'pagada'").run();
  const deps = { db, ahora, nutricionistas, acceso: dentro };
  const d = await (await handleEquipoReservas(get('/api/equipo/reservas'), {}, deps)).json();
  assert.deepEqual(d.pagadas, []);
});
