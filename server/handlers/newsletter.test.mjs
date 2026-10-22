import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleSubscribe, handleConfirm, handleUnsubscribe } from './newsletter.mjs';

const intocable = {
  db: { from() { throw new Error('no debía tocar la base'); } },
  sendEmail() { throw new Error('no debía mandar correo'); },
};
const env = { PUBLIC_SITE_URL: 'https://www.ajlnutricion.com', NEWSLETTER_FROM: 'AJL <hola@ajlnutricion.com>' };
const post = (body) => new Request('https://x.test/api/newsletter', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
});

test('alta: GET → 405', async () => {
  assert.equal((await handleSubscribe(new Request('https://x.test/api/newsletter'), env, intocable)).status, 405);
});

test('alta: honeypot lleno → 200 sin tocar nada', async () => {
  const r = await handleSubscribe(post('{"website":"bot","email":"a@b.pe","consent":true}'), env, intocable);
  assert.equal(r.status, 200);
});

test('alta: cuerpo no JSON → 400', async () => {
  assert.equal((await handleSubscribe(post('basura'), env, intocable)).status, 400);
});

test('alta: sin consentimiento → 400', async () => {
  assert.equal((await handleSubscribe(post('{"email":"a@b.pe"}'), env, intocable)).status, 400);
});

test('alta nueva: guarda pending y manda link de confirmación al sitio', async () => {
  let insertada; const correos = [];
  const deps = {
    db: {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
        insert: async (f) => { insertada = f; return { error: null }; },
      }),
    },
    sendEmail: async (m) => { correos.push(m); return true; },
  };
  const r = await handleSubscribe(post('{"email":" A@B.pe ","consent":true,"source":"popup"}'), env, deps);
  assert.equal(r.status, 200);
  assert.equal(insertada.email, 'a@b.pe');
  assert.equal(insertada.status, 'pending');
  assert.equal(correos[0].from, 'AJL <hola@ajlnutricion.com>');
  assert.ok(correos[0].html.includes(`https://www.ajlnutricion.com/api/newsletter-confirm?token=${insertada.confirm_token}`));
});

test('confirmación sin token → 302 a gracias?estado=invalido', async () => {
  const r = await handleConfirm(new Request('https://x.test/api/newsletter-confirm'), env, intocable);
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('Location'), 'https://www.ajlnutricion.com/newsletter/gracias/?estado=invalido');
});

test('baja sin token → 302 a baja?estado=invalido', async () => {
  const r = await handleUnsubscribe(new Request('https://x.test/api/newsletter-unsubscribe'), env, intocable);
  assert.equal(r.headers.get('Location'), 'https://www.ajlnutricion.com/newsletter/baja/?estado=invalido');
});

test('baja con token válido marca unsubscribed → estado=ok', async () => {
  let cambio;
  const deps = {
    db: {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 5 }, error: null }) }) }),
        update: (c) => { cambio = c; return { eq: async () => ({ error: null }) }; },
      }),
    },
  };
  const r = await handleUnsubscribe(new Request('https://x.test/api/newsletter-unsubscribe?token=abc'), env, deps);
  assert.equal(r.headers.get('Location'), 'https://www.ajlnutricion.com/newsletter/baja/?estado=ok');
  assert.equal(cambio.status, 'unsubscribed');
});
