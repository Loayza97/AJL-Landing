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

function armar({ cobros = {}, pagos = {}, pre = {}, planes = {} } = {}) {
  const correos = [];
  const canceladas = [];
  const desactivados = [];
  const d = {
    db: d1DePrueba(), nutricionistas, ahora: () => t0, correos, canceladas, desactivados,
    sendEmail: async (c) => { correos.push(c); return true; },
    google: { listarEventos: async () => [], crearEvento: async () => ({ id: 'ev', meet: null }) },
    mp: {
      obtenerCobroSuscripcion: async (id) => cobros[id],
      obtenerPago: async (id) => pagos[id],
      obtenerSuscripcion: async (id) => pre[id],
      cancelarSuscripcion: async (id) => { canceladas.push(id); return {}; },
      buscarCobrosSuscripcion: async () => Object.values(cobros),
      buscarSuscripcionDePlan: async (id) => planes[id] ?? null,
      desactivarPlan: async (id) => { desactivados.push(id); return {}; },
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

test('si la confirmación del primer cobro falla, el reintento del aviso la completa', async () => {
  const d = armar({ cobros: { a1: cobro('a1', 'p1') }, pagos: { p1: pago('p1') } });
  await reservaMensual(d);
  const prepare = d.db.prepare.bind(d.db);
  let fallar = true;
  d.db.prepare = (sql) => {
    if (fallar && sql.includes("estado = 'confirmada'")) { fallar = false; throw new Error('D1 caída'); }
    return prepare(sql);
  };
  await assert.rejects(procesarCobro(d, env, 'a1'), /D1 caída/);
  assert.notEqual((await repo.reservaPorId(d.db, 'r1')).estado, 'confirmada');
  await procesarCobro(d, env, 'a1');
  assert.equal((await repo.reservaPorId(d.db, 'r1')).estado, 'confirmada');
  assert.equal((await sus.porId(d.db, 's1')).cobros_aprobados, 1);
});

test('un cobro solo cuenta si la API de pagos lo confirma aprobado', async () => {
  const d = armar({ cobros: { a1: cobro('a1', 'p1') }, pagos: {} });
  await reservaMensual(d);
  await procesarCobro(d, env, 'a1');
  assert.equal((await sus.porId(d.db, 's1')).cobros_aprobados, 0);
  assert.notEqual((await repo.reservaPorId(d.db, 'r1')).estado, 'confirmada');
});

test('cobro cuyo preapproval no está guardado: se encuentra por la referencia externa', async () => {
  const d = armar({ cobros: { a1: { ...cobro('a1', 'p1'), preapproval_id: 'pre-viejo' } }, pagos: { p1: pago('p1') },
    pre: { 'pre-viejo': { id: 'pre-viejo', external_reference: 's1', status: 'pending' } } });
  await reservaMensual(d);
  await d.db.prepare("UPDATE suscripciones SET mp_preapproval_id = NULL WHERE id = 's1'").run();
  assert.deepEqual(await procesarCobro(d, env, 'a1'), { estado: 'aprobado', numero: 1 });
  assert.equal((await repo.reservaPorId(d.db, 'r1')).estado, 'confirmada');
});

test('aviso de baja de un preapproval reemplazado por un reintento no cancela la suscripción', async () => {
  const d = armar({ pre: { 'pre-viejo': { id: 'pre-viejo', status: 'cancelled', external_reference: 's1' } } });
  await reservaMensual(d);
  await procesarPreapproval(d, env, 'pre-viejo');
  assert.equal((await sus.porId(d.db, 's1')).estado, 'pendiente');
});

test('cobro cancelado porque el paciente canceló en Mercado Pago: baja del paciente, no cobro fallido', async () => {
  const d = armar({ cobros: { a1: cobro('a1', 'p1'), a2: { ...cobro('a2', 'p2', 'cancelled'), payment: { id: 'p2', status: 'rejected' } } },
    pagos: { p1: pago('p1'), p2: pago('p2', 'rejected') }, pre: { pre1: { id: 'pre1', status: 'cancelled', external_reference: 's1' } } });
  await reservaMensual(d);
  await procesarCobro(d, env, 'a1');
  assert.deepEqual(await procesarCobro(d, env, 'a2'), { estado: 'cancelada' });
  const s = await sus.porId(d.db, 's1');
  assert.equal(s.estado, 'cancelada');
  assert.equal(s.motivo_cancelacion, 'paciente_mp');
  assert.equal(s.penalidad_estado, 'pendiente');
  assert.deepEqual(d.canceladas, []);
  assert.ok(d.correos.some((c) => c.subject === 'Ana Pérez canceló su plan · penalidad pendiente S/80'));
  assert.ok(!d.correos.some((c) => /Cobro fallido/.test(c.subject)));
  const baja = d.correos.find((c) => /quedó cancelado/.test(c.subject));
  assert.doesNotMatch(baja.html, /No pudimos cobrar/);
});

test('cobro fallido con la penalidad ya pagada: la baja no dice «quedan pendientes» y explica el cobro', async () => {
  const d = armar({ cobros: { a1: cobro('a1', 'p1'), a2: { ...cobro('a2', 'p2', 'cancelled'), payment: { id: 'p2', status: 'rejected' } } },
    pagos: { p1: pago('p1'), p2: pago('p2', 'rejected') } });
  await reservaMensual(d);
  await procesarCobro(d, env, 'a1');
  await sus.marcarPenalidadPagada(d.db, { id: 's1', mpPaymentId: 'pp1', ahora: t0 });
  await d.db.prepare("UPDATE suscripciones SET penalidad_centimos = 8000 WHERE id = 's1'").run();
  await procesarCobro(d, env, 'a2');
  const baja = d.correos.find((c) => c.to === 'ana@x.pe' && /quedó cancelado/.test(c.subject));
  assert.doesNotMatch(baja.html, /quedan pendientes/);
  assert.match(baja.html, /Recibimos el pago de la penalidad/);
  assert.match(baja.html, /No pudimos cobrar tu cuota mensual y Mercado Pago ya no lo volverá a intentar\./);
});

test('cobro aprobado tras la baja: se registra sin sumar, sin recibo, alerta una vez y cancela en Mercado Pago', async () => {
  const d = armar({ cobros: { a1: cobro('a1', 'p1'), a2: cobro('a2', 'p2') }, pagos: { p1: pago('p1'), p2: pago('p2') } });
  await reservaMensual(d);
  await procesarCobro(d, env, 'a1');
  await sus.cancelar(d.db, { id: 's1', motivo: 'paciente_boton', ahora: t0 });
  d.correos.length = 0;
  assert.deepEqual(await procesarCobro(d, env, 'a2'), { estado: 'anomalo' });
  await procesarCobro(d, env, 'a2');
  const s = await sus.porId(d.db, 's1');
  assert.equal(s.cobros_aprobados, 1);
  assert.equal(s.estado, 'cancelada');
  const fila = await d.db.prepare("SELECT estado, numero, monto_centimos FROM suscripcion_cobros WHERE mp_payment_id = 'p2'").first();
  assert.deepEqual(fila, { estado: 'approved', numero: 0, monto_centimos: 36000 });
  assert.ok(!d.correos.some((c) => /Recibimos tu pago/.test(c.subject)));
  const alertas = d.correos.filter((c) => /Cobro tras baja o duplicado: devolver y cancelar en Mercado Pago/.test(c.subject));
  assert.equal(alertas.length, 1);
  assert.match(alertas[0].html, /Ana Pérez/);
  assert.match(alertas[0].html, /pre1/);
  assert.match(alertas[0].html, /S\/360/);
  assert.deepEqual(d.canceladas, ['pre1']);
});

test('cobro aprobado de otro preapproval (duplicado de un reintento): no confirma la cita ni manda recibo', async () => {
  const d = armar({ cobros: { a1: { ...cobro('a1', 'p1'), preapproval_id: 'pre-viejo' } }, pagos: { p1: pago('p1') },
    pre: { 'pre-viejo': { id: 'pre-viejo', external_reference: 's1', status: 'authorized' } } });
  await reservaMensual(d);
  assert.deepEqual(await procesarCobro(d, env, 'a1'), { estado: 'anomalo' });
  assert.notEqual((await repo.reservaPorId(d.db, 'r1')).estado, 'confirmada');
  assert.equal((await sus.porId(d.db, 's1')).cobros_aprobados, 0);
  assert.equal((await sus.porId(d.db, 's1')).estado, 'pendiente');
  assert.ok(!d.correos.some((c) => /Recibimos tu pago/.test(c.subject)));
  assert.equal(d.correos.filter((c) => /Cobro tras baja o duplicado/.test(c.subject)).length, 1);
  assert.deepEqual(d.canceladas, ['pre-viejo']);
});

// Suscripción con plan: la fila tiene mp_plan_id y todavía no sabe su preapproval.
async function conPlan(d) {
  await reservaMensual(d);
  await d.db.prepare("UPDATE suscripciones SET mp_preapproval_id = NULL WHERE id = 's1'").run();
  await sus.guardarPlan(d.db, 's1', 'plan1', t0);
}

test('preapproval de nuestro plan sin referencia externa: se asocia y el plan se desactiva', async () => {
  const d = armar({ pre: { pre1: { id: 'pre1', status: 'authorized', preapproval_plan_id: 'plan1' } } });
  await conPlan(d);
  assert.deepEqual(await procesarPreapproval(d, env, 'pre1'), { estado: 'authorized' });
  const s = await sus.porId(d.db, 's1');
  assert.equal(s.mp_preapproval_id, 'pre1');
  assert.equal(s.estado, 'pendiente');
  assert.deepEqual(d.desactivados, ['plan1']);
  await procesarPreapproval(d, env, 'pre1');
  assert.deepEqual(d.desactivados, ['plan1']); // ya asociado: no se vuelve a desactivar
});

test('si desactivar el plan falla, el preapproval igual queda asociado', async () => {
  const d = armar({ pre: { pre1: { id: 'pre1', status: 'authorized', preapproval_plan_id: 'plan1' } } });
  await conPlan(d);
  d.mp.desactivarPlan = async () => { throw new Error('caído'); };
  assert.deepEqual(await procesarPreapproval(d, env, 'pre1'), { estado: 'authorized' });
  assert.equal((await sus.porId(d.db, 's1')).mp_preapproval_id, 'pre1');
});

test('cobro que llega antes que el preapproval: se asocia por el plan y confirma la cita', async () => {
  const d = armar({ cobros: { a1: cobro('a1', 'p1') }, pagos: { p1: pago('p1') },
    pre: { pre1: { id: 'pre1', status: 'authorized', preapproval_plan_id: 'plan1' } } });
  await conPlan(d);
  assert.deepEqual(await procesarCobro(d, env, 'a1'), { estado: 'aprobado', numero: 1 });
  const s = await sus.porId(d.db, 's1');
  assert.equal(s.mp_preapproval_id, 'pre1');
  assert.equal(s.cobros_aprobados, 1);
  assert.equal((await repo.reservaPorId(d.db, 'r1')).estado, 'confirmada');
  assert.deepEqual(d.desactivados, ['plan1']);
});

test('cobro de un segundo preapproval del mismo plan: anómalo, no suma', async () => {
  const d = armar({ cobros: { a1: { ...cobro('a1', 'p1'), preapproval_id: 'pre2' } }, pagos: { p1: pago('p1') },
    pre: { pre2: { id: 'pre2', status: 'authorized', preapproval_plan_id: 'plan1' } } });
  await reservaMensual(d);
  await d.db.prepare("UPDATE suscripciones SET mp_plan_id = 'plan1' WHERE id = 's1'").run();
  assert.deepEqual(await procesarCobro(d, env, 'a1'), { estado: 'anomalo' });
  assert.equal(d.correos.filter((c) => /Cobro tras baja o duplicado/.test(c.subject)).length, 1);
  assert.equal((await sus.porId(d.db, 's1')).mp_preapproval_id, 'pre1');
  assert.equal((await sus.porId(d.db, 's1')).cobros_aprobados, 0);
  assert.deepEqual(d.canceladas, ['pre2']);
});

test('página de regreso sin preapproval guardado: lo busca por el plan y procesa el primer cobro', async () => {
  const d = armar({ cobros: { a1: cobro('a1', 'p1') }, pagos: { p1: pago('p1') }, planes: { plan1: { id: 'pre1', status: 'authorized', preapproval_plan_id: 'plan1' } } });
  await conPlan(d);
  await sincronizarDeReserva(d, env, 'r1');
  const s = await sus.porId(d.db, 's1');
  assert.equal(s.mp_preapproval_id, 'pre1');
  assert.equal(s.cobros_aprobados, 1);
  assert.equal((await repo.reservaPorId(d.db, 'r1')).estado, 'confirmada');
  assert.deepEqual(d.desactivados, ['plan1']);
});

test('página de regreso antes de que el paciente autorice: no hay preapproval y no pasa nada', async () => {
  const d = armar();
  await conPlan(d);
  await sincronizarDeReserva(d, env, 'r1');
  assert.equal((await sus.porId(d.db, 's1')).mp_preapproval_id, null);
  assert.deepEqual(d.desactivados, []);
});

const alertas = (d) => d.correos.filter((c) => /Cobro tras baja o duplicado: devolver y cancelar en Mercado Pago/.test(c.subject));

test('dos preapprovals del mismo plan a la vez: uno cuenta y el otro avisa como anómalo', async () => {
  const d = armar({ cobros: { a1: cobro('a1', 'p1'), a2: { ...cobro('a2', 'p2'), preapproval_id: 'pre2' } }, pagos: { p1: pago('p1'), p2: pago('p2') },
    pre: { pre1: { id: 'pre1', status: 'authorized', preapproval_plan_id: 'plan1' }, pre2: { id: 'pre2', status: 'authorized', preapproval_plan_id: 'plan1' } } });
  await conPlan(d);
  const res = await Promise.all([procesarCobro(d, env, 'a1'), procesarCobro(d, env, 'a2')]);
  const s = await sus.porId(d.db, 's1');
  assert.equal(s.cobros_aprobados, 1);
  assert.deepEqual(res.map((r) => r.estado).sort(), ['anomalo', 'aprobado']);
  const perdedor = s.mp_preapproval_id === 'pre1' ? 'pre2' : 'pre1';
  assert.deepEqual(d.canceladas, [perdedor]);
  assert.equal(alertas(d).length, 1);
  assert.equal(d.correos.filter((c) => /Recibimos tu pago/.test(c.subject)).length, 1);
});

test('cobro de un plan reemplazado por un reintento: anómalo, avisa, cancela y no manda recibo', async () => {
  const d = armar({ cobros: { a1: { ...cobro('a1', 'p1'), preapproval_id: 'pre-viejo' } }, pagos: { p1: pago('p1') },
    pre: { 'pre-viejo': { id: 'pre-viejo', status: 'authorized', preapproval_plan_id: 'plan1' } } });
  await conPlan(d);
  await sus.guardarPlan(d.db, 's1', 'plan2', t0);
  assert.deepEqual(await procesarCobro(d, env, 'a1'), { estado: 'anomalo' });
  const s = await sus.porId(d.db, 's1');
  assert.equal(s.cobros_aprobados, 0);
  assert.equal(s.mp_preapproval_id, null);
  assert.notEqual((await repo.reservaPorId(d.db, 'r1')).estado, 'confirmada');
  assert.equal(alertas(d).length, 1);
  assert.match(alertas(d)[0].html, /link de pago que se reemplazó/);
  assert.deepEqual(d.canceladas, ['pre-viejo']);
  assert.ok(!d.correos.some((c) => /Recibimos tu pago/.test(c.subject)));
});

test('preapproval autorizado de un plan reemplazado: se cancela en Mercado Pago, sin baja', async () => {
  const d = armar({ pre: { 'pre-viejo': { id: 'pre-viejo', status: 'authorized', preapproval_plan_id: 'plan1' } } });
  await conPlan(d);
  await sus.guardarPlan(d.db, 's1', 'plan2', t0);
  assert.deepEqual(await procesarPreapproval(d, env, 'pre-viejo'), { estado: 'reemplazada' });
  assert.deepEqual(d.canceladas, ['pre-viejo']);
  const s = await sus.porId(d.db, 's1');
  assert.equal(s.estado, 'pendiente');
  assert.equal(s.mp_preapproval_id, null);
  d.mp.obtenerSuscripcion = async (id) => ({ id, status: 'cancelled', preapproval_plan_id: 'plan1' });
  await procesarPreapproval(d, env, 'pre-viejo');
  assert.deepEqual(d.canceladas, ['pre-viejo']); // el aviso de su cancelación no la cancela otra vez
});

test('cobro aprobado de un plan que no es de ninguna suscripción: avisa al equipo', async () => {
  const d = armar({ cobros: { z: { ...cobro('z', 'pz'), preapproval_id: 'pre-x' }, y: { ...cobro('y', 'py'), preapproval_id: 'pre-x' } },
    pagos: { pz: pago('pz'), py: pago('py', 'rejected') }, pre: { 'pre-x': { id: 'pre-x', status: 'authorized', preapproval_plan_id: 'plan-x' } } });
  assert.deepEqual(await procesarCobro(d, env, 'z'), { estado: 'desconocido' });
  assert.equal(alertas(d).length, 1);
  assert.match(alertas(d)[0].html, /plan-x/);
  assert.deepEqual(await procesarCobro(d, env, 'y'), { estado: 'desconocido' });
  assert.equal(alertas(d).length, 1); // un cobro no aprobado no avisa
});

test('preapproval todavía pendiente: se asocia pero el plan no se desactiva', async () => {
  const d = armar({ pre: { pre1: { id: 'pre1', status: 'pending', preapproval_plan_id: 'plan1' } } });
  await conPlan(d);
  await procesarPreapproval(d, env, 'pre1');
  assert.equal((await sus.porId(d.db, 's1')).mp_preapproval_id, 'pre1');
  assert.deepEqual(d.desactivados, []);
});
