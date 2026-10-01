import { test } from 'node:test';
import assert from 'node:assert/strict';
import { horasLibres, ausenciasDelDia, primerasManuales } from './disponibilidad.mjs';
import { nutricionistas } from '../../src/data/nutricionistas.js';

// Lunes 5-oct-2026, 10:00 en Lima.
const ahora = new Date('2026-10-05T15:00:00Z');
const base = { peso: 1, nutricionistas, eventos: [], reservas: [], ahora };
const horas = (r) => r.map((h) => h.hora);
const de = (r, nutri) => r.filter((h) => h.nutricionista_id === nutri);
const diaCompleto = (titulo, desde, hasta) => ({ titulo, todoElDia: true, desde, hasta, propio: false, bloquea: true });
const conHora = (titulo, desde, hasta, extra = {}) => ({ titulo, todoElDia: false, desde, hasta, propio: false, bloquea: true, ...extra });
const reserva = (o) => ({ peso_tope: 1, modalidad: 'presencial', ...o });

test('martes presencial: de 10:00 a 19:00, recortado al consultorio', () => {
  const r = horasLibres({ ...base, fecha: '2026-10-06', modalidad: 'presencial' });
  assert.deepEqual(horas(r), ['10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00']);
  assert.equal(r[0].inicio, '2026-10-06T15:00:00Z');
});

test('Nico alterna: miércoles 7 sí, miércoles 14 no; sábado 10 no, sábado 17 sí de 9 a 18', () => {
  const nico = (fecha) => horasLibres({ ...base, fecha, modalidad: 'presencial', filtroNutricionista: 'nico' });
  assert.equal(horas(nico('2026-10-07'))[0], '11:00');
  assert.deepEqual(nico('2026-10-14'), []);
  assert.deepEqual(nico('2026-10-10'), []);
  assert.deepEqual(horas(nico('2026-10-17')), ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00']);
});

test('Paolo no se ofrece viernes ni sábado mientras su alternancia no esté definida', () => {
  for (const fecha of ['2026-10-09', '2026-10-10']) {
    for (const modalidad of ['presencial', 'video']) {
      assert.deepEqual(horasLibres({ ...base, fecha, modalidad, filtroNutricionista: 'paolo' }), [], `${fecha} ${modalidad}`);
    }
  }
});

test('modalidad sin definir se ofrece en ambas: Jussara también por video', () => {
  const v = horasLibres({ ...base, fecha: '2026-10-06', modalidad: 'video', filtroNutricionista: 'jussara' });
  assert.deepEqual(horas(v), ['10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00']);
});

test('viernes por video: Jussara desde las 10, Nico hasta las 19', () => {
  const r = horasLibres({ ...base, fecha: '2026-10-09', modalidad: 'video' });
  assert.equal(r[0].hora, '10:00');
  assert.equal(r.at(-1).hora, '19:00');
});

test('consultorio único: una presencial ocupa la hora para todas, pero no el video', () => {
  const reservas = [reserva({ inicio_utc: '2026-10-09T20:00:00Z', fecha_lima: '2026-10-09', nutricionista_id: 'paola' })];
  const pres = horasLibres({ ...base, reservas, fecha: '2026-10-09', modalidad: 'presencial' });
  assert.ok(!horas(pres).includes('15:00'));
  const video = horasLibres({ ...base, reservas, fecha: '2026-10-09', modalidad: 'video' });
  assert.ok(horas(video).includes('15:00'));
});

test('nutricionista ocupada por video: la hora se le asigna a otra', () => {
  const reservas = [reserva({ inicio_utc: '2026-10-09T20:00:00Z', fecha_lima: '2026-10-09', nutricionista_id: 'nico', modalidad: 'video' })];
  const r = horasLibres({ ...base, reservas, fecha: '2026-10-09', modalidad: 'video' });
  assert.equal(r.find((h) => h.hora === '15:00').nutricionista_id, 'jussara');
});

test('máximo de horas al día, si se activa: con 5 horas tomadas no se ofrece nada', () => {
  const reservas = ['14', '15', '16'].map((h, i) => reserva({ inicio_utc: `2026-10-06T${h}:00:00Z`, fecha_lima: '2026-10-06', nutricionista_id: `n${i}`, peso_tope: 0 }));
  const eventos = [conHora('Control', '2026-10-06T17:00:00-05:00', '2026-10-06T19:00:00-05:00')];
  assert.deepEqual(horasLibres({ ...base, reservas, eventos, fecha: '2026-10-06', modalidad: 'presencial', maxHorasDia: 5 }), []);
  assert.ok(horasLibres({ ...base, reservas, eventos, fecha: '2026-10-06', modalidad: 'presencial', maxHorasDia: 6 }).length > 0);
  assert.ok(horasLibres({ ...base, reservas, eventos, fecha: '2026-10-06', modalidad: 'presencial' }).length > 0);
});

test('eventos con hora del calendario bloquean la hora; los transparentes y los propios no', () => {
  const eventos = [
    conHora('Carolina Wimpon', '2026-10-06T15:00:00-05:00', '2026-10-06T16:00:00-05:00'),
    conHora('Libre', '2026-10-06T16:00:00-05:00', '2026-10-06T17:00:00-05:00', { bloquea: false }),
    conHora('1ra · Ana · Plan', '2026-10-06T17:00:00-05:00', '2026-10-06T18:00:00-05:00', { propio: true }),
  ];
  const r = horas(horasLibres({ ...base, eventos, fecha: '2026-10-06', modalidad: 'presencial' }));
  assert.ok(!r.includes('15:00'));
  assert.ok(r.includes('14:00'));
  assert.ok(r.includes('16:00'));
  assert.ok(r.includes('17:00'));
});

test('ausencias: «vacas yuyu» saca a Jussara varios días; «nico viene» no saca a Nico', () => {
  const eventos = [diaCompleto('vacas yuyu', '2026-10-06', '2026-10-09'), diaCompleto('nico viene', '2026-10-06', '2026-10-07')];
  const r = horasLibres({ ...base, eventos, fecha: '2026-10-06', modalidad: 'presencial' });
  assert.deepEqual(de(r, 'jussara'), []);
  assert.ok(!horas(r).includes('10:00'));
  assert.ok(horas(r).includes('11:00'));
  assert.equal(r.find((h) => h.hora === '11:00').nutricionista_id, 'nico');
});

test('ausencias: «Paola no viene» no saca a Paolo; tildes y mayúsculas no importan', () => {
  const eventos = [diaCompleto('PAOLA no viene', '2026-10-12', '2026-10-13'), diaCompleto('Nicó no viene', '2026-10-12', '2026-10-13')];
  const { ausentes } = ausenciasDelDia(eventos, '2026-10-12', nutricionistas);
  assert.deepEqual([...ausentes].sort(), ['nico', 'paola']);
});

test('feriado o cerrado cierra la clínica', () => {
  const eventos = [diaCompleto('Feriado', '2026-10-08', '2026-10-09')];
  assert.deepEqual(horasLibres({ ...base, eventos, fecha: '2026-10-08', modalidad: 'presencial' }), []);
});

test('tope: 3 primeras llenan el día; 2,5 deja pasar una evaluación pero no un plan', () => {
  const r3 = [1, 2, 3].map((i) => reserva({ inicio_utc: `2026-10-06T1${i}:00:00Z`, fecha_lima: '2026-10-06', nutricionista_id: 'x' }));
  assert.deepEqual(horasLibres({ ...base, reservas: r3, fecha: '2026-10-06', modalidad: 'presencial' }), []);
  const r25 = [...r3.slice(0, 2), reserva({ inicio_utc: '2026-10-06T19:00:00Z', fecha_lima: '2026-10-06', nutricionista_id: 'x', peso_tope: 0.5 })];
  assert.deepEqual(horasLibres({ ...base, reservas: r25, fecha: '2026-10-06', modalidad: 'presencial' }), []);
  assert.ok(horasLibres({ ...base, reservas: r25, peso: 0.5, fecha: '2026-10-06', modalidad: 'presencial' }).length > 0);
});

test('tope: los eventos manuales que empiezan con «1ra» cuentan', () => {
  const eventos = ['10', '11', '12'].map((h) => conHora(`1ra Juan ${h}`, `2026-10-06T${h}:00:00-05:00`, `2026-10-06T${h}:30:00-05:00`));
  assert.equal(primerasManuales(eventos, '2026-10-06'), 3);
  assert.deepEqual(horasLibres({ ...base, eventos, fecha: '2026-10-06', modalidad: 'presencial' }), []);
});

test('ventana: nada para hoy ni más allá de 21 días', () => {
  assert.deepEqual(horasLibres({ ...base, fecha: '2026-10-05', modalidad: 'presencial' }), []);
  assert.deepEqual(horasLibres({ ...base, fecha: '2026-10-27', modalidad: 'presencial' }), []);
  assert.ok(horasLibres({ ...base, fecha: '2026-10-26', modalidad: 'presencial' }).length > 0);
});

test('asigna a la menos cargada del día, en el orden del equipo si empatan', () => {
  const reservas = [reserva({ inicio_utc: '2026-10-06T23:00:00Z', fecha_lima: '2026-10-06', nutricionista_id: 'nico' })];
  const r = horasLibres({ ...base, reservas, fecha: '2026-10-06', modalidad: 'presencial' });
  assert.equal(r.find((h) => h.hora === '15:00').nutricionista_id, 'jussara');
  assert.equal(r.find((h) => h.hora === '17:00').nutricionista_id, 'paolo');
});
