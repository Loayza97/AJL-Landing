import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1DePrueba } from '../reservas/d1-prueba.mjs';
import { nutricionistas } from '../../src/data/nutricionistas.js';
import { sha256Hex } from '../tokens.mjs';
import * as agenda from '../agenda/repo.mjs';
import * as repo from '../reservas/repo.mjs';
import { handleHoras } from './reservas.mjs';
import { handleAgendaLink, handleAgendaHoras, handleAgendaDni, handleAgendaConfirmar } from './agenda.mjs';

const t0 = new Date('2026-10-05T15:00:00Z'); // lunes 10:00 en Lima
const env = { PUBLIC_SITE_URL: 'https://www.ajlnutricion.com', NOTIFICATION_EMAIL: 'equipo@x.pe' };
function deps(extra = {}) {
  const correos = [];
  const eventos = [];
  return {
    db: d1DePrueba(), nutricionistas, ahora: () => t0, correos, eventos,
    sendEmail: async (m) => { correos.push(m); return true; },
    google: { listarEventos: async () => [], crearEvento: async (e) => { eventos.push(e); return { id: 'ev1', meet: e.modalidad === 'video' ? 'https://meet/x' : null }; } },
    ...extra,
  };
}
async function conLink(d, tipo = 'c30v', ahora = t0, nutri = null) {
  await agenda.crearLink(d.db, { id: `L-${tipo}`, tokenHash: await sha256Hex(`tok-${tipo}`), tipo, creadoPor: 'romi@x.pe', ahora,
    plan: 'transformacion:6', cita: 'evaluacion_mes', nutri });
  return `tok-${tipo}`;
}
const get = (ruta) => new Request(`https://x.test${ruta}`);
const post = (ruta, cuerpo) => new Request(`https://x.test${ruta}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
const datos = { nombres: 'Lucía', apellido_paterno: 'Ramos', apellido_materno: 'Quispe', email: 'lucia@x.pe', whatsapp: '+51987654321',
  fecha_nacimiento: '1992-03-08', acepto: true };
const confirmar = (d, l, o = {}) => handleAgendaConfirmar(post('/api/agenda/confirmar',
  { l, inicio: '2026-10-06T15:30:00Z', modalidad: 'video', dni: '70123456', datos, ...o }), env, d);

test('link: estado, tipo y equipo; token desconocido 404', async () => {
  const d = deps();
  const l = await conLink(d);
  const r = await (await handleAgendaLink(get(`/api/agenda/link?l=${l}`), env, d)).json();
  assert.equal(r.estado, 'sin_usar');
  assert.deepEqual(r.tipo, { id: 'c30v', nombre: 'Control de 30 min', etiqueta: 'Virtual', duracion_min: 30, modalidades: ['video'] });
  assert.equal(r.nutricionistas.length, nutricionistas.length);
  assert.equal((await handleAgendaLink(get('/api/agenda/link?l=nada'), env, d)).status, 404);
});

test('horas: cada 30 min; modalidad fuera del tipo da 400; link vencido 410', async () => {
  const d = deps();
  const l = await conLink(d);
  const r = await (await handleAgendaHoras(get(`/api/agenda/horas?l=${l}&desde=2026-10-06&dias=1&modalidad=video`), env, d)).json();
  assert.ok(r.dias[0].horas.some((h) => h.hora.endsWith(':30')));
  assert.equal((await handleAgendaHoras(get(`/api/agenda/horas?l=${l}&desde=2026-10-06&dias=1&modalidad=presencial`), env, d)).status, 400);
  const tarde = deps({ ahora: () => new Date(t0.getTime() + 8 * 86400000) });
  const l2 = await conLink(tarde, 'c30v', t0);
  assert.equal((await handleAgendaHoras(get(`/api/agenda/horas?l=${l2}&desde=2026-10-14&dias=1&modalidad=video`), env, tarde)).status, 410);
});

test('dni: desconocido → conocido false; conocido → datos enmascarados; formato malo 400', async () => {
  const d = deps();
  const l = await conLink(d);
  assert.deepEqual(await (await handleAgendaDni(post('/api/agenda/dni', { l, dni: '70123456' }), env, d)).json(), { ok: true, conocido: false });
  assert.equal((await handleAgendaDni(post('/api/agenda/dni', { l, dni: '123' }), env, d)).status, 400);
  await confirmar(d, l);
  const l2 = await conLink(d, 's60');
  const r = await (await handleAgendaDni(post('/api/agenda/dni', { l: l2, dni: '70.123.456' }), env, d)).json();
  assert.deepEqual(r, { ok: true, conocido: true, nombre: 'Lucía', email: 'l••••••@x.pe', whatsapp: '+51 ••• ••• 321' });
});

test('dni: el saludo usa solo el primer nombre (como dice la política de privacidad)', async () => {
  const d = deps();
  await confirmar(d, await conLink(d), { datos: { ...datos, nombres: '  María Fernanda ' } });
  const l2 = await conLink(d, 's60');
  const r = await (await handleAgendaDni(post('/api/agenda/dni', { l: l2, dni: '70123456' }), env, d)).json();
  assert.equal(r.nombre, 'María');
  // Ficha vieja de la web: sin «nombres», se toma la primera palabra de «nombre».
  await d.db.prepare("UPDATE clientes SET nombres = NULL, nombre = 'Rosa Elena Díaz'").run();
  const r2 = await (await handleAgendaDni(post('/api/agenda/dni', { l: l2, dni: '70123456' }), env, d)).json();
  assert.equal(r2.nombre, 'Rosa');
});

test('dni: más de 10 consultas con el mismo link da 429', async () => {
  const d = deps();
  const l = await conLink(d);
  for (let i = 0; i < 10; i++) await handleAgendaDni(post('/api/agenda/dni', { l, dni: '70123456' }), env, d);
  assert.equal((await handleAgendaDni(post('/api/agenda/dni', { l, dni: '70123456' }), env, d)).status, 429);
});

test('confirmar sin datos gasta el mismo cupo de DNI: tras 10 consultas da 429', async () => {
  const d = deps();
  const l = await conLink(d);
  for (let i = 0; i < 10; i++) await handleAgendaDni(post('/api/agenda/dni', { l, dni: '70123456' }), env, d);
  assert.equal((await confirmar(d, l, { datos: undefined, dni: '99999999' })).status, 429);
});

test('confirmar paciente nuevo: reserva, evento de 30 min con invitación, correo y vista de listo', async () => {
  const d = deps();
  const l = await conLink(d);
  const res = await confirmar(d, l);
  assert.equal(res.status, 200);
  const v = await res.json();
  assert.equal(v.duracion_min, 30);
  assert.equal(v.meet, 'https://meet/x');
  assert.match(v.google_calendar, /^https:\/\/calendar\.google\.com/);
  assert.equal(new URL(v.google_calendar).searchParams.get('location'), 'https://meet/x');
  assert.equal(v.titulo, 'Control de 30 min');
  assert.equal(d.eventos[0].finUtc, '2026-10-06T16:00:00Z');
  assert.equal(d.eventos[0].titulo, 'Lucía Ramos Quispe · 4 sesiones al mes · Evaluación de fin de mes');
  assert.equal(d.eventos[0].invitado.email, 'lucia@x.pe');
  // El paciente está invitado y ve la descripción: su plan y su cita también (2026-10-19).
  assert.match(d.eventos[0].descripcion, /^Producto: Transformación · 6 meses$/m);
  assert.match(d.eventos[0].descripcion, /^Procedencia: Link de un solo uso$/m);
  assert.deepEqual(d.correos.map((c) => c.to), ['lucia@x.pe']);
  const link = await (await handleAgendaLink(get(`/api/agenda/link?l=${l}`), env, d)).json();
  assert.equal(link.estado, 'agendado');
  assert.equal(link.cita.nutricionista, 'Jussara');
  assert.equal(link.cita.meet, 'https://meet/x');
});

test('confirmar dos veces el mismo link: la segunda 410', async () => {
  const d = deps();
  const l = await conLink(d);
  assert.equal((await confirmar(d, l)).status, 200);
  const r = await confirmar(d, l, { inicio: '2026-10-06T16:30:00Z' });
  assert.equal(r.status, 410);
});

test('confirmar paciente conocido sin datos: usa su ficha; DNI nuevo sin datos da 400', async () => {
  const d = deps();
  await confirmar(d, await conLink(d));
  const l2 = await conLink(d, 's60');
  const r = await confirmar(d, l2, { datos: undefined, inicio: '2026-10-07T15:00:00Z' });
  assert.equal(r.status, 200);
  const l3 = await conLink(d, 'c30p');
  assert.equal((await confirmar(d, l3, { datos: undefined, dni: '99999999', inicio: '2026-10-08T15:00:00Z' })).status, 400);
});

test('confirmar con datos inválidos o sin aceptar: 400 y el link sigue sin usar', async () => {
  const d = deps();
  const l = await conLink(d);
  assert.equal((await confirmar(d, l, { datos: { ...datos, email: 'malo' } })).status, 400);
  assert.equal((await confirmar(d, l, { datos: { ...datos, acepto: false } })).status, 400);
  assert.equal((await (await handleAgendaLink(get(`/api/agenda/link?l=${l}`), env, d)).json()).estado, 'sin_usar');
});

test('confirmar una hora que ya no se ofrece (reserva web encima): 409 y el link sigue', async () => {
  const d = deps();
  await repo.crearRetencion(d.db, { id: 'web', token: 'tw', producto: 'constancia', duracion_meses: 3, monto_centimos: 108000, peso_tope: 1,
    nutricionista_id: 'jussara', inicio_utc: '2026-10-06T15:00:00Z', fecha_lima: '2026-10-06', modalidad: 'video', tope: 300, ahora: t0 });
  const l = await conLink(d);
  const r = await confirmar(d, l, { nutricionista: 'jussara' });
  assert.equal(r.status, 409);
  assert.equal((await r.json()).motivo, 'ocupada');
});

test('confirmar con inicio que no es :00 ni :30, o modalidad fuera del tipo: 400', async () => {
  const d = deps();
  const l = await conLink(d);
  assert.equal((await confirmar(d, l, { inicio: '2026-10-06T15:15:00Z' })).status, 400);
  assert.equal((await confirmar(d, l, { modalidad: 'presencial' })).status, 400);
});

test('confirmar con Google caído: confirmada con calendario pendiente y alerta al equipo', async () => {
  const d = deps({ google: { listarEventos: async () => [], crearEvento: async () => { throw new Error('caído'); } } });
  const l = await conLink(d);
  assert.equal((await confirmar(d, l)).status, 200);
  const r = await d.db.prepare("SELECT estado, calendario_pendiente FROM reservas WHERE producto = 'link_c30v'").first();
  assert.deepEqual(r, { estado: 'confirmada', calendario_pendiente: 1 });
  assert.ok(d.correos.some((c) => c.to === 'equipo@x.pe'));
});

test('si D1 falla después de agendar: 200 con meet null, la cita queda confirmada y se avisa al equipo', async () => {
  const d = deps();
  const l = await conLink(d);
  // guardarEvento y marcarCalendarioPendiente fallan, así finalizarAgenda lanza error.
  const prepare = d.db.prepare;
  d.db.prepare = (sql) => { if (sql.includes('calendario_pendiente')) throw new Error('D1 caída'); return prepare(sql); };
  const res = await confirmar(d, l);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).meet, null);
  d.db.prepare = prepare;
  assert.equal((await d.db.prepare("SELECT estado FROM reservas WHERE producto = 'link_c30v'").first()).estado, 'confirmada');
  assert.ok(d.correos.some((c) => c.to === 'equipo@x.pe'));
});

test('una cita de link de 30 a las 10:00 deja de ofrecerse en la web a las 10:00 con esa nutricionista', async () => {
  const d = deps();
  const l = await conLink(d);
  await confirmar(d, l, { inicio: '2026-10-06T15:00:00Z', nutricionista: 'jussara' });
  const r = await (await handleHoras(get('/api/reservas/horas?desde=2026-10-06&dias=1&modalidad=video&producto=constancia&duracion=3&nutricionista=jussara'), env, d)).json();
  assert.ok(!r.dias[0].horas.some((h) => h.hora === '10:00'));
});

test('si leer la reserva falla después de agendar: 200 con meet null, cita confirmada, link usado y alerta', async () => {
  const d = deps();
  const l = await conLink(d);
  // reservaPorId lanza error: la cita y el link ya quedaron guardados.
  const prepare = d.db.prepare;
  d.db.prepare = (sql) => { if (sql.includes('WHERE r.id = ?1')) throw new Error('D1 caída'); return prepare(sql); };
  const res = await confirmar(d, l);
  d.db.prepare = prepare;
  assert.equal(res.status, 200);
  const v = await res.json();
  assert.equal(v.meet, null);
  assert.equal(v.duracion_min, 30);
  assert.match(v.ics, /\/api\/reservas\/ics\?r=.+/);
  assert.equal((await d.db.prepare("SELECT estado FROM reservas WHERE producto = 'link_c30v'").first()).estado, 'confirmada');
  assert.equal((await (await handleAgendaLink(get(`/api/agenda/link?l=${l}`), env, d)).json()).estado, 'agendado');
  assert.ok(d.correos.some((c) => c.to === 'equipo@x.pe'));
});

test('si además falla la alerta al equipo: igual 200 con la cita guardada', async () => {
  const d = deps({ sendEmail: async () => { throw new Error('Resend caído'); } });
  const l = await conLink(d);
  const prepare = d.db.prepare;
  d.db.prepare = (sql) => { if (sql.includes('WHERE r.id = ?1')) throw new Error('D1 caída'); return prepare(sql); };
  const res = await confirmar(d, l);
  d.db.prepare = prepare;
  assert.equal(res.status, 200);
  assert.equal((await res.json()).meet, null);
  assert.equal((await d.db.prepare("SELECT estado FROM reservas WHERE producto = 'link_c30v'").first()).estado, 'confirmada');
});

test('confirmar un link de 30 min a las 13:30 Lima (almuerzo): 409 y el link sigue sin usar', async () => {
  const d = deps();
  const l = await conLink(d);
  for (const inicio of ['2026-10-06T18:00:00Z', '2026-10-06T18:30:00Z']) {
    assert.equal((await confirmar(d, l, { inicio })).status, 409, inicio);
  }
  assert.equal((await (await handleAgendaLink(get(`/api/agenda/link?l=${l}`), env, d)).json()).estado, 'sin_usar');
});

test('horas: la sesión de 1 hora solo en hora en punto; el control de 30 min también a la media', async () => {
  const d = deps();
  const l60 = await conLink(d, 's60');
  const r60 = await (await handleAgendaHoras(get(`/api/agenda/horas?l=${l60}&desde=2026-10-06&dias=1&modalidad=video`), env, d)).json();
  assert.ok(r60.dias[0].horas.length > 0);
  assert.ok(r60.dias[0].horas.every((h) => h.hora.endsWith(':00')), JSON.stringify(r60.dias[0].horas.map((h) => h.hora)));
  const l30 = await conLink(d, 'c30v');
  const r30 = await (await handleAgendaHoras(get(`/api/agenda/horas?l=${l30}&desde=2026-10-06&dias=1&modalidad=video`), env, d)).json();
  assert.ok(r30.dias[0].horas.some((h) => h.hora.endsWith(':30')));
});

test('link: trae la nutricionista sugerida mientras está sin usar; sin ella no manda el campo', async () => {
  const d = deps();
  const l = await conLink(d, 's60', t0, 'paola');
  assert.equal((await (await handleAgendaLink(get(`/api/agenda/link?l=${l}`), env, d)).json()).nutricionista_sugerida, 'paola');
  const l2 = await conLink(d, 'c30v');
  assert.equal('nutricionista_sugerida' in (await (await handleAgendaLink(get(`/api/agenda/link?l=${l2}`), env, d)).json()), false);
});

test('confirmar con link: aviso «Nueva cita» a Romina, Irene y la nutri de la cita', async () => {
  const d = deps();
  const l = await conLink(d);
  const conEquipo = { ...env, CORREOS_EQUIPO: JSON.stringify({ romina: 'romi@x.pe', irene: 'irene@x.pe', nico: 'nico@x.pe', paola: 'paola@x.pe', jussara: 'yuyu@x.pe', paolo: 'paolo@x.pe' }) };
  const res = await handleAgendaConfirmar(post('/api/agenda/confirmar', { l, inicio: '2026-10-06T15:30:00Z', modalidad: 'video', dni: '70123456', datos }), conEquipo, d);
  assert.equal(res.status, 200);
  const r = await d.db.prepare('SELECT nutricionista_id FROM reservas WHERE link_id IS NOT NULL').first();
  const aviso = d.correos.find((c) => /^Nueva cita: /.test(c.subject));
  assert.deepEqual(aviso.to, ['romi@x.pe', 'irene@x.pe', JSON.parse(conEquipo.CORREOS_EQUIPO)[r.nutricionista_id]]);
});
