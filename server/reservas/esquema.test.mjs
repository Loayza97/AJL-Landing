import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1DePrueba } from './d1-prueba.mjs';

const fila = (db, o) => db.prepare(
  `INSERT INTO reservas (id, token, producto, duracion_meses, monto_centimos, peso_tope, nutricionista_id,
     inicio_utc, fecha_lima, modalidad, estado, retencion_hasta, creado_en, actualizado_en)
   VALUES (?1, ?1, 'constancia', 3, 108000, 1, ?2, ?3, '2026-10-06', ?4, ?5, NULL, 'x', 'x')`,
).bind(o.id, o.nutri, o.inicio, o.modalidad, o.estado).run();

test('dos presenciales activas a la misma hora chocan', async () => {
  const db = d1DePrueba();
  await fila(db, { id: 'a', nutri: 'nico', inicio: '2026-10-06T17:00:00Z', modalidad: 'presencial', estado: 'apartada' });
  await assert.rejects(
    fila(db, { id: 'b', nutri: 'jussara', inicio: '2026-10-06T17:00:00Z', modalidad: 'presencial', estado: 'confirmada' }),
    /UNIQUE constraint failed/,
  );
});

test('una expirada no bloquea la hora', async () => {
  const db = d1DePrueba();
  await fila(db, { id: 'a', nutri: 'nico', inicio: '2026-10-06T17:00:00Z', modalidad: 'presencial', estado: 'expirada' });
  await fila(db, { id: 'b', nutri: 'nico', inicio: '2026-10-06T17:00:00Z', modalidad: 'presencial', estado: 'apartada' });
});

test('la misma nutricionista no puede tener dos videos a la vez', async () => {
  const db = d1DePrueba();
  await fila(db, { id: 'a', nutri: 'nico', inicio: '2026-10-09T17:00:00Z', modalidad: 'video', estado: 'confirmada' });
  await assert.rejects(
    fila(db, { id: 'b', nutri: 'nico', inicio: '2026-10-09T17:00:00Z', modalidad: 'video', estado: 'apartada' }),
    /UNIQUE constraint failed/,
  );
  await fila(db, { id: 'c', nutri: 'paolo', inicio: '2026-10-09T17:00:00Z', modalidad: 'video', estado: 'apartada' });
});

test('batch revierte todo si una sentencia falla', async () => {
  const db = d1DePrueba();
  const ok = db.prepare("INSERT INTO clientes (id, creado_en) VALUES ('c1', 'x')");
  const malo = db.prepare("INSERT INTO clientes (id, creado_en) VALUES ('c1', 'x')");
  await assert.rejects(db.batch([ok, malo]));
  assert.equal(await db.prepare('SELECT id FROM clientes').first(), null);
});
