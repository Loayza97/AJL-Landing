// Plantillas de correo de reservas. Todo lo que escribió el paciente pasa por
// esc(): un nombre con HTML no puede inyectar nada en el correo del equipo.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const marco = (cuerpo) => `
  <div style="font-family:system-ui,Arial,sans-serif;max-width:560px;margin:auto;color:#20302A">
    ${cuerpo}
    <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
    <p style="font-size:12px;color:#5E6B63">AJL Nutrición · Jr. Almirante Manuel Villavicencio 1461, Lince, Lima · WhatsApp +51 919 151 237</p>
  </div>`;

const boton = (href, texto) => `<p style="margin:24px 0"><a href="${esc(href)}" style="background:#D68A5C;color:#fff;text-decoration:none;font-weight:700;padding:13px 26px;border-radius:999px;display:inline-block">${esc(texto)}</a></p>`;

export function correoConfirmacion({ nombre, titulo, etiqueta, modalidad, direccion, meet, nutricionista, urlIcs }) {
  const donde = modalidad === 'video'
    ? (meet ? `Por videollamada: <a href="${esc(meet)}">${esc(meet)}</a>` : 'Por videollamada: el enlace llega en la invitación de Google Calendar.')
    : `En nuestro consultorio: ${esc(direccion)}`;
  return {
    subject: `Tu primera sesión: ${etiqueta} · AJL Nutrición`,
    html: marco(`
      <h2 style="font-family:Georgia,serif;color:#173C2C">Listo, ${esc(nombre)}. Tu sesión está reservada.</h2>
      <p><strong>${esc(etiqueta)}</strong> · 60 min · con ${esc(nutricionista)}</p>
      <p>${donde}</p>
      <p>Plan: ${esc(titulo)}</p>
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
      <p><strong>${esc(d.nombre)}</strong> · ${esc(d.whatsapp)} · ${esc(d.email)}${d.dni ? ` · DNI ${esc(d.dni)}` : ''}</p>
      <p>${esc(d.titulo)} · S/${esc(d.monto)}</p>
      <p>${esc(d.etiqueta)} · ${d.modalidad === 'video' ? 'Videollamada' : 'Presencial'} · ${esc(d.nutricionista)}</p>
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
