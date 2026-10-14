import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRODUCTOS, duracionesDeProducto, clavePlan, citasDePlan, ordinal, etiquetaPlan, etiquetaCita, planValido, citaValida } from './opciones.mjs';

test('ordinal: abreviaturas femeninas como se escriben en Perú', () => {
  const esperado = ['1ra', '2da', '3ra', '4ta', '5ta', '6ta', '7ma', '8va', '9na', '10ma', '11va', '12va',
    '13ra', '14ta', '15ta', '16ta', '17ma', '18va', '19na', '20ma', '21ra', '22da', '23ra', '24ta'];
  assert.deepEqual(esperado.map((_, i) => ordinal(i + 1)), esperado);
});

test('productos: los 5 del catálogo con el nombre interno del equipo', () => {
  assert.deepEqual(PRODUCTOS.map((p) => [p.id, p.etiqueta]), [
    ['evaluacion', 'Evaluación'], ['basico', 'Básico'], ['acompanamiento', 'Acompañamiento'],
    ['constancia', 'Constancia'], ['transformacion', 'Transformación'],
  ]);
});

test('duración depende del producto: pago único solo en evaluación y básico', () => {
  for (const p of ['evaluacion', 'basico']) assert.deepEqual(duracionesDeProducto(p), [{ id: 'unico', etiqueta: 'Pago único' }]);
  for (const p of ['acompanamiento', 'constancia', 'transformacion']) {
    assert.deepEqual(duracionesDeProducto(p).map((d) => d.etiqueta), ['1 mes', '3 meses', '6 meses']);
  }
  assert.deepEqual(duracionesDeProducto(''), []);
  assert.deepEqual(duracionesDeProducto('__proto__'), []);
  assert.equal(clavePlan('evaluacion', 'unico'), 'evaluacion');
  assert.equal(clavePlan('constancia', '3'), 'constancia:3');
});

test('citas dependen de producto y duración: 1 de N, con N = sesiones al mes × meses', () => {
  const total = (plan) => citasDePlan(plan).filter((c) => /^\d+$/.test(c.id)).length;
  assert.deepEqual(citasDePlan('evaluacion'), [{ id: '1', etiqueta: '1 de 1' }]);
  assert.deepEqual(citasDePlan('basico'), [{ id: '1', etiqueta: '1 de 1' }]);
  assert.equal(total('acompanamiento:3'), 3);
  assert.equal(total('acompanamiento:6'), 6);
  assert.equal(total('constancia:3'), 6);
  assert.equal(total('transformacion:1'), 4);
  assert.equal(total('transformacion:6'), 24);
  assert.deepEqual(citasDePlan('transformacion:6').at(-2), { id: '24', etiqueta: '24 de 24' });
  // La evaluación del primer mes solo en los planes que la incluyen.
  assert.equal(citasDePlan('constancia:3').at(-1).id, 'evaluacion_mes');
  assert.ok(!citasDePlan('acompanamiento:3').some((c) => c.id === 'evaluacion_mes'));
  assert.deepEqual(citasDePlan('zzz'), []);
});

test('etiquetas y validación', () => {
  assert.equal(etiquetaPlan('constancia:3'), 'Constancia, 3 meses');
  assert.equal(etiquetaPlan('acompanamiento:1'), 'Acompañamiento, 1 mes');
  assert.equal(etiquetaPlan('evaluacion'), 'Evaluación');
  assert.equal(etiquetaPlan('otro'), 'Otro'); // links viejos
  assert.equal(planValido('otro'), false);
  for (const x of [null, undefined, '', 'zzz', 'constancia:12', 'evaluacion:1', '__proto__', 'toString']) {
    assert.equal(etiquetaPlan(x), null, String(x));
    assert.equal(planValido(x), false, String(x));
  }
  assert.equal(etiquetaCita('constancia:3', '2'), '2 de 6');
  assert.equal(etiquetaCita('otro', '2'), '2da sesión'); // link viejo sin total
  assert.equal(etiquetaCita(null, '1'), '1ra sesión');
  assert.equal(etiquetaCita('constancia:3', 'evaluacion_mes'), 'Evaluación de fin de mes');
  for (const x of [null, '', '0', '25', 2, 'constructor']) assert.equal(etiquetaCita('constancia:3', x), null, String(x));
  assert.equal(citaValida('acompanamiento:3', '3'), true);
  assert.equal(citaValida('acompanamiento:3', '4'), false);
  assert.equal(citaValida('evaluacion', '1'), true);
  assert.equal(citaValida('evaluacion', 1), false);
});
