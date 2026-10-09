import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dispararResumen } from '../../workers/resumen-cron/index.js';

test('el cron hace POST con el token y falla si la web responde error', async () => {
  let pedido;
  const ok = async (url, init) => { pedido = { url, init }; return new Response('{}', { status: 200 }); };
  const env = { RESUMEN_URL: 'https://www.ajlnutricion.com/api/reservas/resumen-diario', RESUMEN_TOKEN: 'tok' };
  assert.equal(await dispararResumen(env, ok), 200);
  assert.equal(pedido.init.method, 'POST');
  assert.equal(pedido.init.headers.Authorization, 'Bearer tok');
  await assert.rejects(dispararResumen(env, async () => new Response('', { status: 503 })), /503/);
});
