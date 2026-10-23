import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eventoEquipo } from './evento-equipo.mjs';

const nutri = { nombre: 'Jussara' };
const base = { id: 'R1', nombre: 'Cecilia Chau Pérez', whatsapp: '+51987098864', email: 'c@x.pe' };

test('web, plan por meses: nombre · sesiones al mes · 1 de N', () => {
  const e = eventoEquipo({ ...base, producto: 'constancia', duracion_meses: 3 }, nutri);
  assert.equal(e.titulo, 'Cecilia Chau Pérez · 2 sesiones al mes · 1 de 7');
  assert.equal(e.descripcion, [
    'Producto: Constancia · 3 meses', 'Cita: 1 de 7', 'Nutricionista: Jussara',
    'WhatsApp: +51987098864', 'Correo: c@x.pe', 'Procedencia: Web (pagado)', 'Reserva: R1',
  ].join('\n'));
});

test('singular: 1 sesión al mes', () => {
  const e = eventoEquipo({ ...base, producto: 'acompanamiento', duracion_meses: 1 }, nutri);
  assert.equal(e.titulo, 'Cecilia Chau Pérez · 1 sesión al mes · 1 de 1');
  assert.match(e.descripcion, /^Producto: Acompañamiento · 1 mes$/m);
});

test('Transformación 6 meses: 4 sesiones al mes y una evaluación extra', () => {
  const e = eventoEquipo({ ...base, producto: 'transformacion', duracion_meses: 6 }, nutri);
  assert.equal(e.titulo, 'Cecilia Chau Pérez · 4 sesiones al mes · 1 de 25');
});

test('web, pago único: evaluación y básico sin sesiones al mes', () => {
  const ev = eventoEquipo({ ...base, producto: 'evaluacion', duracion_meses: 1 }, nutri);
  assert.equal(ev.titulo, 'Cecilia Chau Pérez · 1 de 1');
  assert.match(ev.descripcion, /^Producto: Evaluación$/m);
  const ba = eventoEquipo({ ...base, producto: 'basico', duracion_meses: 1 }, nutri);
  assert.equal(ba.titulo, 'Cecilia Chau Pérez · 1 de 1');
  assert.match(ba.descripcion, /^Producto: Básico$/m);
});

test('link: plan y cita del link, procedencia link', () => {
  const e = eventoEquipo({ ...base, producto: 'link_c30p', link_id: 'L1', link_plan: 'constancia:3', link_cita: '2' }, nutri);
  assert.equal(e.titulo, 'Cecilia Chau Pérez · 2 sesiones al mes · 2 de 7');
  assert.match(e.descripcion, /^Producto: Constancia · 3 meses$/m);
  assert.match(e.descripcion, /^Cita: 2 de 7$/m);
  assert.match(e.descripcion, /^Procedencia: Link de un solo uso$/m);
});

test('link de evaluación: 1 de 1', () => {
  const e = eventoEquipo({ ...base, producto: 'link_c30v', link_id: 'L1', link_plan: 'evaluacion', link_cita: '1' }, nutri);
  assert.equal(e.titulo, 'Cecilia Chau Pérez · 1 de 1');
});

test('link viejo sin plan válido: etiqueta de cita del panel o 1ra sesión', () => {
  const viejo = eventoEquipo({ ...base, producto: 'link_c30v', link_id: 'L1', link_plan: 'otro', link_cita: '3' }, nutri);
  assert.equal(viejo.titulo, 'Cecilia Chau Pérez · 3ra sesión');
  assert.match(viejo.descripcion, /^Producto: Otro$/m);
  const sin = eventoEquipo({ ...base, producto: 'link_c30v', link_id: 'L1', link_plan: null, link_cita: null }, nutri);
  assert.equal(sin.titulo, 'Cecilia Chau Pérez · 1ra sesión');
  assert.doesNotMatch(sin.descripcion, /Producto:/);
  const evalMes = eventoEquipo({ ...base, producto: 'link_c30v', link_id: 'L1', link_plan: 'transformacion:6', link_cita: 'evaluacion_mes' }, nutri);
  assert.equal(evalMes.titulo, 'Cecilia Chau Pérez · 4 sesiones al mes · Evaluación de fin de mes');
});

test('link de Renovación Constancia: sin sesiones al mes, 2 de 2', () => {
  const e = eventoEquipo({ ...base, producto: 'link_c30p', link_id: 'L1', link_plan: 'renovacion_constancia', link_cita: '2' }, nutri);
  assert.equal(e.titulo, 'Cecilia Chau Pérez · 2 de 2');
  assert.match(e.descripcion, /^Producto: Renovación Constancia$/m);
});

test('la descripción del evento termina con los requisitos de la modalidad (2026-10-23)', () => {
  const v = eventoEquipo({ ...base, producto: 'evaluacion', duracion_meses: 1, modalidad: 'video' }, nutri).descripcion;
  assert.match(v, /^Reserva: R1\n\n📌 Requisitos para tu consulta virtual\n• Tienes que pesarte y tallarte/m);
  const p = eventoEquipo({ ...base, producto: 'evaluacion', duracion_meses: 1, modalidad: 'presencial' }, nutri).descripcion;
  assert.match(p, /Requisitos para tu consulta presencial/);
  assert.doesNotMatch(p, /pesarte/);
});
