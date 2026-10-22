// Contraseñas del panel: PBKDF2-SHA256 de WebCrypto con sal de 16 bytes.
// 10.000 iteraciones para entrar en los 10 ms de CPU del plan gratis de Workers;
// cada fila guarda las suyas, así se pueden subir sin invalidar las viejas.
export const ITERACIONES = 10000;
export const MIN_CLAVE = 10;
export const MAX_CLAVE = 200;

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const deHex = (s) => new Uint8Array(s.match(/../g).map((h) => Number.parseInt(h, 16)));

async function derivar(clave, sal, iteraciones) {
  const llave = await crypto.subtle.importKey('raw', new TextEncoder().encode(clave), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: iteraciones }, llave, 256));
}

export async function hashClave(clave) {
  const sal = crypto.getRandomValues(new Uint8Array(16));
  return { hash: await derivar(clave, sal, ITERACIONES), sal: hex(sal), iteraciones: ITERACIONES };
}

// Compara sin cortar en el primer carácter distinto (no da pistas por el tiempo).
const iguales = (a, b) => a.length === b.length && [...a].reduce((d, c, i) => d | (c.charCodeAt(0) ^ b.charCodeAt(i)), 0) === 0;

// Sin fila (correo sin contraseña o no autorizado) igual se calcula un hash, para
// que la respuesta tarde lo mismo y no diga qué correos existen.
export async function claveCorrecta(clave, fila) {
  if (!fila) { await derivar(String(clave), new Uint8Array(16), ITERACIONES); return false; }
  return iguales(await derivar(String(clave), deHex(fila.sal), fila.iteraciones), fila.hash);
}

export const claveValida = (c) => typeof c === 'string' && c.length >= MIN_CLAVE && c.length <= MAX_CLAVE;
