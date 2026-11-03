import test from 'node:test';
import assert from 'node:assert/strict';
import { CYBER_FIN, cyberActivo, descuentoDe, descuentoMaxDe, descuentoMaxGlobal } from '../../src/data/cyberwow.js';

test('los descuentos de la campaña salen de duracionesDe: 1 sesión 16/22, 2 sesiones 18/26, 4 sesiones 15/22', () => {
  assert.deepEqual([descuentoDe('acompanamiento', 3), descuentoDe('acompanamiento', 6)], [16, 22]);
  assert.deepEqual([descuentoDe('constancia', 3), descuentoDe('constancia', 6)], [18, 26]);
  assert.deepEqual([descuentoDe('transformacion', 3), descuentoDe('transformacion', 6)], [15, 22]);
});

test('el mes suelto y un plan inexistente no tienen descuento', () => {
  assert.equal(descuentoDe('constancia', 1), 0);
  assert.equal(descuentoDe('no-existe', 6), 0);
  assert.equal(descuentoMaxDe('no-existe'), 0);
});

test('el «hasta X%» de cada plan y el global', () => {
  assert.deepEqual(['acompanamiento', 'constancia', 'transformacion'].map(descuentoMaxDe), [22, 26, 22]);
  assert.equal(descuentoMaxGlobal(), 26);
});

test('la campaña vence el domingo 8-nov a las 11:59:59 p. m. de Lima', () => {
  assert.equal(CYBER_FIN, '2026-11-08T23:59:59-05:00');
  assert.equal(cyberActivo(Date.parse('2026-11-08T23:59:58-05:00')), true);
  assert.equal(cyberActivo(Date.parse('2026-11-09T00:00:00-05:00')), false);
});
