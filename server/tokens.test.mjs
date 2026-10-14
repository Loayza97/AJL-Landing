import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomToken, couponCode, sha256Hex } from './tokens.mjs';

test('randomToken(24) da 32 caracteres base64url', () => {
  const t = randomToken(24);
  assert.equal(t.length, 32);
  assert.match(t, /^[A-Za-z0-9_-]+$/);
  assert.notEqual(t, randomToken(24));
});

test('couponCode usa el alfabeto sin ambiguos', () => {
  for (let i = 0; i < 200; i++) assert.match(couponCode(), /^AJL-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
});

test('sha256Hex en hexadecimal', async () => {
  assert.equal(await sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
