// ─── Prueba A/B del botón de la portada y video de la portada · AJL Nutrición ─
// POST /api/ab  { evento: 'vista' | 'click', variante: 'a' | 'b' }
//   Cuenta, sin identificar a nadie, cuántas personas ven y tocan cada versión
//   del botón. Las reservas pagadas por versión salen de reservas.variante.
// POST /api/ab  { experimento: 'video_como_trabajamos', evento: 'play' | 'p50' | 'p100', variante: 'a' | 'b' }
//   Cuenta cuántas veces se da play al video «cómo trabajamos» de la portada y
//   cuántas llegan a la mitad y al final. La variante es la del botón que vio
//   esa persona, para cruzar ambas cosas. Necesita la migración 0020.
import { json, empty, readJson } from '../http.mjs';

const EXPERIMENTOS = {
  hero_cta: new Set(['vista', 'click']),
  video_como_trabajamos: new Set(['play', 'p50', 'p100']),
};
const VARIANTES = new Set(['a', 'b']);

export async function handleAb(request, env, deps) {
  if (request.method !== 'POST') return json(405, { ok: false, error: 'Método no permitido' });
  const d = await readJson(request);
  // Sin «experimento» es el botón: así lo manda el script de la portada desde el 12-oct-2026.
  const experimento = d.experimento ?? 'hero_cta';
  const eventos = Object.hasOwn(EXPERIMENTOS, experimento) ? EXPERIMENTOS[experimento] : null;
  if (!eventos || !eventos.has(d.evento) || !VARIANTES.has(d.variante)) return json(400, { ok: false, error: 'Evento no reconocido' });
  await deps.db.prepare('INSERT INTO ab_eventos (experimento, variante, evento, creado_en) VALUES (?1, ?2, ?3, ?4)')
    .bind(experimento, d.variante, d.evento, deps.ahora().toISOString()).run();
  return empty(204);
}

// Resumen por versión: vistas, clics y reservas pagadas.
export async function resultadosAb(db) {
  const { results } = await db.prepare(
    `SELECT v.variante,
       (SELECT COUNT(*) FROM ab_eventos e WHERE e.experimento = ?1 AND e.variante = v.variante AND e.evento = 'vista') AS vistas,
       (SELECT COUNT(*) FROM ab_eventos e WHERE e.experimento = ?1 AND e.variante = v.variante AND e.evento = 'click') AS clics,
       (SELECT COUNT(*) FROM reservas r WHERE r.variante = v.variante AND r.estado IN ('confirmada', 'pagada_sin_hora')) AS reservas_pagadas
     FROM (SELECT 'a' AS variante UNION ALL SELECT 'b') v ORDER BY v.variante`,
  ).bind('hero_cta').all();
  return results;
}

// Resumen del video por versión del botón: plays, llegadas a la mitad y al final.
export async function resultadosVideo(db) {
  const { results } = await db.prepare(
    `SELECT v.variante,
       (SELECT COUNT(*) FROM ab_eventos e WHERE e.experimento = ?1 AND e.variante = v.variante AND e.evento = 'play') AS plays,
       (SELECT COUNT(*) FROM ab_eventos e WHERE e.experimento = ?1 AND e.variante = v.variante AND e.evento = 'p50') AS mitad,
       (SELECT COUNT(*) FROM ab_eventos e WHERE e.experimento = ?1 AND e.variante = v.variante AND e.evento = 'p100') AS completos
     FROM (SELECT 'a' AS variante UNION ALL SELECT 'b') v ORDER BY v.variante`,
  ).bind('video_como_trabajamos').all();
  return results;
}
