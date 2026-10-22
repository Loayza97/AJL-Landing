import { test } from 'node:test';
import assert from 'node:assert/strict';
import { horasLibres, ausenciasDelDia, topeMinutosDia } from './disponibilidad.mjs';
import { nutricionistas } from '../../src/data/nutricionistas.js';

// Lunes 5-oct-2026, 10:00 en Lima.
const ahora = new Date('2026-10-05T15:00:00Z');
const base = { nutricionistas, eventos: [], reservas: [], ahora };
const horas = (r) => r.map((h) => h.hora);
const de = (r, nutri) => r.filter((h) => h.nutricionista_id === nutri);
const diaCompleto = (titulo, desde, hasta) => ({ titulo, todoElDia: true, desde, hasta, propio: false, bloquea: true });
const conHora = (titulo, desde, hasta, extra = {}) => ({ titulo, todoElDia: false, desde, hasta, propio: false, bloquea: true, ...extra });
const reserva = (o) => ({ modalidad: 'presencial', ...o });

test('martes presencial: de 10:00 a 19:00, recortado al consultorio', () => {
  const r = horasLibres({ ...base, fecha: '2026-10-06', modalidad: 'presencial' });
  assert.deepEqual(horas(r), ['10:00', '11:00', '12:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00']);
  assert.equal(r[0].inicio, '2026-10-06T15:00:00Z');
});

test('Nico alterna (Romi, 2026-10-15): miércoles 14 sí, 21 no; sábado 10 sí de 9 a 18, 17 no', () => {
  const nico = (fecha) => horasLibres({ ...base, fecha, modalidad: 'presencial', filtroNutricionista: 'nico' });
  assert.equal(horas(nico('2026-10-14'))[0], '11:00');
  assert.deepEqual(nico('2026-10-21'), []);
  assert.deepEqual(nico('2026-10-17'), []);
  assert.deepEqual(horas(nico('2026-10-10')), ['09:00', '10:00', '11:00', '12:00', '14:00', '15:00', '16:00', '17:00']);
});

test('Paolo (Romi, 2026-10-15): viernes fijo de 14 a 20; alterna martes 20 y sábado 17 de 10 a 17', () => {
  const paolo = (fecha, modalidad = 'presencial') => horas(horasLibres({ ...base, fecha, modalidad, filtroNutricionista: 'paolo' }));
  assert.deepEqual(paolo('2026-10-09'), ['14:00', '15:00', '16:00', '17:00', '18:00', '19:00']);
  assert.deepEqual(paolo('2026-10-17'), ['10:00', '11:00', '12:00', '14:00', '15:00', '16:00']);
  assert.deepEqual(paolo('2026-10-10'), []);
  assert.deepEqual(paolo('2026-10-24'), []);
  assert.deepEqual(paolo('2026-10-20'), ['14:00', '15:00', '16:00', '17:00', '18:00', '19:00']);
  assert.deepEqual(paolo('2026-10-13'), []);
  assert.deepEqual(paolo('2026-10-12'), ['14:00', '15:00', '16:00', '17:00', '18:00', '19:00']); // lunes fijo
  // Viernes y sábado son presenciales y, como toda ventana presencial, también por video.
  assert.deepEqual(paolo('2026-10-09', 'video'), ['14:00', '15:00', '16:00', '17:00', '18:00', '19:00']);
  assert.deepEqual(paolo('2026-10-17', 'video'), ['10:00', '11:00', '12:00', '14:00', '15:00', '16:00']);
});

test('modalidad sin definir se ofrece en ambas: Jussara también por video', () => {
  const v = horasLibres({ ...base, fecha: '2026-10-06', modalidad: 'video', filtroNutricionista: 'jussara' });
  assert.deepEqual(horas(v), ['10:00', '11:00', '12:00', '14:00', '15:00', '16:00']);
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
  assert.notEqual(r.find((h) => h.hora === '15:00').nutricionista_id, 'nico');
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

test('de 1 a 2 es almuerzo: nunca se ofrece la hora de las 13:00, ni presencial ni por video', () => {
  for (const fecha of ['2026-10-06', '2026-10-07', '2026-10-09', '2026-10-17']) {
    for (const modalidad of ['presencial', 'video']) {
      assert.ok(!horas(horasLibres({ ...base, fecha, modalidad })).includes('13:00'), `${fecha} ${modalidad}`);
    }
  }
});

const media = { duracionMin: 30, pasoMin: 30 };

test('30 min cada 30: martes presencial de 10:00 a 19:30, sin la hora del almuerzo', () => {
  const r = horasLibres({ ...base, ...media, fecha: '2026-10-06', modalidad: 'presencial' });
  assert.deepEqual(horas(r), ['10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30',
    '17:00', '17:30', '18:00', '18:30', '19:00', '19:30']);
  assert.equal(r[1].inicio, '2026-10-06T15:30:00Z');
});

test('60 min cada 30: no se ofrece 12:30 (pisa el almuerzo) ni 19:30 (pasa el cierre)', () => {
  const r = horas(horasLibres({ ...base, duracionMin: 60, pasoMin: 30, fecha: '2026-10-06', modalidad: 'presencial' }));
  assert.ok(r.includes('12:00'));
  assert.ok(!r.includes('12:30'));
  assert.ok(r.includes('19:00'));
  assert.ok(!r.includes('19:30'));
});

test('una reserva de 60 a las 10:00 tapa 10:00 y 10:30 de esa nutricionista; una de 30 a las 10:00 solo 10:00', () => {
  const de60 = [reserva({ inicio_utc: '2026-10-06T15:00:00Z', fin_utc: '2026-10-06T16:00:00Z', fecha_lima: '2026-10-06', nutricionista_id: 'jussara', modalidad: 'video' })];
  const r60 = horas(horasLibres({ ...base, ...media, reservas: de60, fecha: '2026-10-06', modalidad: 'video', filtroNutricionista: 'jussara' }));
  assert.ok(!r60.includes('10:00') && !r60.includes('10:30') && r60.includes('11:00'));
  const de30 = [reserva({ inicio_utc: '2026-10-06T15:00:00Z', fin_utc: '2026-10-06T15:30:00Z', fecha_lima: '2026-10-06', nutricionista_id: 'jussara', modalidad: 'video' })];
  const r30 = horas(horasLibres({ ...base, ...media, reservas: de30, fecha: '2026-10-06', modalidad: 'video', filtroNutricionista: 'jussara' }));
  assert.ok(!r30.includes('10:00') && r30.includes('10:30'));
});

test('una reserva vieja sin fin_utc cuenta como 60 min', () => {
  const reservas = [reserva({ inicio_utc: '2026-10-06T15:00:00Z', fecha_lima: '2026-10-06', nutricionista_id: 'jussara', modalidad: 'video' })];
  const r = horas(horasLibres({ ...base, ...media, reservas, fecha: '2026-10-06', modalidad: 'video', filtroNutricionista: 'jussara' }));
  assert.ok(!r.includes('10:30'));
});

test('la web sigue igual: una cita de 30 a las 10:30 tapa la hora de 10:00 a 11:00', () => {
  const reservas = [reserva({ inicio_utc: '2026-10-06T15:30:00Z', fin_utc: '2026-10-06T16:00:00Z', fecha_lima: '2026-10-06', nutricionista_id: 'jussara', modalidad: 'video' })];
  const r = horas(horasLibres({ ...base, reservas, fecha: '2026-10-06', modalidad: 'video', filtroNutricionista: 'jussara' }));
  assert.ok(!r.includes('10:00'));
  assert.ok(r.includes('11:00'));
});

test('una reserva de 30 min ocupa solo esa media hora de su nutricionista', () => {
  const reservas = [reserva({ inicio_utc: '2026-10-06T15:00:00Z', fecha_lima: '2026-10-06', nutricionista_id: 'jussara', duracion_min: 30, fin_utc: '2026-10-06T15:30:00Z' })];
  const r = horas(horasLibres({ ...base, ...media, reservas, fecha: '2026-10-06', modalidad: 'video', filtroNutricionista: 'jussara' }));
  assert.ok(!r.includes('10:00'));
  assert.ok(r.includes('10:30'));
});

test('presencial también se ofrece por video; una ventana solo virtual no se vuelve presencial', () => {
  // Lunes: Nico es presencial de 11 a 20 y Paola solo virtual de 14 a 20.
  const nico = horas(horasLibres({ ...base, fecha: '2026-10-12', modalidad: 'video', filtroNutricionista: 'nico' }));
  assert.deepEqual(nico, ['11:00', '12:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00']);
  assert.deepEqual(horasLibres({ ...base, fecha: '2026-10-12', modalidad: 'presencial', filtroNutricionista: 'paola' }), []);
});

test('Paola los miércoles atiende de 14 a 19 (a las 7 p. m. da la clase), presencial o virtual', () => {
  for (const modalidad of ['presencial', 'video']) {
    const r = horas(horasLibres({ ...base, fecha: '2026-10-14', modalidad, filtroNutricionista: 'paola' }));
    assert.deepEqual(r, ['14:00', '15:00', '16:00', '17:00', '18:00'], modalidad);
  }
});

// Martes 6-oct a las horas dadas (Lima), cada una de otra nutricionista ficticia.
const delMartes = (horasLima, extra = {}) => horasLima.map((h, i) => reserva({
  inicio_utc: `2026-10-06T${String(h + 5).padStart(2, '0')}:00:00Z`, fecha_lima: '2026-10-06', nutricionista_id: `n${i}`, ...extra }));

test('tope diario (Alejandro, 2026-10-22): 300 minutos de lunes a viernes, 480 el sábado', () => {
  assert.equal(topeMinutosDia('2026-10-05'), 300);
  assert.equal(topeMinutosDia('2026-10-09'), 300);
  assert.equal(topeMinutosDia('2026-10-10'), 480);
});

test('tope: 5 citas de una hora llenan un martes, sean de la web o de links', () => {
  const llenas = delMartes([10, 11, 12, 14, 15]);
  assert.deepEqual(horasLibres({ ...base, reservas: llenas, fecha: '2026-10-06', modalidad: 'video' }), []);
  assert.deepEqual(horasLibres({ ...base, reservas: llenas, fecha: '2026-10-06', modalidad: 'video', duracionMin: 30, pasoMin: 30 }), []);
  assert.ok(horasLibres({ ...base, reservas: llenas.slice(1), fecha: '2026-10-06', modalidad: 'video' }).length > 0);
});

test('tope: se combinan citas de 30 y de 60; con 30 minutos libres entra un link de 30 pero no una cita de una hora', () => {
  const reservas = [...delMartes([10, 11, 12, 14]), ...delMartes([15], { duracion_min: 30, nutricionista_id: 'n9' })];
  assert.deepEqual(horasLibres({ ...base, reservas, fecha: '2026-10-06', modalidad: 'video' }), []);
  assert.ok(horasLibres({ ...base, reservas, fecha: '2026-10-06', modalidad: 'video', duracionMin: 30, pasoMin: 30 }).length > 0);
  const diez = delMartes([10, 11, 12, 14, 15, 16, 17, 18, 19, 20], { duracion_min: 30 });
  assert.deepEqual(horasLibres({ ...base, reservas: diez, fecha: '2026-10-06', modalidad: 'video', duracionMin: 30, pasoMin: 30 }), []);
});

test('tope: el sábado caben 8 horas', () => {
  const sabado = (horasLima) => horasLima.map((h, i) => reserva({
    inicio_utc: `2026-10-10T${h + 5}:00:00Z`, fecha_lima: '2026-10-10', nutricionista_id: `n${i}` }));
  assert.ok(horasLibres({ ...base, reservas: sabado([9, 10, 11, 12, 14]), fecha: '2026-10-10', modalidad: 'video' }).length > 0);
  assert.deepEqual(horasLibres({ ...base, reservas: sabado([9, 10, 11, 12, 14, 15, 16, 17]), fecha: '2026-10-10', modalidad: 'video' }), []);
});

test('tope: los eventos puestos a mano no suman', () => {
  const eventos = ['16', '17', '18'].map((h) => conHora(`Control ${h}`, `2026-10-06T${h}:00:00-05:00`, `2026-10-06T${h}:30:00-05:00`));
  const r = horasLibres({ ...base, reservas: delMartes([10, 11, 12, 14]), eventos, fecha: '2026-10-06', modalidad: 'video' });
  assert.ok(r.length > 0);
});

test('evento manual con hora que nombra a una nutricionista: la bloquea solo a ella', () => {
  const eventos = [conHora('Juan Pérez · Yuyu', '2026-10-06T11:00:00-05:00', '2026-10-06T12:00:00-05:00')];
  const r = horasLibres({ ...base, eventos, fecha: '2026-10-06', modalidad: 'presencial' });
  assert.equal(r.find((h) => h.hora === '11:00').nutricionista_id, 'nico');
  assert.ok(horas(r).includes('10:00'));
  const jussara = horasLibres({ ...base, eventos, fecha: '2026-10-06', modalidad: 'presencial', filtroNutricionista: 'jussara' });
  assert.ok(!horas(jussara).includes('11:00'));
  assert.ok(horas(jussara).includes('12:00'));
});

test('evento manual con hora que no nombra a nadie: bloquea esa hora para todas, en ambas modalidades', () => {
  const eventos = [conHora('Reunión equipo', '2026-10-06T11:30:00-05:00', '2026-10-06T12:00:00-05:00')];
  for (const modalidad of ['presencial', 'video']) {
    const r = horas(horasLibres({ ...base, eventos, fecha: '2026-10-06', modalidad }));
    assert.ok(!r.includes('11:00'), modalidad);
    assert.ok(r.includes('10:00') && r.includes('12:00'), modalidad);
  }
});

test('no bloquean: eventos marcados como libres en Google ni los que creó el sistema', () => {
  const eventos = [
    conHora('Reunión equipo', '2026-10-06T11:00:00-05:00', '2026-10-06T12:00:00-05:00', { bloquea: false }),
    conHora('Cecilia · 1 de 1', '2026-10-06T12:00:00-05:00', '2026-10-06T13:00:00-05:00', { propio: true }),
  ];
  assert.deepEqual(horasLibres({ ...base, eventos, fecha: '2026-10-06', modalidad: 'presencial' }),
    horasLibres({ ...base, fecha: '2026-10-06', modalidad: 'presencial' }));
});

test('sinTope (editar desde el panel): un día lleno sigue ofreciendo horas libres', () => {
  const llenas = delMartes([10, 11, 12, 14, 15]);
  assert.deepEqual(horasLibres({ ...base, reservas: llenas, fecha: '2026-10-06', modalidad: 'video' }), []);
  const r = horasLibres({ ...base, reservas: llenas, fecha: '2026-10-06', modalidad: 'video', sinTope: true });
  assert.ok(horas(r).includes('16:00'));
});
