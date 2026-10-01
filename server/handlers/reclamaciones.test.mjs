import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleReclamaciones } from './reclamaciones.mjs';

const intocable = {
  db: { rpc() { throw new Error('no debía tocar la base'); }, from() { throw new Error('no debía tocar la base'); } },
  sendEmail() { throw new Error('no debía mandar correo'); },
};
const post = (body) => new Request('https://x.test/api/reclamaciones', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '9.9.9.9' }, body,
});
const valido = {
  nombre: ' Ana Pérez ', dni: '12345678', email: 'ANA@test.pe', tipo: 'reclamo',
  detalle: 'detalle', pedido: 'pedido', consentimiento: true,
};

test('GET → 405', async () => {
  const r = await handleReclamaciones(new Request('https://x.test/api/reclamaciones'), {}, intocable);
  assert.equal(r.status, 405);
});

test('cuerpo no JSON → 400 con error', async () => {
  const r = await handleReclamaciones(post('no es json'), {}, intocable);
  assert.equal(r.status, 400);
  assert.equal((await r.json()).ok, false);
});

test('menor de edad sin apoderado → 400', async () => {
  const r = await handleReclamaciones(post(JSON.stringify({ ...valido, edad: '15' })), {}, intocable);
  assert.equal(r.status, 400);
});

test('sin consentimiento → 400', async () => {
  const r = await handleReclamaciones(post(JSON.stringify({ ...valido, consentimiento: false })), {}, intocable);
  assert.equal(r.status, 400);
});

test('válido: guarda, manda 2 correos y devuelve el correlativo', async () => {
  let fila; const correos = [];
  const deps = {
    db: {
      rpc: async () => ({ data: 'AJL-2026-0007', error: null }),
      from: () => ({ insert: (f) => { fila = f; return { select: () => ({ single: async () =>
        ({ data: { correlativo: 'AJL-2026-0007', fecha_creacion: '2026-09-28T15:00:00Z' }, error: null }) }) }; } }),
    },
    sendEmail: async (m) => { correos.push(m); return true; },
  };
  const env = { FROM_EMAIL: 'reclamos@ajlnutricion.com', NOTIFICATION_EMAIL: 'asesor@ajlnutricion.com' };
  const r = await handleReclamaciones(post(JSON.stringify(valido)), env, deps);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).correlativo, 'AJL-2026-0007');
  assert.equal(fila.consumidor_nombre, 'Ana Pérez');
  assert.equal(fila.consumidor_email, 'ana@test.pe');
  assert.equal(fila.ip_origen, '9.9.9.9');
  assert.deepEqual(correos.map((c) => c.to).sort(), ['ana@test.pe', 'asesor@ajlnutricion.com']);
  assert.ok(correos.every((c) => c.from === 'reclamos@ajlnutricion.com'));
});
