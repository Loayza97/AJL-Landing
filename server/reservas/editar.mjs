// Editar una cita desde el panel (spec 2026-10-22-editar-cita-design.md):
// base primero (sin tope, sin cruces) y después el mismo evento de Google.
// Si Google falla, la cita queda editada y marcada pendiente, como al agendar.
import * as repo from './repo.mjs';
import { fechaLima, finDeReserva } from './tiempo.mjs';
import { eventoEquipo } from './evento-equipo.mjs';
import { correoEquipoAlerta } from './correos.mjs';
import { contacto } from '../../src/data/contacto.js';

const MOD = { presencial: 'presencial', video: 'virtual' };
// H:mm, sin cero a la izquierda en la hora («9:00», «15:30»).
const hora = (iso) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${Number(p.hour)}:${p.minute}`;
};
const dia = (iso) => new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', weekday: 'short', day: 'numeric', month: 'short' })
  .format(new Date(iso)).replace(/\./g, '').replace(',', '');

export function textoCambios(antes, despues, nutricionistas) {
  const nombre = (id) => nutricionistas.find((n) => n.id === id)?.nombre ?? id;
  const partes = [];
  if (antes.inicio_utc !== despues.inicio_utc) {
    partes.push(fechaLima(new Date(antes.inicio_utc)) === fechaLima(new Date(despues.inicio_utc))
      ? `${hora(antes.inicio_utc)} → ${hora(despues.inicio_utc)}`
      : `${dia(antes.inicio_utc)} ${hora(antes.inicio_utc)} → ${dia(despues.inicio_utc)} ${hora(despues.inicio_utc)}`);
  }
  if (antes.modalidad !== despues.modalidad) partes.push(`${MOD[antes.modalidad]} → ${MOD[despues.modalidad]}`);
  if (antes.nutricionista_id !== despues.nutricionista_id) partes.push(`${nombre(antes.nutricionista_id)} → ${nombre(despues.nutricionista_id)}`);
  return partes.join(' · ') || 'sin cambios';
}

const remitente = (env) => env.NEWSLETTER_FROM || 'AJL Nutrición <hola@ajlnutricion.com>';

// Lleva el evento de Google a la cita ya editada en la base. Devuelve 'ok' o 'pendiente'.
// Solo si cambió la modalidad se toca el Meet o la dirección del evento.
export async function sincronizarEventoEditado(deps, env, r, { modalidadAnterior }) {
  const n = deps.nutricionistas.find((x) => x.id === r.nutricionista_id);
  const datos = { ...eventoEquipo(r, n), inicioUtc: r.inicio_utc, finUtc: finDeReserva(r), modalidad: r.modalidad, direccion: contacto.direccion };
  const cambiaModalidad = r.modalidad !== modalidadAnterior;
  try {
    let ev;
    let meet;
    try {
      if (!r.google_event_id) throw Object.assign(new Error('sin evento'), { noExiste: true });
      ev = await deps.google.actualizarEvento(r.google_event_id, { ...datos, cambiaModalidad });
      meet = cambiaModalidad ? ev.meet : (ev.meet ?? r.meet_url);
    } catch (e) {
      if (!e.noExiste) throw e;
      ev = await deps.google.crearEvento({ reservaId: r.id, ...datos, invitado: { email: r.email, nombre: r.nombre } });
      meet = ev.meet;
    }
    await repo.guardarEvento(deps.db, r.id, ev.id, meet, deps.ahora());
    return 'ok';
  } catch (e) {
    console.error('editar/google', e);
    try { await repo.marcarCalendarioPendiente(deps.db, r.id, deps.ahora()); } catch (x) { console.error('editar/pendiente', x); }
    await deps.sendEmail({ from: remitente(env), to: env.NOTIFICATION_EMAIL, ...correoEquipoAlerta({
      asunto: 'Cita editada sin calendario',
      detalle: `${r.nombre}: la cita se cambió en el panel (${r.edicion_cambios}) pero Google Calendar no se pudo actualizar. Revisar el evento a mano. Reserva ${r.id}.`,
    }) }).catch((x) => console.error('editar/alerta', x));
    return 'pendiente';
  }
}
