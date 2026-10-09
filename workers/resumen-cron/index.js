// Cron diario (8:00 en Lima): pide a la web que mande al equipo el resumen de
// quienes dejaron sus datos y no pagaron. La lógica vive en la web; este
// Worker solo la dispara con el token compartido.
export async function dispararResumen(env, fetchImpl = fetch) {
  const r = await fetchImpl(env.RESUMEN_URL, { method: 'POST', headers: { Authorization: `Bearer ${env.RESUMEN_TOKEN}` } });
  if (!r.ok) throw new Error(`resumen-diario respondió ${r.status}`);
  return r.status;
}

export default {
  scheduled(_evento, env, ctx) {
    ctx.waitUntil(dispararResumen(env));
  },
};
