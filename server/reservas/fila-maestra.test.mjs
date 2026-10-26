import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filaMaestra, COLUMNAS_MAESTRA } from '../../src/scripts/fila-maestra.js';

const fila = { apellido_paterno: 'Ramos', apellido_materno: 'Díaz', nombres: 'Lucía', dni: '70123456', email: 'lucia@x.pe', whatsapp: '+51987654321',
  fecha_nacimiento: '1992-03-08', pais: 'Perú', inicio_utc: '2026-10-29T15:00:00Z', sin_hora: false, producto_id: 'constancia', sesiones: '2/7',
  soles: 1080, neto_soles: 1045.12, paciente_nuevo: 0, modalidad: 'video', nutricionista: 'Jussara' };
const col = (letra) => (letra.length === 1 ? letra.charCodeAt(0) - 65 : 26 + letra.charCodeAt(1) - 65);

test('base maestra: 28 columnas, de la A a la AB (Joaquín, 2026-10-26)', () => {
  assert.equal(COLUMNAS_MAESTRA, 28);
  assert.equal(filaMaestra(fila).split('\t').length, 28);
});

test('base maestra: datos en su columna y el producto con el nombre de la lista de M', () => {
  const c = filaMaestra(fila).split('\t');
  assert.deepEqual([c[col('A')], c[col('B')], c[col('C')], c[col('E')], c[col('F')], c[col('H')]],
    ['Ramos Díaz', 'Lucía', '70123456', '987654321', '08/03/1992', '29/10/2026']);
  assert.deepEqual([c[col('M')], c[col('O')], c[col('P')], c[col('R')], c[col('S')], c[col('W')]],
    ['CONSTANCIA', '1080', '1045.12', 'Control', 'Virtual', 'Yuyu']);
  const m = (producto_id) => filaMaestra({ ...fila, producto_id }).split('\t')[col('M')];
  assert.deepEqual(['acompanamiento', 'control_acompanamiento', 'basico', 'transformacion', 'evaluacion', 'renovacion_constancia', null].map(m),
    ['ACOMPANAMIENTO', 'C.ACOMPANAMIENTO', 'BÁS - S/S', 'Transformación', 'Evaluación', 'Renovación Constancia', '']);
});

test('base maestra: sesiones en N como texto para que Sheets no lo vuelva fecha', () => {
  assert.equal(filaMaestra(fila).split('\t')[col('N')], '="2/7"');
  assert.equal(filaMaestra({ ...fila, sesiones: null }).split('\t')[col('N')], '');
});

test('base maestra: J, K y U llevan su fórmula apuntando a la fila donde se pega', () => {
  const c = filaMaestra(fila).split('\t');
  assert.equal(c[col('J')], '=SI(INDIRECTO("H"&FILA())=MAXIFS(H:H, C:C, INDIRECTO("C"&FILA())), "✅", "❌")');
  assert.equal(c[col('K')], '=($A$1-INDIRECTO("H"&FILA()))');
  assert.match(c[col('U')], /^=LET\(t, INDIRECTO\("T"&FILA\(\)\), v, INDIRECTO\("V"&FILA\(\)\), h, INDIRECTO\("H"&FILA\(\)\), ancla, SI\(t<>"", t, SI\(v="No requiere", h, ""\)\)/);
  assert.match(c[col('U')], /"Falta", SI\(HOY\(\)-ancla>28, \(HOY\(\)-ancla\) & " T", SI\(HOY\(\)-ancla>=0, \(HOY\(\)-ancla\) & " V", ""\)\)\)\)$/);
});

test('base maestra: lo que se llena a mano va en blanco (I, Q, T, V, X, Y, Z, AA, AB)', () => {
  const c = filaMaestra(fila).split('\t');
  for (const l of ['I', 'Q', 'T', 'V', 'X', 'Y', 'Z', 'AA', 'AB']) assert.equal(c[col(l)], '', l);
});

test('base maestra: sin hora no pone fecha; ningún dato rompe la fila con tabs o saltos', () => {
  const c = filaMaestra({ ...fila, sin_hora: true, nombres: 'Ana\tMaría\nLuz' }).split('\t');
  assert.equal(c.length, 28);
  assert.equal(c[col('H')], '');
  assert.equal(c[col('B')], 'Ana María Luz');
});
