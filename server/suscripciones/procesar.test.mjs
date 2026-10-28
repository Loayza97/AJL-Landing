import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1DePrueba } from '../reservas/d1-prueba.mjs';
import { nutricionistas } from '../../src/data/nutricionistas.js';
import * as sus from './repo.mjs';
import * as repo from '../reservas/repo.mjs';
import { procesarCobro, procesarPreapproval, sincronizarDeReserva } from './procesar.mjs';

const t0 = new Date('2026-10-05T15:00:00Z');
const env = { PUBLIC_SITE_URL: 'https://www.ajlnutricion.com', NOTIFICATION_EMAIL: 'eq@x.pe',
  CORREOS_EQUIPO: JSON.stringify({ nico: 'n@x.pe', romina: 'r@x.pe', irene: 'i@x.pe', alejandro: 'a@x.pe' }) };

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
