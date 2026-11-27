import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1DePrueba } from '../reservas/d1-prueba.mjs';
import { nutricionistas } from '../../src/data/nutricionistas.js';
import * as sus from './repo.mjs';
import { revisarCobros, MAX_POR_VUELTA } from './revision.mjs';
import { barrerSuscripciones } from './procesar.mjs';

const t0 = new Date('2026-12-01T15:00:00Z');
const env = { PUBLIC_SITE_URL: 'https://www.ajlnutricion.com', AVISOS_RESPALDO: 'joaquin@x.pe',
  CORREOS_EQUIPO: JSON.stringify({ romina: 'r@x.pe', irene: 'i@x.pe', alejandro: 'a@x.pe' }) };

// Mercado Pago de mentira: cada suscripción con sus cobros aprobados.
function armar(subs = {}) {
  const d = { db: d1DePrueba(), nutricionistas, ahora: () => t0, correos: [], pedidos: [], esperas: [], canceladas: [], subs,
    esperar: async (ms) => { d.esperas.push(ms); } };
  d.sendEmail = async (c) => { d.correos.push(c); return true; };
  const pre = (id) => ({ id, status: d.subs[id].status ?? 'authorized', reason: d.subs[id].reason ?? '3 meses - 2 sesiones mes', payer_first_name: `P ${id}`,
    auto_recurring: { transaction_amount: 360 }, next_payment_date: d.subs[id].proximo, summarized: { charged_quantity: d.subs[id].contador ?? d.subs[id].cobros, last_charged_date: d.subs[id].ultimo } });
  const cobrosDe = (id) => Array.from({ length: d.subs[id].cobros }, (_, i) => ({ id: `${id}.${i + 1}`, preapproval_id: id, status: 'processed', transaction_amount: 360, payment: { id: `${id}.p${i + 1}` } }));
  d.mp = {
    listarSuscripcionesVigentes: async () => { d.pedidos.push('lista'); return Object.keys(d.subs).filter((id) => (d.subs[id].status ?? 'authorized') === 'authorized').map(pre); },
    buscarCobrosSuscripcion: async (id) => { d.pedidos.push(`cobros ${id}`); return cobrosDe(id); },
    obtenerSuscripcion: async (id) => { d.pedidos.push(`pre ${id}`); return pre(id); },
    obtenerCobroSuscripcion: async (id) => cobrosDe(id.split('.')[0]).find((c) => c.id === id),
    obtenerPago: async (id) => ({ id, status: 'approved', date_approved: '2026-11-30T10:00:00.000-05:00', transaction_amount: 360 }),
    cancelarSuscripcion: async (id) => { d.canceladas.push(id); },
    desactivarPlan: async () => ({}),
  };
  return d;
}
const guardados = async (d) => (await d.db.prepare('SELECT mp_payment_id FROM sus_externa_cobros ORDER BY mp_payment_id').all()).results.map((c) => c.mp_payment_id);
const desde = (d) => d.db.prepare("UPDATE sync_estado SET valor = '2026-11-01T00:00:00.000Z' WHERE clave = 'citas_por_cobro_desde'").run();
const pedidosCobros = (d) => d.pedidos.filter((p) => p.startsWith('cobros'));
const de429 = () => new Error('Mercado Pago suscripción 429: local_rate_limited');

test('registra el cobro de una hecha a mano y avisa una vez; si el contador no sube, no vuelve a preguntar', async () => {
  const d = armar({ aa: { cobros: 1 } });
  await desde(d);
  assert.deepEqual(await revisarCobros(d, env), { vigentes: 1, consultadas: 1, errores: 0 });
  assert.deepEqual(await guardados(d), ['aa.p1']);
  assert.deepEqual(await revisarCobros(d, env), { vigentes: 1, consultadas: 0, errores: 0 });
  assert.equal(pedidosCobros(d).length, 1);
  assert.equal(d.correos.length, 1);
  d.subs.aa.cobros = 2;
  await revisarCobros(d, env);
  assert.deepEqual(await guardados(d), ['aa.p1', 'aa.p2']);
  assert.equal(d.correos.length, 2);
});

test('dos vueltas a la vez: un registro y un correo', async () => {
  const d = armar({ aa: { cobros: 1 } });
  await desde(d);
  await Promise.all([revisarCobros(d, env), revisarCobros(d, env)]);
  assert.deepEqual(await guardados(d), ['aa.p1']);
  assert.equal(d.correos.length, 1);
});

test('web: pide los cobros solo si el contador supera a los aprobados, y los registra', async () => {
  const d = armar({ web1: { cobros: 2, reason: 'AJL Nutrición · Constancia' } });
  await sus.crear(d.db, { id: 's1', token: 't', producto: 'constancia', duracion_meses: 3, cuota_centimos: 36000, precio_mes_centimos: 44000,
    estado: 'activa', cobros_aprobados: 0, nombre: 'Ana', mp_preapproval_id: 'web1', creado_en: t0.toISOString() });
  await revisarCobros(d, env);
  assert.equal((await sus.porId(d.db, 's1')).cobros_aprobados, 2);
  await revisarCobros(d, env);
  assert.equal(pedidosCobros(d).length, 1);
  assert.deepEqual(await guardados(d), []);
  assert.deepEqual(d.canceladas, []);
});

test('un plan de la web que no está en la base no se toca', async () => {
  const d = armar({ zz: { cobros: 1, reason: 'AJL Nutrición · Constancia' } });
  assert.deepEqual(await revisarCobros(d, env), { vigentes: 1, consultadas: 0, errores: 0 });
});

test('hecha a mano que salió de la lista (terminó): registra su último cobro una vez y deja de mirarla', async () => {
  const d = armar({ aa: { cobros: 1 } });
  await revisarCobros(d, env);
  d.subs.aa = { cobros: 2, status: 'cancelled' };
  await revisarCobros(d, env);
  assert.deepEqual(await guardados(d), ['aa.p1', 'aa.p2']);
  d.pedidos.length = 0;
  await revisarCobros(d, env);
  assert.deepEqual(d.pedidos, ['lista']);
});

test(`carga inicial: consulta como mucho ${MAX_POR_VUELTA} suscripciones por vuelta y sigue en la siguiente`, async () => {
  const subs = Object.fromEntries(Array.from({ length: MAX_POR_VUELTA + 2 }, (_, i) => [`s${i}`, { cobros: 1 }]));
  const d = armar(subs);
  // La carga inicial es de cobros anteriores a la publicación: entran sin correo.
  await d.db.prepare("UPDATE sync_estado SET valor = '2026-12-01T00:00:00.000Z' WHERE clave = 'citas_por_cobro_desde'").run();
  assert.equal((await revisarCobros(d, env)).consultadas, MAX_POR_VUELTA);
  assert.equal((await revisarCobros(d, env)).consultadas, 2);
  assert.equal((await guardados(d)).length, MAX_POR_VUELTA + 2);
  assert.equal(d.correos.length, 0);
});

test('un 429 aislado se reintenta y registra', async () => {
  const d = armar({ aa: { cobros: 1 } });
  const buscar = d.mp.buscarCobrosSuscripcion;
  let veces = 0;
  d.mp.buscarCobrosSuscripcion = async (id) => { veces += 1; if (veces === 1) throw de429(); return buscar(id); };
  assert.equal((await revisarCobros(d, env)).errores, 0);
  assert.deepEqual(await guardados(d), ['aa.p1']);
  assert.ok(d.esperas.includes(2000));
});

test('si una suscripción falla, las demás siguen; el correo sale solo a la 4.ª vuelta seguida y una vez', async () => {
  const d = armar({ aa: { cobros: 1 }, bb: { cobros: 1 } });
  const buscar = d.mp.buscarCobrosSuscripcion;
  d.mp.buscarCobrosSuscripcion = async (id) => { if (id === 'aa') throw de429(); return buscar(id); };
  const alertas = () => d.correos.filter((c) => /revisión de cobros/.test(c.subject));
  for (let i = 1; i <= 3; i++) assert.equal((await revisarCobros(d, env)).errores, 1);
  assert.deepEqual(await guardados(d), ['bb.p1']);
  assert.equal(alertas().length, 0);
  await revisarCobros(d, env);
  await revisarCobros(d, env);
  assert.equal(alertas().length, 1);
  assert.deepEqual(alertas()[0].to, ['joaquin@x.pe']);
  // Cuando se recupera, la cuenta vuelve a cero.
  d.mp.buscarCobrosSuscripcion = buscar;
  await revisarCobros(d, env);
  assert.equal((await d.db.prepare("SELECT valor FROM sync_estado WHERE clave = 'citas_revision_fallos'").first()).valor, '{}');
});

test('si falla la lista, no consulta nada y avisa a la 4.ª vuelta', async () => {
  const d = armar({ aa: { cobros: 1 } });
  d.mp.listarSuscripcionesVigentes = async () => { throw new Error('Mercado Pago suscripción 500: x'); };
  for (let i = 1; i <= 4; i++) assert.deepEqual(await revisarCobros(d, env), { vigentes: 0, consultadas: 0, errores: 1 });
  assert.deepEqual(d.pedidos, []);
  assert.equal(d.correos.length, 1);
});

test('respaldo diario: pausa entre suscripciones y reintenta un 429 sin reportar error', async () => {
  const d = armar({ w1: { cobros: 0 }, w2: { cobros: 0 } });
  for (const [id, pre] of [['s1', 'w1'], ['s2', 'w2']]) {
    await sus.crear(d.db, { id, token: id, producto: 'constancia', duracion_meses: 3, cuota_centimos: 36000, precio_mes_centimos: 44000,
      estado: 'activa', cobros_aprobados: 1, nombre: id, mp_preapproval_id: pre, creado_en: t0.toISOString() });
  }
  let veces = 0;
  d.mp.buscarCobrosSuscripcion = async () => { veces += 1; if (veces === 1) throw de429(); return []; };
  assert.equal((await barrerSuscripciones(d, env)).errores, 0);
  assert.deepEqual(d.esperas, [2000, 300]);
});

test('suscripciones que siempre quedan pendientes no dejan sin turno a las demás', async () => {
  const subs = Object.fromEntries(Array.from({ length: MAX_POR_VUELTA }, (_, i) => [`s${i}`, { cobros: 1 }]));
  const d = armar({ ...subs, nueva: { cobros: 1 } });
  const pago = d.mp.obtenerPago;
  d.mp.obtenerPago = async (id) => (id.startsWith('nueva') ? pago(id) : { id, status: 'pending' });
  for (let i = 0; i < MAX_POR_VUELTA + 1; i++) {
    d.ahora = () => new Date(t0.getTime() + i * 15 * 60000);
    await revisarCobros(d, env);
  }
  assert.deepEqual(await guardados(d), ['nueva.p1']);
});

test('cada vuelta se queda lejos del tope de 50 consultas a la base, y lo que no cabe sale en las siguientes', async () => {
  const ids = Array.from({ length: MAX_POR_VUELTA }, (_, i) => `w${i}`);
  const d = armar(Object.fromEntries(ids.map((id) => [id, { cobros: 3, reason: 'AJL Nutrición · Constancia' }])));
  for (const id of ids) {
    await sus.crear(d.db, { id: `s-${id}`, token: id, producto: 'constancia', duracion_meses: 6, cuota_centimos: 32500, precio_mes_centimos: 44000,
      estado: 'activa', cobros_aprobados: 0, nombre: id, email: `${id}@x.pe`, mp_preapproval_id: id, creado_en: t0.toISOString() });
  }
  const real = d.db;
  let consultas = 0;
  d.db = { prepare: (sql) => { consultas += 1; return real.prepare(sql); }, batch: (s) => real.batch(s) };
  const maximos = [];
  for (let i = 0; i < 12; i++) {
    consultas = 0;
    d.ahora = () => new Date(t0.getTime() + i * 15 * 60000);
    assert.equal((await revisarCobros(d, env)).errores, 0);
    maximos.push(consultas);
  }
  assert.ok(Math.max(...maximos) <= 50, `consultas por vuelta: ${maximos}`);
  const { n } = await real.prepare('SELECT SUM(cobros_aprobados) AS n FROM suscripciones').first();
  assert.equal(n, MAX_POR_VUELTA * 3);
});

test('hecha a mano: si el contador no sube pero la fecha del último cobro avanzó, igual lo busca', async () => {
  const d = armar({ aa: { cobros: 1, ultimo: '2026-11-30T10:00:00.000-05:00' } });
  await revisarCobros(d, env);
  assert.equal((await revisarCobros(d, env)).consultadas, 0);
  d.subs.aa = { cobros: 2, contador: 1, ultimo: '2026-12-30T10:00:00.000-05:00' };
  await revisarCobros(d, env);
  assert.deepEqual(await guardados(d), ['aa.p1', 'aa.p2']);
});

test('hecha a mano que terminó con el último cobro todavía pendiente: la sigue mirando hasta que se resuelve', async () => {
  const d = armar({ aa: { cobros: 1 } });
  await revisarCobros(d, env);
  d.subs.aa = { cobros: 2, status: 'cancelled' };
  const pago = d.mp.obtenerPago;
  d.mp.obtenerPago = async (id) => (id === 'aa.p2' ? { id, status: 'in_process' } : pago(id));
  await revisarCobros(d, env);
  assert.deepEqual(await guardados(d), ['aa.p1']);
  d.mp.obtenerPago = pago;
  await revisarCobros(d, env);
  assert.deepEqual(await guardados(d), ['aa.p1', 'aa.p2']);
  d.pedidos.length = 0;
  await revisarCobros(d, env);
  assert.deepEqual(d.pedidos, ['lista']);
});

const proximos = async (d) => (await d.db.prepare('SELECT clave, fecha FROM sus_proximo ORDER BY clave').all()).results.map((p) => `${p.clave} ${p.fecha}`);

test('próximo cobro: guarda el de cada suscripción vigente, web y a mano, también las que aún no cobran', async () => {
  const d = armar({ aa: { cobros: 0, proximo: '2026-12-05T14:00:00.000-05:00' },
    ww: { cobros: 0, proximo: '2026-12-07T10:00:00.000-05:00', reason: 'AJL Nutrición · Constancia' },
    zz: { cobros: 0, proximo: '2026-12-09T10:00:00.000-05:00', reason: 'AJL Nutrición · Constancia' } });
  await sus.crear(d.db, { id: 's-ww', token: 'ww', producto: 'constancia', duracion_meses: 3, cuota_centimos: 36000, precio_mes_centimos: 44000,
    estado: 'activa', nombre: 'W', mp_preapproval_id: 'ww', creado_en: t0.toISOString() });
  await revisarCobros(d, env);
  assert.deepEqual(await proximos(d), ['s:s-ww 2026-12-07T15:00:00.000Z', 'x:aa 2026-12-05T19:00:00.000Z']);
  const x = await d.db.prepare("SELECT pagador, reason, estado_mp FROM sus_externas WHERE preapproval_id = 'aa'").first();
  assert.deepEqual({ ...x }, { pagador: 'P aa', reason: '3 meses - 2 sesiones mes', estado_mp: 'authorized' });
  assert.deepEqual(d.pedidos, ['lista']);
  assert.equal(d.correos.length, 0);
});

test('próximo cobro: solo escribe lo que cambió', async () => {
  const d = armar({ aa: { cobros: 0, proximo: '2026-12-05T19:00:00.000Z' } });
  await revisarCobros(d, env);
  const marca = () => d.db.prepare('SELECT actualizado_en AS t FROM sus_proximo').first();
  d.ahora = () => new Date(t0.getTime() + 15 * 60000);
  await revisarCobros(d, env);
  assert.equal((await marca()).t, t0.toISOString());
  d.subs.aa.proximo = '2027-01-05T19:00:00.000Z';
  await revisarCobros(d, env);
  assert.deepEqual(await proximos(d), ['x:aa 2027-01-05T19:00:00.000Z']);
});

test('próximo cobro: con muchas suscripciones se reparte en varias vueltas sin pasar el tope de consultas', async () => {
  const ids = Array.from({ length: 35 }, (_, i) => `m${i}`);
  const d = armar(Object.fromEntries(ids.map((id) => [id, { cobros: 0, proximo: '2026-12-05T19:00:00.000Z' }])));
  const real = d.db;
  let consultas = 0;
  d.db = { prepare: (sql) => { consultas += 1; return real.prepare(sql); }, batch: (s) => real.batch(s) };
  for (let i = 0; i < 8; i++) {
    consultas = 0;
    await revisarCobros(d, env);
    assert.ok(consultas <= 40, `consultas: ${consultas}`);
  }
  assert.equal((await real.prepare('SELECT COUNT(*) AS n FROM sus_proximo').first()).n, 35);
});
