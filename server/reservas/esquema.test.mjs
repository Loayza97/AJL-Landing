import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
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

test('migración 0002: columnas nuevas de clientes y tabla de resúmenes', async () => {
  const db = d1DePrueba();
  await db.prepare(`INSERT INTO clientes (id, nombre, nombres, apellido_paterno, apellido_materno, fecha_nacimiento, tipo_documento, dni, creado_en)
    VALUES ('c', 'Ana Pérez', 'Ana', 'Pérez', NULL, '1990-05-04', 'ce', 'X12345678', 'x')`).run();
  const c = await db.prepare('SELECT * FROM clientes').first();
  assert.equal(c.fecha_nacimiento, '1990-05-04');
  assert.equal(c.tipo_documento, 'ce');
  await db.prepare("INSERT INTO resumenes_enviados (fecha, enviado_en) VALUES ('2026-10-09', 'x')").run();
  await assert.rejects(db.prepare("INSERT INTO resumenes_enviados (fecha, enviado_en) VALUES ('2026-10-09', 'y')").run(), /UNIQUE|PRIMARY/);
});

test('migración 0006: duración 60 por defecto y fin_utc calculado para las reservas existentes', () => {
  const sqlite = new DatabaseSync(':memory:');
  const dir = new URL('../../db/d1/', import.meta.url);
  const archivos = readdirSync(dir).filter((x) => x.endsWith('.sql')).sort();
  for (const f of archivos.filter((x) => x < '0006')) sqlite.exec(readFileSync(new URL(f, dir), 'utf8'));
  sqlite.exec(`INSERT INTO reservas (id, token, producto, duracion_meses, monto_centimos, peso_tope, nutricionista_id,
    inicio_utc, fecha_lima, modalidad, estado, creado_en, actualizado_en)
    VALUES ('vieja', 'tv', 'constancia', 3, 108000, 1, 'nico', '2026-10-06T15:00:00Z', '2026-10-06', 'presencial', 'confirmada', 'x', 'x')`);
  for (const f of archivos.filter((x) => x >= '0006')) sqlite.exec(readFileSync(new URL(f, dir), 'utf8'));
  const r = sqlite.prepare("SELECT duracion_min, fin_utc FROM reservas WHERE id = 'vieja'").get();
  assert.deepEqual({ ...r }, { duracion_min: 60, fin_utc: '2026-10-06T16:00:00Z' });
});
