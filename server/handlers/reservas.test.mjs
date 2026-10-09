import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { d1DePrueba } from '../reservas/d1-prueba.mjs';
import { nutricionistas } from '../../src/data/nutricionistas.js';
import { handleHoras, handleApartar, handlePagar, handleEstado, handleWebhookMp, handleIcs, handleResumenDiario } from './reservas.mjs';

const t0 = new Date('2026-10-05T15:00:00Z');
const env = { PUBLIC_SITE_URL: 'https://www.ajlnutricion.com', NOTIFICATION_EMAIL: 'equipo@x.pe', MP_WEBHOOK_SECRET: 'sec', RESUMEN_TOKEN: 'tok' };
function deps(extra = {}) {
  const pagos = {};
  return {
    db: d1DePrueba(), nutricionistas, ahora: () => t0, sendEmail: async () => true, pagos,
    google: { listarEventos: async () => [], crearEvento: async () => ({ id: 'ev', meet: null }) },
    mp: { crearPreferencia: async () => ({ id: 'pref', init_point: 'https://mp/pagar' }), obtenerPago: async (id) => pagos[id] },
    ...extra,
  };
}
const get = (ruta) => new Request(`https://x.test${ruta}`);
const post = (ruta, cuerpo, headers = {}) => new Request(`https://x.test${ruta}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(cuerpo) });
const apartar = (d, o = {}) => handleApartar(post('/api/reservas/apartar', { producto: 'constancia', duracion: 3, modalidad: 'presencial', inicio: '2026-10-06T17:00:00Z', ...o }), env, d);
const datos = { nombres: 'Ana', apellido_paterno: 'Pérez', apellido_materno: '', whatsapp: '987 654 321', email: 'ana@x.pe',
  fecha_nacimiento: '1990-05-04', tipo_documento: 'dni', documento: '12345678', acepto: true, novedades: false };

test('horas: 7 días y el equipo, sin datos privados', async () => {
  const r = await handleHoras(get('/api/reservas/horas?desde=2026-10-06&modalidad=presencial&producto=constancia&duracion=3'), env, deps());
  const d = await r.json();
  assert.equal(r.status, 200);
  assert.equal(d.dias.length, 7);
  assert.equal(d.dias[0].horas[0].inicio, '2026-10-06T15:00:00Z');
  assert.deepEqual(Object.keys(d.nutricionistas[0]).sort(), ['foto', 'id', 'nombre']);
});

test('horas: parámetros inválidos dan 400', async () => {
  for (const q of ['desde=hoy&modalidad=presencial&producto=constancia&duracion=3', 'desde=2026-10-06&modalidad=casa&producto=constancia&duracion=3',
    'desde=2026-10-06&modalidad=video&producto=constancia&duracion=12', 'desde=2026-10-06&modalidad=video&producto=constancia&duracion=3&nutricionista=zzz']) {
    assert.equal((await handleHoras(get(`/api/reservas/horas?${q}`), env, deps())).status, 400, q);
  }
});

test('horas: si Google falla, 503', async () => {
  const d = deps({ google: { listarEventos: async () => { throw new Error('x'); } } });
  assert.equal((await handleHoras(get('/api/reservas/horas?desde=2026-10-06&modalidad=presencial&producto=constancia&duracion=3'), env, d)).status, 503);
});

test('apartar: devuelve token, monto del servidor y la nutricionista asignada', async () => {
  const r = await apartar(deps());
  const d = await r.json();
  assert.equal(r.status, 200);
  assert.equal(d.monto_centimos, 108000);
  assert.equal(d.requiere_dni, true);
  assert.equal(d.nutricionista.id, 'nico'); // empate de carga: gana el orden del equipo
  assert.ok(d.token.length >= 32);
});

test('apartar dos veces la misma hora presencial: la segunda da 409', async () => {
  const d = deps();
  assert.equal((await apartar(d)).status, 200);
  const r = await apartar(d);
  assert.equal(r.status, 409);
  assert.equal((await r.json()).motivo, 'ocupada');
});

test('apartar más de 2 horas a la vez desde la misma IP: 429', async () => {
  const d = deps();
  const desde = (inicio) => handleApartar(new Request('https://x.test/api/reservas/apartar', { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '1.2.3.4' },
    body: JSON.stringify({ producto: 'constancia', duracion: 3, modalidad: 'presencial', inicio }) }), env, d);
  assert.equal((await desde('2026-10-06T15:00:00Z')).status, 200);
  assert.equal((await desde('2026-10-06T16:00:00Z')).status, 200);
  assert.equal((await desde('2026-10-06T17:00:00Z')).status, 429);
});

test('apartar: la purga de reservas no pagadas se manda a enSegundoPlano cuando existe', async () => {
  const programadas = [];
  const d = deps({ enSegundoPlano: (p) => programadas.push(p) });
  assert.equal((await apartar(d)).status, 200);
  assert.equal(programadas.length, 1);
  await programadas[0]; // no debe lanzar
});

test('apartar una hora que no se ofrece da 409', async () => {
  assert.equal((await apartar(deps(), { inicio: '2026-10-06T03:00:00Z' })).status, 409);
});

test('pagar: valida datos, exige documento y aceptar condiciones; guarda el detalle', async () => {
  let pedido;
  const d = deps({ mp: { crearPreferencia: async (p) => { pedido = p; return { id: 'pref', init_point: 'https://mp/pagar' }; } } });
  const { token } = await (await apartar(d)).json();
  const pagar = (o) => handlePagar(post('/api/reservas/pagar', { ...datos, token, ...o }), env, d);
  assert.equal((await pagar({ email: 'malo' })).status, 400);
  assert.equal((await pagar({ documento: '' })).status, 400);
  assert.equal((await pagar({ fecha_nacimiento: '' })).status, 400);
  assert.equal((await pagar({ acepto: false })).status, 400);
  const ok = await pagar({});
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { ok: true, url: 'https://mp/pagar' });
  assert.equal(pedido.urlNotificacion, 'https://www.ajlnutricion.com/api/reservas/webhook-mp');
  assert.equal(pedido.nombre, 'Ana Pérez');
  const c = await d.db.prepare('SELECT * FROM clientes').first();
  assert.deepEqual([c.nombres, c.apellido_paterno, c.apellido_materno, c.fecha_nacimiento, c.tipo_documento, c.dni],
    ['Ana', 'Pérez', null, '1990-05-04', 'dni', '12345678']);
});

test('pagar con token inexistente: 404', async () => {
  assert.equal((await handlePagar(post('/api/reservas/pagar', { ...datos, token: 'nope' }), env, deps())).status, 404);
});

test('estado con payment_id aprobado confirma como respaldo del webhook', async () => {
  const d = deps();
  const ap = await (await apartar(d)).json();
  await handlePagar(post('/api/reservas/pagar', { ...datos, token: ap.token }), env, d);
  const { id } = await d.db.prepare('SELECT id FROM reservas WHERE token = ?1').bind(ap.token).first();
  d.pagos['77'] = { id: 77, status: 'approved', external_reference: id, transaction_amount: 1080, currency_id: 'PEN' };
  const v = await (await handleEstado(get(`/api/reservas/estado?r=${ap.token}&payment_id=77`), env, d)).json();
  assert.equal(v.estado, 'confirmada');
  assert.equal(v.nombre, 'Ana');
  assert.equal(v.email, undefined);
});

test('webhook con firma inválida: 401 y nada cambia', async () => {
  const d = deps();
  const r = await handleWebhookMp(post('/api/reservas/webhook-mp?type=payment&data.id=77', { type: 'payment', data: { id: '77' } }, { 'x-signature': 'ts=1,v1=00', 'x-request-id': 'q' }), env, d);
  assert.equal(r.status, 401);
});

test('webhook firmado procesa el pago', async () => {
  const d = deps();
  const ap = await (await apartar(d)).json();
  await handlePagar(post('/api/reservas/pagar', { ...datos, token: ap.token }), env, d);
  const { id } = await d.db.prepare('SELECT id FROM reservas WHERE token = ?1').bind(ap.token).first();
  d.pagos['88'] = { id: 88, status: 'approved', external_reference: id, transaction_amount: 1080, currency_id: 'PEN' };
  const v1 = createHmac('sha256', 'sec').update('id:88;request-id:q;ts:9;').digest('hex');
  const r = await handleWebhookMp(post('/api/reservas/webhook-mp?type=payment&data.id=88', { type: 'payment', data: { id: '88' } }, { 'x-signature': `ts=9,v1=${v1}`, 'x-request-id': 'q' }), env, d);
  assert.equal(r.status, 200);
  const ics = await handleIcs(get(`/api/reservas/ics?r=${ap.token}`), env, d);
  assert.equal(ics.status, 200);
  assert.match(ics.headers.get('Content-Type'), /text\/calendar/);
});

test('webhook de otro tipo se ignora con 200; sin secreto configurado, 503', async () => {
  assert.equal((await handleWebhookMp(post('/api/reservas/webhook-mp?type=merchant_order&data.id=1', {}), env, deps())).status, 200);
  assert.equal((await handleWebhookMp(post('/api/reservas/webhook-mp?type=payment&data.id=1', {}), { ...env, MP_WEBHOOK_SECRET: '' }, deps())).status, 503);
});

test('resumen diario: token, una sola vez por día y solo con alguien que avisar', async () => {
  const enviados = [];
  const d = deps({ sendEmail: async (m) => { enviados.push(m); return true; } });
  const llamar = (auth) => handleResumenDiario(new Request('https://x.test/api/reservas/resumen-diario', { method: 'POST', headers: auth ? { Authorization: auth } : {} }), env, d);
  assert.equal((await llamar()).status, 401);
  assert.equal((await llamar('Bearer otro')).status, 401);
  assert.deepEqual(await (await llamar('Bearer tok')).json(), { ok: true, enviados: 0 });
  const ap = await (await apartar(d)).json();
  await handlePagar(post('/api/reservas/pagar', { ...datos, token: ap.token }), env, d);
  const d2 = { ...d, ahora: () => new Date(t0.getTime() + 2 * 3600000) };
  const llamar2 = () => handleResumenDiario(new Request('https://x.test/api/reservas/resumen-diario', { method: 'POST', headers: { Authorization: 'Bearer tok' } }), env, d2);
  assert.deepEqual(await (await llamar2()).json(), { ok: true, enviados: 1 });
  assert.deepEqual(await (await llamar2()).json(), { ok: true, enviados: 0 }); // nadie nuevo desde el último envío
  assert.equal(enviados.length, 1);
  assert.equal(enviados[0].to, 'equipo@x.pe');
  assert.equal((await handleResumenDiario(new Request('https://x.test/api/reservas/resumen-diario', { method: 'POST', headers: { Authorization: 'Bearer tok' } }), { ...env, RESUMEN_TOKEN: '' }, d2)).status, 503);
});

test('resumen diario: si el correo falla, se puede reintentar el mismo día', async () => {
  let falla = true;
  const d = deps({ sendEmail: async () => !falla });
  const ap = await (await apartar(d)).json();
  await handlePagar(post('/api/reservas/pagar', { ...datos, token: ap.token }), env, d);
  const d2 = { ...d, ahora: () => new Date(t0.getTime() + 2 * 3600000) };
  const llamar = () => handleResumenDiario(new Request('https://x.test/api/reservas/resumen-diario', { method: 'POST', headers: { Authorization: 'Bearer tok' } }), env, d2);
  assert.equal((await llamar()).status, 503);
  falla = false;
  assert.deepEqual(await (await llamar()).json(), { ok: true, enviados: 1 });
});

test('apartar con liberar suelta la hora anterior: cambiar de hora no gasta el límite ni bloquea la misma hora', async () => {
  const d = deps();
  const desde = (inicio, liberar) => handleApartar(new Request('https://x.test/api/reservas/apartar', { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '9.9.9.9' },
    body: JSON.stringify({ producto: 'constancia', duracion: 3, modalidad: 'presencial', inicio, liberar }) }), env, d);
  let anterior = (await (await desde('2026-10-06T15:00:00Z')).json()).token;
  for (const h of ['16', '17', '15']) {
    const r = await desde(`2026-10-06T${h}:00:00Z`, anterior);
    assert.equal(r.status, 200, h);
    anterior = (await r.json()).token;
  }
  const { n } = await d.db.prepare("SELECT COUNT(*) AS n FROM reservas WHERE estado = 'apartada'").first();
  assert.equal(n, 1);
});

test('resumen diario: si un día no se envió, el siguiente incluye lo acumulado desde el último envío', async () => {
  const enviados = [];
  const d = deps({ sendEmail: async (m) => { enviados.push(m); return true; } });
  const llamar = (horas) => handleResumenDiario(new Request('https://x.test/api/reservas/resumen-diario', { method: 'POST', headers: { Authorization: 'Bearer tok' } }),
    env, { ...d, ahora: () => new Date(t0.getTime() + horas * 3600000) });
  // Primer envío (día 1) sin nadie pendiente: no deja marca.
  // Una persona deja datos y no paga; su plazo vence a las 15:30 del día 1.
  const ap = await (await apartar(d)).json();
  await handlePagar(post('/api/reservas/pagar', { ...datos, token: ap.token }), env, d);
  // El cron no corre el día 2; corre recién el día 3 (más de 24 h después del vencimiento).
  assert.deepEqual(await (await llamar(50)).json(), { ok: true, enviados: 1 });
  // El día 4 no la repite: el último envío marca desde dónde mirar.
  assert.deepEqual(await (await llamar(74)).json(), { ok: true, enviados: 0 });
  assert.equal(enviados.length, 1);
});
