import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dispararResumen, dispararTodo } from '../../workers/resumen-cron/index.js';

test('el cron hace POST con el token y falla si la web responde error', async () => {
  let pedido;
  const ok = async (url, init) => { pedido = { url, init }; return new Response('{}', { status: 200 }); };
  const env = { RESUMEN_URL: 'https://www.ajlnutricion.com/api/reservas/resumen-diario', RESUMEN_TOKEN: 'tok' };
  assert.equal(await dispararResumen(env, ok), 200);
  assert.equal(pedido.init.method, 'POST');
  assert.equal(pedido.init.headers.Authorization, 'Bearer tok');
  await assert.rejects(dispararResumen(env, async () => new Response('', { status: 503 })), /503/);
});

test('el cron dispara el resumen y el respaldo; si uno falla, el otro igual corre y la falla se ve', async () => {
  const urls = [];
  const env = { RESUMEN_URL: 'https://w/resumen', BARRIDO_URL: 'https://w/barrido', RESUMEN_TOKEN: 'tok' };
  await dispararTodo(env, async (url) => { urls.push(url); return new Response('{}', { status: 200 }); });
  assert.deepEqual(urls.sort(), ['https://w/barrido', 'https://w/resumen']);
  urls.length = 0;
  await assert.rejects(dispararTodo(env, async (url) => { urls.push(url); return new Response('', { status: url.endsWith('resumen') ? 503 : 200 }); }), /resumen respondió 503/);
  assert.equal(urls.length, 2);
});
