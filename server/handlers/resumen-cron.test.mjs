import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { dispararResumen, dispararSincronizacion } from '../../workers/resumen-cron/index.js';

test('el cron hace POST con el token y falla si la web responde error', async () => {
  let pedido;
  const ok = async (url, init) => { pedido = { url, init }; return new Response('{}', { status: 200 }); };
  const env = { RESUMEN_URL: 'https://www.ajlnutricion.com/api/reservas/resumen-diario', RESUMEN_TOKEN: 'tok' };
  assert.equal(await dispararResumen(env, ok), 200);
  assert.equal(pedido.init.method, 'POST');
  assert.equal(pedido.init.headers.Authorization, 'Bearer tok');
  await assert.rejects(dispararResumen(env, async () => new Response('', { status: 503 })), /503/);
});

test('el cron de 10 min llama a la sincronización con el token', async () => {
  let pedido;
  const env = { SYNC_URL: 'https://www.ajlnutricion.com/api/reservas/sincronizar-calendario', RESUMEN_TOKEN: 'tok' };
  assert.equal(await dispararSincronizacion(env, async (url, init) => { pedido = { url, init }; return new Response('{}', { status: 200 }); }), 200);
  assert.equal(pedido.url, env.SYNC_URL);
  assert.equal(pedido.init.headers.Authorization, 'Bearer tok');
  await assert.rejects(dispararSincronizacion(env, async () => new Response('', { status: 503 })), /503/);
});

test('scheduled elige la tarea según el cron', async () => {
  const llamadas = [];
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = async (url) => { llamadas.push(String(url)); return new Response('{}', { status: 200 }); };
  try {
    const env = { RESUMEN_URL: 'https://r', SYNC_URL: 'https://s', RESUMEN_TOKEN: 'tok' };
    const promesas = [];
    const ctx = { waitUntil: (p) => promesas.push(p) };
    worker.scheduled({ cron: '0 13 * * *' }, env, ctx);
    worker.scheduled({ cron: '*/10 * * * *' }, env, ctx);
    await Promise.all(promesas);
    assert.deepEqual(llamadas, ['https://r', 'https://s']);
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});
