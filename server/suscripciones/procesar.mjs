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

export async function procesarCobro(deps, env, authorizedId) {
  const ap = await deps.mp.obtenerCobroSuscripcion(authorizedId);
  if (!ap?.preapproval_id) return { estado: 'desconocido' };
  let s = await sus.porPreapproval(deps.db, String(ap.preapproval_id));
  if (!s) {
    // Un reintento de pago pudo reemplazar el preapproval guardado: se busca por la referencia que le pusimos.
    const p = await deps.mp.obtenerSuscripcion(String(ap.preapproval_id));
    s = p?.external_reference ? await sus.porId(deps.db, p.external_reference) : null;
  }
  if (!s) return { estado: 'desconocido' };
  const preapprovalId = String(ap.preapproval_id);
  // Un cobro de una suscripción ya cerrada, o de otro preapproval que no es el vigente (un reintento
  // de pago dejó dos), no corresponde: se registra porque es dinero real, pero no cuenta para el plan.
  const anomalo = !['pendiente', 'activa'].includes(s.estado) || (s.mp_preapproval_id != null && preapprovalId !== s.mp_preapproval_id);
  const pagoId = ap.payment?.id ? String(ap.payment.id) : null;
  const pago = pagoId ? await deps.mp.obtenerPago(pagoId) : null;
  // Solo cuenta lo que la API de pagos confirma; el estado que trae el cobro no se toma como cierto.
  const estado = pago?.status ?? 'pending';
  const neto = Number(pago?.transaction_details?.net_received_amount);
  const montoCentimos = Math.round(Number(ap.transaction_amount) * 100);
  const { nuevoAprobado, pagoNuevoAprobado, numero } = await sus.registrarCobro(deps.db, {
    suscripcionId: s.id, mpPaymentId: pagoId ?? `ap-${ap.id}`, estado, montoCentimos,
    netoCentimos: neto > 0 ? Math.round(neto * 100) : null, metodo: pago?.payment_method_id ?? null, ahora: deps.ahora(), contar: !anomalo,
  });

  if (anomalo) {
    // Sin recibo ni confirmación. Solo quien dejó el pago aprobado avisa (un aviso repetido no alerta otra vez).
    if (pagoNuevoAprobado) {
      await avisarFijas(deps, env, correoEquipoAlerta({ asunto: 'Cobro tras baja o duplicado: devolver y cancelar en Mercado Pago',
        detalle: `${s.nombre}: Mercado Pago cobró ${formatoSoles(montoCentimos / 100)} en la suscripción ${preapprovalId}, que ya no corresponde (plan ${s.estado}${preapprovalId !== s.mp_preapproval_id ? `, la vigente es ${s.mp_preapproval_id}` : ''}). Devuelve ese pago y revisa que la suscripción quede cancelada en Mercado Pago.` }));
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
    if (numero === 1) await avisarFijas(deps, env, correoEquipoSuscripcion('nueva', actual));
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
  const s = (await sus.porPreapproval(deps.db, String(p?.id ?? ''))) ?? (p?.external_reference ? await sus.porId(deps.db, p.external_reference) : null);
  if (!s) return { estado: 'desconocido' };
  // Aviso de un preapproval que un reintento de pago reemplazó: no es una baja del paciente.
  if (s.mp_preapproval_id && p.id && String(p.id) !== s.mp_preapproval_id) return { estado: 'reemplazada' };
  if (!s.mp_preapproval_id && p.id) await sus.guardarPreapproval(deps.db, s.id, String(p.id), deps.ahora());
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

// Respaldo de la página de regreso: revisa los cobros de la suscripción de esa reserva.
export async function sincronizarDeReserva(deps, env, reservaId) {
  const s = await sus.porReserva(deps.db, reservaId);
  if (!s?.mp_preapproval_id) return;
  for (const ap of await deps.mp.buscarCobrosSuscripcion(s.mp_preapproval_id)) {
    await procesarCobro(deps, env, String(ap.id));
  }
}
