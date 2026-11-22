import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarDatos, hoyEnLima, pideConsentimientoTutor } from '../../src/data/validar-datos.js';

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

test('fecha de nacimiento: real, entre 5 y 100 años', () => {
  assert.equal(v({ fecha_nacimiento: '1990-02-30' }).ok, false);
  assert.equal(v({ fecha_nacimiento: '04/05/1990' }).ok, false);
  assert.equal(v({ fecha_nacimiento: '2000-02-29' }).ok, true);
  assert.equal(v({ fecha_nacimiento: '2026-10-10' }).ok, false); // nace mañana
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

test('para mí (por defecto): quien paga es el paciente, con su correo y su documento', () => {
  const v = validarDatos({ ...base }, hoy);
  assert.equal(v.paraMi, true);
  assert.deepEqual(v.pagador, { nombres: 'María José', apellido_paterno: "O'Brien", apellido_materno: 'Núñez-Ríos', tipo_documento: 'dni',
    documento: '12345678', whatsapp: '+51987654321', email: 'ana@x.pe' });
  assert.equal(v.cliente.dni, '12345678');
  assert.equal(v.cliente.email, v.pagador.email);
});

test('la sesión es para otra persona: el paciente con sus datos y, sin correo propio, el de quien paga', () => {
  const otro = { ...base, para_mi: false, fecha_nacimiento: '', paciente_nombres: 'Lucía', paciente_apellido_paterno: 'Rojas',
    paciente_apellido_materno: 'Díaz', paciente_fecha_nacimiento: '2011-03-14', paciente_tipo_documento: 'dni', paciente_documento: '81234567' };
  const v = validarDatos(otro, hoy);
  assert.equal(v.ok, true);
  assert.equal(v.paraMi, false);
  assert.equal(v.cliente.nombre, 'Lucía Rojas Díaz');
  assert.equal(v.cliente.dni, '81234567');
  assert.equal(v.cliente.fecha_nacimiento, '2011-03-14');
  assert.equal(v.cliente.email, v.pagador.email);
  assert.equal(v.pagador.documento, '12345678');
  assert.equal(validarDatos({ ...otro, paciente_email: 'Lucia@X.pe ' }, hoy).cliente.email, 'lucia@x.pe');
  assert.equal(validarDatos({ ...otro, paciente_email: 'malo' }, hoy).error, 'Revisa el correo del paciente.');
  assert.equal(validarDatos({ ...otro, paciente_nombres: '' }, hoy).error, 'Escribe los nombres del paciente.');
  assert.equal(validarDatos({ ...otro, paciente_fecha_nacimiento: '' }, hoy).error, 'Revisa la fecha de nacimiento del paciente.');
  assert.equal(validarDatos({ ...otro, paciente_documento: '12' }, hoy).error, 'Escribe el DNI del paciente (8 dígitos).');
});

// Desde los 5 años (decisión 3 del rediseño web, pedido de Alejandro 22-nov-2026): 4 años no, 5 justos y 9 sí.
// En /reservar/ un menor de 14 no puede ser quien paga (va como «otra persona»); en /agenda/ no hay pago.
const otro = { ...base, para_mi: false, fecha_nacimiento: '', paciente_nombres: 'Lucía', paciente_apellido_paterno: 'Rojas',
  paciente_tipo_documento: 'dni', paciente_documento: '81234567' };
const ERROR_PARA_MI = 'Si la sesión es para un menor de 14 años, desmarca «La sesión es para mí» y escribe sus datos.';
const ERROR_TUTOR = 'Para continuar, marca la casilla de consentimiento del padre, madre o tutor.';

test('edad mínima 5 años: para otra persona en /reservar/ y en /agenda/', () => {
  const casos = [['2021-10-10', false, '4 años, cumple 5 mañana'], ['2021-10-09', true, 'cumple 5 hoy'], ['2016-10-10', true, '9 años']];
  for (const [nacimiento, ok, que] of casos) {
    const suyo = validarDatos({ ...otro, paciente_fecha_nacimiento: nacimiento, consentimiento_tutor: true }, hoy);
    assert.equal(suyo.ok, ok, `para otra persona, ${que}`);
    if (ok) assert.equal(suyo.cliente.fecha_nacimiento, nacimiento);
    else assert.equal(suyo.error, 'Revisa la fecha de nacimiento del paciente.');
    const agenda = validarDatos({ ...base, fecha_nacimiento: nacimiento, consentimiento_tutor: true }, hoy, { pago: false });
    assert.equal(agenda.ok, ok, `agenda, ${que}`);
    if (!ok) assert.equal(agenda.error, 'Revisa tu fecha de nacimiento.');
  }
});

test('menor de 14: sin la casilla del padre, madre o tutor rechaza; con ella acepta', () => {
  for (const nacimiento of ['2021-10-09', '2012-10-10']) { // 5 años; 13, cumple 14 mañana
    const sin = validarDatos({ ...otro, paciente_fecha_nacimiento: nacimiento }, hoy);
    assert.equal(sin.ok, false, nacimiento);
    assert.equal(sin.error, ERROR_TUTOR);
    const con = validarDatos({ ...otro, paciente_fecha_nacimiento: nacimiento, consentimiento_tutor: true }, hoy);
    assert.equal(con.ok, true, nacimiento);
    assert.equal(con.consentimientoTutor, true);
    assert.equal(validarDatos({ ...otro, paciente_fecha_nacimiento: nacimiento, consentimiento_tutor: 'true' }, hoy).ok, false);
    assert.equal(validarDatos({ ...base, fecha_nacimiento: nacimiento }, hoy, { pago: false }).error, ERROR_TUTOR);
    assert.equal(validarDatos({ ...base, fecha_nacimiento: nacimiento, consentimiento_tutor: true }, hoy, { pago: false }).ok, true);
  }
});

test('14 años o más: no pide la casilla, para mí ni para otra persona', () => {
  for (const nacimiento of ['2012-10-09', '2011-03-14', '1990-02-28']) { // cumple 14 hoy; 15; adulto
    const mio = validarDatos({ ...base, fecha_nacimiento: nacimiento }, hoy);
    assert.equal(mio.ok, true, `para mí, ${nacimiento}`);
    assert.equal(mio.consentimientoTutor, false);
    assert.equal(validarDatos({ ...otro, paciente_fecha_nacimiento: nacimiento }, hoy).ok, true, `otra persona, ${nacimiento}`);
    assert.equal(validarDatos({ ...base, fecha_nacimiento: nacimiento }, hoy, { pago: false }).ok, true, `agenda, ${nacimiento}`);
  }
});

test('«para mí» con menos de 14 en /reservar/: rechaza aunque marque la casilla', () => {
  for (const nacimiento of ['2021-10-09', '2016-10-10', '2012-10-10']) {
    assert.equal(validarDatos({ ...base, fecha_nacimiento: nacimiento }, hoy).error, ERROR_PARA_MI, nacimiento);
    assert.equal(validarDatos({ ...base, fecha_nacimiento: nacimiento, consentimiento_tutor: true }, hoy).error, ERROR_PARA_MI, nacimiento);
  }
});

test('pideConsentimientoTutor: solo con fecha real y menos de 14 años', () => {
  assert.equal(pideConsentimientoTutor('2012-10-10', hoy), true);
  assert.equal(pideConsentimientoTutor('2012-10-09', hoy), false);
  assert.equal(pideConsentimientoTutor('2021-02-30', hoy), false);
  assert.equal(pideConsentimientoTutor('', hoy), false);
});
