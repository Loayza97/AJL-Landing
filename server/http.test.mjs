import { test } from 'node:test';
import assert from 'node:assert/strict';
import { json, empty, redirect, readJson, siteUrl, clientIp } from './http.mjs';

const post = (body, type = 'application/json') =>
  new Request('https://x.test/api', { method: 'POST', headers: { 'Content-Type': type }, body });

test('json pone status, content-type y no-store', async () => {
  const r = json(400, { ok: false });
  assert.equal(r.status, 400);
  assert.match(r.headers.get('Content-Type'), /application\/json/);
  assert.equal(r.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await r.json(), { ok: false });
});

test('empty no lleva cuerpo', async () => {
  const r = empty(204);
  assert.equal(r.status, 204);
  assert.equal(await r.text(), '');
});

test('redirect arma Location con el sitio', () => {
  const r = redirect('https://www.ajlnutricion.com', '/newsletter/baja/?estado=ok');
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('Location'), 'https://www.ajlnutricion.com/newsletter/baja/?estado=ok');
});

test('readJson parsea JSON aunque venga como text/plain (sendBeacon)', async () => {
  assert.deepEqual(await readJson(post('{"a":1}', 'text/plain')), { a: 1 });
});

test('readJson devuelve {} ante cuerpo vacío, inválido o no-objeto', async () => {
  assert.deepEqual(await readJson(post('')), {});
  assert.deepEqual(await readJson(post('no es json')), {});
  assert.deepEqual(await readJson(post('[1,2]')), {});
  assert.deepEqual(await readJson(post('null')), {});
});

test('siteUrl quita la barra final y tiene default', () => {
  assert.equal(siteUrl({ PUBLIC_SITE_URL: 'https://a.test/' }), 'https://a.test');
  assert.equal(siteUrl({}), 'https://www.ajlnutricion.com');
});

test('clientIp prefiere CF-Connecting-IP y cae a x-forwarded-for', () => {
  const a = new Request('https://x.test', { headers: { 'CF-Connecting-IP': '1.1.1.1', 'x-forwarded-for': '2.2.2.2' } });
  const b = new Request('https://x.test', { headers: { 'x-forwarded-for': '3.3.3.3, 4.4.4.4' } });
  const c = new Request('https://x.test');
  assert.equal(clientIp(a), '1.1.1.1');
  assert.equal(clientIp(b), '3.3.3.3');
  assert.equal(clientIp(c), null);
});
