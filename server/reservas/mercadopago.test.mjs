import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { crearMp, firmaValida, isoLima } from './mercadopago.mjs';

test('isoLima escribe la hora de Lima con su desfase', () => {
  assert.equal(isoLima(new Date('2026-10-06T17:30:00Z')), '2026-10-06T12:30:00.000-05:00');
});

test('crearPreferencia: un ítem en soles, una cuota, sin efectivo, con vencimiento y retorno', async () => {
  let pedido;
  const f = async (url, init) => { pedido = { url, init }; return new Response(JSON.stringify({ id: 'pref1', init_point: 'https://mp/pay' })); };
  const mp = crearMp({ MP_ACCESS_TOKEN: 'TEST-1' }, f);
  const r = await mp.crearPreferencia({ reservaId: 'r1', titulo: '2 sesiones al mes · 3 meses', montoCentimos: 108000, email: 'a@x.pe',
    nombre: 'Ana', venceEn: new Date('2026-10-05T15:30:00Z'), ahora: new Date('2026-10-05T15:00:00Z'), urlRetorno: 'https://w/reservar/listo/?r=t',
    urlNotificacion: 'https://w/api/reservas/webhook-mp' });
  assert.deepEqual(r, { id: 'pref1', init_point: 'https://mp/pay' });
  assert.equal(pedido.url, 'https://api.mercadopago.com/checkout/preferences');
  assert.equal(pedido.init.headers.Authorization, 'Bearer TEST-1');
  const c = JSON.parse(pedido.init.body);
  assert.deepEqual(c.items, [{ id: 'r1', title: '2 sesiones al mes · 3 meses', quantity: 1, unit_price: 1080, currency_id: 'PEN' }]);
  assert.equal(c.external_reference, 'r1');
  // Sin payer: el correo del paciente no debe atar el pago a su cuenta de Mercado Pago.
  assert.equal(c.payer, undefined);
  assert.equal(c.notification_url, 'https://w/api/reservas/webhook-mp');
  assert.deepEqual(c.payment_methods, { excluded_payment_types: [{ id: 'ticket' }, { id: 'atm' }], installments: 12 });
  assert.equal(c.expires, true);
  assert.equal(c.expiration_date_to, '2026-10-05T10:30:00.000-05:00');
  assert.equal(c.back_urls.success, 'https://w/reservar/listo/?r=t');
  assert.equal(c.auto_return, 'approved');
});

test('crearPreferencia lanza si MP responde error', async () => {
  const mp = crearMp({ MP_ACCESS_TOKEN: 'x' }, async () => new Response('{"message":"bad"}', { status: 400 }));
  await assert.rejects(mp.crearPreferencia({ reservaId: 'r', titulo: 't', montoCentimos: 100, email: 'a@x.pe', nombre: 'A',
    venceEn: new Date(), ahora: new Date(), urlRetorno: 'u' }), /Mercado Pago 400/);
});

test('firmaValida acepta la firma correcta y rechaza la alterada o ausente', async () => {
  const secreto = 'secreto-webhook';
  const manifiesto = 'id:123456;request-id:req-1;ts:1700000000;';
  const v1 = createHmac('sha256', secreto).update(manifiesto).digest('hex');
  const base = { xRequestId: 'req-1', dataId: '123456', secreto };
  assert.equal(await firmaValida({ ...base, xSignature: `ts=1700000000,v1=${v1}` }), true);
  assert.equal(await firmaValida({ ...base, xSignature: `ts=1700000000,v1=${'0'.repeat(64)}` }), false);
  assert.equal(await firmaValida({ ...base, xSignature: null }), false);
  assert.equal(await firmaValida({ ...base, dataId: '999', xSignature: `ts=1700000000,v1=${v1}` }), false);
});

test('crearSuscripcion: crea un plan mensual en soles, sin correo, con la key del número de plan', async () => {
  let pedido;
  const f = async (url, init) => { pedido = { url, init }; return new Response(JSON.stringify({ id: 'plan1', init_point: 'https://mp/plan', status: 'active' })); };
  const mp = crearMp({ MP_ACCESS_TOKEN: 'TEST-1' }, f);
  const r = await mp.crearSuscripcion({ suscripcionId: 's1', titulo: '2 sesiones al mes · 3 meses · pago mensual', cuotaCentimos: 36000,
    cobros: 3, urlRetorno: 'https://w/reservar/listo/?r=t' });
  assert.deepEqual(r, { planId: 'plan1', init_point: 'https://mp/plan' });
  assert.equal(pedido.init.headers['X-Idempotency-Key'], 'plan-s1-0');
  assert.equal(pedido.url, 'https://api.mercadopago.com/preapproval_plan');
  assert.equal(pedido.init.method, 'POST');
  assert.equal(pedido.init.headers.Authorization, 'Bearer TEST-1');
  assert.deepEqual(JSON.parse(pedido.init.body), {
    reason: 'AJL Nutrición · 2 sesiones al mes · 3 meses · pago mensual', back_url: 'https://w/reservar/listo/?r=t',
    auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: 360, currency_id: 'PEN', repetitions: 3 },
  });
  assert.doesNotMatch(pedido.init.body, /payer_email|email/);
  await mp.crearSuscripcion({ suscripcionId: 's1', titulo: 't', cuotaCentimos: 36000, cobros: 3, urlRetorno: 'https://w/reservar/listo/?r=t', numeroPlan: 1 });
  assert.equal(pedido.init.headers['X-Idempotency-Key'], 'plan-s1-1'); // reintento de pago: otro plan
});

test('crearSuscripcion de mes a mes va sin repetitions', async () => {
  let cuerpo;
  const mp = crearMp({ MP_ACCESS_TOKEN: 'T' }, async (u, i) => { cuerpo = JSON.parse(i.body); return new Response('{"id":"p","init_point":"u"}'); });
  await mp.crearSuscripcion({ suscripcionId: 's', titulo: 't', cuotaCentimos: 44000, cobros: null, urlRetorno: 'u' });
  assert.deepEqual(cuerpo.auto_recurring, { frequency: 1, frequency_type: 'months', transaction_amount: 440, currency_id: 'PEN' });
});

test('buscarSuscripcionDePlan devuelve el primer preapproval del plan, o null', async () => {
  const pedidos = [];
  let results = [{ id: 'pre2' }, { id: 'pre1' }];
  const mp = crearMp({ MP_ACCESS_TOKEN: 'T' }, async (url, init = {}) => { pedidos.push([init.method || 'GET', url]); return new Response(JSON.stringify({ results })); });
  assert.deepEqual(await mp.buscarSuscripcionDePlan('plan 1'), { id: 'pre2' });
  results = [];
  assert.equal(await mp.buscarSuscripcionDePlan('plan1'), null);
  assert.deepEqual(pedidos[0], ['GET', 'https://api.mercadopago.com/preapproval/search?preapproval_plan_id=plan%201']);
});

test('desactivarPlan cancela el plan para que su link no sirva de nuevo', async () => {
  let pedido;
  const mp = crearMp({ MP_ACCESS_TOKEN: 'T' }, async (url, init) => { pedido = [init.method, url, init.body]; return new Response('{"id":"plan1","status":"cancelled"}'); });
  await mp.desactivarPlan('plan1');
  assert.deepEqual(pedido, ['PUT', 'https://api.mercadopago.com/preapproval_plan/plan1', '{"status":"cancelled"}']);
});

test('cancelar, obtener y buscar cobros usan las rutas de suscripción', async () => {
  const pedidos = [];
  const f = async (url, init = {}) => { pedidos.push([init.method || 'GET', url, init.body]); return new Response(JSON.stringify(url.includes('search') ? { results: [{ id: 7 }] } : { id: 'x' })); };
  const mp = crearMp({ MP_ACCESS_TOKEN: 'T' }, f);
  await mp.cancelarSuscripcion('pre1');
  await mp.obtenerSuscripcion('pre1');
  await mp.obtenerCobroSuscripcion('77');
  assert.deepEqual(await mp.buscarCobrosSuscripcion('pre1'), [{ id: 7 }]);
  assert.deepEqual(pedidos, [
    ['PUT', 'https://api.mercadopago.com/preapproval/pre1', '{"status":"cancelled"}'],
    ['GET', 'https://api.mercadopago.com/preapproval/pre1', undefined],
    ['GET', 'https://api.mercadopago.com/authorized_payments/77', undefined],
    ['GET', 'https://api.mercadopago.com/authorized_payments/search?preapproval_id=pre1', undefined],
  ]);
});

test('las llamadas de suscripción lanzan si Mercado Pago responde error', async () => {
  const mp = crearMp({ MP_ACCESS_TOKEN: 'T' }, async () => new Response('no', { status: 400 }));
  await assert.rejects(mp.cancelarSuscripcion('p'), /Mercado Pago suscripción 400/);
  await assert.rejects(mp.crearSuscripcion({ suscripcionId: 's', titulo: 't', cuotaCentimos: 1, cobros: null, urlRetorno: 'u' }), /400/);
  await assert.rejects(mp.desactivarPlan('p'), /400/);
});
