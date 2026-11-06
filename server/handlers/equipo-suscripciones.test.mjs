import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1DePrueba } from '../reservas/d1-prueba.mjs';
import * as sus from '../suscripciones/repo.mjs';
import { handleEquipoSuscripciones, handleEquipoSuscripcionPenalidad, handleEquipoSuscripcionSincronizar } from './equipo-suscripciones.mjs';

const t0 = new Date('2026-11-03T15:00:00Z');
const env = { PUBLIC_SITE_URL: 'https://www.ajlnutricion.com', SUSCRIPCIONES_ABIERTAS: '1' };
const deps = (o = {}) => ({ db: d1DePrueba(), ahora: () => t0, acceso: async () => ({ ok: true, email: 'romi@x.pe', admin: false }), ...o });
const post = (ruta, b) => new Request(`https://x.test${ruta}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });

test('crear link: cuota y penalidad del servidor, vence en 7 días, URL de un solo uso', async () => {
  const d = deps();
  const j = await (await handleEquipoSuscripciones(post('/api/equipo/suscripciones', { nombre: 'Lucía Ramos', producto: 'acompanamiento', meses: 6 }), env, d)).json();
  assert.equal(j.cuota_centimos, 25000);
  assert.equal(j.precio_mes_centimos, 32000);
  assert.equal(j.vence_en, '2026-11-10T15:00:00.000Z');
  assert.match(j.url, /^https:\/\/www\.ajlnutricion\.com\/suscribirse\/\?l=[\w-]{32,}$/);
  const { n } = await d.db.prepare("SELECT COUNT(*) AS n FROM suscripciones WHERE creado_por = 'romi@x.pe' AND estado = 'pendiente'").first();
  assert.equal(n, 1);
});

test('crear link: sin acceso 401; plan de pago único o sin nombre 400', async () => {
  assert.equal((await handleEquipoSuscripciones(post('/api/equipo/suscripciones', {}), env, deps({ acceso: async () => ({ ok: false }) }))).status, 401);
  assert.equal((await handleEquipoSuscripciones(post('/api/equipo/suscripciones', { nombre: 'X', producto: 'basico', meses: 1 }), env, deps())).status, 400);
  assert.equal((await handleEquipoSuscripciones(post('/api/equipo/suscripciones', { nombre: ' ', producto: 'constancia', meses: 3 }), env, deps())).status, 400);
});

test('listar y marcar penalidad pagada a mano', async () => {
  const d = deps();
  await sus.crear(d.db, { id: 'a', token: 'a', producto: 'transformacion', duracion_meses: 3, cuota_centimos: 51000, precio_mes_centimos: 60000, penalidad_centimos: 9000,
    estado: 'cobro_fallido', penalidad_estado: 'pendiente', cobros_aprobados: 1, nombre: 'Ana Torres', creado_en: t0.toISOString() });
  const j = await (await handleEquipoSuscripciones(new Request('https://x.test/api/equipo/suscripciones?filtro=penalidad'), env, d)).json();
  assert.equal(j.filas.length, 1);
  assert.equal(j.filas[0].titulo, '4 sesiones al mes · 3 meses · pago mensual');
  assert.equal(j.conteos.penalidad, 1);
  assert.equal((await handleEquipoSuscripcionPenalidad(post('/api/equipo/suscripciones-penalidad', { id: 'a' }), env, d)).status, 200);
  const s = await sus.porId(d.db, 'a');
  assert.equal(s.penalidad_estado, 'pagada');
  assert.equal(s.penalidad_marcada_por, 'romi@x.pe');
});

test('penalidad: fila sin penalidad pendiente 409 y sin cambios; id desconocido 404', async () => {
  const d = deps();
  await sus.crear(d.db, { id: 'b', token: 'b', producto: 'constancia', duracion_meses: 3, cuota_centimos: 36000, precio_mes_centimos: 44000, estado: 'activa', nombre: 'Bea', creado_en: t0.toISOString() });
  assert.equal((await handleEquipoSuscripcionPenalidad(post('/api/equipo/suscripciones-penalidad', { id: 'b' }), env, d)).status, 409);
  const s = await sus.porId(d.db, 'b');
  assert.equal(s.penalidad_estado, 'no_aplica');
  assert.equal(s.penalidad_marcada_por, null);
  assert.equal((await handleEquipoSuscripcionPenalidad(post('/api/equipo/suscripciones-penalidad', { id: 'zz' }), env, d)).status, 404);
});

const crear = (e, d, producto = 'prueba', meses = 3) => handleEquipoSuscripciones(post('/api/equipo/suscripciones', { nombre: 'Yo', producto, meses }), e, d);
const admin = () => deps({ acceso: async () => ({ ok: true, email: 'joaquin@x.pe', admin: true }) });

test('prueba interna terminada: ya no se crean links de prueba, ni siquiera administradores', async () => {
  assert.equal((await crear(env, admin())).status, 400);
  assert.equal((await crear(env, deps())).status, 400);
});

test('interruptor apagado: ningún producto (400); abierto: los planes del catálogo (200)', async () => {
  for (const e of [{ PUBLIC_SITE_URL: env.PUBLIC_SITE_URL }, { ...env, SUSCRIPCIONES_ABIERTAS: '0' }]) {
    assert.equal((await crear(e, admin(), 'constancia', 3)).status, 400);
    assert.equal((await crear(e, deps(), 'constancia', 3)).status, 400);
  }
  assert.equal((await crear(env, deps(), 'constancia', 3)).status, 200);
});

test('listar devuelve admin para que el panel decida qué ofrecer', async () => {
  const j = async (d) => (await handleEquipoSuscripciones(new Request('https://x.test/api/equipo/suscripciones'), env, d)).json();
  assert.equal((await j(admin())).admin, true);
  assert.equal((await j(deps())).admin, false);
});

test('sincronizar: 401 sin acceso, 403 al equipo, 200 al admin con los cobros revisados', async () => {
  const req = () => post('/api/equipo/suscripciones-sincronizar', { id: 'sy' });
  assert.equal((await handleEquipoSuscripcionSincronizar(req(), env, deps({ acceso: async () => ({ ok: false }) }))).status, 401);
  assert.equal((await handleEquipoSuscripcionSincronizar(req(), env, deps())).status, 403);
  const buscados = [];
  const d = { ...admin(), correos: [], sendEmail: async () => true,
    mp: { buscarSuscripcionDePlan: async (p) => { buscados.push(p); return { id: 'pre7' }; },
      buscarCobrosSuscripcion: async (p) => { buscados.push(p); return [{ id: 'a1' }]; },
      obtenerCobroSuscripcion: async () => ({ id: 'a1', preapproval_id: 'pre7', status: 'processed', transaction_amount: 5, payment: { id: 'p1' } }),
      obtenerPago: async () => ({ id: 'p1', status: 'approved', payment_method_id: 'visa' }) } };
  await sus.crear(d.db, { id: 'sy', token: 'sy', producto: 'prueba', duracion_meses: 3, cuota_centimos: 500, precio_mes_centimos: 500, estado: 'pendiente',
    mp_plan_id: 'plan9', nombre: 'Yo', creado_en: t0.toISOString() });
  assert.equal((await handleEquipoSuscripcionSincronizar(post('/api/equipo/suscripciones-sincronizar', { id: 'zz' }), env, d)).status, 404);
  const r = await handleEquipoSuscripcionSincronizar(req(), env, d);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, estado: 'activa', cobros_aprobados: 1 });
  assert.deepEqual(buscados, ['plan9', 'pre7']);
  assert.equal((await sus.porId(d.db, 'sy')).mp_preapproval_id, 'pre7');
});

test('listar trae el neto del último cobro aprobado (lo que nos queda tras Mercado Pago)', async () => {
  const d = deps();
  const base = { producto: 'constancia', duracion_meses: 3, cuota_centimos: 36000, precio_mes_centimos: 44000, estado: 'activa', creado_en: t0.toISOString() };
  await sus.crear(d.db, { ...base, id: 'n1', token: 'n1', nombre: 'Con neto', cobros_aprobados: 2 });
  await sus.crear(d.db, { ...base, id: 'n2', token: 'n2', nombre: 'Sin neto', cobros_aprobados: 1 });
  await sus.crear(d.db, { ...base, id: 'n3', token: 'n3', nombre: 'Sin cobro', mp_preapproval_id: 'pre3' });
  const ins = d.db.prepare(`INSERT INTO suscripcion_cobros (id, suscripcion_id, mp_payment_id, numero, estado, monto_centimos, neto_centimos, metodo, creado_en)
    VALUES (?1, ?2, ?1, ?3, ?4, 36000, ?5, NULL, ?6)`);
  await ins.bind('c1', 'n1', 1, 'approved', 34300, '2026-10-05T00:00:00Z').run();
  await ins.bind('c2', 'n1', 2, 'approved', 34320, '2026-11-05T00:00:00Z').run();
  await ins.bind('c3', 'n1', 0, 'rejected', null, '2026-11-06T00:00:00Z').run();
  await ins.bind('c4', 'n2', 1, 'approved', null, '2026-11-05T00:00:00Z').run();
  const j = await (await handleEquipoSuscripciones(new Request('https://x.test/api/equipo/suscripciones?filtro=todas'), env, d)).json();
  const por = Object.fromEntries(j.filas.map((f) => [f.nombre, [f.cuota_centimos, f.neto_ultimo_centimos, f.con_cobro]]));
  assert.deepEqual(por['Con neto'], [36000, 34320, true], 'el último aprobado, no el rechazado');
  assert.deepEqual(por['Sin neto'], [36000, null, true]);
  assert.deepEqual(por['Sin cobro'], [36000, null, false]);
});

test('mes a mes: el panel no crea links que cobrarían sin fin (400); 3 y 6 meses sí', async () => {
  for (const p of ['acompanamiento', 'constancia', 'transformacion']) {
    const r = await crear(env, deps(), p, 1);
    assert.equal(r.status, 400, p);
    assert.match((await r.json()).error, /mes a mes/);
    assert.equal((await crear(env, deps(), p, 3)).status, 200, p);
    assert.equal((await crear(env, deps(), p, 6)).status, 200, p);
  }
});
