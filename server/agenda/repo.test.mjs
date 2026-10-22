import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1DePrueba } from '../reservas/d1-prueba.mjs';
import * as repo from '../reservas/repo.mjs';
import * as agenda from './repo.mjs';

const t0 = new Date('2026-10-05T15:00:00Z');
const dias = (n) => new Date(t0.getTime() + n * 86400000);
const nuevo = { nombre: 'Lucía Ramos Quispe', nombres: 'Lucía', apellido_paterno: 'Ramos', apellido_materno: 'Quispe',
  fecha_nacimiento: '1992-03-08', tipo_documento: 'dni', dni: '70123456', whatsapp: '+51987654321', email: 'lucia@x.pe' };
const hora = (o = {}) => ({ inicio: '2026-10-06T15:00:00Z', fin: '2026-10-06T15:30:00Z', nutricionista_id: 'nico', modalidad: 'video',
  fecha_lima: '2026-10-06', duracion_min: 30, ...o });
let n = 0;
async function link(db, o = {}) {
  const id = `l${++n}`;
  await agenda.crearLink(db, { id, tokenHash: `h${n}`, tipo: 'c30v', creadoPor: 'romi@x.pe', ahora: t0, ...o });
  return id;
}
const agendar = (db, linkId, o = {}) => agenda.agendarConLink(db, { link: linkId, reservaId: `r${++n}`, token: `t${n}`, tipoId: 'c30v',
  cliente: nuevo, clienteId: `c${n}`, hora: hora(), pacienteNuevo: true, condicionesVersion: 'v1', ahora: t0, ...o });

test('crear: vence a los 7 días; el estado sale de las fechas', async () => {
  const db = d1DePrueba();
  const { vence_en } = await agenda.crearLink(db, { id: 'a', tokenHash: 'ha', tipo: 's60', creadoPor: 'romi@x.pe', ahora: t0 });
  assert.equal(vence_en, dias(7).toISOString());
  const l = await agenda.linkPorHash(db, 'ha');
  assert.equal(agenda.estadoLink(l, t0), 'sin_usar');
  assert.equal(agenda.estadoLink(l, dias(7)), 'vencido');
  assert.equal(await agenda.linkPorHash(db, 'no'), null);
});

test('agendar: crea cliente, reserva confirmada de link y marca el link usado', async () => {
  const db = d1DePrueba();
  const id = await link(db);
  const res = await agendar(db, id, { reservaId: 'rx', token: 'tx', clienteId: 'cx' });
  assert.deepEqual(res, { ok: true });
  const r = await repo.reservaPorId(db, 'rx');
  assert.deepEqual([r.estado, r.producto, r.monto_centimos, r.peso_tope, r.link_id, r.fin_utc, r.duracion_min, r.dni, r.email],
    ['confirmada', 'link_c30v', 0, 0, id, '2026-10-06T15:30:00Z', 30, '70123456', 'lucia@x.pe']);
  const l = await agenda.linkPorHash(db, `h${n - 1}`);
  assert.equal(agenda.estadoLink(l, t0), 'agendado');
  assert.equal(l.reserva_id, 'rx');
  assert.equal(l.paciente_nuevo, 1);
});

test('agendar dos veces con el mismo link: la segunda no entra y no deja datos sueltos', async () => {
  const db = d1DePrueba();
  const id = await link(db);
  assert.equal((await agendar(db, id)).ok, true);
  assert.deepEqual(await agendar(db, id, { hora: hora({ inicio: '2026-10-07T15:00:00Z', fin: '2026-10-07T15:30:00Z', fecha_lima: '2026-10-07' }) }),
    { ok: false, motivo: 'link' });
  assert.equal((await db.prepare('SELECT COUNT(*) AS c FROM clientes').first()).c, 1);
  assert.equal((await db.prepare('SELECT COUNT(*) AS c FROM reservas').first()).c, 1);
});

test('agendar con link vencido: motivo link', async () => {
  const db = d1DePrueba();
  const id = await link(db);
  assert.deepEqual(await agendar(db, id, { ahora: dias(8) }), { ok: false, motivo: 'link' });
});

test('agendar sobre una hora que se cruza con una reserva web: ocupada, y el link sigue sin usar', async () => {
  const db = d1DePrueba();
  await repo.crearRetencion(db, { id: 'web', token: 'tw', producto: 'constancia', duracion_meses: 3, monto_centimos: 108000, peso_tope: 1,
    nutricionista_id: 'nico', inicio_utc: '2026-10-06T15:00:00Z', fecha_lima: '2026-10-06', modalidad: 'video', tope: 300, ahora: t0 });
  const id = await link(db);
  assert.deepEqual(await agendar(db, id, { hora: hora({ inicio: '2026-10-06T15:30:00Z', fin: '2026-10-06T16:00:00Z' }) }), { ok: false, motivo: 'ocupada' });
  const l = await db.prepare('SELECT usado_en FROM links_agenda WHERE id = ?1').bind(id).first();
  assert.equal(l.usado_en, null);
});

test('agendar con el día lleno (tope en minutos, Alejandro 2026-10-22): motivo tope, sin cliente nuevo y el link sigue sin usar', async () => {
  const db = d1DePrueba();
  for (const h of ['15', '16', '17', '19', '20']) {
    await repo.crearRetencion(db, { id: `w${h}`, token: `tw${h}`, producto: 'constancia', duracion_meses: 3, monto_centimos: 108000, peso_tope: 1,
      nutricionista_id: `n${h}`, inicio_utc: `2026-10-06T${h}:00:00Z`, fecha_lima: '2026-10-06', modalidad: 'video', tope: 300, ahora: t0 });
  }
  const id = await link(db);
  assert.deepEqual(await agendar(db, id, { hora: hora({ inicio: '2026-10-06T22:00:00Z', fin: '2026-10-06T22:30:00Z' }) }), { ok: false, motivo: 'tope' });
  assert.equal((await db.prepare('SELECT usado_en FROM links_agenda WHERE id = ?1').bind(id).first()).usado_en, null);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM clientes').first()).n, 0);
});

test('paciente conocido: agenda con su cliente existente, sin crear otro', async () => {
  const db = d1DePrueba();
  const a = await link(db);
  await agendar(db, a, { clienteId: 'c-lucia' });
  const b = await link(db);
  const res = await agendar(db, b, { cliente: null, clienteId: 'c-lucia', pacienteNuevo: false,
    hora: hora({ inicio: '2026-10-08T15:00:00Z', fin: '2026-10-08T15:30:00Z', fecha_lima: '2026-10-08' }) });
  assert.deepEqual(res, { ok: true });
  assert.equal((await db.prepare('SELECT COUNT(*) AS c FROM clientes').first()).c, 1);
});

test('pacientePorDni: solo quien tiene una reserva confirmada o pagada; el más reciente', async () => {
  const db = d1DePrueba();
  assert.equal(await agenda.pacientePorDni(db, '70123456'), null);
  await agendar(db, await link(db), { clienteId: 'c-1' });
  const p = await agenda.pacientePorDni(db, '70123456');
  assert.equal(p.id, 'c-1');
  assert.equal(p.email, 'lucia@x.pe');
  await db.prepare(`INSERT INTO clientes (id, nombre, dni, tipo_documento, email, creado_en) VALUES ('suelto', 'X', '11112222', 'dni', 'x@x.pe', 'z')`).run();
  assert.equal(await agenda.pacientePorDni(db, '11112222'), null);
});

test('reactivar: solo un link vencido y sin usar; suma 3 días desde ahora', async () => {
  const db = d1DePrueba();
  const id = await link(db);
  assert.equal(await agenda.reactivarLink(db, id, dias(1)), null);
  assert.equal(await agenda.reactivarLink(db, id, dias(9)), dias(12).toISOString());
  const usado = await link(db);
  await agendar(db, usado);
  assert.equal(await agenda.reactivarLink(db, usado, dias(9)), null);
});

test('consultas de DNI: hasta el máximo por link', async () => {
  const db = d1DePrueba();
  const id = await link(db);
  assert.equal(await agenda.contarConsultaDni(db, id, 2), true);
  assert.equal(await agenda.contarConsultaDni(db, id, 2), true);
  assert.equal(await agenda.contarConsultaDni(db, id, 2), false);
});

test('borrar: solo un link sin usar (vigente o vencido), en una sola sentencia; el usado no se toca', async () => {
  const db = d1DePrueba();
  const vigente = await link(db);
  const vencido = await link(db, { ahora: dias(-8) });
  const usado = await link(db);
  assert.deepEqual(await agendar(db, usado), { ok: true });
  assert.equal(await agenda.borrarLink(db, vigente), 'borrado');
  assert.equal(await agenda.borrarLink(db, vencido), 'borrado');
  assert.equal(await agenda.borrarLink(db, usado), 'usado');
  assert.equal(await agenda.borrarLink(db, 'no-existe'), null);
  const { results } = await db.prepare('SELECT id FROM links_agenda').all();
  assert.deepEqual(results.map((l) => l.id), [usado]);
});
