import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRODUCTOS, productosDeTipo, duracionesDeProducto, clavePlan, citasDePlan, ordinal, etiquetaPlan, etiquetaCita, planValido, citaValida, citasDeCobros, sugerirPlan } from './opciones.mjs';

test('ordinal: abreviaturas femeninas como se escriben en Perú', () => {
  const esperado = ['1ra', '2da', '3ra', '4ta', '5ta', '6ta', '7ma', '8va', '9na', '10ma', '11va', '12va',
    '13ra', '14ta', '15ta', '16ta', '17ma', '18va', '19na', '20ma', '21ra', '22da', '23ra', '24ta'];
  assert.deepEqual(esperado.map((_, i) => ordinal(i + 1)), esperado);
});

test('productos: los 5 del catálogo con el nombre interno del equipo, más Renovación Constancia', () => {
  assert.deepEqual(PRODUCTOS.map((p) => [p.id, p.etiqueta]), [
    ['evaluacion', 'Evaluación'], ['basico', 'Básico'], ['acompanamiento', 'Acompañamiento'],
    ['control_acompanamiento', 'Control Acompañamiento'],
    ['constancia', 'Constancia'], ['renovacion_constancia', 'Renovación Constancia'], ['transformacion', 'Transformación'],
  ]);
});

test('productos por tarjeta (Joaquín, 2026-10-26): los controles de 30 min no ofrecen evaluación, básico ni acompañamiento', () => {
  const ids = (tipo) => productosDeTipo(tipo).map((p) => p.id);
  assert.deepEqual(ids('c30v'), ['constancia', 'renovacion_constancia', 'transformacion']);
  assert.deepEqual(ids('c30p'), ['constancia', 'renovacion_constancia', 'transformacion']);
  assert.deepEqual(ids('s60'), ['evaluacion', 'basico', 'acompanamiento', 'control_acompanamiento', 'constancia', 'renovacion_constancia', 'transformacion']);
  assert.deepEqual(productosDeTipo('zzz'), []);
  assert.deepEqual(productosDeTipo('__proto__'), []);
});

test('Control Acompañamiento funciona igual que Acompañamiento: 1, 3 o 6 meses, una cita al mes', () => {
  assert.deepEqual(duracionesDeProducto('control_acompanamiento').map((d) => d.etiqueta), ['1 mes', '3 meses', '6 meses']);
  assert.deepEqual([1, 3, 6].map((m) => citasDePlan(`control_acompanamiento:${m}`).length), [1, 3, 6]);
  assert.equal(etiquetaPlan('control_acompanamiento:3'), 'Control Acompañamiento, 3 meses');
  assert.ok(planValido('control_acompanamiento:6'));
  assert.ok(!planValido('control_acompanamiento'));
});

test('duración depende del producto: pago único solo en evaluación, básico y renovación', () => {
  for (const p of ['evaluacion', 'basico', 'renovacion_constancia']) assert.deepEqual(duracionesDeProducto(p), [{ id: 'unico', etiqueta: 'Pago único' }]);
  for (const p of ['acompanamiento', 'constancia', 'transformacion']) {
    assert.deepEqual(duracionesDeProducto(p).map((d) => d.etiqueta), ['1 mes', '3 meses', '6 meses']);
  }
  assert.deepEqual(duracionesDeProducto(''), []);
  assert.deepEqual(duracionesDeProducto('__proto__'), []);
  assert.equal(clavePlan('evaluacion', 'unico'), 'evaluacion');
  assert.equal(clavePlan('constancia', '3'), 'constancia:3');
});

test('citas dependen de producto y duración: sesiones al mes × meses, +1 el primer mes en Constancia y Transformación', () => {
  const total = (plan) => citasDePlan(plan).length;
  assert.deepEqual(citasDePlan('evaluacion'), [{ id: '1', etiqueta: '1 de 1' }]);
  assert.deepEqual(citasDePlan('basico'), [{ id: '1', etiqueta: '1 de 1' }]);
  assert.deepEqual([1, 3, 6].map((m) => total(`acompanamiento:${m}`)), [1, 3, 6]);
  assert.deepEqual([1, 3, 6].map((m) => total(`constancia:${m}`)), [3, 7, 13]);
  assert.deepEqual([1, 3, 6].map((m) => total(`transformacion:${m}`)), [5, 13, 25]);
  assert.deepEqual(citasDePlan('constancia:3').at(-1), { id: '7', etiqueta: '7 de 7' });
  assert.ok(!citasDePlan('constancia:3').some((c) => c.id === 'evaluacion_mes'));
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
  assert.equal(etiquetaCita('constancia:3', '2'), '2 de 7');
  assert.equal(etiquetaCita('otro', '2'), '2da sesión'); // link viejo sin total
  assert.equal(etiquetaCita(null, '1'), '1ra sesión');
  assert.equal(etiquetaCita('constancia:3', 'evaluacion_mes'), 'Evaluación de fin de mes');
  for (const x of [null, '', '0', '26', 2, 'constructor']) assert.equal(etiquetaCita('constancia:3', x), null, String(x));
  assert.equal(citaValida('acompanamiento:3', '3'), true);
  assert.equal(citaValida('acompanamiento:3', '4'), false);
  assert.equal(citaValida('transformacion:6', '25'), true);
  assert.equal(citaValida('constancia:3', 'evaluacion_mes'), false);
  assert.equal(citaValida('evaluacion', '1'), true);
  assert.equal(citaValida('evaluacion', 1), false);
});

test('Renovación Constancia: pago único con 2 citas, «1 de 2» y «2 de 2»', () => {
  assert.equal(clavePlan('renovacion_constancia', 'unico'), 'renovacion_constancia');
  assert.deepEqual(citasDePlan('renovacion_constancia').map((c) => c.etiqueta), ['1 de 2', '2 de 2']);
  assert.equal(etiquetaPlan('renovacion_constancia'), 'Renovación Constancia');
  assert.ok(citaValida('renovacion_constancia', '2'));
  assert.ok(!citaValida('renovacion_constancia', '3'));
});

test('citas que dan los cobros: sesiones al mes, más la evaluación en el primero (Constancia 3 y luego 2; Transformación 5 y luego 4)', () => {
  assert.equal(citasDeCobros('acompanamiento:3', 2), 2);
  assert.equal(citasDeCobros('constancia:3', 0), 0);
  assert.equal(citasDeCobros('constancia:3', 1), 3);
  assert.equal(citasDeCobros('constancia:3', 3), 7);
  assert.equal(citasDeCobros('transformacion:6', 2), 9);
});

test('citas de los cobros fuera de catálogo: las que diga el equipo; sin ese dato o con plan desconocido, no se sabe', () => {
  assert.equal(citasDeCobros('otro', 2, 4), 8);
  assert.equal(citasDeCobros('otro', 2), null);
  assert.equal(citasDeCobros('zzz', 1), null);
  assert.equal(citasDeCobros(null, 1), null);
});

test('plan sugerido a partir del nombre del plan hecho a mano en Mercado Pago', () => {
  const casos = [['3 meses- 1 sesión mes', 'acompanamiento', '3'], ['3 meses-1 sesión mes', 'acompanamiento', '3'],
    ['6 meses- 1 sesión mes', 'acompanamiento', '6'], ['3 meses - 2 sesiones mes', 'constancia', '3'],
    ['6 meses - 2 sesiones mes', 'constancia', '6'], ['6 meses 2 sesiones mes', 'constancia', '6']];
  for (const [reason, producto, duracion] of casos) {
    assert.deepEqual(sugerirPlan(reason), { producto, duracion, citasPorCobro: null }, reason);
  }
  assert.deepEqual(sugerirPlan('2 meses-4 sesiones mes'), { producto: 'otro', duracion: null, citasPorCobro: 4 });
  assert.equal(sugerirPlan('cualquier cosa'), null);
  assert.equal(sugerirPlan(null), null);
});
