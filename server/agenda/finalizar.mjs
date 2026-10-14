// Después de agendar con un link: evento en el calendario del equipo con el
// paciente invitado (así le llega a su calendario) y correo de confirmación.
// Si Google falla, la cita igual queda: se marca pendiente y se avisa al equipo.
import * as repo from '../reservas/repo.mjs';
import { etiquetaLima, finDeReserva } from '../reservas/tiempo.mjs';
import { correoCitaAgenda, correoEquipoAlerta } from '../reservas/correos.mjs';
import { tipoDeReserva } from './tipos.mjs';
import { siteUrl } from '../http.mjs';
import { contacto } from '../../src/data/contacto.js';

// Otra copia del remitente (confirmar.mjs y acceso.mjs tienen la misma);
// unificarlas queda fuera de esta entrega. Se exporta para la alerta de agenda.mjs.
export const remitente = (env) => env.NEWSLETTER_FROM || 'AJL Nutrición <hola@ajlnutricion.com>';

export async function finalizarAgenda(deps, env, r) {
  const tipo = tipoDeReserva(r);
  const n = deps.nutricionistas.find((x) => x.id === r.nutricionista_id);
  let meet = null;
  try {
    const ev = await deps.google.crearEvento({
      reservaId: r.id,
      titulo: `Agenda · ${r.nombre} · ${tipo.nombre}`,
      descripcion: `WhatsApp: ${r.whatsapp}\nCorreo: ${r.email}\nNutricionista: ${n.nombre}\nAgendado con link de un solo uso (${r.id}).`,
      inicioUtc: r.inicio_utc,
      finUtc: finDeReserva(r),
      modalidad: r.modalidad,
      direccion: contacto.direccion,
      invitado: { email: r.email, nombre: r.nombre },
    });
    meet = ev.meet;
    await repo.guardarEvento(deps.db, r.id, ev.id, meet, deps.ahora());
  } catch (e) {
    console.error('agenda/crearEvento', e);
    await repo.marcarCalendarioPendiente(deps.db, r.id, deps.ahora());
    await deps.sendEmail({ from: remitente(env), to: env.NOTIFICATION_EMAIL, ...correoEquipoAlerta({ asunto: 'Cita de link sin calendario',
      detalle: `${r.nombre} (${r.whatsapp}) agendó ${tipo.nombre} para ${etiquetaLima(r.inicio_utc)} con ${n.nombre}, pero no se pudo crear el evento. Créalo a mano e invita a ${r.email}.` }) });
  }
  await deps.sendEmail({
    from: remitente(env), to: r.email,
    ...correoCitaAgenda({ nombre: r.nombres || r.nombre, titulo: tipo.nombre, etiqueta: etiquetaLima(r.inicio_utc), duracion: tipo.duracion_min,
      modalidad: r.modalidad, direccion: contacto.direccion, meet, nutricionista: n.nombre,
      urlIcs: `${siteUrl(env)}/api/reservas/ics?r=${r.token}` }),
  });
  return { meet };
}
