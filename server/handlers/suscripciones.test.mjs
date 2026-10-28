import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1DePrueba } from '../reservas/d1-prueba.mjs';
import * as sus from '../suscripciones/repo.mjs';
import { handleSuscripcionCancelar, handleSuscripcionLink, handleSuscripcionEstado } from './suscripciones.mjs';
import { sha256Hex } from '../tokens.mjs';

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

async function conLink(d, o = {}) {
  await sus.crear(d.db, { id: 'sl', token: 'tsl', link_token_hash: await sha256Hex('L1'), vence_en: '2026-11-27T00:00:00Z', nombre: 'Lucía Ramos',
    producto: 'acompanamiento', duracion_meses: 6, cuota_centimos: 25000, precio_mes_centimos: 32000, precio_3m_centimos: 27000, estado: 'pendiente', creado_por: 'romi@x.pe', creado_en: t0.toISOString(), ...o });
}
const postLink = (b) => new Request('https://x.test/api/suscripciones/link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
const formLink = { l: 'L1', email: 'lucia@x.pe', tipo_documento: 'dni', documento: '70123456', whatsapp: '+51987654321', acepto: true };

test('link: GET muestra el plan; POST crea la suscripción en Mercado Pago una sola vez', async () => {
  const d = deps();
  d.mp.crearSuscripcion = async (a) => { d.creadas = [...(d.creadas ?? []), a]; return { id: 'preL', init_point: 'https://mp/sus' }; };
  await conLink(d);
  const g = await (await handleSuscripcionLink(new Request('https://x.test/api/suscripciones/link?l=L1'), env, d)).json();
  assert.equal(g.cuota_centimos, 25000);
  assert.equal(g.ahorro_centimos, 7000);
  assert.equal(g.nombre, 'Lucía');
  assert.deepEqual(await (await handleSuscripcionLink(postLink(formLink), env, d)).json(), { ok: true, url: 'https://mp/sus' });
  assert.equal(d.creadas[0].urlRetorno, 'https://www.ajlnutricion.com/suscribirse/listo/?s=tsl');
  assert.equal((await handleSuscripcionLink(postLink(formLink), env, d)).status, 410);
  assert.equal(d.creadas.length, 1);
  assert.equal((await sus.porId(d.db, 'sl')).mp_preapproval_id, 'preL');
});

test('link vencido: 410 en GET y en POST', async () => {
  const d = deps();
  await conLink(d, { vence_en: '2026-11-01T00:00:00Z' });
  assert.equal((await handleSuscripcionLink(new Request('https://x.test/api/suscripciones/link?l=L1'), env, d)).status, 410);
  assert.equal((await handleSuscripcionLink(postLink(formLink), env, d)).status, 410);
});

test('link con penalidad pendiente en ese documento: 409 y el link sigue sin usar', async () => {
  const d = deps();
  await conLink(d);
  await sus.crear(d.db, fila({ id: 'old', token: 'told', mp_preapproval_id: null, estado: 'cancelada', penalidad_estado: 'pendiente', dni: '70123456' }));
  const r = await handleSuscripcionLink(postLink(formLink), env, d);
  assert.equal(r.status, 409);
  assert.equal((await sus.porId(d.db, 'sl')).link_usado_en, null);
});

test('estado: devuelve el estado por token', async () => {
  const d = deps();
  await sus.crear(d.db, fila());
  assert.equal((await (await handleSuscripcionEstado(new Request('https://x.test/api/suscripciones/estado?s=ts'), env, d)).json()).estado, 'activa');
});
