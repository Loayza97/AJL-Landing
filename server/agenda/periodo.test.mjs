import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rangoPeriodo } from './periodo.mjs';

const ahora = new Date('2026-10-12T20:00:00Z'); // lunes 12, 15:00 en Lima

test('30 días: hacia atrás para links y pasadas, hacia adelante para próximas', () => {
  assert.deepEqual(rangoPeriodo({ periodo: '30' }, ahora, 'pasado'), { desde: '2026-09-12T20:00:00.000Z', hasta: null });
  assert.deepEqual(rangoPeriodo({}, ahora, 'futuro'), { desde: null, hasta: '2026-11-11T20:00:00.000Z' });
});

test('este mes y mes anterior en hora de Lima; todo sin límites', () => {
  assert.deepEqual(rangoPeriodo({ periodo: 'mes' }, ahora, 'pasado'), { desde: '2026-10-01T05:00:00Z', hasta: '2026-11-01T05:00:00Z' });
  assert.deepEqual(rangoPeriodo({ periodo: 'mes_anterior' }, ahora, 'pasado'), { desde: '2026-09-01T05:00:00Z', hasta: '2026-10-01T05:00:00Z' });
  assert.deepEqual(rangoPeriodo({ periodo: 'todo' }, ahora, 'pasado'), { desde: null, hasta: null });
});

test('rango de fechas inclusivo; inválido da null', () => {
  assert.deepEqual(rangoPeriodo({ periodo: 'rango', desde: '2026-10-01', hasta: '2026-10-05' }, ahora, 'pasado'),
    { desde: '2026-10-01T05:00:00Z', hasta: '2026-10-06T05:00:00Z' });
  assert.equal(rangoPeriodo({ periodo: 'rango', desde: '2026-10-05', hasta: '2026-10-01' }, ahora, 'pasado'), null);
  assert.equal(rangoPeriodo({ periodo: 'otro' }, ahora, 'pasado'), null);
});
