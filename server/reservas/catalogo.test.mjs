import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cotizar } from './catalogo.mjs';

test('2 sesiones al mes por 3 meses: S/1.080, peso 1, pide DNI', () => {
  assert.deepEqual(cotizar('constancia', 3), {
    titulo: '2 sesiones al mes · 3 meses', monto_centimos: 108000, duracion_meses: 3, peso: 1, requiereDni: true,
  });
});

test('mes a mes usa el precio mensual y también pide DNI', () => {
  const c = cotizar('transformacion', 1);
  assert.equal(c.monto_centimos, 60000);
  assert.equal(c.titulo, '4 sesiones al mes · 1 mes');
  assert.equal(c.requiereDni, true);
});

test('evaluación pesa 0,5 y sesión única 1', () => {
  assert.equal(cotizar('evaluacion', 1).peso, 0.5);
  assert.equal(cotizar('evaluacion', 1).monto_centimos, 8000);
  assert.equal(cotizar('basico', 1).peso, 1);
});

test('6 meses: S/1.950 para 2 sesiones y S/2.808 para 4', () => {
  assert.deepEqual(cotizar('constancia', 6), {
    titulo: '2 sesiones al mes · 6 meses', monto_centimos: 195000, duracion_meses: 6, peso: 1, requiereDni: true,
  });
  assert.equal(cotizar('transformacion', 6).monto_centimos, 280800);
  assert.equal(cotizar('acompanamiento', 6).monto_centimos, 150000);
});

test('combinaciones inválidas devuelven null', () => {
  assert.equal(cotizar('evaluacion', 3), null);
  assert.equal(cotizar('basico', 6), null);
  assert.equal(cotizar('constancia', 12), null);
  assert.equal(cotizar('constancia', 2), null);
  assert.equal(cotizar('inventado', 1), null);
  assert.equal(cotizar('__proto__', 1), null);
});
