// Plan Parejas (22-nov-2026): se muestra en la web y se compra por WhatsApp.
// Estas pruebas fijan que el checkout no lo vende (no hay registro de dos
// personas) y que las cifras de la web son las de la decisión del 22-nov.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plans, planParejas } from '../../src/data/plans.js';
import { cotizar } from './catalogo.mjs';
import { condicionesSuscripcion } from '../suscripciones/calculo.mjs';

test('el Plan Parejas no está en `plans`: el checkout no lo cotiza', () => {
  assert.equal(Object.hasOwn(plans, planParejas.id), false);
  for (const d of [1, 3, 6]) {
    assert.equal(cotizar(planParejas.id, d), null);
    assert.equal(cotizar(planParejas.id, d, 'mensual'), null);
    assert.equal(condicionesSuscripcion(planParejas.id, d), null);
  }
});

test('precios de la decisión del 22-nov: 275 / 325 al mes cada uno, mes suelto 420', () => {
  const [cinco, siete] = planParejas.paquetes;
  assert.deepEqual([cinco.sesiones, cinco.cadaUno, cinco.totalLosDos], [5, 275, 1650]);
  assert.deepEqual([siete.sesiones, siete.cadaUno, siete.totalLosDos], [7, 325, 1950]);
  assert.equal(planParejas.mesSuelto.cadaUno, 420);
});

test('«los dos» es siempre el doble de «cada uno», y 3 cuotas dan el total', () => {
  for (const o of planParejas.paquetes) {
    assert.equal(o.losDos, 2 * o.cadaUno);
    assert.equal(o.totalLosDos, 3 * o.losDos);
  }
  assert.equal(planParejas.mesSuelto.losDos, 2 * planParejas.mesSuelto.cadaUno);
});

test('solo el de 7 sesiones lleva «Recomendado» y el mensaje lleva la marca de origen', () => {
  assert.deepEqual(planParejas.paquetes.filter((o) => o.highlight).map((o) => o.sesiones), [7]);
  assert.match(planParejas.waMensaje, /vengo de la web/);
  assert.match(planParejas.waMensaje, /Plan Parejas/);
});
