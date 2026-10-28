import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1DePrueba } from '../reservas/d1-prueba.mjs';
import * as sus from '../suscripciones/repo.mjs';
import { handleSuscripcionCancelar } from './suscripciones.mjs';

const t0 = new Date('2026-11-20T15:00:00Z');
const env = { PUBLIC_SITE_URL: 'https://www.ajlnutricion.com' };
function deps() {
  const prefs = []; const canceladas = [];
  return { db: d1DePrueba(), ahora: () => t0, prefs, canceladas, sendEmail: async () => true,
    mp: { crearPreferencia: async (a) => { prefs.push(a); return { id: 'pref', init_point: 'https://mp/pen' }; }, cancelarSuscripcion: async (id) => { canceladas.push(id); } } };
}
const get = (q) => new Request(`https://x.test/api/suscripciones/cancelar?${q}`);
const post = (b) => new Request('https://x.test/api/suscripciones/cancelar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
const fila = (o = {}) => ({ id: 's1', token: 'ts', producto: 'constancia', duracion_meses: 3, cuota_centimos: 36000, precio_mes_centimos: 44000,
  estado: 'activa', cobros_aprobados: 1, nombre: 'Ana', email: 'a@x.pe', dni: '1', mp_preapproval_id: 'pre1', creado_en: t0.toISOString(), ...o });

test('GET: activa a mitad muestra la penalidad; token desconocido 404', async () => {
  const d = deps();
  await sus.crear(d.db, fila());
  const j = await (await handleSuscripcionCancelar(get('s=ts'), env, d)).json();
  assert.equal(j.modo, 'activa');
  assert.equal(j.penalidad_centimos, 8000);
  assert.equal(j.detalle, '1 mes a S/440, menos los S/360 que pagaste');
  assert.equal((await handleSuscripcionCancelar(get('s=zz'), env, d)).status, 404);
});

test('POST pagar: crea la preferencia de la penalidad con referencia pen-<id>', async () => {
  const d = deps();
  await sus.crear(d.db, fila());
  const j = await (await handleSuscripcionCancelar(post({ s: 'ts', pagar: true }), env, d)).json();
  assert.deepEqual(j, { ok: true, url: 'https://mp/pen' });
  assert.equal(d.prefs[0].reservaId, 'pen-s1');
  assert.equal(d.prefs[0].montoCentimos, 8000);
  assert.equal((await sus.porId(d.db, 's1')).penalidad_centimos, 8000); // queda cotizada para validar el pago
  assert.equal(d.prefs[0].urlRetorno, 'https://www.ajlnutricion.com/suscripcion/cancelar/?s=ts&pago=1');
});

test('POST sin pagar: cancela ya en Mercado Pago y deja la penalidad pendiente', async () => {
  const d = deps();
  await sus.crear(d.db, fila());
  const j = await (await handleSuscripcionCancelar(post({ s: 'ts', pagar: false }), env, d)).json();
  assert.deepEqual(j, { ok: true, cancelada: true, penalidad_centimos: 8000 });
  assert.deepEqual(d.canceladas, ['pre1']);
  assert.equal((await sus.porId(d.db, 's1')).penalidad_estado, 'pendiente');
});

test('si Mercado Pago no cancela, no se marca la baja y se responde 503', async () => {
  const d = deps();
  d.mp.cancelarSuscripcion = async () => { throw new Error('caído'); };
  await sus.crear(d.db, fila());
  assert.equal((await handleSuscripcionCancelar(post({ s: 'ts', pagar: false }), env, d)).status, 503);
  assert.equal((await sus.porId(d.db, 's1')).estado, 'activa');
});

test('deuda: modo deuda y solo se puede pagar; en el último mes no hay penalidad', async () => {
  const d = deps();
  await sus.crear(d.db, fila({ estado: 'cancelada', penalidad_estado: 'pendiente' }));
  assert.equal((await (await handleSuscripcionCancelar(get('s=ts'), env, d)).json()).modo, 'deuda');
  assert.equal((await handleSuscripcionCancelar(post({ s: 'ts', pagar: false }), env, d)).status, 409);
  await sus.crear(d.db, fila({ id: 's2', token: 't2', mp_preapproval_id: 'pre2', cobros_aprobados: 3 }));
  assert.equal((await (await handleSuscripcionCancelar(get('s=t2'), env, d)).json()).penalidad_centimos, 0);
});

test('si la base falla tras cancelar en Mercado Pago: 200 si otro ya cerró el plan, 503 si no', async () => {
  const d = deps();
  await sus.crear(d.db, fila());
  const real = d.db.prepare.bind(d.db);
  d.db.prepare = (sql) => { if (/UPDATE suscripciones/.test(sql) && /cancelada/.test(sql)) throw new Error('conflicto'); return real(sql); };
  assert.equal((await handleSuscripcionCancelar(post({ s: 'ts', pagar: false }), env, d)).status, 503);
});
