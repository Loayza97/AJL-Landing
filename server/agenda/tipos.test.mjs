import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TIPOS_LINK, tipoDeReserva } from './tipos.mjs';

test('tres tipos fijos: el virtual solo por video', () => {
  assert.deepEqual(Object.keys(TIPOS_LINK), ['c30v', 'c30p', 's60']);
  assert.deepEqual(TIPOS_LINK.c30v.modalidades, ['video']);
  assert.equal(TIPOS_LINK.s60.duracion_min, 60);
});

test('tipoDeReserva: solo para reservas creadas con link', () => {
  assert.equal(tipoDeReserva({ producto: 'link_c30v' }).nombre, 'Control de 30 min');
  assert.equal(tipoDeReserva({ producto: 'constancia' }), null);
  assert.equal(tipoDeReserva({ producto: 'link_zzz' }), null);
});
