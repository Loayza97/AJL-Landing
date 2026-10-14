import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1DePrueba } from '../reservas/d1-prueba.mjs';
import { handlePedirCodigo, handleEntrar, verificarAcceso } from '../equipo/acceso.mjs';
import { handleUsuarios, handleUsuariosQuitar } from './equipo-usuarios.mjs';

const env = { EQUIPO_ADMINS: 'joaquin@x.pe, Ale@X.pe', EQUIPO_EMAILS: 'romi@x.pe', NEWSLETTER_FROM: 'AJL <hola@x.pe>' };
const t0 = new Date('2026-10-13T15:00:00Z');
function deps(o = {}) {
  const correos = [];
  const d = { db: d1DePrueba(), ahora: () => t0, correos, sendEmail: async (m) => { correos.push(m); return true; }, ...o };
  d.acceso = o.acceso ?? ((request) => verificarAcceso(request, env, d)); // como makeEquipoDeps
  return d;
}
const pedir = (ruta, metodo, cuerpo, cookie) => new Request(`https://www.ajlnutricion.com${ruta}`, {
  method: metodo, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
  ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}) });
const get = (ruta, cookie) => pedir(ruta, 'GET', null, cookie);
const post = (ruta, cuerpo, cookie) => pedir(ruta, 'POST', cuerpo, cookie);
const codigoDe = (d) => d.correos.at(-1).html.match(/\b(\d{6})\b/)[1];
const panel = (cookie) => get('/api/equipo/reservas', cookie);

async function entrar(d, email) {
  const antes = d.correos.length;
  await handlePedirCodigo(post('/api/equipo/codigo', { email }), env, d);
  assert.equal(d.correos.length, antes + 1, `le llega el código a ${email}`);
  const r = await handleEntrar(post('/api/equipo/entrar', { email, codigo: codigoDe(d) }), env, d);
  assert.equal(r.status, 200, `entra ${email}`);
  return r.headers.get('Set-Cookie').split(';')[0];
}
const agregar = (d, cookie, cuerpo) => handleUsuarios(post('/api/equipo/usuarios', cuerpo, cookie), env, d);
const quitar = (d, cookie, email) => handleUsuariosQuitar(post('/api/equipo/usuarios-quitar', { email }, cookie), env, d);

test('usuarios: verificarAcceso dice quién es súper usuario', async () => {
  const d = deps();
  assert.deepEqual(await verificarAcceso(panel(await entrar(d, 'ale@x.pe')), env, d), { ok: true, email: 'ale@x.pe', admin: true });
  assert.deepEqual(await verificarAcceso(panel(await entrar(d, 'romi@x.pe')), env, d), { ok: true, email: 'romi@x.pe', admin: false });
});

test('usuarios: sin sesión 401 y sin ser súper usuario 403, en las tres rutas y sin leer la base', async () => {
  const explota = { prepare() { throw new Error('no debía leer'); }, batch() { throw new Error('no debía escribir'); } };
  const llamadas = (d) => [handleUsuarios(get('/api/equipo/usuarios'), env, d), agregar(d, null, { email: 'irene@x.pe', nombre: 'Irene' }),
    quitar(d, null, 'irene@x.pe')];
  for (const r of await Promise.all(llamadas(deps({ db: explota, acceso: async () => ({ ok: false }) })))) assert.equal(r.status, 401);
  for (const r of await Promise.all(llamadas(deps({ db: explota, acceso: async () => ({ ok: true, email: 'romi@x.pe', admin: false }) })))) {
    assert.equal(r.status, 403);
  }
});

test('usuarios: el súper usuario agrega a Irene; ella pide código, entra y usa el panel, pero no ve usuarios', async () => {
  const d = deps();
  const ale = await entrar(d, 'ale@x.pe');
  const r = await agregar(d, ale, { email: '  Irene@X.pe ', nombre: '  Irene   Ríos ' });
  assert.equal(r.status, 200);
  assert.deepEqual((await r.json()).usuario, { email: 'irene@x.pe', nombre: 'Irene Ríos', origen: 'app', creado_por: 'ale@x.pe', creado_en: t0.toISOString() });
  const lista = await (await handleUsuarios(get('/api/equipo/usuarios', ale), env, d)).json();
  assert.deepEqual(lista.usuarios.map((u) => [u.email, u.origen]),
    [['joaquin@x.pe', 'admin'], ['ale@x.pe', 'admin'], ['romi@x.pe', 'fijo'], ['irene@x.pe', 'app']]);
  const irene = await entrar(d, ' IRENE@x.pe');
  assert.deepEqual(await verificarAcceso(panel(irene), env, d), { ok: true, email: 'irene@x.pe', admin: false });
  assert.equal((await handleUsuarios(get('/api/equipo/usuarios', irene), env, d)).status, 403);
  assert.equal((await agregar(d, irene, { email: 'otra@x.pe', nombre: 'Otra' })).status, 403);
});

test('usuarios: quitar a Irene cierra su sesión al instante y ya no recibe códigos', async () => {
  const d = deps();
  const ale = await entrar(d, 'ale@x.pe');
  await agregar(d, ale, { email: 'irene@x.pe', nombre: 'Irene' });
  const irene = await entrar(d, 'irene@x.pe');
  assert.equal((await verificarAcceso(panel(irene), env, d)).ok, true);
  assert.equal((await quitar(d, ale, ' Irene@X.pe ')).status, 200);
  assert.equal((await verificarAcceso(panel(irene), env, d)).ok, false, 'la sesión abierta deja de servir');
  const { n } = await d.db.prepare("SELECT COUNT(*) AS n FROM equipo_sesiones WHERE email = 'irene@x.pe'").first();
  assert.equal(n, 0, 'sus sesiones se borran en el mismo batch');
  const antes = d.correos.length;
  const pide = await handlePedirCodigo(post('/api/equipo/codigo', { email: 'irene@x.pe' }), env, d);
  const extraño = await handlePedirCodigo(post('/api/equipo/codigo', { email: 'nadie@x.pe' }), env, d);
  assert.equal(d.correos.length, antes, 'no le llega código');
  assert.deepEqual([pide.status, await pide.json()], [extraño.status, await extraño.json()], 'misma respuesta que un correo desconocido');
  assert.equal((await quitar(d, ale, 'irene@x.pe')).status, 404);
});

test('usuarios: súper usuarios y fijos no se quitan desde el panel', async () => {
  const d = deps();
  const ale = await entrar(d, 'ale@x.pe');
  const romi = await entrar(d, 'romi@x.pe');
  assert.equal((await quitar(d, ale, 'JOAQUIN@x.pe')).status, 409);
  assert.equal((await quitar(d, ale, 'ale@x.pe')).status, 409);
  assert.equal((await quitar(d, ale, 'romi@x.pe')).status, 409);
  assert.equal((await verificarAcceso(panel(romi), env, d)).ok, true, 'la sesión de Romi sigue');
  assert.equal((await verificarAcceso(panel(ale), env, d)).ok, true);
});

test('usuarios: agregar un correo que ya tiene acceso da 409 y no pisa nada', async () => {
  const d = deps();
  const ale = await entrar(d, 'ale@x.pe');
  assert.equal((await agregar(d, ale, { email: 'irene@x.pe', nombre: 'Irene' })).status, 200);
  assert.equal((await agregar(d, ale, { email: ' IRENE@x.pe', nombre: 'Otra' })).status, 409);
  assert.equal((await agregar(d, ale, { email: 'Romi@x.pe', nombre: 'Romi' })).status, 409, 'ya es fijo');
  assert.equal((await agregar(d, ale, { email: 'joaquin@x.pe', nombre: 'Joaquín' })).status, 409, 'ya es súper usuario');
  const { results } = await d.db.prepare('SELECT email, nombre FROM equipo_usuarios').all();
  assert.deepEqual(results, [{ email: 'irene@x.pe', nombre: 'Irene' }]);
});

test('usuarios: valida correo y nombre (obligatorio, hasta 60 caracteres)', async () => {
  const d = deps();
  const ale = await entrar(d, 'ale@x.pe');
  for (const email of ['', 'irene', 'irene@x', 'a b@x.pe', 'a@x.pe,b@x.pe', 42]) {
    assert.equal((await agregar(d, ale, { email, nombre: 'Irene' })).status, 400, String(email));
  }
  for (const nombre of [undefined, '', '   ', 'x'.repeat(61), { a: 1 }]) {
    assert.equal((await agregar(d, ale, { email: 'irene@x.pe', nombre })).status, 400, String(nombre));
  }
  assert.equal((await agregar(d, ale, { email: 'irene@x.pe', nombre: 'x'.repeat(60) })).status, 200);
});
