import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fechaLima, inicioUtc, sumarDias, diaSemana, diasEntre, etiquetaLima } from './tiempo.mjs';

test('fechaLima usa UTC−5: las 3:00 UTC del 6 son aún el 5 en Lima', () => {
  assert.equal(fechaLima(new Date('2026-10-06T03:00:00Z')), '2026-10-05');
  assert.equal(fechaLima(new Date('2026-10-06T05:00:00Z')), '2026-10-06');
});

test('inicioUtc convierte hora de Lima a UTC con formato fijo', () => {
  assert.equal(inicioUtc('2026-10-06', 10), '2026-10-06T15:00:00Z');
  assert.equal(inicioUtc('2026-10-06', 20), '2026-10-07T01:00:00Z');
});

test('sumarDias cruza meses', () => {
  assert.equal(sumarDias('2026-10-30', 3), '2026-11-02');
  assert.equal(sumarDias('2026-10-01', -1), '2026-09-30');
});

test('diaSemana y diasEntre', () => {
  assert.equal(diaSemana('2026-10-07'), 3); // miércoles
  assert.equal(diasEntre('2026-10-07', '2026-10-21'), 14);
  assert.equal(diasEntre('2026-10-07', '2026-09-30'), -7);
});

test('etiquetaLima muestra la fecha en Lima', () => {
  const t = etiquetaLima('2026-10-08T22:00:00Z');
  assert.match(t, /8/);
  assert.match(t, /octubre/);
  assert.match(t, /5:00/);
});
