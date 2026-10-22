import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1DePrueba } from '../reservas/d1-prueba.mjs';
import { nutricionistas } from '../../src/data/nutricionistas.js';
import * as repo from '../reservas/repo.mjs';
import { textoCambios } from '../reservas/editar.mjs';
import { handleEditar, handleEditarHoras } from './equipo-editar.mjs';

const t0 = new Date('2026-10-05T15:00:00Z');
const env = { NOTIFICATION_EMAIL: 'equipo@x.pe' };
const dentro = async () => ({ ok: true, email: 'romi@x.pe' });
const fuera = async () => ({ ok: false });
const get = (ruta) => new Request(`https://x.test${ruta}`);
const post = (cuerpo) => new Request('https://x.test/api/equipo/editar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
const cliente = { nombre: 'Ana Pérez', nombres: 'Ana', apellido_paterno: 'Pérez', apellido_materno: 'Núñez', fecha_nacimiento: '1990-05-04',
  tipo_documento: 'dni', dni: '12345678', whatsapp: '+51987654321', email: 'a@x.pe' };

function deps(o = {}) {
  const llamadas = [];
  const d = { db: d1DePrueba(), ahora: () => t0, nutricionistas, acceso: dentro, sendEmail: async () => {}, llamadas,
    google: { listarEventos: async () => [], actualizarEvento: async (id, datos) => { llamadas.push([id, datos]); return { id, meet: null }; },
      crearEvento: async () => ({ id: 'nuevo', meet: null }) }, ...o };
  return d;
}

let n = 0;
async function cita(db, o = {}) {
  const id = o.id ?? `c${++n}`;
  await repo.crearRetencion(db, { id, token: o.token ?? `t${id}`, producto: 'constancia', duracion_meses: 3, monto_centimos: 108000, peso_tope: 1,
    nutricionista_id: 'jussara', inicio_utc: '2026-10-06T15:00:00Z', fecha_lima: '2026-10-06', modalidad: 'presencial', tope: 300, ahora: t0, ...o });
  await repo.guardarDatosYPagar(db, { reserva: await repo.reservaPorId(db, id), cliente, condicionesVersion: 'v', novedades: false, ahora: t0 });
  await db.prepare("UPDATE reservas SET estado = 'confirmada', retencion_hasta = NULL, google_event_id = 'ev1' WHERE id = ?1").bind(id).run();
  return id;
}

const q = (id, extra = '') => `/api/equipo/editar-horas?id=${id}&nutricionista=jussara&fecha=2026-10-06&modalidad=presencial${extra}`;

test('editar-horas: sin acceso 401; parámetros inválidos 400', async () => {
  assert.equal((await handleEditarHoras(get(q('x')), env, deps({ acceso: fuera }))).status, 401);
  const d = deps();
  const id = await cita(d.db);
  for (const ruta of [`/api/equipo/editar-horas?id=${id}&nutricionista=jussara&fecha=mañana&modalidad=presencial`,
    `/api/equipo/editar-horas?id=${id}&nutricionista=zzz&fecha=2026-10-06&modalidad=presencial`,
    `/api/equipo/editar-horas?id=${id}&nutricionista=jussara&fecha=2026-10-06&modalidad=otra`]) {
    assert.equal((await handleEditarHoras(get(ruta), env, d)).status, 400, ruta);
  }
});

test('editar-horas: la cita no se bloquea a sí misma', async () => {
  const d = deps();
  const id = await cita(d.db);
  const r = await (await handleEditarHoras(get(q(id)), env, d)).json();
  assert.ok(r.horas.some((h) => h.hora === '10:00'), JSON.stringify(r.horas));
});

test('editar-horas: con el día lleno por otras 5 citas sigue habiendo horas (sin tope)', async () => {
  const d = deps();
  const id = await cita(d.db);
  for (const h of ['14', '16', '17', '19', '20']) {
    await cita(d.db, { nutricionista_id: 'nico', inicio_utc: `2026-10-06T${h}:00:00Z`, modalidad: 'video', tope: 9999 });
  }
  const r = await (await handleEditarHoras(get(q(id)), env, d)).json();
  assert.ok(r.horas.length > 0);
});

test('editar: sin acceso 401; datos inválidos 400', async () => {
  assert.equal((await handleEditar(post({}), env, deps({ acceso: fuera }))).status, 401);
  const d = deps();
  const id = await cita(d.db);
  for (const c of [{}, { id, inicio: 'ayer', modalidad: 'video', nutricionista: 'jussara' }, { id, inicio: '2026-10-06T16:00:00Z', modalidad: 'x', nutricionista: 'jussara' },
    { id, inicio: '2026-10-06T16:00:00Z', modalidad: 'video', nutricionista: 'zzz' }]) {
    assert.equal((await handleEditar(post(c), env, d)).status, 400, JSON.stringify(c));
  }
});

test('editar: cita pasada 409 «ya no se puede editar»', async () => {
  const d = deps({ ahora: () => new Date('2026-10-06T16:00:00Z') });
  const id = await cita(d.db);
  const r = await handleEditar(post({ id, inicio: '2026-10-07T15:00:00Z', modalidad: 'video', nutricionista: 'jussara' }), env, d);
  assert.equal(r.status, 409);
  assert.equal((await r.json()).error, 'Esta cita ya no se puede editar.');
});

test('editar: hora fuera de la ventana de la nutri 409 «acaba de ocuparse»', async () => {
  const d = deps();
  const id = await cita(d.db);
  const r = await handleEditar(post({ id, inicio: '2026-10-06T11:00:00Z', modalidad: 'presencial', nutricionista: 'jussara' }), env, d);
  assert.equal(r.status, 409);
  assert.equal((await r.json()).error, 'Esa hora acaba de ocuparse. Elige otra.');
});

test('editar: caso feliz cambia la reserva, guarda quién y qué, y actualiza el evento', async () => {
  const d = deps();
  const id = await cita(d.db);
  const r = await handleEditar(post({ id, inicio: '2026-10-06T16:00:00Z', modalidad: 'video', nutricionista: 'jussara' }), env, d);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, calendario: 'ok' });
  const f = await repo.reservaPorId(d.db, id);
  assert.deepEqual([f.inicio_utc, f.modalidad, f.editada_por], ['2026-10-06T16:00:00Z', 'video', 'romi@x.pe']);
  assert.equal(f.edicion_cambios, textoCambios({ inicio_utc: '2026-10-06T15:00:00Z', modalidad: 'presencial', nutricionista_id: 'jussara' },
    { inicio_utc: '2026-10-06T16:00:00Z', modalidad: 'video', nutricionista_id: 'jussara' }, nutricionistas));
  assert.equal(d.llamadas.length, 1);
  assert.equal(d.llamadas[0][0], 'ev1');
  assert.equal(d.llamadas[0][1].cambiaModalidad, true);
});

test('editar: si Google falla, la cita queda editada y la respuesta dice pendiente', async () => {
  const d = deps({ google: { listarEventos: async () => [], actualizarEvento: async () => { throw new Error('500'); } } });
  const id = await cita(d.db);
  const mudo = console.error; console.error = () => {};
  try {
    const r = await handleEditar(post({ id, inicio: '2026-10-06T16:00:00Z', modalidad: 'video', nutricionista: 'jussara' }), env, d);
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { ok: true, calendario: 'pendiente' });
  } finally { console.error = mudo; }
  assert.equal((await repo.reservaPorId(d.db, id)).inicio_utc, '2026-10-06T16:00:00Z');
});
