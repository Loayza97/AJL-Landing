// ─── Tokens y cupones con Web Crypto (no hay 'crypto' de Node en Workers) ───

// Alfabeto sin caracteres ambiguos (0/O, 1/I/L).
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function randomToken(nBytes = 24) {
  const bytes = crypto.getRandomValues(new Uint8Array(nBytes));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function couponCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  let s = '';
  for (let i = 0; i < 6; i++) s += ALPHABET[bytes[i] % ALPHABET.length];
  return `AJL-${s}`;
}

export async function sha256Hex(texto) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
