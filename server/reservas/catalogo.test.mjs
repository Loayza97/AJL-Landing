import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cotizar } from './catalogo.mjs';

test('2 sesiones al mes por 3 meses: S/1.080, peso 1, pide DNI', () => {
  assert.deepEqual(cotizar('constancia', 3), {
    titulo: '2 sesiones al mes · 3 meses', monto_centimos: 108000, duracion_meses: 3, peso: 1, requiereDni: true,
  });
});

test('mes a mes usa el precio mensual y no pide DNI', () => {
  const c = cotizar('transformacion', 1);
  assert.equal(c.monto_centimos, 60000);
  assert.equal(c.requiereDni, false);
});

test('evaluación pesa 0,5 y sesión única 1', () => {
  assert.equal(cotizar('evaluacion', 1).peso, 0.5);
  assert.equal(cotizar('evaluacion', 1).monto_centimos, 8000);
  assert.equal(cotizar('basico', 1).peso, 1);
});

test('combinaciones inválidas devuelven null', () => {
  assert.equal(cotizar('evaluacion', 3), null);
  assert.equal(cotizar('constancia', 6), null);
  assert.equal(cotizar('inventado', 1), null);
  assert.equal(cotizar('__proto__', 1), null);
});
