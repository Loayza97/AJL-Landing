// ─── Suscripciones, lado del paciente ───────────────────────────────────────
// GET  /api/suscripciones/cancelar?s=   datos de «Cancelar mi plan»
// POST /api/suscripciones/cancelar      { s, pagar } paga la penalidad o cancela sin pagar
// GET/POST /api/suscripciones/link      link de un solo uso creado en el panel
// GET  /api/suscripciones/estado?s=     estado del plan por token
import { json, readJson, siteUrl } from '../http.mjs';
import * as sus from '../suscripciones/repo.mjs';
import { penalidadAlCancelar, detallePenalidad, condicionesSuscripcion, finDeCobros } from '../suscripciones/calculo.mjs';
import { avisarBaja, avisarPenalidadPendiente, MSJ_DEUDA } from '../suscripciones/procesar.mjs';
import { procesarPagoPenalidad } from '../suscripciones/penalidad.mjs';
import { sha256Hex } from '../tokens.mjs';
import { CONDICIONES_VERSION } from '../../src/data/condiciones.js';

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
    // Si ya estaba cancelada en Mercado Pago (por ejemplo, desde la cuenta del paciente), la baja sigue.
    let pre = null;
    try {
      pre = await deps.mp.obtenerSuscripcion(s.mp_preapproval_id);
    } catch (e2) {
      console.error('consultar suscripción en Mercado Pago', s.id, e2);
    }
    if (pre?.status !== 'cancelled') return bad(503, 'No pudimos cancelar en este momento. Intenta de nuevo en unos minutos o escríbenos por WhatsApp.');
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
  let s = typeof d.s === 'string' && d.s ? await sus.porToken(deps.db, d.s) : null;
  if (!s) return bad(404, 'No encontramos tu plan.');
  // Respaldo de la vuelta del pago de la penalidad (como handleEstado): si el webhook no llegó,
  // se procesa el pago aquí. Solo cuenta un pago cuya referencia es la de este plan.
  if (request.method === 'GET' && /^\d+$/.test(d.payment_id ?? '') && modo(s) !== 'cerrada') {
    try {
      const pago = await deps.mp.obtenerPago(d.payment_id);
      if (pago?.external_reference === `pen-${s.id}`) {
        await procesarPagoPenalidad(deps, env, pago);
        s = await sus.porId(deps.db, s.id);
      }
    } catch (e) {
      console.error('cancelar/procesarPagoPenalidad', s.id, e);
    }
  }
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

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOCUMENTO = { dni: /^\d{8}$/, ce: /^[A-Z0-9]{6,12}$/, pasaporte: /^[A-Z0-9]{6,12}$/ };
const MSJ_LINK = 'Este link ya no sirve. Pídele uno nuevo al equipo por WhatsApp.';

async function linkVigente(deps, l) {
  const s = typeof l === 'string' && l ? await sus.porLinkHash(deps.db, await sha256Hex(l)) : null;
  if (!s || s.link_usado_en || s.estado !== 'pendiente' || Date.parse(s.vence_en) <= deps.ahora().getTime()) return null;
  return s;
}

export async function handleSuscripcionLink(request, env, deps) {
  if (!['GET', 'POST'].includes(request.method)) return bad(405, 'Método no permitido');
  if (request.method === 'GET') {
    const s = await linkVigente(deps, new URL(request.url).searchParams.get('l'));
    if (!s) return bad(410, MSJ_LINK);
    const c = condicionesSuscripcion(s.producto, s.duracion_meses);
    return json(200, { ok: true, nombre: s.nombre.split(' ')[0], titulo: c.titulo, cuota_centimos: s.cuota_centimos,
      precio_mes_centimos: s.precio_mes_centimos, cobros: c.cobros, ahorro_centimos: s.precio_mes_centimos - s.cuota_centimos });
  }
  const d = await readJson(request);
  const s = await linkVigente(deps, d.l);
  if (!s) return bad(410, MSJ_LINK);
  const email = String(d.email ?? '').trim();
  const tipo = String(d.tipo_documento ?? '');
  const documento = String(d.documento ?? '').replace(/[\s.-]+/g, '').toUpperCase();
  const whatsapp = String(d.whatsapp ?? '').replace(/[^\d+]/g, '');
  if (!EMAIL.test(email)) return bad(400, 'Revisa tu correo.');
  if (!Object.hasOwn(DOCUMENTO, tipo) || !DOCUMENTO[tipo].test(documento)) return bad(400, 'Revisa tu documento.');
  if (!/^\+?\d{9,15}$/.test(whatsapp)) return bad(400, 'Revisa tu número de WhatsApp.');
  if (d.acepto !== true) return bad(400, 'Para continuar, acepta los cobros mensuales y las condiciones.');
  const deuda = await sus.deudaPorDni(deps.db, documento);
  if (deuda) {
    await avisarPenalidadPendiente(deps, env, deuda);
    return bad(409, MSJ_DEUDA, { motivo: 'penalidad' });
  }
  const ahora = deps.ahora();
  if (!(await sus.usarLink(deps.db, { hash: await sha256Hex(d.l), nombre: s.nombre, email, dni: documento, whatsapp, condicionesVersion: CONDICIONES_VERSION, ahora }))) {
    return bad(410, MSJ_LINK);
  }
  try {
    const c = condicionesSuscripcion(s.producto, s.duracion_meses);
    const pre = await deps.mp.crearSuscripcion({ suscripcionId: s.id, titulo: c.titulo, cuotaCentimos: s.cuota_centimos, email,
      urlRetorno: `${siteUrl(env)}/suscribirse/listo/?s=${s.token}`, finEn: finDeCobros(ahora, c.cobros) });
    await sus.guardarPreapproval(deps.db, s.id, pre.id, ahora);
    return json(200, { ok: true, url: pre.init_point });
  } catch (e) {
    console.error('link de suscripción', e);
    return bad(503, 'No pudimos abrir Mercado Pago. Pídele al equipo un link nuevo.');
  }
}

export async function handleSuscripcionEstado(request, env, deps) {
  if (request.method !== 'GET') return bad(405, 'Método no permitido');
  const s = await sus.porToken(deps.db, new URL(request.url).searchParams.get('s') || '');
  if (!s) return bad(404, 'No encontramos tu plan.');
  return json(200, { ok: true, estado: s.estado, titulo: titulo(s), nombre: s.nombre?.split(' ')[0] ?? null });
}
