import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1DePrueba } from '../reservas/d1-prueba.mjs';
import { handlePedirCodigo, handleEntrar, handleSalir, verificarAcceso } from './acceso.mjs';

const env = { EQUIPO_EMAILS: 'romi@x.pe, Ale@X.pe', NEWSLETTER_FROM: 'AJL <hola@x.pe>' };
let reloj = new Date('2026-10-12T20:00:00Z');
function deps() {
  const correos = [];
  return { db: d1DePrueba(), ahora: () => reloj, correos, sendEmail: async (m) => { correos.push(m); return true; } };
}
const post = (ruta, cuerpo, cookie) => new Request(`https://www.ajlnutricion.com${ruta}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(cuerpo) });
const codigoDe = (d) => d.correos.at(-1).html.match(/\b(\d{6})\b/)[1];
const cookieDe = (r) => r.headers.get('Set-Cookie').split(';')[0];

test('acceso: correo autorizado recibe un código y entra; la sesión abre la API', async () => {
  reloj = new Date('2026-10-12T20:00:00Z');
  const d = deps();
  const r1 = await handlePedirCodigo(post('/api/equipo/codigo', { email: ' ALE@x.pe ' }), env, d);
  assert.equal(r1.status, 200);
  assert.equal(d.correos.length, 1);
  assert.equal(d.correos[0].to, 'ale@x.pe');
  const r2 = await handleEntrar(post('/api/equipo/entrar', { email: 'ale@x.pe', codigo: codigoDe(d) }), env, d);
  assert.equal(r2.status, 200);
  const sc = r2.headers.get('Set-Cookie');
  assert.match(sc, /HttpOnly/); assert.match(sc, /Secure/); assert.match(sc, /SameSite=Strict/); assert.match(sc, /Max-Age=43200/);
  const api = new Request('https://www.ajlnutricion.com/api/equipo/reservas', { headers: { Cookie: `otra=1; ${cookieDe(r2)}` } });
  assert.deepEqual(await verificarAcceso(api, env, d), { ok: true, email: 'ale@x.pe' });
  const { n } = await d.db.prepare('SELECT COUNT(*) AS n FROM equipo_codigos').first();
  assert.equal(n, 0, 'el código se usa una sola vez');
});

test('acceso: correo no autorizado recibe la misma respuesta pero ningún correo', async () => {
  const d = deps();
  const r = await handlePedirCodigo(post('/api/equipo/codigo', { email: 'intruso@x.pe' }), env, d);
  assert.equal(r.status, 200);
  assert.equal(d.correos.length, 0);
  assert.equal((await handleEntrar(post('/api/equipo/entrar', { email: 'intruso@x.pe', codigo: '123456' }), env, d)).status, 401);
});

test('acceso: código equivocado, vencido o tras 5 intentos no entra', async () => {
  reloj = new Date('2026-10-12T20:00:00Z');
  const d = deps();
  await handlePedirCodigo(post('/api/equipo/codigo', { email: 'romi@x.pe' }), env, d);
  const bueno = codigoDe(d);
  const malo = bueno === '000000' ? '111111' : '000000';
  for (let i = 0; i < 5; i++) assert.equal((await handleEntrar(post('/api/equipo/entrar', { email: 'romi@x.pe', codigo: malo }), env, d)).status, 401);
  assert.equal((await handleEntrar(post('/api/equipo/entrar', { email: 'romi@x.pe', codigo: bueno }), env, d)).status, 401, 'bloqueado tras 5 intentos');
  reloj = new Date('2026-10-12T20:05:00Z');
  await handlePedirCodigo(post('/api/equipo/codigo', { email: 'romi@x.pe' }), env, d);
  const nuevo = codigoDe(d);
  reloj = new Date('2026-10-12T20:16:00Z');
  assert.equal((await handleEntrar(post('/api/equipo/entrar', { email: 'romi@x.pe', codigo: nuevo }), env, d)).status, 401, 'vencido a los 10 min');
});

test('acceso: pedir de nuevo antes de un minuto no reenvía; salir cierra la sesión', async () => {
  reloj = new Date('2026-10-12T20:00:00Z');
  const d = deps();
  await handlePedirCodigo(post('/api/equipo/codigo', { email: 'romi@x.pe' }), env, d);
  await handlePedirCodigo(post('/api/equipo/codigo', { email: 'romi@x.pe' }), env, d);
  assert.equal(d.correos.length, 1);
  const r = await handleEntrar(post('/api/equipo/entrar', { email: 'romi@x.pe', codigo: codigoDe(d) }), env, d);
  const cookie = cookieDe(r);
  const salir = await handleSalir(post('/api/equipo/salir', {}, cookie), env, d);
  assert.match(salir.headers.get('Set-Cookie'), /Max-Age=0/);
  const api = new Request('https://x/api/equipo/reservas', { headers: { Cookie: cookie } });
  assert.equal((await verificarAcceso(api, env, d)).ok, false);
});

test('acceso: sesión vencida, cookie falsa o correo quitado de la lista no entran', async () => {
  reloj = new Date('2026-10-12T20:00:00Z');
  const d = deps();
  await handlePedirCodigo(post('/api/equipo/codigo', { email: 'romi@x.pe' }), env, d);
  const cookie = cookieDe(await handleEntrar(post('/api/equipo/entrar', { email: 'romi@x.pe', codigo: codigoDe(d) }), env, d));
  const api = (c) => new Request('https://x/api/equipo/reservas', { headers: c ? { Cookie: c } : {} });
  assert.equal((await verificarAcceso(api(cookie), { EQUIPO_EMAILS: 'ale@x.pe' }, d)).ok, false, 'ya no autorizado');
  assert.equal((await verificarAcceso(api('ajl_equipo=inventado'), env, d)).ok, false);
  assert.equal((await verificarAcceso(api(null), env, d)).ok, false);
  reloj = new Date('2026-10-13T08:01:00Z');
  assert.equal((await verificarAcceso(api(cookie), env, d)).ok, false, 'vence a las 12 h');
});

test('acceso: tras 10 intentos fallidos en 24 h el correo queda bloqueado, aunque pida códigos nuevos', async () => {
  reloj = new Date('2026-10-12T20:00:00Z');
  const d = deps();
  for (let ronda = 0; ronda < 2; ronda++) {
    reloj = new Date(reloj.getTime() + 2 * 60000);
    await handlePedirCodigo(post('/api/equipo/codigo', { email: 'romi@x.pe' }), env, d);
    const bueno = codigoDe(d);
    const malo = bueno === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) await handleEntrar(post('/api/equipo/entrar', { email: 'romi@x.pe', codigo: malo }), env, d);
  }
  const enviados = d.correos.length;
  reloj = new Date(reloj.getTime() + 2 * 60000);
  await handlePedirCodigo(post('/api/equipo/codigo', { email: 'romi@x.pe' }), env, d);
  assert.equal(d.correos.length, enviados, 'bloqueado: no se manda otro código');
  reloj = new Date(reloj.getTime() + 25 * 3600000);
  await handlePedirCodigo(post('/api/equipo/codigo', { email: 'romi@x.pe' }), env, d);
  assert.equal(d.correos.length, enviados + 1, 'al día siguiente vuelve a poder');
  assert.equal((await handleEntrar(post('/api/equipo/entrar', { email: 'romi@x.pe', codigo: codigoDe(d) }), env, d)).status, 200);
});
