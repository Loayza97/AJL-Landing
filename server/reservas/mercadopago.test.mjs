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
    nombre: 'Ana', venceEn: new Date('2026-10-05T15:30:00Z'), ahora: new Date('2026-10-05T15:00:00Z'), urlRetorno: 'https://w/reservar/listo/?r=t' });
  assert.deepEqual(r, { id: 'pref1', init_point: 'https://mp/pay' });
  assert.equal(pedido.url, 'https://api.mercadopago.com/checkout/preferences');
  assert.equal(pedido.init.headers.Authorization, 'Bearer TEST-1');
  const c = JSON.parse(pedido.init.body);
  assert.deepEqual(c.items, [{ id: 'r1', title: '2 sesiones al mes · 3 meses', quantity: 1, unit_price: 1080, currency_id: 'PEN' }]);
  assert.equal(c.external_reference, 'r1');
  assert.deepEqual(c.payment_methods, { excluded_payment_types: [{ id: 'ticket' }, { id: 'atm' }], installments: 1 });
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
