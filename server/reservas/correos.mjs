// Plantillas de correo de reservas. Todo lo que escribió el paciente pasa por
// esc(): un nombre con HTML no puede inyectar nada en el correo del equipo.
import { requisitosDe } from '../../src/data/requisitos.js';
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const marco = (cuerpo) => `
  <div style="font-family:system-ui,Arial,sans-serif;max-width:560px;margin:auto;color:#20302A">
    ${cuerpo}
    <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
    <p style="font-size:12px;color:#5E6B63">AJL Nutrición · Jr. Almirante Manuel Villavicencio 1461, Lince, Lima · WhatsApp +51 919 151 237</p>
  </div>`;

export const boton = (href, texto) => `<p style="margin:24px 0"><a href="${esc(href)}" style="background:#D68A5C;color:#fff;text-decoration:none;font-weight:700;padding:13px 26px;border-radius:999px;display:inline-block">${esc(texto)}</a></p>`;

const ETIQUETA_DOCUMENTO = { dni: 'DNI', ce: 'CE', pasaporte: 'Pasaporte' };
const etiquetaDocumento = (tipo) => ETIQUETA_DOCUMENTO[tipo] || 'DNI';

// Requisitos según la modalidad (src/data/requisitos.js), como bloque del correo.
const bloqueRequisitos = (modalidad) => {
  const r = requisitosDe(modalidad);
  return `<div style="background:#F7F3EA;border-radius:12px;padding:14px 18px;margin:18px 0">
      <p style="margin:0 0 8px"><strong>${esc(r.titulo)}</strong></p>
      <ul style="margin:0;padding-left:18px">${r.items.map((i) => `<li style="margin-bottom:6px">${esc(i)}</li>`).join('')}</ul>
    </div>`;
};

const dondeCita = (modalidad, direccion, meet) => (modalidad === 'video'
  ? (meet ? `Por videollamada: <a href="${esc(meet)}">${esc(meet)}</a>` : 'Por videollamada: el enlace llega en la invitación de Google Calendar.')
  : `En nuestro consultorio: ${esc(direccion)}`);

export function correoConfirmacion({ nombre, titulo, etiqueta, modalidad, direccion, meet, nutricionista, urlIcs }) {
  const donde = dondeCita(modalidad, direccion, meet);
  return {
    subject: `Tu primera sesión: ${etiqueta} · AJL Nutrición`,
    html: marco(`
      <h2 style="font-family:Georgia,serif;color:#173C2C">Listo, ${esc(nombre)}. Tu sesión está reservada.</h2>
      <p><strong>${esc(etiqueta)}</strong> · 60 min · con ${esc(nutricionista)}</p>
      <p>${donde}</p>
      <p>Plan: ${esc(titulo)}</p>
      ${bloqueRequisitos(modalidad)}
      ${boton(urlIcs, 'Agregar a mi calendario')}
      <p>Si necesitas mover tu cita, escríbenos por WhatsApp. Es gratis hasta 48 horas antes.</p>`),
  };
}

export function correoEquipoConfirmada(d) {
  return {
    subject: `Nueva reserva web: ${d.nombre} · ${d.etiqueta}`,
    html: marco(`
      <h2 style="color:#BE6E42">Reserva pagada en la web</h2>
      ${d.calendarioPendiente ? '<p style="color:#b00020"><strong>No se pudo crear el evento en el calendario: créalo a mano.</strong></p>' : ''}
      <p><strong>${esc(d.nombre)}</strong> · ${esc(d.whatsapp)} · ${esc(d.email)}${d.dni ? ` · ${etiquetaDocumento(d.tipo_documento)} ${esc(d.dni)}` : ''}</p>
      <p>${esc(d.titulo)} · S/${esc(d.monto)}</p>
      <p>${esc(d.etiqueta)} · ${d.modalidad === 'video' ? 'Videollamada' : 'Presencial'} · ${esc(d.nutricionista)}</p>
      ${d.fecha_nacimiento ? `<p>Fecha de nacimiento: ${esc(d.fecha_nacimiento)}</p>` : ''}
      <p>Novedades por correo: ${d.novedades ? 'sí' : 'no'}</p>
      <p>Emitir el comprobante de pago.</p>`),
  };
}

export function correoSinHora({ nombre, urlReubicar }) {
  return {
    subject: 'Tu pago está confirmado: elige tu hora · AJL Nutrición',
    html: marco(`
      <h2 style="font-family:Georgia,serif;color:#173C2C">Tu pago llegó, ${esc(nombre)}.</h2>
      <p>La hora que habías elegido se ocupó mientras pagabas. No tienes que pagar de nuevo: elige otra hora aquí.</p>
      ${boton(urlReubicar, 'Elegir mi hora')}`),
  };
}

export function correoEquipoAlerta({ asunto, detalle }) {
  return { subject: `Reservas web: ${asunto}`, html: marco(`<h2 style="color:#b00020">${esc(asunto)}</h2><p>${esc(detalle)}</p>`) };
}

export function correoResumenNoPagadas({ fecha, personas }) {
  const n = personas.length;
  const filas = personas.map((p) => {
    const wa = `https://wa.me/${String(p.whatsapp).replace(/\D/g, '')}`;
    return `<li style="margin-bottom:12px"><strong>${esc(p.nombre)}</strong> · <a href="${esc(wa)}">${esc(p.whatsapp)}</a><br>
      ${esc(p.titulo)} · ${esc(p.etiqueta)} · ${p.modalidad === 'video' ? 'Videollamada' : 'Presencial'} · ${esc(p.nutricionista)}</li>`;
  }).join('');
  return {
    subject: `Reservas web: ${n} ${n === 1 ? 'persona no completó' : 'personas no completaron'} el pago (${fecha})`,
    html: marco(`
      <h2 style="color:#9C7A2B">Dejaron sus datos y no pagaron</h2>
      <p>Desde el resumen anterior. Escríbeles por WhatsApp para ayudarles con su reserva; sus datos se borran a los 30 días.</p>
      <ul style="padding-left:18px">${filas}</ul>`),
  };
}

export function correoCitaAgenda({ nombre, titulo, etiqueta, duracion, modalidad, direccion, meet, nutricionista, urlIcs }) {
  return {
    subject: `Tu cita: ${etiqueta} · AJL Nutrición`,
    html: marco(`
      <h2 style="font-family:Georgia,serif;color:#173C2C">Listo, ${esc(nombre)}. Tu cita está agendada.</h2>
      <p><strong>${esc(etiqueta)}</strong> · ${Number(duracion)} min · con ${esc(nutricionista)}</p>
      <p>${dondeCita(modalidad, direccion, meet)}</p>
      <p>${esc(titulo)}</p>
      ${bloqueRequisitos(modalidad)}
      ${boton(urlIcs, 'Agregar a mi calendario')}
      <p>Si necesitas mover tu cita, escríbenos por WhatsApp.</p>`),
  };
}

// Cuando el equipo cambia la modalidad desde el panel (2026-10-23): dónde es
// ahora la cita y los requisitos nuevos. El resto de cambios los avisa Google.
export function correoCambioModalidad({ nombre, etiqueta, modalidad, direccion, meet, nutricionista }) {
  const ahora = modalidad === 'video' ? 'virtual' : 'presencial';
  return {
    subject: `Tu cita ahora es ${ahora}: ${etiqueta} · AJL Nutrición`,
    html: marco(`
      <h2 style="font-family:Georgia,serif;color:#173C2C">${esc(nombre)}, tu cita ahora es ${ahora}.</h2>
      <p><strong>${esc(etiqueta)}</strong> · con ${esc(nutricionista)}</p>
      <p>${dondeCita(modalidad, direccion, meet)}</p>
      ${bloqueRequisitos(modalidad)}
      <p>Si tienes dudas, escríbenos por WhatsApp.</p>`),
  };
}
