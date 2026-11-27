// «Por agendar» (spec 2026-11-26-citas-por-cobro): cuántas citas le faltan a cada suscripción, de la web
// ('s:<id>') o hecha a mano en Mercado Pago ('x:<preapproval>'). Nada se guarda por cita: se calcula
// con los cobros aprobados, lo usado antes, las citas de los links de la suscripción y los ajustes.
//   faltan = citas de los cobros − usadas antes − primera cita (web) − citas de links + ajuste
import { citasDeCobros, sugerirPlan } from '../agenda/opciones.mjs';
import { PRODUCTO_PRUEBA } from './calculo.mjs';

const esWeb = (clave) => String(clave).startsWith('s:');

async function filasWeb(db) {
  const ultimo = (c) => `(SELECT c.${c} FROM suscripcion_cobros c WHERE c.suscripcion_id = s.id AND c.estado = 'approved' ORDER BY c.creado_en DESC LIMIT 1)`;
  const { results } = await db.prepare(
    `SELECT s.id, s.nombre, s.whatsapp, s.producto, s.duracion_meses, s.cobros_aprobados, s.reserva_id, r.estado AS primera_estado,
       cs.citas_previas, cs.por_revisar, cs.revisado_en, ${ultimo('monto_centimos')} AS monto_centimos, ${ultimo('creado_en')} AS cobrado_en
     FROM suscripciones s LEFT JOIN reservas r ON r.id = s.reserva_id LEFT JOIN citas_suscripcion cs ON cs.clave = 's:' || s.id
     WHERE s.cobros_aprobados > 0 AND s.producto <> ?1`,
  ).bind(PRODUCTO_PRUEBA).all();
  return results.map((s) => ({
    clave: `s:${s.id}`, origen: 'web', nombre: s.nombre, pagador: null, reason: null, whatsapp: s.whatsapp, plan: `${s.producto}:${s.duracion_meses}`,
    citas_por_cobro: null, sin_asignar: false,
    // Sin revisar y marcada al publicar, o sin cita atada: sus citas pueden estar agendadas por fuera.
    por_revisar: !s.revisado_en && (s.por_revisar === 1 || !s.reserva_id),
    cobros: s.cobros_aprobados, cobros_total: s.duracion_meses > 1 ? s.duracion_meses : null,
    monto_centimos: s.monto_centimos, cobrado_en: s.cobrado_en, sugerido: null,
    previas: s.citas_previas ?? 0,
    // Lo revisado ya incluye la cita elegida al comprar.
    primera: !s.revisado_en && s.primera_estado === 'confirmada' ? 1 : 0,
  }));
}

async function filasMano(db) {
  const { results } = await db.prepare(
    `SELECT x.preapproval_id, x.pagador, x.reason, cs.cliente_id, cs.plan, cs.citas_por_cobro, cs.citas_previas, cl.nombre, cl.whatsapp,
       COUNT(c.mp_payment_id) AS cobros, MAX(c.cobrado_en) AS cobrado_en,
       (SELECT u.monto_centimos FROM sus_externa_cobros u WHERE u.preapproval_id = x.preapproval_id ORDER BY u.cobrado_en DESC LIMIT 1) AS monto_centimos
     FROM sus_externas x JOIN sus_externa_cobros c ON c.preapproval_id = x.preapproval_id
     LEFT JOIN citas_suscripcion cs ON cs.clave = 'x:' || x.preapproval_id
     LEFT JOIN clientes cl ON cl.id = cs.cliente_id
     GROUP BY x.preapproval_id`,
  ).all();
  return results.map((x) => {
    const asignada = Boolean(x.cliente_id);
    const sugerido = asignada ? null : sugerirPlan(x.reason);
    const meses = Number(asignada ? String(x.plan).split(':')[1] : sugerido?.duracion);
    return {
      clave: `x:${x.preapproval_id}`, origen: 'mano', nombre: asignada ? x.nombre : null, pagador: x.pagador, whatsapp: asignada ? x.whatsapp : null,
      reason: x.reason, plan: asignada ? x.plan : null, citas_por_cobro: asignada ? x.citas_por_cobro : null, sin_asignar: !asignada, por_revisar: false,
      cobros: x.cobros, cobros_total: meses > 1 ? meses : null, monto_centimos: x.monto_centimos, cobrado_en: x.cobrado_en, sugerido,
      previas: x.citas_previas ?? 0, primera: 0,
    };
  });
}

async function todasLasFilas(db, ahora) {
  const [web, mano, links, ajustes] = await Promise.all([
    filasWeb(db), filasMano(db),
    db.prepare(`SELECT l.sus_clave AS clave, SUM(CASE WHEN r.estado = 'confirmada' THEN 1 ELSE 0 END) AS agendadas,
        SUM(CASE WHEN l.usado_en IS NULL AND l.vence_en > ?1 THEN 1 ELSE 0 END) AS sin_usar
      FROM links_agenda l LEFT JOIN reservas r ON r.id = l.reserva_id WHERE l.sus_clave IS NOT NULL GROUP BY l.sus_clave`).bind(ahora.toISOString()).all(),
    db.prepare('SELECT clave, SUM(cantidad) AS n FROM citas_ajustes GROUP BY clave').all(),
  ]);
  const porLink = new Map(links.results.map((l) => [l.clave, l]));
  const porAjuste = new Map(ajustes.results.map((a) => [a.clave, a.n]));
  return [...web, ...mano].map(({ previas, primera, ...f }) => {
    const ajuste = porAjuste.get(f.clave) ?? 0;
    const calculable = !f.sin_asignar && !f.por_revisar;
    const dadas = calculable ? citasDeCobros(f.plan, f.cobros, f.citas_por_cobro) : null;
    const usadas = previas + primera + (porLink.get(f.clave)?.agendadas ?? 0);
    return { ...f, dadas, usadas, ajuste, faltan: dadas == null ? null : dadas - usadas + ajuste, links_sin_usar: porLink.get(f.clave)?.sin_usar ?? 0 };
  });
}

const grupo = (f) => (f.por_revisar ? 0 : f.sin_asignar ? 1 : 2);

// Sin `todas`, solo las que tienen algo que hacer. La suscripción terminada o cancelada sigue
// mientras le falten citas (decisión 9).
export async function filasPorAgendar(db, ahora, { todas = false } = {}) {
  const filas = await todasLasFilas(db, ahora);
  return filas.filter((f) => todas || f.por_revisar || f.sin_asignar || f.faltan == null || f.faltan > 0)
    .sort((a, b) => grupo(a) - grupo(b) || String(b.cobrado_en).localeCompare(String(a.cobrado_en)));
}

export async function filaPorClave(db, clave, ahora) {
  return (await todasLasFilas(db, ahora)).find((f) => f.clave === clave) ?? null;
}

// El equipo anota una vez cuántas citas ya usó o agendó (incluida la primera). Solo web.
export async function revisar(db, { clave, usadas, por, ahora }) {
  if (!esWeb(clave)) return false;
  const r = await db.prepare(
    `INSERT INTO citas_suscripcion (clave, citas_previas, por_revisar, revisado_en, revisado_por, actualizado_en) VALUES (?1, ?2, 0, ?3, ?4, ?3)
     ON CONFLICT (clave) DO UPDATE SET citas_previas = excluded.citas_previas, por_revisar = 0, revisado_en = excluded.revisado_en,
       revisado_por = excluded.revisado_por, actualizado_en = excluded.actualizado_en
     WHERE citas_suscripcion.revisado_en IS NULL`,
  ).bind(clave, usadas, ahora.toISOString(), por).run();
  return r.meta.changes === 1;
}

export async function ajustar(db, { clave, cantidad, motivo, por, ahora }) {
  await db.prepare('INSERT INTO citas_ajustes (id, clave, cantidad, motivo, creado_por, creado_en) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
    .bind(crypto.randomUUID(), clave, cantidad, motivo, por, ahora.toISOString()).run();
}

// Corrige una unión equivocada de una hecha a mano: los cobros se quedan y las citas de sus links dejan de contar.
export async function quitarPaciente(db, { clave }) {
  if (esWeb(clave)) return false;
  const [, borrado] = await db.batch([
    // Los ajustes eran de ese paciente: no pasan al siguiente.
    db.prepare(`DELETE FROM citas_ajustes WHERE clave = ?1
      AND EXISTS (SELECT 1 FROM citas_suscripcion WHERE clave = ?1 AND cliente_id IS NOT NULL)`).bind(clave),
    db.prepare('DELETE FROM citas_suscripcion WHERE clave = ?1 AND cliente_id IS NOT NULL').bind(clave),
    db.prepare('UPDATE links_agenda SET sus_clave = NULL, sus_cpc = NULL WHERE sus_clave = ?1').bind(clave),
  ]);
  return borrado.meta.changes === 1;
}
