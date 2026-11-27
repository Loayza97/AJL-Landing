// Suscripciones hechas a mano en Mercado Pago (spec 2026-11-26-citas-por-cobro). La web solo anota sus
// cobros aprobados para contar citas y avisar al equipo: nunca manda recibos, cancela ni cobra nada.
import { PREFIJO_PLAN } from '../reservas/mercadopago.mjs';
import { avisarFijas } from '../reservas/aviso-equipo.mjs';
import { leerSync } from '../reservas/repo.mjs';
import { etiquetaPlan } from '../agenda/opciones.mjs';
import { filaPorClave } from './citas.mjs';
import { correoCobroEquipo } from './correos.mjs';

export const CLAVE_DESDE = 'citas_por_cobro_desde';
// Sin reason no se puede saber: se trata como de la web, como siempre (spec 2026-11-09).
export const esHechaAMano = (reason) => Boolean(reason) && !String(reason).startsWith(PREFIJO_PLAN);

const nombrePagador = (p) => [p.payer_first_name, p.payer_last_name].map((x) => String(x ?? '').trim()).filter(Boolean).join(' ') || p.payer_email || null;

// Un dato que venga vacío no borra el que ya había.
export async function guardarExterna(db, pre, ahora) {
  const monto = Number(pre.auto_recurring?.transaction_amount);
  await db.prepare(
    `INSERT INTO sus_externas (preapproval_id, pagador, reason, monto_centimos, estado_mp, creado_mp, creado_en, actualizado_en)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
     ON CONFLICT (preapproval_id) DO UPDATE SET pagador = COALESCE(excluded.pagador, sus_externas.pagador),
       reason = COALESCE(excluded.reason, sus_externas.reason), monto_centimos = COALESCE(excluded.monto_centimos, sus_externas.monto_centimos),
       estado_mp = COALESCE(excluded.estado_mp, sus_externas.estado_mp), creado_mp = COALESCE(excluded.creado_mp, sus_externas.creado_mp),
       actualizado_en = excluded.actualizado_en`,
  ).bind(String(pre.id), nombrePagador(pre), pre.reason ?? null, monto > 0 ? Math.round(monto * 100) : null, pre.status ?? null,
    pre.date_created ?? null, ahora.toISOString()).run();
}

// Solo cuenta lo que la API de pagos confirma como aprobado. Quien inserta la fila (una sola vez por
// número de pago) es quien avisa.
export async function registrarCobroExterno(deps, env, pre, ap, pago) {
  if (pago?.status !== 'approved') return { nuevo: false };
  const ahora = deps.ahora();
  await guardarExterna(deps.db, pre, ahora);
  const cobradoEn = new Date(pago.date_approved ?? ap.debit_date ?? ap.date_created ?? ahora).toISOString();
  const monto = Math.round(Number(ap.transaction_amount) * 100);
  const r = await deps.db.prepare(
    `INSERT INTO sus_externa_cobros (mp_payment_id, preapproval_id, numero, monto_centimos, cobrado_en, creado_en)
     SELECT ?1, ?2, (SELECT COUNT(*) FROM sus_externa_cobros WHERE preapproval_id = ?2) + 1, ?3, ?4, ?5 WHERE true
     ON CONFLICT (mp_payment_id) DO NOTHING`,
  ).bind(String(pago.id), String(pre.id), monto, cobradoEn, ahora.toISOString()).run();
  if (r.meta.changes !== 1) return { nuevo: false };
  // Los cobros anteriores a la publicación entran sin correo (carga inicial).
  const desde = await leerSync(deps.db, CLAVE_DESDE);
  if (!desde || Date.parse(cobradoEn) > Date.parse(desde)) await avisarCobro(deps, env, `x:${pre.id}`, { monto, reason: pre.reason });
  return { nuevo: true };
}

// Correo al equipo por un cobro: quién pagó, cuánto, qué cobro es y cuántas citas faltan. Nunca
// rompe el registro del cobro: si no se puede leer la cuenta, sale sin ella.
export async function avisarCobro(deps, env, clave, { monto, reason = null, nombre = null, titulo = null, numero = null, cobros = null }) {
  let f = null;
  try {
    f = await filaPorClave(deps.db, clave, deps.ahora());
  } catch (e) {
    console.error('cuenta de citas para el aviso', clave, e);
  }
  await avisarFijas(deps, env, correoCobroEquipo({
    quien: f?.nombre ?? f?.pagador ?? nombre ?? 'sin nombre en Mercado Pago',
    titulo: titulo ?? etiquetaPlan(f?.plan) ?? reason, monto,
    numero: numero ?? f?.cobros ?? null, cobros: cobros ?? f?.cobros_total ?? null,
    faltan: f?.faltan ?? null, sinAsignar: f?.sin_asignar ?? false,
  }));
}
