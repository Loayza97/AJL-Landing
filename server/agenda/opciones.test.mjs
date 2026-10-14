import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLANES, CITAS, ordinal, etiquetaPlan, etiquetaCita, planValido, citaValida, citasDeTipo, citaValidaParaTipo, productoPaciente } from './opciones.mjs';

test('ordinal: abreviaturas femeninas como se escriben en Perú', () => {
  const esperado = ['1ra', '2da', '3ra', '4ta', '5ta', '6ta', '7ma', '8va', '9na', '10ma', '11va', '12va',
    '13ra', '14ta', '15ta', '16ta', '17ma', '18va', '19na', '20ma', '21ra', '22da', '23ra', '24ta'];
  assert.deepEqual(esperado.map((_, i) => ordinal(i + 1)), esperado);
});

test('planes: evaluación, una sola sesión, cada plan con acompañamiento × 1, 3 y 6 meses, y Otro', () => {
  assert.deepEqual(PLANES.map((p) => [p.id, p.etiqueta]), [
    ['evaluacion', 'Evaluación nutricional'],
    ['basico', 'Básico · Una sola sesión'],
    ['acompanamiento:1', 'Seguimiento · 1 sesión al mes · 1 mes'],
    ['acompanamiento:3', 'Seguimiento · 1 sesión al mes · 3 meses'],
    ['acompanamiento:6', 'Seguimiento · 1 sesión al mes · 6 meses'],
    ['constancia:1', 'Constancia · 2 sesiones al mes · 1 mes'],
    ['constancia:3', 'Constancia · 2 sesiones al mes · 3 meses'],
    ['constancia:6', 'Constancia · 2 sesiones al mes · 6 meses'],
    ['transformacion:1', 'Transformación · 4 sesiones al mes · 1 mes'],
    ['transformacion:3', 'Transformación · 4 sesiones al mes · 3 meses'],
    ['transformacion:6', 'Transformación · 4 sesiones al mes · 6 meses'],
    ['otro', 'Otro'],
  ]);
});

test('citas: de la 1ra a la 24ta (desde la 2da son control) y la evaluación de fin de mes', () => {
  assert.equal(CITAS.length, 25);
  assert.deepEqual(CITAS[0], { id: '1', etiqueta: '1ra sesión' });
  assert.deepEqual(CITAS[1], { id: '2', etiqueta: '2da sesión (control)' });
  assert.deepEqual(CITAS[2], { id: '3', etiqueta: '3ra sesión (control)' });
  assert.deepEqual(CITAS[23], { id: '24', etiqueta: '24ta sesión (control)' });
  assert.deepEqual(CITAS[24], { id: 'evaluacion_mes', etiqueta: 'Evaluación de fin de mes' });
});

test('etiquetas y validación: lo desconocido o vacío no pasa y no tiene etiqueta', () => {
  assert.equal(etiquetaPlan('constancia:3'), 'Constancia · 2 sesiones al mes · 3 meses');
  assert.equal(etiquetaCita('2'), '2da sesión (control)');
  for (const x of [null, undefined, '', 'zzz', 'constancia:12', '__proto__', 'toString']) {
    assert.equal(etiquetaPlan(x), null, String(x));
    assert.equal(planValido(x), false, String(x));
  }
  for (const x of [null, '', '0', '25', 2, 'constructor']) {
    assert.equal(etiquetaCita(x), null, String(x));
    assert.equal(citaValida(x), false, String(x));
  }
  assert.equal(planValido('otro'), true);
  assert.equal(citaValida('evaluacion_mes'), true);
});

test('un control de 30 min nunca es la 1ra sesión; la sesión de 1 hora ofrece la lista completa', () => {
  for (const t of ['c30v', 'c30p']) {
    assert.ok(!citasDeTipo(t).some((c) => c.id === '1'));
    assert.equal(citasDeTipo(t).length, CITAS.length - 1);
    assert.equal(citaValidaParaTipo(t, '1'), false);
    assert.equal(citaValidaParaTipo(t, '2'), true);
    assert.equal(citaValidaParaTipo(t, 'evaluacion_mes'), true);
  }
  assert.deepEqual(citasDeTipo('s60'), CITAS);
  assert.equal(citaValidaParaTipo('s60', '1'), true);
  assert.equal(citaValidaParaTipo('s60', '99'), false);
});

test('productoPaciente: nombre público del plan para el WhatsApp, nunca el interno', () => {
  assert.equal(productoPaciente('evaluacion'), 'Evaluación nutricional');
  assert.equal(productoPaciente('basico'), 'Plan de una sola sesión');
  assert.equal(productoPaciente('constancia:3'), 'Plan de 2 sesiones al mes por 3 meses');
  assert.equal(productoPaciente('acompanamiento:1'), 'Plan de 1 sesión al mes por 1 mes');
  assert.equal(productoPaciente('otro'), null);
  assert.equal(productoPaciente(null), null);
  assert.equal(productoPaciente('__proto__'), null);
});
