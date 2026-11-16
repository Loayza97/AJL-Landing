import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1DePrueba } from './d1-prueba.mjs';
import { revisarAgenda, REPETIR_MS, CLAVE } from './salud-agenda.mjs';
import { handleSaludAgenda } from '../handlers/reservas.mjs';
import { nutricionistas } from '../../src/data/nutricionistas.js';
import * as repo from './repo.mjs';

const env = { AVISOS_RESPALDO: 'joaquin@x.pe, ale@x.pe', RESUMEN_TOKEN: 'tok' };
const t0 = new Date('2026-11-14T04:00:00Z');

function armar() {
  let ahora = t0;
  const correos = [];
  const deps = {
    db: d1DePrueba(), nutricionistas, ahora: () => ahora, esperar: async () => {},
    sendEmail: async (c) => { correos.push(c); return true; },
    google: { listarEventos: async () => [] },
  };
  return { deps, correos, mover: (ms) => { ahora = new Date(ahora.getTime() + ms); } };
}
const falla = async () => { throw new Error('Google token 400: invalid_grant — Token has been expired or revoked.'); };
const bien = async () => {};

test('agenda bien: no avisa a nadie', async () => {
  const { deps, correos } = armar();
  assert.deepEqual(await revisarAgenda(deps, env, bien, { esperar: async () => {} }), { ok: true, volvio: false });
  assert.equal(correos.length, 0);
});

test('una falla suelta que se arregla al reintentar no avisa', async () => {
  const { deps, correos } = armar();
  let n = 0;
  const r = await revisarAgenda(deps, env, async () => { if (n++ === 0) throw new Error('blip'); }, { esperar: async () => {} });
  assert.equal(r.ok, true);
  assert.equal(n, 2);
  assert.equal(correos.length, 0);
});

test('caída: avisa una vez con el error y la pista; repite a las 3 h; avisa cuando vuelve', async () => {
  const { deps, correos, mover } = armar();
  const r = await revisarAgenda(deps, env, falla, { esperar: async () => {} });
  assert.equal(r.ok, false);
  assert.equal(correos.length, 1);
  assert.deepEqual(correos[0].to, ['joaquin@x.pe', 'ale@x.pe']);
  assert.equal(correos[0].subject, 'La agenda web está caída');
  assert.match(correos[0].html, /invalid_grant/);
  assert.match(correos[0].html, /google-oauth\.mjs/);

  // Cada 15 min, sin repetir el correo hasta las 3 h.
  for (let i = 0; i < 11; i++) { mover(15 * 60000); await revisarAgenda(deps, env, falla, { esperar: async () => {} }); }
  assert.equal(correos.length, 1);
  mover(REPETIR_MS - 11 * 15 * 60000);
  await revisarAgenda(deps, env, falla, { esperar: async () => {} });
  assert.equal(correos.length, 2);
  assert.match(correos[1].subject, /sigue caída/);

  mover(15 * 60000);
  assert.deepEqual(await revisarAgenda(deps, env, bien, { esperar: async () => {} }), { ok: true, volvio: true });
  assert.equal(correos.length, 3);
  assert.equal(correos[2].subject, 'La agenda web volvió');
  assert.match(correos[2].html, /3 h/);
  assert.equal(await repo.leerSync(deps.db, CLAVE), '');

  // Ya volvió: la siguiente revisión no manda nada.
  mover(15 * 60000);
  await revisarAgenda(deps, env, bien, { esperar: async () => {} });
  assert.equal(correos.length, 3);
});

test('si D1 tampoco responde, avisa igual', async () => {
  const { deps, correos } = armar();
  deps.db = { prepare: () => { throw new Error('D1 caído'); } };
  const r = await revisarAgenda(deps, env, falla, { esperar: async () => {} });
  assert.equal(r.ok, false);
  assert.equal(correos.length, 1);
});

test('endpoint: pide POST y el token; con Google caído responde 200 y avisa', async () => {
  const llamar = (deps, init) => handleSaludAgenda(new Request('https://x.test/api/reservas/salud-agenda', init), env, deps);
  const a = armar();
  assert.equal((await llamar(a.deps, { method: 'GET' })).status, 405);
  assert.equal((await llamar(a.deps, { method: 'POST' })).status, 401);
  assert.equal((await llamar(a.deps, { method: 'POST', headers: { Authorization: 'Bearer otro' } })).status, 401);
  const ok = await llamar(a.deps, { method: 'POST', headers: { Authorization: 'Bearer tok' } });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).ok, true);

  const b = armar();
  b.deps.google = { listarEventos: falla };
  const caida = await llamar(b.deps, { method: 'POST', headers: { Authorization: 'Bearer tok' } });
  assert.equal(caida.status, 200);
  const d = await caida.json();
  assert.equal(d.ok, false);
  assert.match(d.error, /invalid_grant/);
  assert.equal(b.correos.length, 1);
});
