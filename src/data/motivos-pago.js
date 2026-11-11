// El motivo real de un pago de Mercado Pago (status_detail) en palabras. Su panel dice «el banco
// rechazó» aunque haya sido su antifraude (cc_rejected_high_risk, 10-nov-2026). Lo usan la pantalla de
// rechazo de /reservar/listo y el panel del equipo.
const MOTIVOS = {
  cc_rejected_high_risk: 'No es tu banco: fue un filtro de seguridad de Mercado Pago.',
  cc_rejected_insufficient_amount: 'La tarjeta no tiene saldo o cupo suficiente.',
  cc_rejected_call_for_authorize: 'Tu banco pide que autorices el pago: revisa su app o llámalo.',
  cc_rejected_card_disabled: 'La tarjeta no está activa para compras por internet.',
  cc_rejected_duplicated_payment: 'Mercado Pago lo tomó como un pago repetido.',
  cc_rejected_max_attempts: 'Llegaste al límite de intentos con esta tarjeta.',
  cc_rejected_time_out: 'Tu banco tardó en responder. Puedes volver a intentarlo con la misma tarjeta.',
};

// Para el paciente.
export function motivoRechazo(detalle) {
  if (MOTIVOS[detalle]) return MOTIVOS[detalle];
  if (String(detalle || '').startsWith('cc_rejected_bad_filled')) return 'Algún dato de la tarjeta no coincide (número, vencimiento o código).';
  return 'Tu banco o Mercado Pago no aprobó el pago.';
}

// Para el equipo: corto, con qué hacer.
const EQUIPO = {
  cc_rejected_high_risk: ['Antifraude de Mercado Pago', 'No es el banco. No reintentar enseguida: ofrecer Yape o transferencia.'],
  cc_rejected_insufficient_amount: ['Sin saldo o cupo', 'Otra tarjeta o Yape.'],
  cc_rejected_call_for_authorize: ['El banco pide autorizar', 'Que lo autorice en la app de su banco y reintente.'],
  cc_rejected_card_disabled: ['Tarjeta sin compras por internet', 'Que las active en su banco o use otra.'],
  cc_rejected_duplicated_payment: ['Pago repetido', 'Revisar si ya pagó antes.'],
  cc_rejected_max_attempts: ['Límite de intentos', 'Otra tarjeta o Yape.'],
  // No es el antifraude: el banco o Mercado Pago no respondieron a tiempo. El 10-nov-2026 un S/270 pasó al reintentar con la misma tarjeta.
  cc_rejected_time_out: ['El banco no respondió a tiempo', 'Que reintente con la misma tarjeta: no es un rechazo del banco ni del antifraude.'],
  cc_rejected_other_reason: ['Rechazado por el banco', 'Otra tarjeta o Yape.'],
};
const ESTADOS = { pending: 'Pendiente', in_process: 'En revisión', approved: 'Aprobado', rejected: 'Rechazado', cancelled: 'Cancelado' };

// { titulo, accion } del último intento, o null si no hubo.
export function motivoEquipo(estado, detalle) {
  if (!estado) return null;
  if (estado === 'rejected') {
    const [t, a] = EQUIPO[detalle]
      ?? (String(detalle || '').startsWith('cc_rejected_bad_filled') ? ['Datos de tarjeta mal escritos', 'Que revise número, vencimiento y código.'] : [null, 'Otra tarjeta o Yape.']);
    return { titulo: t ? `Rechazado · ${t}` : 'Rechazado', accion: a };
  }
  return { titulo: ESTADOS[estado] ?? estado, accion: '' };
}
