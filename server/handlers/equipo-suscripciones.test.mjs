import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1DePrueba } from '../reservas/d1-prueba.mjs';
import * as sus from '../suscripciones/repo.mjs';
import { handleEquipoSuscripciones, handleEquipoSuscripcionPenalidad } from './equipo-suscripciones.mjs';

const t0 = new Date('2026-11-03T15:00:00Z');
const env = { PUBLIC_SITE_URL: 'https://www.ajlnutricion.com' };
const deps = (o = {}) => ({ db: d1DePrueba(), ahora: () => t0, acceso: async () => ({ ok: true, email: 'romi@x.pe' }), ...o });
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
