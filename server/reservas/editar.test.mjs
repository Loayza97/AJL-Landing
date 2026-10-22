import { test } from 'node:test';
import assert from 'node:assert/strict';
import { textoCambios, sincronizarEventoEditado } from './editar.mjs';
import { nutricionistas } from '../../src/data/nutricionistas.js';
import { d1DePrueba } from './d1-prueba.mjs';
import * as repo from './repo.mjs';

const antes = { inicio_utc: '2026-10-29T15:00:00Z', modalidad: 'presencial', nutricionista_id: 'jussara' };

test('textoCambios: solo lo que cambió; el día si cambió la fecha', () => {
  assert.equal(textoCambios(antes, { ...antes, inicio_utc: '2026-10-29T14:00:00Z' }, nutricionistas), '10:00 → 09:00');
  assert.equal(textoCambios(antes, { inicio_utc: '2026-10-30T20:00:00Z', modalidad: 'video', nutricionista_id: 'nico' }, nutricionistas),
    'jue 29 oct 10:00 → vie 30 oct 15:00 · presencial → virtual · Jussara → Nico');
  assert.equal(textoCambios(antes, antes, nutricionistas), 'sin cambios');
});

const t0 = new Date('2026-10-05T15:00:00Z');
const env = { NOTIFICATION_EMAIL: 'equipo@x.pe' };
const cliente = { nombre: 'Ana Pérez', nombres: 'Ana', apellido_paterno: 'Pérez', apellido_materno: 'Núñez', fecha_nacimiento: '1990-05-04',
  tipo_documento: 'dni', dni: '12345678', whatsapp: '+51987654321', email: 'a@x.pe' };

// Cita confirmada de Jussara el martes 6 a las 10:00 (Lima), con ficha de paciente.
async function sembrar(db, { eventId = 'ev1', modalidad = 'video', meet = 'https://meet.google.com/viejo' } = {}) {
  await repo.crearRetencion(db, { id: 'e', token: 'te', producto: 'constancia', duracion_meses: 3, monto_centimos: 108000, peso_tope: 1,
    nutricionista_id: 'jussara', inicio_utc: '2026-10-06T15:00:00Z', fecha_lima: '2026-10-06', modalidad, tope: 300, ahora: t0 });
  await repo.guardarDatosYPagar(db, { reserva: await repo.reservaPorToken(db, 'te'), cliente, condicionesVersion: 'v', novedades: false, ahora: t0 });
  await db.prepare("UPDATE reservas SET estado = 'confirmada', retencion_hasta = NULL, google_event_id = ?1, meet_url = ?2 WHERE id = 'e'").bind(eventId, meet).run();
}

function deps(google, correos = []) {
  return { db: d1DePrueba(), ahora: () => t0, nutricionistas, google, sendEmail: async (m) => { correos.push(m); } };
}

test('sincronizar: con evento, lo actualiza (mismo id) y guarda el meet devuelto', async () => {
  const llamadas = [];
  const d = deps({ actualizarEvento: async (id, datos) => { llamadas.push([id, datos]); return { id, meet: 'https://meet.google.com/nuevo' }; } });
  await sembrar(d.db, { modalidad: 'presencial', meet: null });
  await repo.editarReserva(d.db, { id: 'e', nutricionista_id: 'jussara', inicio_utc: '2026-10-06T16:00:00Z', fecha_lima: '2026-10-06', modalidad: 'video',
    editadaPor: 'romi@x.pe', cambios: 'x', ahora: t0 });
  const r = await repo.reservaPorId(d.db, 'e');
  assert.equal(await sincronizarEventoEditado(d, env, r, { modalidadAnterior: 'presencial' }), 'ok');
  assert.equal(llamadas.length, 1);
  assert.equal(llamadas[0][0], 'ev1');
  assert.match(llamadas[0][1].titulo, /Ana Pérez/);
  assert.deepEqual([llamadas[0][1].inicioUtc, llamadas[0][1].modalidad, llamadas[0][1].cambiaModalidad], ['2026-10-06T16:00:00Z', 'video', true]);
  assert.equal((await repo.reservaPorId(d.db, 'e')).meet_url, 'https://meet.google.com/nuevo');
});

test('sincronizar: video a video no cambia la modalidad y conserva el meet si la respuesta no trae uno', async () => {
  const llamadas = [];
  const d = deps({ actualizarEvento: async (id, datos) => { llamadas.push(datos); return { id, meet: null }; } });
  await sembrar(d.db);
  const r = await repo.reservaPorId(d.db, 'e');
  assert.equal(await sincronizarEventoEditado(d, env, r, { modalidadAnterior: 'video' }), 'ok');
  assert.equal(llamadas[0].cambiaModalidad, false);
  assert.equal((await repo.reservaPorId(d.db, 'e')).meet_url, 'https://meet.google.com/viejo');
});

test('sincronizar: video a presencial deja el meet vacío', async () => {
  const d = deps({ actualizarEvento: async (id) => ({ id, meet: null }) });
  await sembrar(d.db);
  await d.db.prepare("UPDATE reservas SET modalidad = 'presencial' WHERE id = 'e'").run();
  assert.equal(await sincronizarEventoEditado(d, env, await repo.reservaPorId(d.db, 'e'), { modalidadAnterior: 'video' }), 'ok');
  assert.equal((await repo.reservaPorId(d.db, 'e')).meet_url, null);
});

test('sincronizar: si el evento ya no existe, crea uno con el invitado y guarda el id nuevo', async () => {
  const creados = [];
  const d = deps({
    actualizarEvento: async () => { throw Object.assign(new Error('404'), { noExiste: true }); },
    crearEvento: async (x) => { creados.push(x); return { id: 'ev2', meet: 'https://meet.google.com/otro' }; },
  });
  await sembrar(d.db);
  assert.equal(await sincronizarEventoEditado(d, env, await repo.reservaPorId(d.db, 'e'), { modalidadAnterior: 'video' }), 'ok');
  assert.deepEqual(creados[0].invitado, { email: 'a@x.pe', nombre: 'Ana Pérez' });
  assert.equal(creados[0].modalidad, 'video');
  const r = await repo.reservaPorId(d.db, 'e');
  assert.deepEqual([r.google_event_id, r.meet_url], ['ev2', 'https://meet.google.com/otro']);
});

test('sincronizar: sin google_event_id crea el evento', async () => {
  let actualizo = false;
  const d = deps({ actualizarEvento: async () => { actualizo = true; }, crearEvento: async () => ({ id: 'ev3', meet: null }) });
  await sembrar(d.db, { eventId: null });
  assert.equal(await sincronizarEventoEditado(d, env, await repo.reservaPorId(d.db, 'e'), { modalidadAnterior: 'video' }), 'ok');
  assert.equal(actualizo, false);
  assert.equal((await repo.reservaPorId(d.db, 'e')).google_event_id, 'ev3');
});

test('sincronizar: otro error de Google marca pendiente y avisa al equipo', async () => {
  const correos = [];
  const d = deps({ actualizarEvento: async () => { throw new Error('500'); } }, correos);
  await sembrar(d.db);
  const mudo = console.error; console.error = () => {};
  try {
    assert.equal(await sincronizarEventoEditado(d, env, await repo.reservaPorId(d.db, 'e'), { modalidadAnterior: 'video' }), 'pendiente');
  } finally { console.error = mudo; }
  assert.equal((await repo.reservaPorId(d.db, 'e')).calendario_pendiente, 1);
  assert.equal(correos.length, 1);
  assert.equal(correos[0].to, 'equipo@x.pe');
});
