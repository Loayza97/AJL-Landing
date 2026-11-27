import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1DePrueba } from '../reservas/d1-prueba.mjs';
import { nutricionistas } from '../../src/data/nutricionistas.js';
import * as sus from '../suscripciones/repo.mjs';
import { filaPorClave } from '../suscripciones/citas.mjs';
import { handleEquipoPorAgendar } from './equipo-por-agendar.mjs';
import { handleLinks } from './equipo-links.mjs';

const t0 = new Date('2026-10-12T20:00:00Z');
const env = { PUBLIC_SITE_URL: 'https://www.ajlnutricion.com' };
const deps = ({ admin = false, ...o } = {}) => ({ db: d1DePrueba(), ahora: () => t0, nutricionistas, acceso: async () => ({ ok: true, email: 'romi@x.pe', admin }), ...o });
const get = (ruta) => new Request(`https://x.test${ruta}`);
const post = (ruta, cuerpo) => new Request(`https://x.test${ruta}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
const lista = async (d, q = '') => (await handleEquipoPorAgendar(get(`/api/equipo/por-agendar${q}`), env, d)).json();
const accion = (d, cuerpo) => handleEquipoPorAgendar(post('/api/equipo/por-agendar', cuerpo), env, d);
const link = (d, cuerpo) => handleLinks(post('/api/equipo/links', { tipo: 's60', ...cuerpo }), env, d);

// Una de la web sin cita atada, con 1 cobro, y una hecha a mano sin asignar.
async function sembrar(d, { reason = '3 meses - 2 sesiones mes' } = {}) {
  await sus.crear(d.db, { id: 's1', token: 't', producto: 'constancia', duracion_meses: 3, cuota_centimos: 36000, precio_mes_centimos: 44000,
    estado: 'pendiente', nombre: 'Ana', creado_en: t0.toISOString() });
  await sus.registrarCobro(d.db, { suscripcionId: 's1', mpPaymentId: 'p1', estado: 'approved', montoCentimos: 36000, ahora: t0 });
  await d.db.prepare("INSERT INTO sus_externas (preapproval_id, pagador, reason, creado_en, actualizado_en) VALUES ('abc', 'pagador01', ?1, ?2, ?2)").bind(reason, t0.toISOString()).run();
  await d.db.prepare("INSERT INTO sus_externa_cobros (mp_payment_id, preapproval_id, numero, monto_centimos, cobrado_en, creado_en) VALUES ('q1', 'abc', 1, 36000, ?1, ?1)").bind(t0.toISOString()).run();
}
const asignar = (d) => d.db.prepare(`INSERT INTO clientes (id, nombre, creado_en) VALUES ('c1', 'Luis', ?1)`).bind(t0.toISOString()).run()
  .then(() => d.db.prepare("INSERT INTO citas_suscripcion (clave, cliente_id, plan, actualizado_en) VALUES ('x:abc', 'c1', 'constancia:3', ?1)").bind(t0.toISOString()).run());

test('sin acceso: 401 y no se lee nada', async () => {
  const d = deps({ acceso: async () => ({ ok: false }), db: { prepare() { throw new Error('no debía leer'); } } });
  assert.equal((await handleEquipoPorAgendar(get('/api/equipo/por-agendar'), env, d)).status, 401);
  assert.equal((await accion(d, { accion: 'ajuste' })).status, 401);
});

test('lista las filas y dice si quien mira es administrador', async () => {
  const d = deps({ admin: true });
  await sembrar(d);
  const r = await lista(d);
  assert.equal(r.admin, true);
  assert.deepEqual(r.filas.map((f) => f.clave).sort(), ['s:s1', 'x:abc']);
  assert.deepEqual(r.filas.map((f) => f.pendiente), [true, true]);
});

test('la lista trae también las que están al día, marcadas sin pendiente', async () => {
  const d = deps();
  await sembrar(d);
  await accion(d, { accion: 'ajuste', clave: 's:s1', cantidad: -3, motivo: 'por fuera' });
  await accion(d, { accion: 'visto', clave: 's:s1', cobros: 1 });
  const r = await lista(d);
  assert.equal(r.filas.find((f) => f.clave === 's:s1').pendiente, false);
});

test('visto: apaga el aviso hasta ese cobro, queda quién fue y no acepta un número que no existe', async () => {
  const d = deps();
  await sembrar(d);
  await d.db.prepare("UPDATE sync_estado SET valor = '2026-10-01T00:00:00.000Z' WHERE clave = 'citas_por_cobro_desde'").run();
  assert.equal((await filaPorClave(d.db, 'x:abc', t0)).nuevo, true);
  for (const cobros of [0, 2, 1.5, '1', undefined]) assert.equal((await accion(d, { accion: 'visto', clave: 'x:abc', cobros })).status, 400, String(cobros));
  assert.equal((await accion(d, { accion: 'visto', clave: 'x:nada', cobros: 1 })).status, 404);
  assert.equal((await accion(d, { accion: 'visto', clave: 'x:abc', cobros: 1 })).status, 200);
  assert.equal((await filaPorClave(d.db, 'x:abc', t0)).nuevo, false);
  assert.deepEqual({ ...(await d.db.prepare('SELECT cobros, visto_por FROM cobros_vistos').first()) }, { cobros: 1, visto_por: 'romi@x.pe' });
  assert.equal((await accion(d, { accion: 'revisar', clave: 's:s1', usadas: 1 })).status, 400);
});

test('ajuste: entero distinto de cero con motivo; queda quién lo hizo', async () => {
  const d = deps();
  await sembrar(d);
  await asignar(d);
  for (const mal of [{ cantidad: 0, motivo: 'x' }, { cantidad: 26, motivo: 'x' }, { cantidad: 1.5, motivo: 'x' }, { cantidad: 1, motivo: '  ' }, { cantidad: 1 }]) {
    assert.equal((await accion(d, { accion: 'ajuste', clave: 'x:abc', ...mal })).status, 400, JSON.stringify(mal));
  }
  assert.equal((await accion(d, { accion: 'ajuste', clave: 'x:abc2', cantidad: 1, motivo: 'x' })).status, 404);
  assert.equal((await accion(d, { accion: 'ajuste', clave: 'x:abc', cantidad: -1, motivo: ' agendada por fuera ' })).status, 200);
  assert.equal((await filaPorClave(d.db, 'x:abc', t0)).faltan, 2);
  assert.deepEqual({ ...(await d.db.prepare('SELECT motivo, creado_por FROM citas_ajustes').first()) }, { motivo: 'agendada por fuera', creado_por: 'romi@x.pe' });
});

test('quitar paciente: solo administradores', async () => {
  const d = deps();
  await sembrar(d);
  await asignar(d);
  assert.equal((await accion(d, { accion: 'quitar', clave: 'x:abc' })).status, 403);
  d.acceso = async () => ({ ok: true, email: 'jefe@x.pe', admin: true });
  assert.equal((await accion(d, { accion: 'quitar', clave: 's:s1' })).status, 409);
  assert.equal((await accion(d, { accion: 'quitar', clave: 'x:abc' })).status, 200);
  assert.equal((await filaPorClave(d.db, 'x:abc', t0)).sin_asignar, true);
  assert.equal((await accion(d, { accion: 'zzz', clave: 'x:abc' })).status, 400);
});

test('link desde una fila: guarda la suscripción; sin fila, el link queda como siempre', async () => {
  const d = deps();
  await sembrar(d);
  assert.equal((await link(d, { plan: 'constancia:3', cita: '2' })).status, 200);
  assert.equal((await link(d, { plan: 'constancia:3', cita: '2', sus: 'x:abc' })).status, 200);
  const { results } = await d.db.prepare('SELECT sus_clave FROM links_agenda ORDER BY rowid').all();
  assert.deepEqual(results.map((l) => l.sus_clave), [null, 'x:abc']);
});

test('link desde una fila: rechaza suscripción desconocida, con otro plan o que aún no tiene cobros', async () => {
  const d = deps();
  await sembrar(d);
  assert.equal((await link(d, { plan: 'constancia:3', cita: '2', sus: 'x:nada' })).status, 404);
  assert.equal((await link(d, { plan: 'transformacion:3', cita: '2', sus: 's:s1' })).status, 400);
  assert.equal((await link(d, { plan: 'constancia:3', cita: '2', sus: 's:s1' })).status, 200);
  await d.db.prepare("INSERT INTO sus_externas (preapproval_id, estado_mp, creado_en, actualizado_en) VALUES ('sin', 'authorized', ?1, ?1)").bind(t0.toISOString()).run();
  assert.equal((await link(d, { plan: 'constancia:3', cita: '1', sus: 'x:sin' })).status, 409);
});

test('link «otro»: solo para una hecha a mano, con las citas por cobro', async () => {
  const d = deps();
  await sembrar(d, { reason: '2 meses-4 sesiones mes' });
  assert.equal((await link(d, { plan: 'otro', cita: '1' })).status, 400);
  for (const citas_por_cobro of [undefined, 0, 26, 2.5, '4']) {
    assert.equal((await link(d, { plan: 'otro', cita: '1', sus: 'x:abc', citas_por_cobro })).status, 400, String(citas_por_cobro));
  }
  assert.equal((await link(d, { plan: 'otro', cita: '26', sus: 'x:abc', citas_por_cobro: 4 })).status, 400);
  assert.equal((await link(d, { tipo: 'c30v', plan: 'otro', cita: '2', sus: 'x:abc', citas_por_cobro: 4 })).status, 200);
  assert.deepEqual({ ...(await d.db.prepare('SELECT plan, cita, sus_cpc FROM links_agenda').first()) }, { plan: 'otro', cita: '2', sus_cpc: 4 });
  assert.equal((await link(d, { plan: 'otro', cita: '1', sus: 's:s1', citas_por_cobro: 4 })).status, 400);
});
