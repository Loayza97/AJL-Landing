import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PAISES, telefonoCompleto } from '../../src/data/telefono.js';

test('Perú es la primera opción y el número se arma con +51', () => {
  assert.deepEqual(PAISES[0], ['🇵🇪', 'Perú', '51']);
  assert.equal(telefonoCompleto('51', '987 654 321'), '+51987654321');
  assert.equal(telefonoCompleto('34', '0612345678'), '+34612345678');
  assert.equal(telefonoCompleto('', '+44 7700 900123'), '+447700900123');
  assert.equal(telefonoCompleto('51', '+1 305 555 0100'), '+13055550100');
});
