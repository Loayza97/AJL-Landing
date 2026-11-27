// Mercado Pago responde 429 si se le pregunta muy seguido (avisos del 13 al 24-nov-2026). Un reintento tras
// una pausa corta basta; cualquier otro error sube tal cual.
export const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const ESPERA_429_MS = 2000;
export const PAUSA_MS = 300; // entre una suscripción y la siguiente

export async function conReintento(fn, esperar = dormir) {
  try {
    return await fn();
  } catch (e) {
    if (!/ 429\b/.test(String(e?.message))) throw e;
    await esperar(ESPERA_429_MS);
    return fn();
  }
}
