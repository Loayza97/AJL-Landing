// Correos de suscripciones (spec 2026-10-27). El recibo de cada cobro lleva «Cancelar mi plan».
import { esc, marco } from '../reservas/correos.mjs';
import { formatoSoles } from '../../src/data/duraciones.js';
import { condicionesSuscripcion } from './calculo.mjs';

const soles = (c) => formatoSoles(Math.round(c / 100));

export function correoRecibo({ nombre, titulo, numero, cobros, cuota, urlCancelar, penalidadHoy }) {
  const ultimo = cobros && numero >= cobros;
  return {
    subject: `Recibimos tu pago${cobros ? ` · cobro ${numero} de ${cobros}` : ''} · AJL Nutrición`,
    html: marco(`
      <h2 style="font-family:Georgia,serif;color:#173C2C">Gracias, ${esc(nombre)}. Recibimos tu pago</h2>
      <p>${esc(titulo)}</p>
      <p><strong>${soles(cuota)}</strong>${cobros ? ` · cobro ${numero} de ${cobros}` : ''}</p>
      ${ultimo ? '<p>Este fue tu último cobro: tu plan termina sin renovación y no se te cobra nada más.</p>' : ''}
      <p>Escríbenos por WhatsApp para agendar tus sesiones.</p>
      ${ultimo ? '' : `<p style="font-size:13px;color:#5E6B63">¿Quieres dejar tu plan? <a href="${esc(urlCancelar)}">Cancelar mi plan</a>.${cobros && penalidadHoy > 0 ? ` Si cancelas antes del último cobro, pagas la diferencia entre lo que pagaste y el precio que corresponde a los meses usados: hoy serían ${soles(penalidadHoy)}.` : ''}</p>`}`),
  };
}

export function correoBaja({ nombre, titulo, penalidad, penalidadPagada }) {
  return {
    subject: 'Tu plan quedó cancelado · AJL Nutrición',
    html: marco(`
      <h2 style="font-family:Georgia,serif;color:#173C2C">${esc(nombre)}, tu plan quedó cancelado</h2>
      <p>${esc(titulo)}. Ya no se te cobra nada más.</p>
      ${penalidad > 0 && !penalidadPagada ? `<p>${soles(penalidad)} quedan pendientes por la penalidad. Si vuelves a reservar con nosotros, te pediremos pagarlos antes.</p>` : ''}
      ${penalidad > 0 && penalidadPagada ? `<p>Recibimos el pago de la penalidad (${soles(penalidad)}).</p>` : ''}
      <p>Gracias por confiar en AJL Nutrición. Si quieres volver, escríbenos por WhatsApp.</p>`),
  };
}

const ASUNTO = {
  nueva: (s) => `Suscripción nueva: ${s.nombre}`,
  ultimo: (s) => `${s.nombre} pagó su último cobro: ofrécele seguir`,
  cancelada_pagada: (s) => `${s.nombre} canceló su plan y pagó la penalidad`,
  cancelada_pendiente: (s, x) => (x.penalidad > 0 ? `${s.nombre} canceló su plan · penalidad pendiente ${soles(x.penalidad)}` : `${s.nombre} canceló su plan`),
  fallido: (s, x) => `Cobro fallido: ${s.nombre}${x.penalidad > 0 ? ` · penalidad ${soles(x.penalidad)}` : ''}`,
  penalidad_pagada: (s) => `${s.nombre} pagó su penalidad pendiente`,
};

export function correoEquipoSuscripcion(tipo, s, extra = {}) {
  const x = { penalidad: 0, ...extra };
  const titulo = condicionesSuscripcion(s.producto, s.duracion_meses)?.titulo ?? s.producto;
  return {
    subject: ASUNTO[tipo](s, x),
    html: marco(`
      <h2 style="color:${['fallido', 'cancelada_pendiente'].includes(tipo) ? '#9B2C2C' : '#173C2C'}">${esc(ASUNTO[tipo](s, x))}</h2>
      <ul style="padding-left:18px">
        <li>Plan: ${esc(titulo)}</li>
        <li>Cobros pagados: ${s.cobros_aprobados}${s.duracion_meses > 1 ? ` de ${s.duracion_meses}` : ''}</li>
        <li>WhatsApp: ${esc(s.whatsapp ?? 'sin dato')} · Documento: ${esc(s.dni ?? 'sin dato')}</li>
      </ul>
      ${tipo === 'fallido' || tipo === 'cancelada_pendiente' ? '<p>Si vuelve a reservar, la web le pedirá pagar la penalidad antes. También puedes escribirle.</p>' : ''}
      <p>Detalle en el panel, sección «Suscripciones».</p>`),
  };
}
