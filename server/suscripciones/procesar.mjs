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

// La suscripción de un preapproval: por su id guardado, por su plan vigente, por la referencia externa
// o, si es de un plan que un reintento de pago reemplazó, la dueña de ese plan (reemplazado: true).
// planDesconocido: el preapproval sale de un plan que no es de ninguna suscripción del sitio.
async function suscripcionDe(deps, p) {
  const id = String(p?.id ?? '');
  const porPre = id ? await sus.porPreapproval(deps.db, id) : null;
  if (porPre) return { s: porPre };
  const planId = p?.preapproval_plan_id ? String(p.preapproval_plan_id) : null;
  const porPlan = planId ? await sus.porPlan(deps.db, planId) : null;
  if (porPlan) return { s: await asociar(deps, porPlan, id) };
  const porRef = p?.external_reference ? await sus.porId(deps.db, p.external_reference) : null;
  if (porRef) return { s: await asociar(deps, porRef, id) };
  const deUnPlanViejo = planId ? await sus.suscripcionDePlan(deps.db, planId) : null;
  if (deUnPlanViejo) return { s: deUnPlanViejo, reemplazado: true };
  return { s: null, planDesconocido: planId };
}

const ASUNTO_ANOMALO = 'Cobro tras baja o duplicado: devolver y cancelar en Mercado Pago';

// Todos los planes de la cuenta son del sitio: un cobro aprobado de uno que no conocemos se avisa.
async function avisarPlanDesconocido(deps, env, ap, planId, preapprovalId) {
  const pago = ap.payment?.id ? await deps.mp.obtenerPago(String(ap.payment.id)) : null;
  if (pago?.status !== 'approved') return;
  await avisarFijas(deps, env, correoEquipoAlerta({ asunto: ASUNTO_ANOMALO,
    detalle: `Mercado Pago cobró ${formatoSoles(Number(ap.transaction_amount))} en la suscripción ${preapprovalId} del plan ${planId}, que no es de ninguna suscripción del sitio. Revisa de quién es, devuelve ese pago si no corresponde y cancela la suscripción en Mercado Pago.` }));
}

export async function procesarCobro(deps, env, authorizedId) {
  const ap = await deps.mp.obtenerCobroSuscripcion(authorizedId);
  if (!ap?.preapproval_id) return { estado: 'desconocido' };
  const preapprovalId = String(ap.preapproval_id);
  // Si no está guardado: el cobro llegó antes que el aviso del preapproval (se reconoce por el plan),
  // o un reintento de pago lo reemplazó (por la referencia que le pusimos o por el plan viejo).
  let s = await sus.porPreapproval(deps.db, preapprovalId);
  let reemplazado = false;
  if (!s) {
    const r = await suscripcionDe(deps, { ...(await deps.mp.obtenerSuscripcion(preapprovalId)), id: preapprovalId });
    if (!r.s) {
      if (r.planDesconocido) await avisarPlanDesconocido(deps, env, ap, r.planDesconocido, preapprovalId);
      return { estado: 'desconocido' };
    }
    s = r.s;
    reemplazado = Boolean(r.reemplazado);
  }
  // Un cobro de una suscripción ya cerrada, de otro preapproval que no es el vigente o de un plan
  // reemplazado (un reintento de pago), no corresponde: se registra porque es dinero real, pero no cuenta.
  const anomalo = reemplazado || !['pendiente', 'activa'].includes(s.estado) || (s.mp_preapproval_id != null && preapprovalId !== s.mp_preapproval_id);
  const pagoId = ap.payment?.id ? String(ap.payment.id) : null;
  const pago = pagoId ? await deps.mp.obtenerPago(pagoId) : null;
  // Solo cuenta lo que la API de pagos confirma; el estado que trae el cobro no se toma como cierto.
  const estado = pago?.status ?? 'pending';
  const neto = Number(pago?.transaction_details?.net_received_amount);
  const montoCentimos = Math.round(Number(ap.transaction_amount) * 100);
  const { nuevoAprobado, pagoNuevoAprobado, numero } = await sus.registrarCobro(deps.db, {
    suscripcionId: s.id, mpPaymentId: pagoId ?? `ap-${ap.id}`, cobroAutorizadoId: String(ap.id), estado, montoCentimos,
    netoCentimos: neto > 0 ? Math.round(neto * 100) : null, metodo: pago?.payment_method_id ?? null, ahora: deps.ahora(), contar: !anomalo,
  });

  if (anomalo) {
    // Sin recibo ni confirmación. Solo quien dejó el pago aprobado avisa (un aviso repetido no alerta otra vez).
    if (pagoNuevoAprobado) {
      const motivo = reemplazado ? 'es de un link de pago que se reemplazó' : `plan ${s.estado}${s.mp_preapproval_id && preapprovalId !== s.mp_preapproval_id ? `, la vigente es ${s.mp_preapproval_id}` : ''}`;
      await avisarFijas(deps, env, correoEquipoAlerta({ asunto: ASUNTO_ANOMALO,
        detalle: `${s.nombre}: Mercado Pago cobró ${formatoSoles(montoCentimos / 100)} en la suscripción ${preapprovalId}, que ya no corresponde (${motivo}). Devuelve ese pago y revisa que la suscripción quede cancelada en Mercado Pago.` }));
      await cancelarEnMp(deps, env, { ...s, mp_preapproval_id: preapprovalId });
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
  const { s, reemplazado } = await suscripcionDe(deps, p);
  if (!s) return { estado: 'desconocido' };
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

// Respaldo de la página de regreso: revisa los cobros de la suscripción de esa reserva.
export async function sincronizarDeReserva(deps, env, reservaId) {
  let s = await sus.porReserva(deps.db, reservaId);
  if (!s) return;
  // Con plan, el regreso puede no traer el preapproval: se le pregunta a Mercado Pago por el plan.
  if (!s.mp_preapproval_id && s.mp_plan_id) {
    const p = await deps.mp.buscarSuscripcionDePlan(s.mp_plan_id);
    if (p?.id) s = await asociar(deps, s, String(p.id));
  }
  if (!s.mp_preapproval_id) return;
  await sincronizarPreapproval(deps, env, s.mp_preapproval_id);
}
