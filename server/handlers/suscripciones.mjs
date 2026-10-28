// ─── Suscripciones, lado del paciente ───────────────────────────────────────
// GET  /api/suscripciones/cancelar?s=   datos de «Cancelar mi plan»
// POST /api/suscripciones/cancelar      { s, pagar } paga la penalidad o cancela sin pagar
import { json, readJson, siteUrl } from '../http.mjs';
import * as sus from '../suscripciones/repo.mjs';
import { penalidadAlCancelar, detallePenalidad, condicionesSuscripcion } from '../suscripciones/calculo.mjs';
import { avisarBaja } from '../suscripciones/procesar.mjs';

const bad = (status, error, extra = {}) => json(status, { ok: false, error, ...extra });
const titulo = (s) => condicionesSuscripcion(s.producto, s.duracion_meses)?.titulo ?? s.producto;

function modo(s) {
  if (['pendiente', 'activa'].includes(s.estado)) return 'activa';
  return s.penalidad_estado === 'pendiente' ? 'deuda' : 'cerrada';
}
const penalidadDe = (s) => (modo(s) === 'deuda' ? s.penalidad_centimos : modo(s) === 'activa' ? penalidadAlCancelar(s) : 0);

async function cobrarPenalidad(env, deps, s) {
  const ahora = deps.ahora();
  // En una activa la penalidad se calcula hoy y se guarda: el webhook valida el pago contra ese monto.
  const monto = modo(s) === 'deuda' ? s.penalidad_centimos : penalidadAlCancelar(s);
  if (modo(s) === 'activa') await sus.cotizarPenalidad(deps.db, s.id, monto, ahora);
  const pref = await deps.mp.crearPreferencia({
    reservaId: `pen-${s.id}`, titulo: `Penalidad por cancelar · ${titulo(s)}`, montoCentimos: monto, email: s.email, nombre: s.nombre,
    venceEn: new Date(ahora.getTime() + 24 * 3600000), ahora, urlRetorno: `${siteUrl(env)}/suscripcion/cancelar/?s=${s.token}&pago=1`,
    urlNotificacion: `${siteUrl(env)}/api/reservas/webhook-mp`,
  });
  return json(200, { ok: true, url: pref.init_point });
}

async function cancelarYa(env, deps, s) {
  try {
    if (s.mp_preapproval_id) await deps.mp.cancelarSuscripcion(s.mp_preapproval_id);
  } catch (e) {
    console.error('cancelar en Mercado Pago', s.id, e);
    return bad(503, 'No pudimos cancelar en este momento. Intenta de nuevo en unos minutos o escríbenos por WhatsApp.');
  }
  let res;
  try {
    res = await sus.cancelar(deps.db, { id: s.id, motivo: 'paciente_boton', ahora: deps.ahora() });
  } catch (e) {
    console.error('cancelar plan (base)', s.id, e);
    const actual = await sus.porId(deps.db, s.id);
    if (actual && !['pendiente', 'activa'].includes(actual.estado)) return json(200, { ok: true, cancelada: true, penalidad_centimos: actual.penalidad_centimos });
    return bad(503, 'No pudimos cancelar en este momento. Intenta de nuevo en unos minutos o escríbenos por WhatsApp.');
  }
  if (res.cambio) await avisarBaja(deps, env, s.id, { tipoEquipo: 'cancelada_pendiente', penalidad: res.penalidad_centimos });
  return json(200, { ok: true, cancelada: true, penalidad_centimos: res.penalidad_centimos });
}

export async function handleSuscripcionCancelar(request, env, deps) {
  if (!['GET', 'POST'].includes(request.method)) return bad(405, 'Método no permitido');
  const d = request.method === 'POST' ? await readJson(request) : Object.fromEntries(new URL(request.url).searchParams);
  const s = typeof d.s === 'string' && d.s ? await sus.porToken(deps.db, d.s) : null;
  if (!s) return bad(404, 'No encontramos tu plan.');
  const m = modo(s);
  const penalidad = penalidadDe(s);
  if (request.method === 'GET') {
    return json(200, { ok: true, modo: m, titulo: titulo(s), cobros_aprobados: s.cobros_aprobados, duracion_meses: s.duracion_meses,
      cuota_centimos: s.cuota_centimos, penalidad_centimos: penalidad, detalle: m === 'activa' ? detallePenalidad(s) : '' });
  }
  try {
    if (m === 'cerrada') return bad(409, 'Tu plan ya está cerrado. No tienes nada pendiente.');
    if (m === 'deuda') return d.pagar === true ? await cobrarPenalidad(env, deps, s) : bad(409, 'Tu plan ya está cancelado. Solo queda pagar la penalidad.');
    if (d.pagar === true && penalidad > 0) return await cobrarPenalidad(env, deps, s);
    return await cancelarYa(env, deps, s);
  } catch (e) {
    console.error('cancelar plan', e);
    return bad(503, 'No pudimos abrir Mercado Pago. Intenta de nuevo.');
  }
}
