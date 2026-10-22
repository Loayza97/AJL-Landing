import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeReservasDeps } from './deps.mjs';

const env = { DB: {}, RESEND_API_KEY: 'x' };

test('enSegundoPlano usa ctx.waitUntil cuando el contexto lo trae (Pages Functions)', () => {
  const programadas = [];
  const ctx = { waitUntil: (p) => programadas.push(p) };
  const deps = makeReservasDeps(env, ctx);
  const p = Promise.resolve('ok');
  deps.enSegundoPlano(p);
  assert.deepEqual(programadas, [p]);
});

test('enSegundoPlano sin contexto (tests u otros runtimes): no lanza, deja correr la promesa', async () => {
  const deps = makeReservasDeps(env);
  const p = Promise.resolve('ok');
  assert.equal(await deps.enSegundoPlano(p), 'ok');
});
