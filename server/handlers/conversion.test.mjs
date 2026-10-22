import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleConversion } from './conversion.mjs';

const intocable = { from() { throw new Error('no debía tocar la base'); } };
const req = (method, body, type = 'application/json') =>
  new Request('https://x.test/api/conversion', { method, headers: { 'Content-Type': type }, body });

function dbFalsa(error = null) {
  const filas = [];
  return { filas, from: (t) => ({ insert: async (fila) => { filas.push([t, fila]); return { error }; } }) };
}

test('GET → 405', async () => {
  const r = await handleConversion(req('GET'), {}, { db: intocable });
  assert.equal(r.status, 405);
});

test('OPTIONS → 204', async () => {
  const r = await handleConversion(req('OPTIONS'), {}, { db: intocable });
  assert.equal(r.status, 204);
});

test('cuerpo como texto (sendBeacon) inválido → 400 sin tocar la base', async () => {
  const r = await handleConversion(req('POST', 'basura', 'text/plain'), {}, { db: intocable });
  assert.equal(r.status, 400);
});

test('whatsapp_click válido se guarda recortado y sin query → 204', async () => {
  const db = dbFalsa();
  const cuerpo = JSON.stringify({
    evento: 'whatsapp_click', seccion: ' hero ', paquete: 'constancia',
    utm_source: 'x'.repeat(200), path: '/checkout/constancia/?fbclid=abc', extra: 'descartar',
  });
  const r = await handleConversion(req('POST', cuerpo, 'text/plain'), {}, { db });
  assert.equal(r.status, 204);
  const [tabla, fila] = db.filas[0];
  assert.equal(tabla, 'conversiones');
  assert.equal(fila.seccion, 'hero');
  assert.equal(fila.utm_source.length, 120);
  assert.equal(fila.path, '/checkout/constancia/');
  assert.equal(fila.extra, undefined);
});

test('error de la base → 500', async () => {
  const r = await handleConversion(req('POST', '{"evento":"whatsapp_click"}'), {}, { db: dbFalsa({ message: 'x' }) });
  assert.equal(r.status, 500);
});
