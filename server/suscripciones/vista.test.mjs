import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filasDeVista, conteos, ordenDeVista, alOrdenar, diaDeCobro } from './vista.mjs';

const ahora = new Date('2026-11-27T15:00:00Z'); // 10:00 en Lima
const f = (clave, o = {}) => ({ clave, nombre: null, pagador: null, pendiente: false, nuevo: false, cobrado_en: null, proximo: null, ...o });
const filas = [
  f('a', { nombre: 'Ángela Ríos', pendiente: true, cobrado_en: '2026-11-26T15:00:00Z', proximo: '2026-12-26T15:00:00Z' }),
  f('b', { pagador: 'pagador01', pendiente: true, nuevo: true, cobrado_en: '2026-11-10T15:00:00Z', proximo: '2026-12-10T15:00:00Z' }),
  f('c', { nombre: 'Bruno Paz', cobrado_en: '2026-10-27T15:00:00Z', proximo: '2026-11-27T19:00:00Z' }),
  f('d', { nombre: 'Carla Sol', proximo: '2027-01-15T15:00:00Z' }),
  f('e', { nombre: 'Dina Luz', cobrado_en: '2026-10-25T15:00:00Z', proximo: '2026-11-25T15:00:00Z' }),
  f('g', { nombre: 'Elsa Mar', cobrado_en: '2026-09-01T15:00:00Z' }),
];
const claves = (o) => filasDeVista(filas, { ahora, ...o }).map((x) => x.clave);

test('por agendar: solo las pendientes, en el orden en que llegan', () => {
  assert.deepEqual(claves({ vista: 'pendientes' }), ['a', 'b']);
});

test('cobran pronto: atrasadas y próximos 30 días, de la más cercana a la más lejana', () => {
  assert.deepEqual(claves({ vista: 'pronto' }), ['e', 'c', 'b', 'a']);
});

test('todas: el cobro más reciente primero y las que no tienen fecha al final', () => {
  assert.deepEqual(claves({ vista: 'todas' }), ['a', 'b', 'c', 'e', 'g', 'd']);
});

test('ordenar por una columna en ambos sentidos; sin fecha, siempre al final', () => {
  assert.deepEqual(claves({ vista: 'todas', orden: { campo: 'cobrado_en', asc: true } }), ['g', 'e', 'c', 'b', 'a', 'd']);
  assert.deepEqual(claves({ vista: 'todas', orden: { campo: 'proximo', asc: false } }), ['d', 'a', 'b', 'c', 'e', 'g']);
});

test('al tocar un encabezado: próximo empieza por el más cercano, último por el más reciente, y el segundo toque invierte', () => {
  const p = alOrdenar(null, 'proximo');
  assert.deepEqual(p, { campo: 'proximo', asc: true });
  assert.deepEqual(alOrdenar(p, 'proximo'), { campo: 'proximo', asc: false });
  assert.deepEqual(alOrdenar(p, 'cobrado_en'), { campo: 'cobrado_en', asc: false });
  assert.deepEqual([ordenDeVista('pendientes'), ordenDeVista('pronto'), ordenDeVista('todas')],
    [null, { campo: 'proximo', asc: true }, { campo: 'cobrado_en', asc: false }]);
});

test('buscar por nombre o por quien paga, sin tildes ni mayúsculas', () => {
  assert.deepEqual(claves({ vista: 'todas', q: 'angela rios' }), ['a']);
  assert.deepEqual(claves({ vista: 'todas', q: 'PAGADOR' }), ['b']);
});

test('contadores de las vistas y de pagos nuevos', () => {
  assert.deepEqual(conteos(filas, ahora), { pendientes: 2, pronto: 4, todas: 6, nuevos: 1 });
});

test('día del cobro en hora de Lima: hoy, mañana, atrasado o la fecha', () => {
  assert.deepEqual(diaDeCobro('2026-11-28T04:00:00Z', ahora), { cuando: 'Hoy', atrasado: false }); // 23:00 del 27 en Lima
  assert.deepEqual(diaDeCobro('2026-11-28T15:00:00Z', ahora), { cuando: 'Mañana', atrasado: false });
  assert.deepEqual(diaDeCobro('2026-11-25T15:00:00Z', ahora), { cuando: null, atrasado: true });
  assert.deepEqual(diaDeCobro('2026-12-01T15:00:00Z', ahora), { cuando: null, atrasado: false });
});
