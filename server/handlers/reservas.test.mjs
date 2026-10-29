import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { d1DePrueba } from '../reservas/d1-prueba.mjs';
import { nutricionistas } from '../../src/data/nutricionistas.js';
import { handleHoras, handleOpciones, handleApartar, handlePagar, handleEstado, handleWebhookMp, handleIcs, handleResumenDiario, handleReubicar, handleSincronizarCalendario } from './reservas.mjs';
import * as repo from '../reservas/repo.mjs';
import * as sus from '../suscripciones/repo.mjs';
import { avisarPenalidadPendiente } from '../suscripciones/procesar.mjs';

const t0 = new Date('2026-10-05T15:00:00Z');
const env = { PUBLIC_SITE_URL: 'https://www.ajlnutricion.com', NOTIFICATION_EMAIL: 'equipo@x.pe', MP_WEBHOOK_SECRET: 'sec', RESUMEN_TOKEN: 'tok', SUSCRIPCIONES_ABIERTAS: '1' };
function deps(extra = {}) {
  const pagos = {};
  const creadas = [];
  const desactivados = [];
  return {
    db: d1DePrueba(), nutricionistas, ahora: () => t0, sendEmail: async () => true, pagos, creadas, desactivados,
    google: { listarEventos: async () => [], crearEvento: async () => ({ id: 'ev', meet: null }) },
    ...extra,
    mp: { crearPreferencia: async () => ({ id: 'pref', init_point: 'https://mp/pagar' }), obtenerPago: async (id) => pagos[id],
      crearSuscripcion: async (a) => { creadas.push(a); return { planId: 'plan1', init_point: 'https://mp/sus' }; },
      desactivarPlan: async (id) => { desactivados.push(id); return {}; }, buscarSuscripcionDePlan: async () => null, ...extra.mp },
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

test('horas: dias=21 devuelve tres semanas de una vez; más de 45 o no numérico da 400', async () => {
  const d = await (await handleHoras(get('/api/reservas/horas?desde=2026-10-06&modalidad=presencial&producto=constancia&duracion=3&dias=21'), env, deps())).json();
  assert.equal(d.dias.length, 21);
  assert.equal(d.dias[20].fecha, '2026-10-26');
  for (const dias of ['46', 'x', '0']) {
    assert.equal((await handleHoras(get(`/api/reservas/horas?desde=2026-10-06&modalidad=presencial&producto=constancia&duracion=3&dias=${dias}`), env, deps())).status, 400, dias);
  }
});

test('apartar guarda la versión del botón de la portada solo si es válida', async () => {
  const d = deps();
  const ok = await (await apartar(d, { variante: 'hero_b' })).json();
  const raro = await (await apartar(d, { inicio: '2026-10-06T19:00:00Z', variante: '<script>' })).json();
  const v = async (token) => (await d.db.prepare('SELECT variante FROM reservas WHERE token = ?1').bind(token).first()).variante;
  assert.equal(await v(ok.token), 'b');
  assert.equal(await v(raro.token), null);
});

test('ics: DTEND sale de fin_utc', async () => {
  const d = deps();
  await d.db.prepare(`INSERT INTO reservas (id, token, producto, duracion_meses, monto_centimos, peso_tope, nutricionista_id, inicio_utc, fecha_lima,
    modalidad, estado, creado_en, actualizado_en, duracion_min, fin_utc)
    VALUES ('i', 'ti', 'constancia', 3, 108000, 1, 'nico', '2026-10-06T15:00:00Z', '2026-10-06', 'video', 'confirmada', 'x', 'x', 30, '2026-10-06T15:30:00Z')`).run();
  const texto = await (await handleIcs(get('/api/reservas/ics?r=ti'), env, d)).text();
  assert.match(texto, /DTEND:20261006T153000Z/);
});

test('reubicar: una cita de 30 min se valida como de 30 (cabe antes de otra que empieza a y media)', async () => {
  const d = deps();
  const ap = await (await apartar(d, { inicio: '2026-10-06T15:00:00Z' })).json();
  await handlePagar(post('/api/reservas/pagar', { ...datos, token: ap.token }), env, d);
  await d.db.prepare("UPDATE reservas SET estado = 'pagada_sin_hora', duracion_min = 30, fin_utc = '2026-10-06T15:30:00Z' WHERE token = ?1").bind(ap.token).run();
  await repo.crearRetencion(d.db, { id: 'otro', token: 'tok2', producto: 'basico', duracion_meses: 1, monto_centimos: 25000, peso_tope: 1, duracion_min: 30,
    nutricionista_id: 'nico', inicio_utc: '2026-10-06T17:30:00Z', fecha_lima: '2026-10-06', modalidad: 'presencial', tope: 300, ahora: d.ahora() });
  const res = await handleReubicar(post('/api/reservas/reubicar', { token: ap.token, modalidad: 'presencial', inicio: '2026-10-06T17:00:00Z', nutricionista: 'nico' }), env, d);
  assert.equal(res.status, 200);
  const r = await repo.reservaPorToken(d.db, ap.token);
  assert.equal(r.estado, 'confirmada');
  assert.equal(r.inicio_utc, '2026-10-06T17:00:00Z');
});

test('sincronizar-calendario: 401 sin token, 200 con token, 503 si Google falla', async () => {
  const envS = { RESUMEN_TOKEN: 'tok', NOTIFICATION_EMAIL: 'equipo@x.pe' };
  const correos = [];
  const base = { db: d1DePrueba(), ahora: () => new Date('2026-10-19T17:00:00Z'), sendEmail: async (m) => { correos.push(m); return true; } };
  const req = (auth) => new Request('https://x.test/api/reservas/sincronizar-calendario', { method: 'POST', headers: auth ? { Authorization: auth } : {} });
  const ok = { ...base, google: { listarCambios: async () => [] } };
  assert.equal((await handleSincronizarCalendario(req(), envS, ok)).status, 401);
  assert.equal((await handleSincronizarCalendario(req('Bearer otro'), envS, ok)).status, 401);
  const r = await handleSincronizarCalendario(req('Bearer tok'), envS, ok);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, aplicados: 0, revisar: 0, fallidos: [] });
  const cae = { ...base, google: { listarCambios: async () => { throw new Error('Google events.list 500'); } } };
  assert.equal((await handleSincronizarCalendario(req('Bearer tok'), envS, cae)).status, 503);
  assert.equal(correos.length, 0);
});

test('sincronizar-calendario: si un evento falla, avisa al equipo', async () => {
  const envS = { RESUMEN_TOKEN: 'tok', NOTIFICATION_EMAIL: 'equipo@x.pe' };
  const correos = [];
  const db = d1DePrueba();
  await db.prepare(`INSERT INTO reservas (id, token, producto, duracion_meses, monto_centimos, peso_tope, nutricionista_id, inicio_utc, fin_utc, duracion_min,
     fecha_lima, modalidad, estado, retencion_hasta, creado_en, actualizado_en, google_event_id)
     VALUES ('r1', 'r1', 'link_c30p', 1, 0, 0, 'jussara', '2026-10-21T15:00:00Z', '2026-10-21T15:30:00Z', 30, '2026-10-21', 'presencial', 'confirmada', NULL, 'x', 'x', 'ev1')`).run();
  const prepareReal = db.prepare.bind(db);
  db.prepare = (sql) => (sql.startsWith('UPDATE reservas SET inicio_utc') ? { bind: () => ({ run: async () => { throw new Error('D1 caído'); } }) } : prepareReal(sql));
  const d = { db, ahora: () => new Date('2026-10-19T17:00:00Z'), sendEmail: async (m) => { correos.push(m); return true; },
    google: { listarCambios: async () => [{ id: 'ev1', borrado: false, reservaId: 'r1', inicio: '2026-10-21T14:00:00Z', fin: '2026-10-21T14:30:00Z', meet: false, ubicacion: true }] } };
  const r = await handleSincronizarCalendario(new Request('https://x.test/', { method: 'POST', headers: { Authorization: 'Bearer tok' } }), envS, d);
  assert.equal(r.status, 200);
  assert.equal(correos.length, 1);
  assert.equal(correos[0].to, 'equipo@x.pe');
  assert.match(correos[0].subject, /Calendario sin sincronizar/);
});

test('sincronizar-calendario: si el correo de alerta falla, la sincronización sigue en 200', async () => {
  const db = d1DePrueba();
  await db.prepare(`INSERT INTO reservas (id, token, producto, duracion_meses, monto_centimos, peso_tope, nutricionista_id, inicio_utc, fin_utc, duracion_min,
     fecha_lima, modalidad, estado, retencion_hasta, creado_en, actualizado_en, google_event_id)
     VALUES ('r1', 'r1', 'link_c30p', 1, 0, 0, 'jussara', '2026-10-21T15:00:00Z', '2026-10-21T15:30:00Z', 30, '2026-10-21', 'presencial', 'confirmada', NULL, 'x', 'x', 'ev1')`).run();
  const prepareReal = db.prepare.bind(db);
  db.prepare = (sql) => (sql.startsWith('UPDATE reservas SET inicio_utc') ? { bind: () => ({ run: async () => { throw new Error('D1 caído'); } }) } : prepareReal(sql));
  const d = { db, ahora: () => new Date('2026-10-19T17:00:00Z'), sendEmail: async () => { throw new Error('Resend caído'); },
    google: { listarCambios: async () => [{ id: 'ev1', borrado: false, reservaId: 'r1', inicio: '2026-10-21T14:00:00Z', fin: '2026-10-21T14:30:00Z', meet: false, ubicacion: true }] } };
  const r = await handleSincronizarCalendario(new Request('https://x.test/', { method: 'POST', headers: { Authorization: 'Bearer tok' } }),
    { RESUMEN_TOKEN: 'tok', NOTIFICATION_EMAIL: 'equipo@x.pe' }, d);
  assert.equal(r.status, 200);
  assert.deepEqual((await r.json()).fallidos, ['ev1']);
});

test('horas: la ventana es de seis semanas (Romi, 2026-10-23): a 5 semanas hay horas; pasado el día 42, no', async () => {
  const d = await (await handleHoras(get('/api/reservas/horas?desde=2026-11-09&modalidad=video&producto=constancia&duracion=3&dias=45'), env, deps())).json();
  assert.equal(d.dias.length, 45);
  const conHoras = d.dias.filter((x) => x.horas.length).map((x) => x.fecha);
  assert.ok(conHoras.includes('2026-11-10'), 'a cinco semanas se ofrece');
  assert.ok(conHoras.every((f) => f <= '2026-11-16'), 'nada después de 42 días');
});

test('apartar con pago mensual: cotiza la cuota y guarda la forma', async () => {
  const d = deps();
  const r = await apartar(d, { forma: 'mensual' });
  const j = await r.json();
  assert.equal(j.monto_centimos, 36000);
  assert.equal(j.forma, 'mensual');
  assert.equal(j.precio_mes_centimos, 44000);
  assert.equal((await repo.reservaPorToken(d.db, j.token)).forma_pago, 'mensual');
  assert.equal((await apartar(deps(), { producto: 'basico', duracion: 1, forma: 'mensual' })).status, 400);
});

test('estado de una reserva mensual: forma_pago y cobros para retomarla', async () => {
  const d = deps();
  const { token } = await (await apartar(d, { forma: 'mensual' })).json();
  const v = await (await handleEstado(get(`/api/reservas/estado?r=${token}`), env, d)).json();
  assert.equal(v.forma_pago, 'mensual');
  assert.equal(v.cobros, 3);
});

test('pagar con pago mensual: pide aceptar la suscripción, crea el plan sin correo y abre Mercado Pago', async () => {
  const d = deps();
  const { token } = await (await apartar(d, { forma: 'mensual' })).json();
  const sin = await handlePagar(post('/api/reservas/pagar', { token, ...datos }), env, d);
  assert.equal(sin.status, 400);
  const r = await handlePagar(post('/api/reservas/pagar', { token, ...datos, acepto_suscripcion: true }), env, d);
  assert.deepEqual(await r.json(), { ok: true, url: 'https://mp/sus' });
  const reserva = await repo.reservaPorToken(d.db, token);
  const s = await sus.porReserva(d.db, reserva.id);
  assert.equal(s.cuota_centimos, 36000);
  assert.equal(s.mp_plan_id, 'plan1');
  assert.equal(s.mp_preapproval_id, null);
  assert.equal(s.dni, '12345678');
  assert.equal(s.email, 'ana@x.pe'); // el correo queda para los recibos
  assert.deepEqual(d.creadas[0], { suscripcionId: s.id, titulo: '2 sesiones al mes · 3 meses · pago mensual', cuotaCentimos: 36000, cobros: 3,
    urlRetorno: `https://www.ajlnutricion.com/reservar/listo/?r=${token}`, numeroPlan: 0 });
});

test('pagar con una penalidad pendiente en ese documento: 409 sin link; el link va al correo del deudor', async () => {
  const enviados = [];
  const d = deps({ sendEmail: async (m) => { enviados.push(m); return true; } });
  await sus.crear(d.db, { id: 'old', token: 'told', producto: 'constancia', duracion_meses: 3, cuota_centimos: 36000, precio_mes_centimos: 44000, penalidad_centimos: 8000,
    estado: 'cancelada', penalidad_estado: 'pendiente', dni: '12345678', email: 'deudor@x.pe', creado_en: t0.toISOString() });
  const { token } = await (await apartar(d)).json();
  const r = await handlePagar(post('/api/reservas/pagar', { token, ...datos }), env, d);
  const j = await r.json();
  assert.equal(r.status, 409);
  assert.equal(j.motivo, 'penalidad');
  assert.equal(j.url, undefined);
  assert.equal(enviados.length, 1);
  assert.equal(enviados[0].to, 'deudor@x.pe');
  assert.match(enviados[0].html, /suscripcion\/cancelar\/\?s=told/);
  assert.equal(j.error, 'Hay un pago pendiente de un plan anterior con este documento. Te enviamos a tu correo cómo resolverlo.');
  assert.doesNotMatch(j.error, /S\//);
  // Un segundo intento dentro de las 24 h responde igual pero no vuelve a mandar el correo.
  const r2 = await handlePagar(post('/api/reservas/pagar', { token, ...datos }), env, d);
  assert.equal(r2.status, 409);
  assert.equal(enviados.length, 1);
});

test('aviso de deuda: como máximo uno cada 24 h por suscripción', async () => {
  const enviados = [];
  let ahora = t0;
  const d = deps({ sendEmail: async (m) => { enviados.push(m); return true; } });
  d.ahora = () => ahora;
  await sus.crear(d.db, { id: 'old', token: 'told', producto: 'constancia', duracion_meses: 3, cuota_centimos: 36000, precio_mes_centimos: 44000, penalidad_centimos: 8000,
    estado: 'cancelada', penalidad_estado: 'pendiente', dni: '12345678', email: 'deudor@x.pe', creado_en: t0.toISOString() });
  const deuda = await sus.porId(d.db, 'old');
  await avisarPenalidadPendiente(d, env, deuda);
  ahora = new Date(t0.getTime() + 23 * 3600000);
  await avisarPenalidadPendiente(d, env, deuda);
  assert.equal(enviados.length, 1);
  ahora = new Date(t0.getTime() + 24 * 3600000);
  await avisarPenalidadPendiente(d, env, deuda);
  assert.equal(enviados.length, 2);
});

test('webhook de suscripción: verifica firma y despacha por tipo', async () => {
  const llamados = [];
  const d = deps({ mp: { obtenerSuscripcion: async (id) => { llamados.push(['pre', id]); return { id, status: 'authorized' }; },
    obtenerCobroSuscripcion: async (id) => { llamados.push(['ap', id]); return { id, preapproval_id: 'nada' }; } } });
  const firmar = (dataId) => {
    const ts = '1700000000';
    const v1 = createHmac('sha256', 'sec').update(`id:${dataId};request-id:rq;ts:${ts};`).digest('hex');
    return { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': 'rq' };
  };
  for (const [type, id] of [['subscription_preapproval', 'pre9'], ['subscription_authorized_payment', '77']]) {
    const r = await handleWebhookMp(post(`/api/reservas/webhook-mp?type=${type}&data.id=${id}`, { type, data: { id } }, firmar(id)), env, d);
    assert.equal(r.status, 200);
  }
  assert.deepEqual(llamados, [['pre', 'pre9'], ['ap', '77'], ['pre', 'nada']]);
  const mal = await handleWebhookMp(post('/api/reservas/webhook-mp?type=subscription_preapproval&data.id=x', {}, { 'x-signature': 'ts=1,v1=00' }), env, d);
  assert.equal(mal.status, 401);
});

test('pagar dos veces la misma reserva mensual: plan nuevo guardado y después se desactiva el viejo', async () => {
  let n = 0;
  let d;
  d = deps({ mp: { crearSuscripcion: async () => ({ planId: `plan${++n}`, init_point: `https://mp/sus${n}` }),
    desactivarPlan: async (id) => {
      d.desactivados.push(id);
      const fila = await d.db.prepare('SELECT mp_plan_id FROM suscripciones').first();
      assert.equal(fila.mp_plan_id, 'plan2'); // el nuevo ya estaba guardado al desactivar el viejo
      return {};
    } } });
  const { token } = await (await apartar(d, { forma: 'mensual' })).json();
  const body = { token, ...datos, acepto_suscripcion: true };
  await handlePagar(post('/api/reservas/pagar', body), env, d);
  const r = await handlePagar(post('/api/reservas/pagar', { ...body, email: 'otra@x.pe' }), env, d);
  assert.deepEqual(await r.json(), { ok: true, url: 'https://mp/sus2' });
  assert.deepEqual(d.desactivados, ['plan1']);
  const s = await sus.porReserva(d.db, (await repo.reservaPorToken(d.db, token)).id);
  assert.equal(s.mp_plan_id, 'plan2');
  assert.equal(s.email, 'otra@x.pe');
});

test('cada reintento de /pagar pide un plan distinto: numeroPlan 0, 1, 2', async () => {
  let n = 0;
  const d = deps({ mp: { crearSuscripcion: async (a) => { d.creadas.push(a); return { planId: `plan${++n}`, init_point: 'https://mp/sus' }; } } });
  const { token } = await (await apartar(d, { forma: 'mensual' })).json();
  const body = { token, ...datos, acepto_suscripcion: true };
  for (let k = 0; k < 3; k++) await handlePagar(post('/api/reservas/pagar', body), env, d);
  assert.deepEqual(d.creadas.map((c) => c.numeroPlan), [0, 1, 2]);
  assert.deepEqual(d.desactivados, ['plan1', 'plan2']);
});

test('pagar de nuevo cuando ya autorizó el plan: 409 esperando_cobro, sin plan nuevo ni cancelar nada', async () => {
  const canceladas = [];
  const d = deps({ mp: { cancelarSuscripcion: async (id) => { canceladas.push(id); return {}; }, obtenerSuscripcion: async (id) => ({ id, status: 'authorized' }) } });
  const { token } = await (await apartar(d, { forma: 'mensual' })).json();
  const body = { token, ...datos, acepto_suscripcion: true };
  await handlePagar(post('/api/reservas/pagar', body), env, d);
  const id = (await sus.porReserva(d.db, (await repo.reservaPorToken(d.db, token)).id)).id;
  await sus.asociarPreapproval(d.db, id, 'pre1', t0);
  const r = await handlePagar(post('/api/reservas/pagar', { ...body, email: 'otra@x.pe' }), env, d);
  assert.equal(r.status, 409);
  assert.deepEqual(await r.json(), { ok: false, motivo: 'esperando_cobro',
    error: 'Ya autorizaste tu pago mensual. Estamos esperando el primer cobro de Mercado Pago; te llega un correo cuando se confirme.' });
  assert.equal(d.creadas.length, 1);
  assert.deepEqual(canceladas, []);
  assert.deepEqual(d.desactivados, []);
  const s = await sus.porId(d.db, id);
  assert.equal(s.mp_preapproval_id, 'pre1');
  assert.equal(s.email, 'ana@x.pe');
});

test('pagar de nuevo con crearSuscripcion fallando: 503, no se desactiva nada y la fila conserva el plan anterior', async () => {
  let n = 0;
  const d = deps({ mp: { crearSuscripcion: async () => { if (++n === 2) throw new Error('MP caído'); return { planId: 'plan1', init_point: 'https://mp/sus1' }; } } });
  const { token } = await (await apartar(d, { forma: 'mensual' })).json();
  const body = { token, ...datos, acepto_suscripcion: true };
  assert.equal((await handlePagar(post('/api/reservas/pagar', body), env, d)).status, 200);
  assert.equal((await handlePagar(post('/api/reservas/pagar', body), env, d)).status, 503);
  assert.deepEqual(d.desactivados, []);
  assert.equal((await sus.porReserva(d.db, (await repo.reservaPorToken(d.db, token)).id)).mp_plan_id, 'plan1');
});

test('estado de una reserva mensual sin preapproval_id: con sync busca por el plan y confirma; sin sync no consulta', async () => {
  const consultas = [];
  const d = deps({ mp: {
    buscarSuscripcionDePlan: async (id) => { consultas.push(id); return { id: 'pre1', status: 'authorized', preapproval_plan_id: id }; },
    buscarCobrosSuscripcion: async () => [{ id: 'a1' }],
    obtenerCobroSuscripcion: async (id) => ({ id, preapproval_id: 'pre1', status: 'processed', transaction_amount: 360, payment: { id: 'p1' } }),
    obtenerSuscripcion: async (id) => ({ id, status: 'authorized', preapproval_plan_id: 'plan1' }),
  } });
  d.pagos.p1 = { id: 'p1', status: 'approved', transaction_amount: 360, currency_id: 'PEN', payment_method_id: 'visa' };
  const { token } = await (await apartar(d, { forma: 'mensual' })).json();
  await handlePagar(post('/api/reservas/pagar', { token, ...datos, acepto_suscripcion: true }), env, d);
  await handleEstado(get(`/api/reservas/estado?r=${token}`), env, d);
  assert.deepEqual(consultas, []);
  const v = await (await handleEstado(get(`/api/reservas/estado?r=${token}&sync=1`), env, d)).json();
  assert.deepEqual(consultas, ['plan1']);
  assert.equal(v.estado, 'confirmada');
  assert.equal((await sus.porReserva(d.db, (await repo.reservaPorToken(d.db, token)).id)).mp_preapproval_id, 'pre1');
});

test('pagar con una suscripción ya activa para esa reserva: 409 y no se crea otra en Mercado Pago', async () => {
  const d = deps();
  const { token } = await (await apartar(d, { forma: 'mensual' })).json();
  const reserva = await repo.reservaPorToken(d.db, token);
  await sus.crear(d.db, { id: 'sx', token: 'tsx', reserva_id: reserva.id, producto: 'constancia', duracion_meses: 3, cuota_centimos: 36000,
    precio_mes_centimos: 44000, estado: 'activa', mp_preapproval_id: 'preX', creado_en: t0.toISOString() });
  const r = await handlePagar(post('/api/reservas/pagar', { token, ...datos, acepto_suscripcion: true }), env, d);
  assert.equal(r.status, 409);
  assert.equal((await r.json()).motivo, 'suscripcion_existente');
  assert.equal(d.creadas.length, 0);
});

test('pagar de nuevo con el preapproval guardado sin autorizar: plan nuevo, se suelta y cancela el viejo', async () => {
  let n = 0;
  const canceladas = [];
  const d = deps({ mp: { crearSuscripcion: async () => ({ planId: `plan${++n}`, init_point: `https://mp/sus${n}` }),
    obtenerSuscripcion: async (id) => ({ id, status: 'pending' }), cancelarSuscripcion: async (id) => { canceladas.push(id); return {}; } } });
  const { token } = await (await apartar(d, { forma: 'mensual' })).json();
  const body = { token, ...datos, acepto_suscripcion: true };
  await handlePagar(post('/api/reservas/pagar', body), env, d);
  const id = (await sus.porReserva(d.db, (await repo.reservaPorToken(d.db, token)).id)).id;
  await sus.asociarPreapproval(d.db, id, 'pre1', t0);
  assert.deepEqual(await (await handlePagar(post('/api/reservas/pagar', body), env, d)).json(), { ok: true, url: 'https://mp/sus2' });
  assert.deepEqual(canceladas, ['pre1']);
  assert.deepEqual(d.desactivados, ['plan1']);
  assert.equal((await sus.suscripcionDePlan(d.db, 'plan1')).id, id); // el preapproval soltado es de un plan reemplazado
  const s = await sus.porId(d.db, id);
  assert.equal(s.mp_plan_id, 'plan2');
  assert.equal(s.mp_preapproval_id, null);
});

test('pagar de nuevo con plan guardado y sin preapproval: si el plan ya tiene una suscripción autorizada, 409 esperando_cobro y no se crea otro plan', async () => {
  const buscadas = [];
  const d = deps({ mp: { buscarSuscripcionDePlan: async (id) => { buscadas.push(id); return { id: 'pre1', status: 'authorized' }; } } });
  const { token } = await (await apartar(d, { forma: 'mensual' })).json();
  const body = { token, ...datos, acepto_suscripcion: true };
  assert.equal((await handlePagar(post('/api/reservas/pagar', body), env, d)).status, 200);
  const r = await handlePagar(post('/api/reservas/pagar', body), env, d);
  assert.equal(r.status, 409);
  assert.deepEqual(await r.json(), { ok: false, motivo: 'esperando_cobro',
    error: 'Ya autorizaste tu pago mensual. Estamos esperando el primer cobro de Mercado Pago; te llega un correo cuando se confirme.' });
  assert.deepEqual(buscadas, ['plan1']);
  assert.equal(d.creadas.length, 1);
  assert.deepEqual(d.desactivados, []);
});

test('pagar de nuevo con plan guardado y sin preapproval: si el plan no tiene suscripción autorizada, plan nuevo como siempre', async () => {
  let n = 0;
  const d = deps({ mp: { crearSuscripcion: async () => ({ planId: `plan${++n}`, init_point: `https://mp/sus${n}` }), buscarSuscripcionDePlan: async () => ({ id: 'pre1', status: 'pending' }) } });
  const { token } = await (await apartar(d, { forma: 'mensual' })).json();
  const body = { token, ...datos, acepto_suscripcion: true };
  await handlePagar(post('/api/reservas/pagar', body), env, d);
  assert.deepEqual(await (await handlePagar(post('/api/reservas/pagar', body), env, d)).json(), { ok: true, url: 'https://mp/sus2' });
  assert.deepEqual(d.desactivados, ['plan1']);
});

test('apartar con pago mensual y el interruptor apagado: 400; el pago completo sigue igual', async () => {
  for (const apagado of [{}, { SUSCRIPCIONES_ABIERTAS: '0' }, { SUSCRIPCIONES_ABIERTAS: 'true' }]) {
    const e = { ...env, SUSCRIPCIONES_ABIERTAS: undefined, ...apagado };
    const r = await handleApartar(post('/api/reservas/apartar', { producto: 'constancia', duracion: 3, modalidad: 'presencial', inicio: '2026-10-06T17:00:00Z', forma: 'mensual' }), e, deps());
    assert.equal(r.status, 400);
    assert.equal((await r.json()).error, 'El pago mensual todavía no está disponible.');
    const ok = await handleApartar(post('/api/reservas/apartar', { producto: 'constancia', duracion: 3, modalidad: 'presencial', inicio: '2026-10-06T17:00:00Z' }), e, deps());
    assert.equal(ok.status, 200);
  }
});

test('apartar con el producto interno prueba desde la web: 400, aunque el pago mensual esté abierto', async () => {
  const r = await apartar(deps(), { producto: 'prueba', duracion: 3, forma: 'mensual' });
  assert.equal(r.status, 400);
});

test('opciones: dice si el pago mensual está abierto solo con "1"', async () => {
  const pide = async (e) => (await handleOpciones(get('/api/reservas/opciones'), e)).json();
  assert.deepEqual(await pide({ SUSCRIPCIONES_ABIERTAS: '1' }), { ok: true, suscripciones: true });
  assert.deepEqual(await pide({}), { ok: true, suscripciones: false });
  assert.deepEqual(await pide({ SUSCRIPCIONES_ABIERTAS: 'true' }), { ok: true, suscripciones: false });
  assert.equal((await handleOpciones(post('/api/reservas/opciones', {}), {})).status, 405);
});

test('pagar de nuevo y no se puede revisar el preapproval guardado: 503 sin tocar nada', async () => {
  const d = deps({ mp: { obtenerSuscripcion: async () => { throw new Error('caído'); } } });
  const { token } = await (await apartar(d, { forma: 'mensual' })).json();
  const body = { token, ...datos, acepto_suscripcion: true };
  await handlePagar(post('/api/reservas/pagar', body), env, d);
  const id = (await sus.porReserva(d.db, (await repo.reservaPorToken(d.db, token)).id)).id;
  await sus.asociarPreapproval(d.db, id, 'pre1', t0);
  const r = await handlePagar(post('/api/reservas/pagar', body), env, d);
  assert.equal(r.status, 503);
  assert.equal((await r.json()).error, 'No pudimos revisar tu pago. Intenta en unos minutos.');
  assert.equal(d.creadas.length, 1);
  assert.equal((await sus.porId(d.db, id)).mp_preapproval_id, 'pre1');
});

test('webhook payment de un cobro de suscripción (metadata.preapproval_id): revisa los cobros y cuenta uno solo', async () => {
  const enviados = [];
  const cobros = { a1: { id: 'a1', preapproval_id: 'pre1', status: 'scheduled', transaction_amount: 5 } };
  const pagos = { p1: { id: 'p1', status: 'approved', external_reference: 'sin-reserva', metadata: { preapproval_id: 'pre1' }, payment_method_id: 'visa' } };
  const d = deps({ sendEmail: async (m) => { enviados.push(m); return true; }, mp: {
    obtenerPago: async (id) => pagos[id], obtenerCobroSuscripcion: async (id) => cobros[id],
    buscarCobrosSuscripcion: async () => Object.values(cobros) } });
  await sus.crear(d.db, { id: 's1', token: 'ts', producto: 'prueba', duracion_meses: 3, cuota_centimos: 500, precio_mes_centimos: 500, estado: 'pendiente',
    nombre: 'Yo', email: 'yo@x.pe', mp_preapproval_id: 'pre1', creado_en: t0.toISOString() });
  const { procesarCobro } = await import('../suscripciones/procesar.mjs');
  await procesarCobro(d, env, 'a1'); // aviso del cobro programado, sin payment.id
  cobros.a1 = { ...cobros.a1, status: 'processed', payment: { id: 'p1' } };
  const v1 = createHmac('sha256', 'sec').update('id:p1;request-id:q;ts:9;').digest('hex');
  const llamar = () => handleWebhookMp(post('/api/reservas/webhook-mp?type=payment&data.id=p1', { type: 'payment', data: { id: 'p1' } }, { 'x-signature': `ts=9,v1=${v1}`, 'x-request-id': 'q' }), env, d);
  assert.equal((await llamar()).status, 200);
  assert.equal((await llamar()).status, 200);
  const s = await sus.porId(d.db, 's1');
  assert.equal(s.cobros_aprobados, 1);
  assert.equal(s.estado, 'activa');
  assert.equal(enviados.filter((m) => /Recibimos tu pago/.test(m.subject)).length, 1);
});
