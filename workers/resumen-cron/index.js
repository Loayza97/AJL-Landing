// Tareas programadas de la web (Pages no corre crons): a las 8:00 en Lima,
// 1) resumen de quienes dejaron sus datos y no pagaron, y
// 2) respaldo de cobros de suscripciones que Mercado Pago aprobó sin avisar (13-nov-2026).
// Y cada 15 min, 3) revisión de la agenda web, que avisa por correo si se cae (16-nov-2026), y
// 4) revisión de cobros mensuales, para avisar al equipo de las citas que hay que agendar (26-nov-2026).
// La lógica vive en la web; este Worker solo la dispara con el token compartido.
// La sincronización cada 10 min con Google Calendar se quitó (Joaquín, 2026-10-21).
async function disparar(url, env, fetchImpl) {
  const r = await fetchImpl(url, { method: 'POST', headers: { Authorization: `Bearer ${env.RESUMEN_TOKEN}` } });
  if (!r.ok) throw new Error(`${url} respondió ${r.status}`);
  return r.status;
}

export const dispararResumen = (env, fetchImpl = fetch) => disparar(env.RESUMEN_URL, env, fetchImpl);
export const dispararRespaldo = (env, fetchImpl = fetch) => disparar(env.BARRIDO_URL, env, fetchImpl);
export const dispararSalud = (env, fetchImpl = fetch) => disparar(env.SALUD_URL, env, fetchImpl);
export const dispararRevision = (env, fetchImpl = fetch) => disparar(env.REVISION_URL, env, fetchImpl);

export const CRON_DIARIO = '0 13 * * *';

// Una falla no frena a la otra.
async function todas(tareas) {
  const r = await Promise.allSettled(tareas);
  const fallas = r.filter((x) => x.status === 'rejected').map((x) => x.reason?.message ?? String(x.reason));
  if (fallas.length) throw new Error(fallas.join('; '));
}
export const dispararTodo = (env, fetchImpl = fetch) => todas([dispararResumen(env, fetchImpl), dispararRespaldo(env, fetchImpl)]);
export const dispararFrecuentes = (env, fetchImpl = fetch) => todas([dispararSalud(env, fetchImpl), dispararRevision(env, fetchImpl)]);

// Cada cron dispara lo suyo: el diario, el resumen y el respaldo; el de cada 15 min, las dos revisiones.
export function tareaDe(cron, env, fetchImpl = fetch) {
  return cron === CRON_DIARIO ? dispararTodo(env, fetchImpl) : dispararFrecuentes(env, fetchImpl);
}

export default {
  scheduled(evento, env, ctx) {
    ctx.waitUntil(tareaDe(evento.cron, env));
  },
};
