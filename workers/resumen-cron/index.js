// Tareas programadas de la web (Pages no corre crons):
// - 8:00 en Lima: resumen de quienes dejaron sus datos y no pagaron.
// - Cada 10 min: sincronizar los cambios manuales de Google Calendar con la base.
// La lógica vive en la web; este Worker solo la dispara con el token compartido.
const RESUMEN_CRON = '0 13 * * *';

async function disparar(url, token, fetchImpl) {
  const r = await fetchImpl(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`${url} respondió ${r.status}`);
  return r.status;
}

export const dispararResumen = (env, fetchImpl = fetch) => disparar(env.RESUMEN_URL, env.RESUMEN_TOKEN, fetchImpl);
export const dispararSincronizacion = (env, fetchImpl = fetch) => disparar(env.SYNC_URL, env.RESUMEN_TOKEN, fetchImpl);

export default {
  scheduled(evento, env, ctx) {
    ctx.waitUntil(evento.cron === RESUMEN_CRON ? dispararResumen(env) : dispararSincronizacion(env));
  },
};
