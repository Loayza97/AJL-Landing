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

test('límite de retenciones por huella: la tercera a la vez no entra; vencidas no cuentan', async () => {
  const db = d1DePrueba();
  const h = (hora, extra = {}) => ret(db, { inicio_utc: `2026-10-06T${hora}:00:00Z`, nutricionista_id: `n${hora}`, huella: 'abc', maxRetenciones: 2, ...extra });
  assert.equal((await h('14')).ok, true);
  assert.equal((await h('15')).ok, true);
  assert.deepEqual(await h('16'), { ok: false, motivo: 'limite' });
  assert.equal((await h('16', { ahora: mas(16) })).ok, true);
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

test('purgar borra la huella apenas termina la retención', async () => {
  const db = d1DePrueba();
  await ret(db, { token: 'th', huella: 'abc' });
  await repo.purgarNoPagadas(db, mas(16));
  assert.equal((await repo.reservaPorToken(db, 'th')).huella, null);
});
