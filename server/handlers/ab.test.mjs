import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { d1DePrueba } from '../reservas/d1-prueba.mjs';
import { handleAb, resultadosAb, resultadosVideo } from './ab.mjs';

const t0 = new Date('2026-10-12T15:00:00Z');
const post = (cuerpo) => new Request('https://x.test/api/ab', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(cuerpo) });

test('ab: registra vista y click de una versión válida; rechaza lo demás', async () => {
  const deps = { db: d1DePrueba(), ahora: () => t0 };
  assert.equal((await handleAb(post({ evento: 'vista', variante: 'a' }), {}, deps)).status, 204);
  assert.equal((await handleAb(post({ evento: 'click', variante: 'b' }), {}, deps)).status, 204);
  for (const malo of [{ evento: 'compra', variante: 'a' }, { evento: 'vista', variante: 'c' }, {}]) {
    assert.equal((await handleAb(post(malo), {}, deps)).status, 400, JSON.stringify(malo));
  }
  assert.equal((await handleAb(new Request('https://x.test/api/ab'), {}, deps)).status, 405);
  const { results } = await deps.db.prepare('SELECT experimento, variante, evento FROM ab_eventos ORDER BY id').all();
  assert.deepEqual(results, [
    { experimento: 'hero_cta', variante: 'a', evento: 'vista' },
    { experimento: 'hero_cta', variante: 'b', evento: 'click' },
  ]);
});

test('ab: el video de la portada registra play, 50 % y 100 % por el mismo camino', async () => {
  const deps = { db: d1DePrueba(), ahora: () => t0 };
  for (const evento of ['play', 'p50', 'p100']) {
    assert.equal((await handleAb(post({ experimento: 'video_como_trabajamos', evento, variante: 'a' }), {}, deps)).status, 204, evento);
  }
  for (const malo of [
    { experimento: 'video_como_trabajamos', evento: 'vista', variante: 'a' }, // eventos del botón, no del video
    { experimento: 'video_como_trabajamos', evento: 'p75', variante: 'a' },
    { experimento: 'video_como_trabajamos', evento: 'play', variante: 'c' },
    { experimento: 'hero_cta', evento: 'play', variante: 'a' }, // eventos del video, no del botón
    { experimento: 'otro', evento: 'play', variante: 'a' },
  ]) {
    assert.equal((await handleAb(post(malo), {}, deps)).status, 400, JSON.stringify(malo));
  }
  const { results } = await deps.db.prepare('SELECT experimento, variante, evento FROM ab_eventos ORDER BY id').all();
  assert.deepEqual(results, [
    { experimento: 'video_como_trabajamos', variante: 'a', evento: 'play' },
    { experimento: 'video_como_trabajamos', variante: 'a', evento: 'p50' },
    { experimento: 'video_como_trabajamos', variante: 'a', evento: 'p100' },
  ]);
});

test('resultadosVideo: plays, 50 % y 100 % del video por versión del botón', async () => {
  const db = d1DePrueba();
  const deps = { db, ahora: () => t0 };
  for (const [evento, variante, n] of [['play', 'a', 3], ['p50', 'a', 2], ['p100', 'a', 1], ['play', 'b', 2], ['vista', 'b', 7]]) {
    const experimento = evento === 'vista' ? undefined : 'video_como_trabajamos';
    for (let i = 0; i < n; i++) await handleAb(post({ experimento, evento, variante }), {}, deps);
  }
  assert.deepEqual(await resultadosVideo(db), [
    { variante: 'a', plays: 3, mitad: 2, completos: 1 },
    { variante: 'b', plays: 2, mitad: 0, completos: 0 },
  ]);
});

test('migración 0020: conserva las filas e ids del botón y acepta los eventos del video', () => {
  const sqlite = new DatabaseSync(':memory:');
  const dir = new URL('../../db/d1/', import.meta.url);
  const migraciones = readdirSync(dir).filter((x) => x.endsWith('.sql')).sort();
  const i = migraciones.indexOf('0020_ab_video.sql');
  assert.ok(i > 0, 'falta la migración 0020_ab_video.sql');
  for (const f of migraciones.slice(0, i)) sqlite.exec(readFileSync(new URL(f, dir), 'utf8'));
  const insertar = sqlite.prepare("INSERT INTO ab_eventos (experimento, variante, evento, creado_en) VALUES ('hero_cta', ?, ?, 'x')");
  insertar.run('a', 'vista');
  insertar.run('b', 'click');
  assert.throws(() => insertar.run('a', 'play'), /CHECK/); // antes de la 0020, el video no entra
  sqlite.exec(readFileSync(new URL(migraciones[i], dir), 'utf8'));
  assert.deepEqual(sqlite.prepare('SELECT id, variante, evento FROM ab_eventos ORDER BY id').all().map((f) => ({ ...f })), [
    { id: 1, variante: 'a', evento: 'vista' },
    { id: 2, variante: 'b', evento: 'click' },
  ]);
  sqlite.prepare("INSERT INTO ab_eventos (experimento, variante, evento, creado_en) VALUES ('video_como_trabajamos', 'a', 'p100', 'x')").run();
  assert.throws(() => insertar.run('a', 'compra'), /CHECK/);
  assert.equal(sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'ab_eventos_exp'").get()?.name, 'ab_eventos_exp');
});

test('resultadosAb: vistas, clics y reservas pagadas por versión', async () => {
  const db = d1DePrueba();
  const deps = { db, ahora: () => t0 };
  for (const [evento, variante, n] of [['vista', 'a', 4], ['click', 'a', 1], ['vista', 'b', 5], ['click', 'b', 2]]) {
    for (let i = 0; i < n; i++) await handleAb(post({ evento, variante }), {}, deps);
  }
  const fila = (id, estado, variante) => db.prepare(
    `INSERT INTO reservas (id, token, producto, duracion_meses, monto_centimos, peso_tope, nutricionista_id, inicio_utc, fecha_lima,
       modalidad, estado, creado_en, actualizado_en, variante)
     VALUES (?1, ?1, 'constancia', 3, 108000, 1, 'nico', ?2, '2026-10-20', 'video', ?3, 'x', 'x', ?4)`,
  ).bind(id, `2026-10-20T1${id.length}:00:00Z`, estado, variante).run();
  await fila('r', 'confirmada', 'b');
  await fila('rr', 'expirada', 'b');
  await fila('rrr', 'confirmada', null);
  assert.deepEqual(await resultadosAb(db), [
    { variante: 'a', vistas: 4, clics: 1, reservas_pagadas: 0 },
    { variante: 'b', vistas: 5, clics: 2, reservas_pagadas: 1 },
  ]);
});
