import { test } from 'node:test';
import assert from 'node:assert/strict';
import { duracionesDe, formatoSoles } from '../../src/data/duraciones.js';

test('formatoSoles usa punto de miles', () => {
  assert.equal(formatoSoles(80), 'S/80');
  assert.equal(formatoSoles(1950), 'S/1.950');
  assert.equal(formatoSoles(2808), 'S/2.808');
});

test('2 sesiones: mes a mes, 3 y 6 meses con su ahorro', () => {
  assert.deepEqual(duracionesDe('constancia'), [
    { meses: 1, total: 440, porMes: 440, ahorro: 0, ahorroPct: 0, congelarSemanas: 0 },
    { meses: 3, total: 1080, porMes: 360, ahorro: 240, ahorroPct: 18, congelarSemanas: 1 },
    { meses: 6, total: 1950, porMes: 325, ahorro: 690, ahorroPct: 26, congelarSemanas: 2 },
  ]);
});

test('1 y 4 sesiones al mes: precios de la hoja', () => {
  const uno = duracionesDe('acompanamiento');
  assert.deepEqual(uno.map((o) => [o.total, o.porMes, o.ahorro, o.ahorroPct]), [[320, 320, 0, 0], [810, 270, 150, 16], [1500, 250, 420, 22]]);
  const cuatro = duracionesDe('transformacion');
  assert.deepEqual(cuatro.map((o) => [o.total, o.porMes, o.ahorro, o.ahorroPct]), [[600, 600, 0, 0], [1530, 510, 270, 15], [2808, 468, 792, 22]]);
});

test('sin duraciones para sesión única, evaluación o ids raros', () => {
  assert.equal(duracionesDe('basico'), null);
  assert.equal(duracionesDe('evaluacion'), null);
  assert.equal(duracionesDe('__proto__'), null);
  assert.equal(duracionesDe('inventado'), null);
});
