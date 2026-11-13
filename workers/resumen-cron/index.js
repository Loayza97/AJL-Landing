// Tareas programadas de la web (Pages no corre crons): a las 8:00 en Lima,
// 1) resumen de quienes dejaron sus datos y no pagaron, y
// 2) respaldo de cobros de suscripciones que Mercado Pago aprobó sin avisar (13-nov-2026).
// La lógica vive en la web; este Worker solo la dispara con el token compartido.
// La sincronización cada 10 min con Google Calendar se quitó (Joaquín, 2026-10-21).
async function disparar(url, env, fetchImpl) {
  const r = await fetchImpl(url, { method: 'POST', headers: { Authorization: `Bearer ${env.RESUMEN_TOKEN}` } });
  if (!r.ok) throw new Error(`${url} respondió ${r.status}`);
  return r.status;
}

export const dispararResumen = (env, fetchImpl = fetch) => disparar(env.RESUMEN_URL, env, fetchImpl);
export const dispararRespaldo = (env, fetchImpl = fetch) => disparar(env.BARRIDO_URL, env, fetchImpl);

// Una falla no frena a la otra.
export async function dispararTodo(env, fetchImpl = fetch) {
  const r = await Promise.allSettled([dispararResumen(env, fetchImpl), dispararRespaldo(env, fetchImpl)]);
  const fallas = r.filter((x) => x.status === 'rejected').map((x) => x.reason?.message ?? String(x.reason));
  if (fallas.length) throw new Error(fallas.join('; '));
}

export default {
  scheduled(evento, env, ctx) {
    ctx.waitUntil(dispararTodo(env));
  },
};
