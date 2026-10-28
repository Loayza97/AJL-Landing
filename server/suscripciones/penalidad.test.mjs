import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1DePrueba } from '../reservas/d1-prueba.mjs';
import * as sus from './repo.mjs';
import { procesarPagoPenalidad } from './penalidad.mjs';
import { procesarPreapproval } from './procesar.mjs';

const t0 = new Date('2026-11-20T15:00:00Z');
const env = { PUBLIC_SITE_URL: 'https://www.ajlnutricion.com', CORREOS_EQUIPO: JSON.stringify({ romina: 'r@x.pe', irene: 'i@x.pe', alejandro: 'a@x.pe' }) };
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

test('orden inverso: el pago gana la penalidad y la baja de Mercado Pago llega durante la cancelación: nadie dice «quedan pendientes»', async () => {
  const d = armar();
  d.mp.cancelarSuscripcion = async () => { await procesarPreapproval(d, env, 'pre1'); };
  await sus.crear(d.db, activa());
  await procesarPagoPenalidad(d, env, pagoPen());
  const s = await sus.porId(d.db, 's1');
  assert.equal(s.estado, 'cancelada');
  assert.equal(s.penalidad_estado, 'pagada');
  assert.ok(!d.correos.some((c) => /quedan pendientes/.test(c.html)));
  assert.equal(d.correos.filter((c) => c.to === 'ana@x.pe').length, 1);
});

test('si Mercado Pago no cancela, el equipo recibe la alerta para cancelar a mano', async () => {
  const d = armar();
  d.mp.cancelarSuscripcion = async () => { throw new Error('caído'); };
  await sus.crear(d.db, activa());
  await procesarPagoPenalidad(d, env, pagoPen());
  assert.ok(d.correos.some((c) => /Cancelar a mano en Mercado Pago/.test(c.subject) && /pre1/.test(c.html)));
});
