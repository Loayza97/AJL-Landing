// Tarea programada de la web (Pages no corre crons): a las 8:00 en Lima, resumen
// de quienes dejaron sus datos y no pagaron. La lógica vive en la web; este
// Worker solo la dispara con el token compartido.
// La sincronización cada 10 min con Google Calendar se quitó (Joaquín, 2026-10-21).
export async function dispararResumen(env, fetchImpl = fetch) {
  const r = await fetchImpl(env.RESUMEN_URL, { method: 'POST', headers: { Authorization: `Bearer ${env.RESUMEN_TOKEN}` } });
  if (!r.ok) throw new Error(`${env.RESUMEN_URL} respondió ${r.status}`);
  return r.status;
}

export default {
  scheduled(evento, env, ctx) {
    ctx.waitUntil(dispararResumen(env));
  },
};
