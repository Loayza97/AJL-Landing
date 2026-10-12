import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1DePrueba } from '../reservas/d1-prueba.mjs';
import { handleAb, resultadosAb } from './ab.mjs';

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
