// Qué pasa cuando Mercado Pago avisa algo de una suscripción. Lo llaman el webhook
// y, de respaldo, la página de regreso. Todo es idempotente: el que gana el UPDATE
// manda los correos. Los estados de Mercado Pago se confirmaron en la Task 1
// (docs/superpowers/notas/2026-10-28-mp-suscripciones-prueba.md).
import * as sus from './repo.mjs';
import * as repo from '../reservas/repo.mjs';
import { confirmarConPago } from '../reservas/confirmar.mjs';
import { condicionesSuscripcion, esUltimoCobro, penalidadAlCancelar } from './calculo.mjs';
import { correoRecibo, correoBaja, correoEquipoSuscripcion, correoPenalidadPendiente } from './correos.mjs';
import { avisarFijas } from '../reservas/aviso-equipo.mjs';
import { correoEquipoAlerta } from '../reservas/correos.mjs';
import { siteUrl } from '../http.mjs';
import { formatoSoles } from '../../src/data/duraciones.js';
import { PREFIJO_PLAN } from '../reservas/mercadopago.mjs';

// authorized payment que Mercado Pago ya no reintentará.
export const ESTADO_COBRO_FALLIDO = 'cancelled';
const remitente = (env) => env.NEWSLETTER_FROM || 'AJL Nutrición <hola@ajlnutricion.com>';
const titulo = (s) => condicionesSuscripcion(s.producto, s.duracion_meses)?.titulo ?? s.producto;
export const urlCancelar = (env, s) => `${siteUrl(env)}/suscripcion/cancelar/?s=${s.token}`;

// El 409 de «penalidad pendiente» no revela el token ni el monto (cualquiera puede teclear un DNI ajeno):
// el link de pago va solo al correo del deudor, como máximo una vez cada 24 h. Nunca rompe la respuesta.
export const MSJ_DEUDA = 'Hay un pago pendiente de un plan anterior con este documento. Te enviamos a tu correo cómo resolverlo.';
export async function avisarPenalidadPendiente(deps, env, deuda) {
  try {
    if (!(await sus.tomarAvisoDeuda(deps.db, deuda.id, deps.ahora()))) return;
  } catch (e) {
    console.error('aviso de deuda', deuda.id, e);
    return;
  }
  await alPaciente(deps, env, deuda,
    correoPenalidadPendiente({ nombre: deuda.nombre?.split(' ')[0], monto: deuda.penalidad_centimos, url: urlCancelar(env, deuda) }));
}

async function alPaciente(deps, env, s, correo) {
  if (!s.email) return;
  try {
    await deps.sendEmail({ from: remitente(env), to: s.email, ...correo });
  } catch (e) {
    console.error('correo suscripción', e);
  }
}

// Avisos de una baja ya escrita en la base (quien la escribió es quien avisa).
export async function avisarBaja(deps, env, id, { tipoEquipo, penalidad, penalidadPagada = false, porCobroFallido = false }) {
  const s = await sus.porId(deps.db, id);
  await Promise.all([
    alPaciente(deps, env, s, correoBaja({ nombre: s.nombre?.split(' ')[0] ?? '', titulo: titulo(s), penalidad, penalidadPagada, porCobroFallido })),
    avisarFijas(deps, env, correoEquipoSuscripcion(tipoEquipo, s, { penalidad })),
  ]);
}

// Si Mercado Pago no cancela, el plan sigue cobrando: se avisa al equipo para cancelarlo a mano.
export async function cancelarEnMp(deps, env, s) {
  try {
    await deps.mp.cancelarSuscripcion(s.mp_preapproval_id);
  } catch (e) {
    console.error('cancelar en Mercado Pago', s.id, e);
    await avisarFijas(deps, env, correoEquipoAlerta({ asunto: 'Cancelar a mano en Mercado Pago',
      detalle: `${s.nombre}: no se pudo cancelar su suscripción ${s.mp_preapproval_id} en Mercado Pago. Cancélala a mano para que no se le siga cobrando.` }));
  }
}

// Igual que cancelarEnMp, pero si Mercado Pago ya lo canceló no se pide de nuevo: cancelar uno cancelado falla
// y avisaría «Cancelar a mano» sin motivo (Mercado Pago cancela solo el preapproval cuyo primer cobro rechaza).
async function cancelarSiSigueVivo(deps, env, s) {
  try {
    if ((await deps.mp.obtenerSuscripcion(s.mp_preapproval_id))?.status === 'cancelled') return;
  } catch (e) {
    console.error('consultar antes de cancelar', s.id, s.mp_preapproval_id, e);
  }
  await cancelarEnMp(deps, env, s);
}

// Con el preapproval guardado autorizado (o su primer cobro aprobado) se desactiva el plan, para que su
// link no sirva otra vez. Best effort e idempotente: otro preapproval que saliera de él sería anómalo.
async function desactivarPlanDe(deps, s) {
  if (!s.mp_plan_id) return;
  try {
    await deps.mp.desactivarPlan(s.mp_plan_id);
  } catch (e) {
    console.error('desactivar plan', s.id, s.mp_plan_id, e);
  }
}

// Una suscripción con plan no sabe su preapproval hasta que el paciente autoriza: se reconoce por el plan
// (o por la referencia externa) y se guarda, solo si la fila no tiene uno (si dos preapprovals del mismo
// plan llegan a la vez, gana uno y se relee la fila, así el otro queda como anómalo). Se asocia en
// cualquier estado: si ya viene cancelado, es una baja del paciente que llegó tarde. Un preapproval que
// soltó un reintento de pago nunca llega aquí: es de un plan reemplazado.
export async function asociar(deps, s, preapprovalId) {
  if (s.mp_preapproval_id || !preapprovalId) return s;
  if (!(await sus.asociarPreapproval(deps.db, s.id, preapprovalId, deps.ahora()))) return sus.porId(deps.db, s.id);
  return { ...s, mp_preapproval_id: preapprovalId };
}

// El plan de Mercado Pago sigue vivo después de que el link de la web se usó (y aunque se cancele): cualquiera
// con su dirección puede pagarlo. Un paciente real paga 1 a 3 minutos después de que se crea el plan; el 12-nov-2026
// otro paciente pagó, con un link mandado a mano, el plan de un link de 5 días antes, y la web le asignó el pago y le
// mandó el recibo a la paciente del link. Por eso un preapproval que nace más de 24 h después de su plan, en una
// suscripción que todavía no tiene cobros, no se asigna a nadie: se avisa al equipo para asignarlo a mano.
export const HORAS_PLAN_VIGENTE = 24;
async function esPlanViejo(deps, s, planId, p) {
  if (s.estado !== 'pendiente' || s.cobros_aprobados > 0) return false;
  const creado = Date.parse((await sus.planCreadoEn(deps.db, planId)) ?? '');
  if (!creado) return false;
  const nacio = Date.parse(p?.date_created ?? '') || deps.ahora().getTime();
  return nacio - creado > HORAS_PLAN_VIGENTE * 3600000;
}

// La suscripción de un preapproval: por su id guardado, por su plan vigente, por la referencia externa
// o, si es de un plan que un reintento de pago reemplazó, la dueña de ese plan (reemplazado: true).
// planViejo: sale del plan vigente de una suscripción, pero se pagó mucho después (ver esPlanViejo); no se asocia.
// planDesconocido: el preapproval sale de un plan que no es de ninguna suscripción del sitio.
// delPlan: se encontró por su plan vigente (puede ser otro preapproval del mismo plan que el guardado).
async function suscripcionDe(deps, p) {
  const id = String(p?.id ?? '');
  const porPre = id ? await sus.porPreapproval(deps.db, id) : null;
  if (porPre) return { s: porPre };
  const planId = p?.preapproval_plan_id ? String(p.preapproval_plan_id) : null;
  const porPlan = planId ? await sus.porPlan(deps.db, planId) : null;
  if (porPlan && await esPlanViejo(deps, porPlan, planId, p)) return { s: porPlan, planViejo: true };
  if (porPlan) return { s: await asociar(deps, porPlan, id), delPlan: true };
  const porRef = p?.external_reference ? await sus.porId(deps.db, p.external_reference) : null;
  if (porRef) return { s: await asociar(deps, porRef, id) };
  const deUnPlanViejo = planId ? await sus.suscripcionDePlan(deps.db, planId) : null;
  if (deUnPlanViejo) return { s: deUnPlanViejo, reemplazado: true };
  return { s: null, planDesconocido: planId, reason: p?.reason ?? null };
}

// Otro preapproval del mismo plan mientras la suscripción no tiene ningún cobro aprobado: el paciente
// volvió a intentar con otra tarjeta y Mercado Pago creó otro preapproval (prueba de S/5 del 10-nov-2026).
// No se cancela: el primero que tenga un cobro aprobado se queda con la suscripción.
const otraTarjeta = (s, preapprovalId, delPlan) => delPlan && s.mp_preapproval_id != null && preapprovalId !== s.mp_preapproval_id
  && s.estado === 'pendiente' && s.cobros_aprobados === 0;

// Un plan que no crea la web (sin el prefijo) es uno hecho a mano en la cuenta: no se avisa. Sin reason no se
// puede saber, y se avisa como antes, para no perder una alerta real (spec 2026-11-09).
const esPlanDeLaWeb = (reason) => reason == null || String(reason).startsWith(PREFIJO_PLAN);

const ASUNTO_ANOMALO = 'Cobro tras baja o duplicado: devolver y cancelar en Mercado Pago';
const ASUNTO_PLAN_VIEJO = 'Pago en un link viejo: asignarlo a mano';

// Un cobro aprobado de un plan de la web que no conocemos se avisa (los planes hechos a mano se filtran antes).
async function avisarPlanDesconocido(deps, env, ap, planId, preapprovalId) {
  const pago = ap.payment?.id ? await deps.mp.obtenerPago(String(ap.payment.id)) : null;
  if (pago?.status !== 'approved') return;
  await avisarFijas(deps, env, correoEquipoAlerta({ asunto: ASUNTO_ANOMALO,
    detalle: `Mercado Pago cobró ${formatoSoles(Number(ap.transaction_amount))} en la suscripción ${preapprovalId} del plan ${planId}, que no es de ninguna suscripción del sitio. Revisa de quién es, devuelve ese pago si no corresponde y cancela la suscripción en Mercado Pago.` }));
}

// Cobro de un plan viejo: queda registrado en la fila del link (es dinero real) sin sumar ni avisar al paciente,
// y el equipo recibe una alerta, una sola vez por pago, con los datos de quien pagó. No se cancela nada: puede ser
// un paciente real que pagó un link mandado a mano. Los cobros siguientes de esa suscripción vuelven a alertar.
async function cobroDePlanViejo(deps, env, s, ap, preapprovalId) {
  const pagoId = ap.payment?.id ? String(ap.payment.id) : null;
  const pago = pagoId ? await deps.mp.obtenerPago(pagoId) : null;
  const estado = pago?.status ?? 'pending';
  const neto = Number(pago?.transaction_details?.net_received_amount);
  const montoCentimos = Math.round(Number(ap.transaction_amount) * 100);
  const { pagoNuevoAprobado } = await sus.registrarCobro(deps.db, {
    suscripcionId: s.id, mpPaymentId: pagoId ?? `ap-${ap.id}`, cobroAutorizadoId: String(ap.id), estado, montoCentimos,
    netoCentimos: neto > 0 ? Math.round(neto * 100) : null, metodo: pago?.payment_method_id ?? null, detalle: pago?.status_detail ?? null, ahora: deps.ahora(), contar: false,
  });
  if (estado !== 'approved') return { estado };
  if (pagoNuevoAprobado) {
    const quien = [pago?.card?.cardholder?.name, pago?.payer?.email].filter(Boolean).join(', ') || 'sin datos en Mercado Pago';
    await avisarFijas(deps, env, correoEquipoAlerta({ asunto: ASUNTO_PLAN_VIEJO,
      detalle: `Mercado Pago cobró ${formatoSoles(montoCentimos / 100)} (pago ${pagoId ?? ap.id}) en la suscripción ${preapprovalId}, que salió del link de ${s.nombre}. Ese link se abrió hace más de ${HORAS_PLAN_VIGENTE} h y nadie lo había pagado, así que no se le asignó a ${s.nombre} ni se le mandó nada. Quién pagó: ${quien}. Revisa de qué paciente es y pide que se le asigne. La suscripción sigue activa en Mercado Pago y volverá a cobrar cada mes.` }));
  }
  return { estado: 'plan_viejo' };
}

export async function procesarCobro(deps, env, authorizedId) {
  const ap = await deps.mp.obtenerCobroSuscripcion(authorizedId);
  if (!ap?.preapproval_id) return { estado: 'desconocido' };
  const preapprovalId = String(ap.preapproval_id);
  // Si no está guardado: el cobro llegó antes que el aviso del preapproval (se reconoce por el plan),
  // o un reintento de pago lo reemplazó (por la referencia que le pusimos o por el plan viejo).
  let s = await sus.porPreapproval(deps.db, preapprovalId);
  let reemplazado = false;
  let delPlan = false;
  if (!s) {
    const r = await suscripcionDe(deps, { ...(await deps.mp.obtenerSuscripcion(preapprovalId)), id: preapprovalId });
    if (r.planViejo) return cobroDePlanViejo(deps, env, r.s, ap, preapprovalId);
    if (!r.s) {
      if (r.planDesconocido && esPlanDeLaWeb(r.reason)) await avisarPlanDesconocido(deps, env, ap, r.planDesconocido, preapprovalId);
      else if (r.planDesconocido) console.log('plan ajeno a la web', r.planDesconocido, r.reason);
      return { estado: 'desconocido' };
    }
    s = r.s;
    reemplazado = Boolean(r.reemplazado);
    delPlan = Boolean(r.delPlan);
  }
  const candidato = !reemplazado && otraTarjeta(s, preapprovalId, delPlan);
  // Un cobro de una suscripción ya cerrada, de otro preapproval que no es el vigente o de un plan
  // reemplazado (un reintento de pago), no corresponde: se registra porque es dinero real, pero no cuenta.
  const anomalo = !candidato && (reemplazado || !['pendiente', 'activa'].includes(s.estado) || (s.mp_preapproval_id != null && preapprovalId !== s.mp_preapproval_id));
  const pagoId = ap.payment?.id ? String(ap.payment.id) : null;
  const pago = pagoId ? await deps.mp.obtenerPago(pagoId) : null;
  // Solo cuenta lo que la API de pagos confirma; el estado que trae el cobro no se toma como cierto.
  const estado = pago?.status ?? 'pending';
  const neto = Number(pago?.transaction_details?.net_received_amount);
  const montoCentimos = Math.round(Number(ap.transaction_amount) * 100);
  const { nuevoAprobado, pagoNuevoAprobado, numero } = await sus.registrarCobro(deps.db, {
    suscripcionId: s.id, mpPaymentId: pagoId ?? `ap-${ap.id}`, preapprovalId, reclamar: candidato, cobroAutorizadoId: String(ap.id), estado, montoCentimos,
    netoCentimos: neto > 0 ? Math.round(neto * 100) : null, metodo: pago?.payment_method_id ?? null, detalle: pago?.status_detail ?? null, ahora: deps.ahora(), contar: !anomalo,
  });

  // Ganó con la otra tarjeta: la suscripción pasa a este preapproval y el anterior, sin cobros, se cancela
  // para que Mercado Pago no reintente la primera tarjeta.
  if (candidato && nuevoAprobado) {
    await cancelarSiSigueVivo(deps, env, s);
    s = { ...s, mp_preapproval_id: preapprovalId };
  } else if (candidato && !pagoNuevoAprobado) return { estado };
  // Cobro aprobado que no sumó: otro preapproval se quedó con la suscripción en el mismo momento.
  const perdio = !anomalo && pagoNuevoAprobado && !nuevoAprobado;

  if (anomalo || perdio) {
    // Sin recibo ni confirmación. Solo quien dejó el pago aprobado avisa (un aviso repetido no alerta otra vez).
    if (pagoNuevoAprobado) {
      const motivo = reemplazado ? 'es de un link de pago que se reemplazó'
        : perdio ? 'el paciente ya pagó con otra suscripción del mismo plan'
          : `plan ${s.estado}${s.mp_preapproval_id && preapprovalId !== s.mp_preapproval_id ? `, la vigente es ${s.mp_preapproval_id}` : ''}`;
      await avisarFijas(deps, env, correoEquipoAlerta({ asunto: ASUNTO_ANOMALO,
        detalle: `${s.nombre}: Mercado Pago cobró ${formatoSoles(montoCentimos / 100)} en la suscripción ${preapprovalId}, que ya no corresponde (${motivo}). Devuelve ese pago y revisa que la suscripción quede cancelada en Mercado Pago.` }));
      await cancelarSiSigueVivo(deps, env, { ...s, mp_preapproval_id: preapprovalId });
    }
    return { estado: 'anomalo' };
  }

  // Fuera del filtro de nuevoAprobado: si la confirmación falló, el reintento de Mercado Pago la repite
  // (confirmarConPago es idempotente y solo quien confirma manda los correos).
  if (estado === 'approved' && numero === 1 && s.reserva_id) {
    const r = await repo.reservaPorId(deps.db, s.reserva_id);
    if (r) await confirmarConPago(deps, env, r, pago);
  }

  if (nuevoAprobado) {
    const actual = await sus.porId(deps.db, s.id);
    await alPaciente(deps, env, actual, correoRecibo({ nombre: actual.nombre?.split(' ')[0] ?? '', titulo: titulo(actual), numero,
      cobros: actual.duracion_meses > 1 ? actual.duracion_meses : null, cuota: actual.cuota_centimos, urlCancelar: urlCancelar(env, actual),
      penalidadHoy: penalidadAlCancelar(actual) }));
    if (numero === 1) {
      await desactivarPlanDe(deps, actual);
      await avisarFijas(deps, env, correoEquipoSuscripcion('nueva', actual));
    }
    if (esUltimoCobro(actual, numero) && await sus.marcarTerminada(deps.db, s.id, deps.ahora())) {
      await cancelarEnMp(deps, env, actual);
      await avisarFijas(deps, env, correoEquipoSuscripcion('ultimo', actual));
    }
    return { estado: 'aprobado', numero };
  }

  if (estado !== 'approved' && ap.status === ESTADO_COBRO_FALLIDO) {
    // Si el paciente canceló desde Mercado Pago, el cobro pendiente también queda cancelado:
    // eso es una baja del paciente, no un cobro fallido.
    let pre = null;
    try {
      pre = s.mp_preapproval_id ? await deps.mp.obtenerSuscripcion(s.mp_preapproval_id) : null;
    } catch (e) {
      console.error('consultar suscripción tras cobro cancelado', s.id, e);
    }
    if (pre?.status === 'cancelled') {
      const res = await sus.cancelar(deps.db, { id: s.id, motivo: 'paciente_mp', ahora: deps.ahora() });
      if (res.cambio) {
        const pagada = res.penalidad_estado === 'pagada';
        await avisarBaja(deps, env, s.id, { tipoEquipo: pagada ? 'cancelada_pagada' : 'cancelada_pendiente', penalidad: res.penalidad_centimos, penalidadPagada: pagada });
      }
      return { estado: 'cancelada' };
    }
    const res = await sus.cancelar(deps.db, { id: s.id, motivo: 'cobro_fallido', ahora: deps.ahora() });
    if (res.cambio) {
      await cancelarEnMp(deps, env, s);
      await avisarBaja(deps, env, s.id, { tipoEquipo: 'fallido', penalidad: res.penalidad_centimos,
        penalidadPagada: res.penalidad_estado === 'pagada', porCobroFallido: true });
    }
    return { estado: 'cobro_fallido' };
  }
  return { estado };
}

export async function procesarPreapproval(deps, env, preapprovalId) {
  const p = await deps.mp.obtenerSuscripcion(preapprovalId);
  const { s, reemplazado, delPlan, planViejo } = await suscripcionDe(deps, p);
  if (!s) return { estado: 'desconocido' };
  if (planViejo) return { estado: 'plan_viejo' };
  // Preapproval de un plan reemplazado: no es la suscripción vigente; se cancela para que no cobre
  // (si falla, cancelarEnMp avisa al equipo; si igual cobra, el cobro queda como anómalo).
  if (reemplazado) {
    if (p.status !== 'cancelled') await cancelarEnMp(deps, env, { ...s, mp_preapproval_id: String(p.id) });
    return { estado: 'reemplazada' };
  }
  const id = String(p.id ?? '');
  // Ya asociado (suscripcionDe asocia si la fila no tenía uno): si no es el guardado, perdió contra otro
  // del mismo plan (o lo reemplazó un reintento con referencia externa). No es una baja del paciente;
  // si sigue vivo, se cancela para que no cobre.
  if (id && id !== s.mp_preapproval_id) {
    if (p.status !== 'cancelled' && otraTarjeta(s, id, delPlan)) return { estado: 'en_espera' };
    if (p.status !== 'cancelled') await cancelarEnMp(deps, env, { ...s, mp_preapproval_id: id });
    return { estado: 'reemplazada' };
  }
  if (p.status === 'authorized') await desactivarPlanDe(deps, s);
  if (p.status === 'cancelled') {
    const res = await sus.cancelar(deps.db, { id: s.id, motivo: 'paciente_mp', ahora: deps.ahora() });
    if (res.cambio) {
      const pagada = res.penalidad_estado === 'pagada';
      await avisarBaja(deps, env, s.id, { tipoEquipo: pagada ? 'cancelada_pagada' : 'cancelada_pendiente', penalidad: res.penalidad_centimos, penalidadPagada: pagada });
    }
    return { estado: 'cancelada' };
  }
  return { estado: p.status };
}

// Revisa de nuevo todos los cobros de un preapproval (procesarCobro vuelve a pedir cada uno a Mercado Pago).
export async function sincronizarPreapproval(deps, env, preapprovalId) {
  for (const ap of await deps.mp.buscarCobrosSuscripcion(preapprovalId)) {
    await procesarCobro(deps, env, String(ap.id));
  }
}

// Respaldo cuando un aviso de Mercado Pago no llega (pasa con el primer cobro que queda pendiente): revisa los
// cobros de todos los preapprovals del plan, no solo el guardado, porque si el paciente probó otra tarjeta el que
// pagó es otro. Primero los otros, al final el guardado: si uno nuevo cobró, se queda con la suscripción antes de
// que un cobro viejo de la tarjeta rechazada pueda contar como baja. false: Mercado Pago no tiene ninguno todavía.
export async function sincronizarSuscripcion(deps, env, s) {
  const pres = s.mp_plan_id ? (await deps.mp.buscarSuscripcionesDePlan(s.mp_plan_id)).filter((p) => p?.id) : [];
  // Sin preapproval guardado (el regreso no lo trajo): se guarda uno del plan, mejor uno que siga vivo.
  if (!s.mp_preapproval_id && pres.length) s = await asociar(deps, s, String((pres.find((p) => p.status !== 'cancelled') ?? pres[0]).id));
  const delPlan = pres.map((p) => String(p.id));
  const ids = [...new Set([...delPlan.filter((id) => id !== s.mp_preapproval_id), ...(s.mp_preapproval_id ? [s.mp_preapproval_id] : [])])];
  for (const id of ids) await sincronizarPreapproval(deps, env, id);
  return ids.length > 0;
}

// Respaldo de la página de regreso: revisa los cobros de la suscripción de esa reserva.
export async function sincronizarDeReserva(deps, env, reservaId) {
  const s = await sus.porReserva(deps.db, reservaId);
  if (s) await sincronizarSuscripcion(deps, env, s);
}
