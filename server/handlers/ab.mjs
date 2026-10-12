// ─── Prueba A/B del botón de la portada · AJL Nutrición ─────────────────────
// POST /api/ab  { evento: 'vista' | 'click', variante: 'a' | 'b' }
// Cuenta, sin identificar a nadie, cuántas personas ven y tocan cada versión
// del botón. Las reservas pagadas por versión salen de reservas.variante.
import { json, empty, readJson } from '../http.mjs';

const EXPERIMENTO = 'hero_cta';
const EVENTOS = new Set(['vista', 'click']);
const VARIANTES = new Set(['a', 'b']);

export async function handleAb(request, env, deps) {
  if (request.method !== 'POST') return json(405, { ok: false, error: 'Método no permitido' });
  const d = await readJson(request);
  if (!EVENTOS.has(d.evento) || !VARIANTES.has(d.variante)) return json(400, { ok: false, error: 'Evento no reconocido' });
  await deps.db.prepare('INSERT INTO ab_eventos (experimento, variante, evento, creado_en) VALUES (?1, ?2, ?3, ?4)')
    .bind(EXPERIMENTO, d.variante, d.evento, deps.ahora().toISOString()).run();
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
  ).bind(EXPERIMENTO).all();
  return results;
}
