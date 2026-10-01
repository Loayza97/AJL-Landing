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

test('si falla el aviso de la confirmación (correo caído): igual queda confirmada y el equipo recibe una alerta', async () => {
  const { db, deps, correos } = await preparar({ pagos: { 555: aprobado() } });
  const original = deps.sendEmail;
  deps.sendEmail = async (m) => (m.to === 'ana@x.pe' ? Promise.reject(new Error('Resend caído')) : original(m));
  assert.deepEqual(await procesarPago(deps, env, '555'), { estado: 'confirmada' });
  const r = await repo.reservaPorId(db, 'r1');
  assert.equal(r.estado, 'confirmada');
  assert.equal(r.google_event_id, 'ev1');
  assert.equal(correos.filter((c) => c.to === 'ana@x.pe').length, 0);
  const alerta = correos.find((c) => c.subject?.includes('Reserva confirmada sin aviso'));
  assert.ok(alerta);
  assert.equal(alerta.to, 'equipo@x.pe');
  assert.match(alerta.html, /Reserva r1 quedó confirmada pero falló el aviso/);
});

test('pago de otra reserva o desconocida: no toca nada', async () => {
  const { db, deps } = await preparar({ pagos: { 9: aprobado({ id: 9, external_reference: 'otra' }) } });
  assert.deepEqual(await procesarPago(deps, env, '9'), { estado: 'desconocido' });
  assert.deepEqual(await procesarPago(deps, env, '9', { reservaId: 'r1' }), { estado: 'desconocido' });
  assert.equal((await repo.reservaPorId(db, 'r1')).estado, 'pagando');
});

test('pago duplicado de una reserva ya confirmada: alerta al equipo una sola vez', async () => {
  const { deps, correos } = await preparar({ pagos: { 555: aprobado(), 556: aprobado({ id: 556 }) } });
  assert.deepEqual(await procesarPago(deps, env, '555'), { estado: 'confirmada' });
  assert.deepEqual(await procesarPago(deps, env, '556'), { estado: 'confirmada' });
  const alertas = correos.filter((c) => c.subject?.includes('Pago duplicado'));
  assert.equal(alertas.length, 1);
  assert.equal(alertas[0].to, 'equipo@x.pe');
  assert.match(alertas[0].html, /pagos 555 y 556/);
  assert.match(alertas[0].html, /reserva r1/);
});

test('aprobado tarde con la hora tomada, procesado dos veces a la vez: un solo correo al paciente', async () => {
  const { db, deps, correos, mover } = await preparar({ pagos: { 555: aprobado() } });
  mover(40);
  await repo.crearRetencion(db, { id: 'otro', token: 'tok2', producto: 'basico', duracion_meses: 1, monto_centimos: 25000, peso_tope: 1,
    nutricionista_id: 'jussara', inicio_utc: '2026-10-06T17:00:00Z', fecha_lima: '2026-10-06', modalidad: 'presencial', primerasManuales: 0, tope: 3, ahora: deps.ahora() });
  await Promise.all([procesarPago(deps, env, '555'), procesarPago(deps, env, '555')]);
  assert.equal(correos.filter((c) => c.to === 'ana@x.pe').length, 1);
});
