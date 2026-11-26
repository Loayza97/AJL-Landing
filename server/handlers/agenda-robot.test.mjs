import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1DePrueba } from '../reservas/d1-prueba.mjs';
import { nutricionistas } from '../../src/data/nutricionistas.js';
import { handleAgendaRobot } from './agenda-robot.mjs';
import { handleAgendaConfirmar } from './agenda.mjs';
import { sha256Hex } from '../tokens.mjs';
import * as agenda from '../agenda/repo.mjs';

const t0 = new Date('2026-10-05T15:00:00Z'); // lunes 10:00 en Lima
const env = { PUBLIC_SITE_URL: 'https://www.ajlnutricion.com', NOTIFICATION_EMAIL: 'equipo@x.pe', ROBOT_AGENDA_TOKEN: 'clave-del-robot',
  CORREOS_EQUIPO: JSON.stringify({ romina: 'romina@x.pe', irene: 'irene@x.pe', alejandro: 'alejandro@x.pe', jussara: 'jussara@x.pe', paola: 'paola@x.pe' }) };
function deps(extra = {}) {
  const correos = [];
  const eventos = [];
  return {
    db: d1DePrueba(), nutricionistas, ahora: () => t0, correos, eventos,
    sendEmail: async (m) => { correos.push(m); return true; },
    google: { listarEventos: async () => [], crearEvento: async (e) => { eventos.push(e); return { id: `ev${eventos.length}`, meet: e.modalidad === 'video' ? 'https://meet/x' : null }; } },
    ...extra,
  };
}
const paciente = { nombres: 'Lucía', apellido_paterno: 'Ramos', apellido_materno: 'Quispe', email: 'lucia@x.pe', whatsapp: '+51987654321' };
const cuerpo = (o = {}) => ({ clave: 'dni:70123456|constancia|5de7', documento: { tipo: 'dni', numero: '70123456' }, paciente,
  producto: 'constancia', sesiones: { n: 5, m: 7 }, nutricionista: 'jussara', modalidad: 'video', duracion_min: 30,
  horas: ['2026-10-06T15:30:00Z', '2026-10-06T16:30:00Z', '2026-10-06T17:30:00Z'], ...o });
const llamar = (d, c = cuerpo(), { token = 'clave-del-robot', e = env } = {}) => handleAgendaRobot(new Request('https://x.test/api/agenda/robot', {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(c) }), e, d);
const reservas = (d) => d.db.prepare('SELECT estado, producto, inicio_utc, nutricionista_id, modalidad, duracion_min FROM reservas').all().then((x) => x.results);

test('sin clave del robot: 401; sin configurar: 503; GET: 405', async () => {
  const d = deps();
  assert.equal((await llamar(d, cuerpo(), { token: null })).status, 401);
  assert.equal((await llamar(d, cuerpo(), { token: 'otra' })).status, 401);
  assert.equal((await llamar(d, cuerpo(), { e: { ...env, ROBOT_AGENDA_TOKEN: undefined } })).status, 503);
  assert.equal((await handleAgendaRobot(new Request('https://x.test/api/agenda/robot'), env, d)).status, 405);
  assert.deepEqual(await reservas(d), []);
});

test('paciente nuevo: reserva la primera hora, evento con invitación, correo al paciente y sin aviso «cita nueva» al equipo', async () => {
  const d = deps();
  const res = await llamar(d);
  assert.equal(res.status, 200);
  const v = await res.json();
  assert.equal(v.ok, true);
  assert.equal(v.ya_agendada, false);
  assert.equal(v.paciente_nuevo, true);
  assert.equal(v.inicio, '2026-10-06T15:30:00Z');
  assert.equal(v.calendario, 'ok');
  assert.equal(v.meet, 'https://meet/x');
  assert.equal(v.plan, 'constancia:3');
  assert.equal(v.cita, '5');
  assert.deepEqual(await reservas(d), [{ estado: 'confirmada', producto: 'link_c30v', inicio_utc: '2026-10-06T15:30:00Z', nutricionista_id: 'jussara', modalidad: 'video', duracion_min: 30 }]);
  assert.equal(d.eventos[0].invitado.email, 'lucia@x.pe');
  assert.deepEqual(d.correos.map((c) => c.to), ['lucia@x.pe']);
  assert.ok(!d.correos.some((c) => /^Nueva cita: /.test(c.subject)));
  // El link interno queda usado, con su producto y cita, para «Agendados».
  const l = await agenda.linkPorId(d.db, 'robot:dni:70123456|constancia|5de7');
  assert.equal(l.plan, 'constancia:3');
  assert.equal(l.cita, '5');
  assert.equal(l.creado_por, 'robot-siguiente-cita');
  assert.ok(l.usado_en);
});

test('el mismo link de agenda manual sí avisa al equipo; el robot no (misma reserva, distinto aviso)', async () => {
  const d = deps();
  await agenda.crearLink(d.db, { id: 'L1', tokenHash: await sha256Hex('tok'), tipo: 'c30v', creadoPor: 'romi@x.pe', ahora: t0, plan: 'constancia:3', cita: '2', nutri: 'jussara' });
  const res = await handleAgendaConfirmar(new Request('https://x.test/api/agenda/confirmar', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ l: 'tok', inicio: '2026-10-06T15:30:00Z', modalidad: 'video', nutricionista: 'jussara', dni: '70999999',
      datos: { ...paciente, fecha_nacimiento: '1992-03-08', acepto: true } }) }), env, d);
  assert.equal(res.status, 200);
  assert.ok(d.correos.some((c) => /^Nueva cita: /.test(c.subject) && c.to.includes('romina@x.pe')));
});

test('repetir la misma clave no duplica: devuelve la cita ya agendada', async () => {
  const d = deps();
  const a = await (await llamar(d)).json();
  const b = await (await llamar(d)).json();
  assert.equal(b.ya_agendada, true);
  assert.equal(b.inicio, a.inicio);
  assert.equal(b.reserva_id, a.reserva_id);
  assert.equal((await reservas(d)).length, 1);
  assert.equal(d.eventos.length, 1);
});

test('hora ideal ocupada por una reserva: toma la siguiente y dice cuál intentó', async () => {
  const d = deps();
  await llamar(d, cuerpo({ clave: 'dni:11111111|constancia|2de7', documento: { tipo: 'dni', numero: '11111111' } })); // ocupa 15:30Z
  const v = await (await llamar(d)).json();
  assert.equal(v.ok, true);
  assert.equal(v.inicio, '2026-10-06T16:30:00Z');
  assert.deepEqual(v.intentadas, [{ inicio: '2026-10-06T15:30:00Z', motivo: 'no_libre' }]);
});

test('hora ocupada por un evento hecho a mano en Google Calendar: no la toma', async () => {
  const d = deps({ google: { listarEventos: async () => [{ titulo: 'Reunión', todoElDia: false, desde: '2026-10-06T15:00:00Z', hasta: '2026-10-06T16:00:00Z', propio: false, bloquea: true }],
    crearEvento: async () => ({ id: 'e', meet: 'https://meet/x' }) } });
  const v = await (await llamar(d)).json();
  assert.equal(v.ok, true);
  assert.notEqual(v.inicio, '2026-10-06T15:30:00Z');
});

test('ninguna hora libre: 409 sin_hora, nada reservado y paciente sin crear', async () => {
  const d = deps({ google: { listarEventos: async () => [{ titulo: 'Cerrado', todoElDia: true, desde: '2026-10-06', hasta: '2026-10-07', propio: false, bloquea: true }],
    crearEvento: async () => ({ id: 'e', meet: null }) } });
  const res = await llamar(d);
  assert.equal(res.status, 409);
  const v = await res.json();
  assert.equal(v.motivo, 'sin_hora');
  assert.equal(v.intentadas.length, 3);
  assert.deepEqual(await reservas(d), []);
  assert.equal((await d.db.prepare('SELECT COUNT(*) AS n FROM clientes').first()).n, 0);
  assert.equal(d.correos.length, 0);
});

test('Google Calendar sin poder leerse: 503 y no reserva nada', async () => {
  const d = deps({ google: { listarEventos: async () => { throw new Error('Google events.list 500'); }, crearEvento: async () => ({ id: 'e', meet: null }) } });
  const res = await llamar(d);
  assert.equal(res.status, 503);
  assert.equal((await res.json()).motivo, 'agenda');
  assert.deepEqual(await reservas(d), []);
});

test('Google falla al crear el evento: 200 con calendario pendiente (el robot no manda el WhatsApp) y alerta al equipo', async () => {
  const d = deps({ google: { listarEventos: async () => [], crearEvento: async () => { throw new Error('caído'); } } });
  const v = await (await llamar(d)).json();
  assert.equal(v.ok, true);
  assert.equal(v.calendario, 'pendiente');
  assert.ok(d.correos.some((c) => c.to === 'equipo@x.pe'));
});

test('paciente que ya está en la web: no hace falta mandar sus datos', async () => {
  const d = deps();
  await llamar(d);
  const v = await (await llamar(d, cuerpo({ clave: 'dni:70123456|constancia|6de7', paciente: undefined, sesiones: { n: 6, m: 7 }, horas: ['2026-10-13T15:30:00Z'] }))).json();
  assert.equal(v.ok, true);
  assert.equal(v.paciente_nuevo, false);
  assert.equal((await d.db.prepare('SELECT COUNT(*) AS n FROM clientes').first()).n, 1);
});

test('paciente que no está en la web y sin datos: 400 paciente', async () => {
  const d = deps();
  const res = await llamar(d, cuerpo({ paciente: undefined }));
  assert.equal(res.status, 400);
  assert.equal((await res.json()).motivo, 'paciente');
  assert.deepEqual(await reservas(d), []);
});

test('datos inválidos: producto o sesión que no existen, tipo que no corresponde, horas mal, nutri desconocida', async () => {
  const d = deps();
  const falla = async (o, motivo) => {
    const res = await llamar(d, cuerpo(o));
    assert.equal(res.status, 400, JSON.stringify(o));
    if (motivo) assert.equal((await res.json()).motivo, motivo);
  };
  await falla({ producto: 'constancia', sesiones: { n: 5, m: 9 } }, 'plan'); // ningún plan de 9 citas
  await falla({ producto: 'cafe' }, 'plan');
  await falla({ sesiones: { n: 8, m: 7 } }, 'plan'); // la 8 de 7 no existe
  await falla({ producto: 'basico', sesiones: { n: 1, m: 1 } }, 'tipo'); // Básico no tiene controles de 30 min
  await falla({ horas: [] });
  await falla({ horas: ['2026-10-06T15:15:00Z'] });
  await falla({ nutricionista: 'nadie' });
  await falla({ modalidad: 'telefono' });
  await falla({ duracion_min: 45 });
  await falla({ clave: 'x' });
  await falla({ documento: { tipo: 'dni', numero: '123' } });
  assert.deepEqual(await reservas(d), []);
});

test('sesión de 1 hora presencial: tipo s60 y solo horas en punto', async () => {
  const d = deps();
  const v = await (await llamar(d, cuerpo({ producto: 'basico', sesiones: { n: 1, m: 1 }, duracion_min: 60, modalidad: 'presencial', nutricionista: 'paola',
    clave: 'dni:70123456|basico|1de1', horas: ['2026-10-09T19:30:00Z', '2026-10-09T20:00:00Z'] }))).json(); // viernes: Paola presencial desde las 14:00 Lima
  assert.equal(v.ok, true);
  assert.equal(v.inicio, '2026-10-09T20:00:00Z');
  assert.equal(v.duracion_min, 60);
  assert.equal((await reservas(d))[0].producto, 'link_s60');
});
