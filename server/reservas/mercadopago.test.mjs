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

test('crearSuscripcion: mensual en soles, pendiente, con fin y referencia', async () => {
  let pedido;
  const f = async (url, init) => { pedido = { url, init }; return new Response(JSON.stringify({ id: 'pre1', init_point: 'https://mp/sus' })); };
  const mp = crearMp({ MP_ACCESS_TOKEN: 'TEST-1' }, f);
  const r = await mp.crearSuscripcion({ suscripcionId: 's1', titulo: '2 sesiones al mes · 3 meses · pago mensual', cuotaCentimos: 36000,
    email: 'a@x.pe', urlRetorno: 'https://w/reservar/listo/?r=t', finEn: '2027-01-18T15:00:00.000Z' });
  assert.deepEqual(r, { id: 'pre1', init_point: 'https://mp/sus' });
  assert.equal(pedido.url, 'https://api.mercadopago.com/preapproval');
  assert.equal(pedido.init.method, 'POST');
  assert.equal(pedido.init.headers['X-Idempotency-Key'], 'sus-s1');
  const c = JSON.parse(pedido.init.body);
  assert.equal(c.reason, 'AJL Nutrición · 2 sesiones al mes · 3 meses · pago mensual');
  assert.equal(c.external_reference, 's1');
  assert.equal(c.payer_email, 'a@x.pe');
  assert.equal(c.back_url, 'https://w/reservar/listo/?r=t');
  assert.equal(c.status, 'pending');
  assert.deepEqual(c.auto_recurring, { frequency: 1, frequency_type: 'months', transaction_amount: 360, currency_id: 'PEN', end_date: '2027-01-18T15:00:00.000Z' });
});

test('crearSuscripcion de mes a mes va sin end_date', async () => {
  let cuerpo;
  const mp = crearMp({ MP_ACCESS_TOKEN: 'T' }, async (u, i) => { cuerpo = JSON.parse(i.body); return new Response('{"id":"p","init_point":"u"}'); });
  await mp.crearSuscripcion({ suscripcionId: 's', titulo: 't', cuotaCentimos: 44000, email: 'a@x.pe', urlRetorno: 'u', finEn: null });
  assert.equal('end_date' in cuerpo.auto_recurring, false);
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
  await assert.rejects(mp.crearSuscripcion({ suscripcionId: 's', titulo: 't', cuotaCentimos: 1, email: 'a@x.pe', urlRetorno: 'u', finEn: null }), /400/);
});
