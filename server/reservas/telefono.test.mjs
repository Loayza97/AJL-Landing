import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PAISES, telefonoCompleto, paisDeTelefono } from '../../src/data/telefono.js';

test('Perú es la primera opción y el número se arma con +51', () => {
  assert.deepEqual(PAISES[0], ['🇵🇪', 'Perú', '51']);
  assert.equal(telefonoCompleto('51', '987 654 321'), '+51987654321');
  assert.equal(telefonoCompleto('34', '0612345678'), '+34612345678');
  assert.equal(telefonoCompleto('', '+44 7700 900123'), '+447700900123');
  assert.equal(telefonoCompleto('51', '+1 305 555 0100'), '+13055550100');
});

test('país según el código del número: el más largo gana y sin + queda vacío', () => {
  assert.equal(paisDeTelefono('+51947560349'), 'Perú');
  assert.equal(paisDeTelefono('+593991234567'), 'Ecuador');
  assert.equal(paisDeTelefono('+5491122334455'), 'Argentina');
  assert.equal(paisDeTelefono('+1 305 555 0101'), 'EE.UU.');
  assert.equal(paisDeTelefono('+81312345678'), '');
  assert.equal(paisDeTelefono('947560349'), '');
  assert.equal(paisDeTelefono(null), '');
});
