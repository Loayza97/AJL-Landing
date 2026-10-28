import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linkReserva, destinoLink, LINKS_RESERVA } from '../../src/data/links-reserva.js';

test('links de reserva: con meses va al calendario', () => {
  assert.equal(linkReserva('constancia', 3), '/reservar/?plan=constancia&meses=3');
  assert.deepEqual(destinoLink('constancia', '3'), { paso: 'p3', plan: 'constancia', meses: 3, forma: 'completo' });
});

test('links de reserva: sin meses o con meses que no existen, a elegir duración', () => {
  assert.deepEqual(destinoLink('constancia', null), { paso: 'p2', plan: 'constancia' });
  assert.deepEqual(destinoLink('constancia', '4'), { paso: 'p2', plan: 'constancia' });
});

test('links de reserva: pago único al calendario, plan desconocido al paso 1', () => {
  assert.deepEqual(destinoLink('basico'), { paso: 'p3', plan: 'basico', forma: 'completo' });
  assert.deepEqual(destinoLink('evaluacion', '3'), { paso: 'p3', plan: 'evaluacion', forma: 'completo' });
  assert.deepEqual(destinoLink('otro', '3'), { paso: 'p1' });
  assert.deepEqual(destinoLink('toString'), { paso: 'p1' });
  assert.deepEqual(destinoLink(null), { paso: 'p1' });
});

test('links de reserva: 3 planes × 3 duraciones + básico + evaluación', () => {
  assert.equal(LINKS_RESERVA.length, 11);
  for (const l of LINKS_RESERVA) {
    const q = new URLSearchParams(l.ruta.split('?')[1]);
    assert.equal(destinoLink(q.get('plan'), q.get('meses')).paso, 'p3', l.ruta);
  }
  assert.ok(LINKS_RESERVA.some((l) => l.ruta === '/reservar/?plan=transformacion&meses=6'));
});

test('links de reserva: forma mensual en el link y en el destino', () => {
  assert.equal(linkReserva('constancia', 3, 'mensual'), '/reservar/?plan=constancia&meses=3&forma=mensual');
  assert.deepEqual(destinoLink('constancia', '3', 'mensual'), { paso: 'p3', plan: 'constancia', meses: 3, forma: 'mensual' });
  assert.deepEqual(destinoLink('constancia', '3', null), { paso: 'p3', plan: 'constancia', meses: 3, forma: 'completo' });
  assert.equal(destinoLink('constancia', '3', 'xyz').forma, 'completo');
  assert.deepEqual(destinoLink('basico', null, 'mensual'), { paso: 'p3', plan: 'basico', forma: 'completo' });
  const c = LINKS_RESERVA.find((l) => l.ruta === '/reservar/?plan=constancia&meses=3');
  assert.equal(c.rutaMensual, '/reservar/?plan=constancia&meses=3&forma=mensual');
  assert.equal(LINKS_RESERVA.find((l) => l.ruta === '/reservar/?plan=basico').rutaMensual, undefined);
});
