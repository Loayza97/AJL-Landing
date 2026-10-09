import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarDatos, hoyEnLima } from '../../src/data/validar-datos.js';

const hoy = '2026-10-09';
const base = {
  nombres: 'María José', apellido_paterno: "O'Brien", apellido_materno: 'Núñez-Ríos', whatsapp: '+51987654321',
  email: 'Ana@X.pe ', fecha_nacimiento: '1990-02-28', tipo_documento: 'dni', documento: '12345678', acepto: true,
};
const v = (o) => validarDatos({ ...base, ...o }, hoy);

test('datos válidos: arma el nombre completo y normaliza el correo', () => {
  const r = v({});
  assert.equal(r.ok, true);
  assert.deepEqual(r.cliente, {
    nombre: "María José O'Brien Núñez-Ríos", nombres: 'María José', apellido_paterno: "O'Brien", apellido_materno: 'Núñez-Ríos',
    fecha_nacimiento: '1990-02-28', tipo_documento: 'dni', dni: '12345678', whatsapp: '+51987654321', email: 'ana@x.pe',
  });
});

test('apellido materno vacío es válido y no deja doble espacio', () => {
  const r = v({ apellido_materno: '  ' });
  assert.equal(r.ok, true);
  assert.equal(r.cliente.apellido_materno, null);
  assert.equal(r.cliente.nombre, "María José O'Brien");
});

test('nombres o paterno vacíos, sin letras o con HTML: error', () => {
  for (const o of [{ nombres: '' }, { nombres: 'A' }, { apellido_paterno: '' }, { nombres: '123' }, { nombres: '<script>' }, { apellido_materno: 'x<b>' }]) {
    assert.equal(v(o).ok, false, JSON.stringify(o));
  }
});

test('documento: DNI 8 dígitos; CE y pasaporte con letras', () => {
  assert.equal(v({ documento: '1234567' }).ok, false);
  assert.equal(v({ documento: '1234567a' }).ok, false);
  assert.equal(v({ tipo_documento: 'ce', documento: 'x0012345' }).ok, false);
  assert.equal(v({ tipo_documento: 'ce', documento: '001234567' }).ok, true);
  assert.equal(v({ tipo_documento: 'pasaporte', documento: 'ab 123456' }).cliente.dni, 'AB123456');
  assert.equal(v({ tipo_documento: 'licencia', documento: '12345678' }).ok, false);
});

test('documento: se limpian espacios, puntos y guiones antes de validar', () => {
  assert.equal(v({ documento: '12.345.678' }).cliente.dni, '12345678');
  assert.equal(v({ documento: '12345678-9' }).ok, false);
  assert.equal(v({ tipo_documento: 'pasaporte', documento: 'AB-123456' }).cliente.dni, 'AB123456');
});

test('fecha de nacimiento: real, entre 10 y 100 años', () => {
  assert.equal(v({ fecha_nacimiento: '1990-02-30' }).ok, false);
  assert.equal(v({ fecha_nacimiento: '04/05/1990' }).ok, false);
  assert.equal(v({ fecha_nacimiento: '2000-02-29' }).ok, true);
  assert.equal(v({ fecha_nacimiento: '2016-10-10' }).ok, false); // 9 años
  assert.equal(v({ fecha_nacimiento: '2016-10-09' }).ok, true); // cumple 10 hoy
  assert.equal(v({ fecha_nacimiento: '1926-10-09' }).ok, true); // 100
  assert.equal(v({ fecha_nacimiento: '1925-10-08' }).ok, false); // 101
  assert.equal(v({ fecha_nacimiento: '2030-01-01' }).ok, false);
});

test('apóstrofo tipográfico se normaliza al guardar', () => {
  const r = v({ apellido_paterno: 'O’Brien' });
  assert.equal(r.ok, true);
  assert.equal(r.cliente.apellido_paterno, "O'Brien");
});

test('correo, WhatsApp y aceptación', () => {
  assert.equal(v({ email: 'malo' }).ok, false);
  assert.equal(v({ whatsapp: '123' }).ok, false);
  assert.equal(v({ acepto: false }).ok, false);
});

test('hoyEnLima usa la hora de Lima', () => {
  assert.equal(hoyEnLima(new Date('2026-10-10T03:00:00Z')), '2026-10-09');
});
