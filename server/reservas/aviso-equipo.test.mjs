import { test } from 'node:test';
import assert from 'node:assert/strict';
import { correosEquipo, avisarEquipo } from './aviso-equipo.mjs';
import { nutricionistas } from '../../src/data/nutricionistas.js';

const CORREOS = JSON.stringify({ romina: 'romi@x.pe', irene: 'irene@x.pe', alejandro: 'ale@x.pe', nico: 'nico@x.pe', paola: 'paola@x.pe', jussara: 'yuyu@x.pe', paolo: 'paolo@x.pe' });
const env = { CORREOS_EQUIPO: CORREOS, NEWSLETTER_FROM: 'AJL <hola@x.pe>' };
const r = { id: 'R1', nombre: 'Ana <b>Pérez</b>', whatsapp: '+51987654321', email: 'ana@x.pe', producto: 'constancia', duracion_meses: 3,
  nutricionista_id: 'jussara', modalidad: 'presencial', inicio_utc: '2026-10-29T15:00:00Z', edicion_cambios: null };

function deps() {
  const enviados = [];
  return { nutricionistas, enviados, sendEmail: async (c) => { enviados.push(c); return true; } };
}

test('correosEquipo: lee el secreto; sin secreto o con JSON roto devuelve vacío', () => {
  assert.equal(correosEquipo(env).romina, 'romi@x.pe');
  assert.deepEqual(correosEquipo({}), {});
  assert.deepEqual(correosEquipo({ CORREOS_EQUIPO: '{roto' }), {});
});

test('nueva: un correo a Romina, Irene, Alejandro y la nutri de la cita; con el plan, la cita y el WhatsApp, y el nombre escapado', async () => {
  const d = deps();
  await avisarEquipo(d, env, { tipo: 'nueva', r });
  assert.equal(d.enviados.length, 1);
  const [c] = d.enviados;
  assert.deepEqual(c.to, ['romi@x.pe', 'irene@x.pe', 'ale@x.pe', 'yuyu@x.pe']);
  assert.equal(c.from, 'AJL <hola@x.pe>');
  assert.match(c.subject, /^Nueva cita: Ana <b>Pérez<\/b> · jueves, 29 de octubre/);
  assert.match(c.html, /Ana &lt;b&gt;Pérez&lt;\/b&gt;/);
  assert.doesNotMatch(c.html, /<b>Pérez/);
  assert.match(c.html, /Producto: Constancia · 3 meses/);
  assert.match(c.html, /Cita: 1 de 7/);
  assert.match(c.html, /\+51987654321/);
  assert.match(c.html, /Presencial/);
  assert.match(c.html, /Jussara/);
});

test('cambiada sin cambio de nutri: un correo con lo que cambió', async () => {
  const d = deps();
  await avisarEquipo(d, env, { tipo: 'cambiada', r: { ...r, edicion_cambios: '10:00 → 9:00' }, antes: r });
  assert.equal(d.enviados.length, 1);
  assert.deepEqual(d.enviados[0].to, ['romi@x.pe', 'irene@x.pe', 'ale@x.pe', 'yuyu@x.pe']);
  assert.match(d.enviados[0].subject, /^Cita cambiada: /);
  assert.match(d.enviados[0].html, /10:00 → 9:00/);
});

test('cambiada con otra nutri: la nueva recibe la cita y la anterior un aviso de que ya no la atiende', async () => {
  const d = deps();
  await avisarEquipo(d, env, { tipo: 'cambiada', r: { ...r, nutricionista_id: 'nico', edicion_cambios: 'Jussara → Nico' }, antes: r });
  assert.equal(d.enviados.length, 2);
  assert.deepEqual(d.enviados[0].to, ['romi@x.pe', 'irene@x.pe', 'ale@x.pe', 'nico@x.pe']);
  assert.deepEqual(d.enviados[1].to, ['yuyu@x.pe']);
  assert.match(d.enviados[1].subject, /^Ya no atiendes a Ana/);
  assert.match(d.enviados[1].html, /Nico/);
});

test('cancelada: a Romina, Irene y la nutri', async () => {
  const d = deps();
  await avisarEquipo(d, env, { tipo: 'cancelada', r });
  assert.deepEqual(d.enviados[0].to, ['romi@x.pe', 'irene@x.pe', 'ale@x.pe', 'yuyu@x.pe']);
  assert.match(d.enviados[0].subject, /^Cita cancelada: /);
});

test('sin secreto no manda nada; correos repetidos o inválidos se saltan; un envío que falla no lanza', async () => {
  const d = deps();
  await avisarEquipo(d, {}, { tipo: 'nueva', r });
  assert.equal(d.enviados.length, 0);
  const raro = { CORREOS_EQUIPO: JSON.stringify({ romina: 'romi@x.pe', irene: 'romi@x.pe', jussara: 'no-es-correo' }) };
  await avisarEquipo(d, raro, { tipo: 'nueva', r });
  assert.deepEqual(d.enviados[0].to, ['romi@x.pe']);
  const original = console.error; console.error = () => {};
  await avisarEquipo({ nutricionistas, sendEmail: async () => { throw new Error('caído'); } }, env, { tipo: 'nueva', r });
  console.error = original;
});
