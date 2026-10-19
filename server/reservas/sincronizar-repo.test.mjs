import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1DePrueba } from './d1-prueba.mjs';
import * as repo from './repo.mjs';

const ahora = new Date('2026-10-19T17:00:00Z');
// Reserva confirmada con evento de Google, como la deja el sistema.
const reserva = (db, o = {}) => db.prepare(
  `INSERT INTO reservas (id, token, producto, duracion_meses, monto_centimos, peso_tope, nutricionista_id, inicio_utc, fin_utc, duracion_min,
     fecha_lima, modalidad, estado, retencion_hasta, creado_en, actualizado_en, google_event_id, cliente_id)
   VALUES (?1, ?1, 'link_c30p', 1, 0, 0, ?2, ?3, ?4, ?5, ?6, ?7, ?8, NULL, 'x', 'x', ?9, ?10)`,
).bind(o.id ?? 'r1', o.nutri ?? 'jussara', o.inicio ?? '2026-10-21T15:00:00Z', o.fin ?? '2026-10-21T15:30:00Z', o.duracion ?? 30,
  o.fecha ?? '2026-10-21', o.modalidad ?? 'presencial', o.estado ?? 'confirmada', o.evento ?? 'ev1', o.cliente ?? null).run();

test('cursor: vacío al inicio, se guarda y se reescribe', async () => {
  const db = d1DePrueba();
  assert.equal(await repo.leerSync(db, 'calendario_cursor'), null);
  await repo.guardarSync(db, 'calendario_cursor', '2026-10-19T16:00:00.000Z');
  await repo.guardarSync(db, 'calendario_cursor', '2026-10-19T16:10:00.000Z');
  assert.equal(await repo.leerSync(db, 'calendario_cursor'), '2026-10-19T16:10:00.000Z');
});

test('reservaPorEvento: por id de evento o por id de reserva; null si no existe', async () => {
  const db = d1DePrueba();
  await reserva(db);
  assert.equal((await repo.reservaPorEvento(db, { eventoId: 'ev1', reservaId: null })).id, 'r1');
  assert.equal((await repo.reservaPorEvento(db, { eventoId: 'otro', reservaId: 'r1' })).id, 'r1');
  assert.equal(await repo.reservaPorEvento(db, { eventoId: 'nada', reservaId: null }), null);
});

test('aplicarCambioCalendario: mueve hora y modalidad, deja rastro y quita la marca', async () => {
  const db = d1DePrueba();
  await reserva(db);
  await repo.marcarRevisar(db, { id: 'r1', motivo: 'borrado', cambios: null, ahora });
  const res = await repo.aplicarCambioCalendario(db, { id: 'r1', inicio: '2026-10-21T14:00:00Z', fin: '2026-10-21T14:30:00Z', duracion: 30,
    fecha: '2026-10-21', modalidad: 'video', cambios: '10:00 → 9:00 · presencial → virtual', ahora });
  assert.deepEqual(res, { ok: true });
  const r = await db.prepare('SELECT * FROM reservas WHERE id = ?1').bind('r1').first();
  assert.equal(r.inicio_utc, '2026-10-21T14:00:00Z');
  assert.equal(r.modalidad, 'video');
  assert.equal(r.calendario_cambios, '10:00 → 9:00 · presencial → virtual');
  assert.equal(r.calendario_editado_en, ahora.toISOString());
  assert.equal(r.calendario_revisar, null);
});

test('aplicarCambioCalendario: choque con índice único → cruce, sin mover', async () => {
  const db = d1DePrueba();
  await reserva(db, { id: 'r1', nutri: 'jussara' });
  await reserva(db, { id: 'r2', nutri: 'jussara', inicio: '2026-10-21T14:00:00Z', fin: '2026-10-21T14:30:00Z', evento: 'ev2' });
  const res = await repo.aplicarCambioCalendario(db, { id: 'r1', inicio: '2026-10-21T14:00:00Z', fin: '2026-10-21T14:30:00Z', duracion: 30,
    fecha: '2026-10-21', modalidad: 'presencial', cambios: '10:00 → 9:00', ahora });
  assert.deepEqual(res, { ok: false, motivo: 'cruce' });
  assert.equal((await repo.reservaPorEvento(db, { eventoId: 'ev1' })).inicio_utc, '2026-10-21T15:00:00Z');
});

test('aplicarCambioCalendario: una reserva no confirmada no se toca', async () => {
  const db = d1DePrueba();
  await reserva(db, { estado: 'cancelada' });
  const res = await repo.aplicarCambioCalendario(db, { id: 'r1', inicio: '2026-10-21T14:00:00Z', fin: '2026-10-21T14:30:00Z', duracion: 30,
    fecha: '2026-10-21', modalidad: 'presencial', cambios: 'x', ahora });
  assert.deepEqual(res, { ok: false, motivo: 'no_confirmada' });
});

test('marcarRevisar y quitarBorrado', async () => {
  const db = d1DePrueba();
  await reserva(db);
  await repo.marcarRevisar(db, { id: 'r1', motivo: 'borrado', cambios: null, ahora });
  assert.equal((await repo.reservaPorEvento(db, { eventoId: 'ev1' })).calendario_revisar, 'borrado');
  await repo.quitarBorrado(db, 'r1');
  assert.equal((await repo.reservaPorEvento(db, { eventoId: 'ev1' })).calendario_revisar, null);
  await repo.marcarRevisar(db, { id: 'r1', motivo: 'cruce', cambios: '10:00 → 9:00', ahora });
  await repo.quitarBorrado(db, 'r1'); // solo quita «borrado», no «cruce»
  const r = await db.prepare('SELECT calendario_revisar, calendario_cambios FROM reservas WHERE id = ?1').bind('r1').first();
  assert.deepEqual({ ...r }, { calendario_revisar: 'cruce', calendario_cambios: '10:00 → 9:00' });
});

test('resolverRevision: cancelar libera la hora y marca cancelada_en_panel; mantener solo quita la marca', async () => {
  const db = d1DePrueba();
  await reserva(db, { id: 'r1', evento: 'ev1' });
  await reserva(db, { id: 'r2', evento: 'ev2', inicio: '2026-10-22T15:00:00Z', fin: '2026-10-22T15:30:00Z', fecha: '2026-10-22' });
  assert.equal(await repo.resolverRevision(db, { id: 'r1', accion: 'cancelar', ahora }), false); // sin marca: no se puede
  await repo.marcarRevisar(db, { id: 'r1', motivo: 'borrado', cambios: null, ahora });
  await repo.marcarRevisar(db, { id: 'r2', motivo: 'borrado', cambios: null, ahora });
  assert.equal(await repo.resolverRevision(db, { id: 'r1', accion: 'cancelar', ahora }), true);
  assert.equal(await repo.resolverRevision(db, { id: 'r2', accion: 'mantener', ahora }), true);
  const r1 = await db.prepare('SELECT estado, cancelada_en_panel, calendario_revisar FROM reservas WHERE id = ?1').bind('r1').first();
  const r2 = await db.prepare('SELECT estado, cancelada_en_panel, calendario_revisar FROM reservas WHERE id = ?1').bind('r2').first();
  assert.deepEqual({ ...r1 }, { estado: 'cancelada', cancelada_en_panel: ahora.toISOString(), calendario_revisar: null });
  assert.deepEqual({ ...r2 }, { estado: 'confirmada', cancelada_en_panel: null, calendario_revisar: null });
  // La hora de r1 quedó libre: otra reserva confirmada puede ocuparla.
  await reserva(db, { id: 'r3', evento: 'ev3' });
});

test('purga de 30 días: no borra la ficha de quien tiene una reserva cancelada desde el panel', async () => {
  const db = d1DePrueba();
  await db.prepare(`INSERT INTO clientes (id, nombre, email, creado_en) VALUES ('c1', 'Cecilia', 'c@x.pe', 'x')`).run();
  await reserva(db, { id: 'r1', cliente: 'c1' });
  await db.prepare(`UPDATE reservas SET estado = 'cancelada', cancelada_en_panel = 'x', actualizado_en = '2026-09-01T00:00:00Z' WHERE id = 'r1'`).run();
  // Otra reserva vieja del mismo paciente, expirada.
  await reserva(db, { id: 'r2', cliente: 'c1', estado: 'expirada', evento: 'ev2', inicio: '2026-09-01T15:00:00Z', fin: '2026-09-01T15:30:00Z', fecha: '2026-09-01' });
  await db.prepare(`UPDATE reservas SET actualizado_en = '2026-09-01T00:00:00Z' WHERE id = 'r2'`).run();
  await repo.purgarNoPagadas(db, ahora);
  assert.equal((await db.prepare(`SELECT nombre FROM clientes WHERE id = 'c1'`).first()).nombre, 'Cecilia');
});
