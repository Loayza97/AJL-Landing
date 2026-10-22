import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enmascararCorreo, enmascararTelefono } from './mascaras.mjs';

test('máscaras: se reconoce el dato propio sin revelarlo', () => {
  assert.equal(enmascararCorreo('lucia.ramos@gmail.com'), 'l••••••@gmail.com');
  assert.equal(enmascararCorreo('a@x.pe'), 'a••••••@x.pe');
  assert.equal(enmascararTelefono('+51987654321'), '+51 ••• ••• 321');
  assert.equal(enmascararTelefono('987654321'), '••• ••• 321');
});
