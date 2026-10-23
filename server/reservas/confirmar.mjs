// Qué pasa cuando Mercado Pago dice que hubo un pago. Lo llaman el webhook y,
// como respaldo, la página de regreso del paciente: los dos pueden llegar a la
// vez, así que todo es idempotente y solo el que confirma en la base crea el
// evento y manda los correos.
import * as repo from './repo.mjs';
import { horasLibres, topeMinutosDia } from './disponibilidad.mjs';
import { cotizar } from './catalogo.mjs';
import { etiquetaLima, finDeReserva, inicioUtc, sumarDias } from './tiempo.mjs';
import { correoConfirmacion, correoEquipoConfirmada, correoSinHora, correoEquipoAlerta } from './correos.mjs';
import { siteUrl } from '../http.mjs';
import { contacto } from '../../src/data/contacto.js';
import { eventoEquipo } from './evento-equipo.mjs';
import { avisarEquipo } from './aviso-equipo.mjs';

const remitente = (env) => env.NEWSLETTER_FROM || 'AJL Nutrición <hola@ajlnutricion.com>';

async function alertaEquipo(deps, env, asunto, detalle) {
  await deps.sendEmail({ from: remitente(env), to: env.NOTIFICATION_EMAIL, ...correoEquipoAlerta({ asunto, detalle }) });
}

async function sinHora(deps, env, r) {
  const res = await repo.marcarSinHora(deps.db, r.id, deps.ahora());
  if (res.meta.changes !== 1) return { estado: 'pagada_sin_hora' };
  const urlReubicar = `${siteUrl(env)}/reservar/reubicar/?r=${r.token}`;
  await Promise.all([
    deps.sendEmail({ from: remitente(env), to: r.email, ...correoSinHora({ nombre: r.nombre, urlReubicar }) }),
    alertaEquipo(deps, env, 'Pago sin hora', `${r.nombre} (${r.whatsapp}) pagó pero su hora se ocupó. Se le pidió elegir otra: ${urlReubicar}`),
  ]);
  return { estado: 'pagada_sin_hora' };
}

export async function finalizarConfirmacion(deps, env, r) {
  const nutricionista = deps.nutricionistas.find((n) => n.id === r.nutricionista_id);
  const precio = cotizar(r.producto, r.duracion_meses);
  const titulo = precio ? precio.titulo : r.producto;
  const etiqueta = etiquetaLima(r.inicio_utc);
  let meet = null;
  let pendiente = false;
  try {
    const ev = await deps.google.crearEvento({
      reservaId: r.id,
      ...eventoEquipo(r, nutricionista),
      inicioUtc: r.inicio_utc,
      finUtc: finDeReserva(r),
      modalidad: r.modalidad,
      direccion: contacto.direccion,
      invitado: { email: r.email, nombre: r.nombre },
    });
    meet = ev.meet;
    await repo.guardarEvento(deps.db, r.id, ev.id, meet, deps.ahora());
  } catch (e) {
    console.error('crearEvento', e);
    pendiente = true;
    await repo.marcarCalendarioPendiente(deps.db, r.id, deps.ahora());
  }
  await Promise.all([
    deps.sendEmail({
      from: remitente(env), to: r.email,
      ...correoConfirmacion({ nombre: r.nombre, titulo, etiqueta, modalidad: r.modalidad, direccion: contacto.direccion, meet,
        nutricionista: nutricionista.nombre, urlIcs: `${siteUrl(env)}/api/reservas/ics?r=${r.token}` }),
    }),
    deps.sendEmail({
      from: remitente(env), to: env.NOTIFICATION_EMAIL,
      ...correoEquipoConfirmada({ nombre: r.nombre, whatsapp: r.whatsapp, email: r.email, dni: r.dni,
        tipo_documento: r.tipo_documento, fecha_nacimiento: r.fecha_nacimiento, titulo, etiqueta,
        modalidad: r.modalidad, nutricionista: nutricionista.nombre, monto: r.monto_centimos / 100,
        calendarioPendiente: pendiente, novedades: Boolean(r.novedades_optin) }),
    }),
    avisarEquipo(deps, env, { tipo: 'nueva', r }),
  ]);
}

export async function procesarPago(deps, env, paymentId, { reservaId = null } = {}) {
  const pago = await deps.mp.obtenerPago(paymentId);
  const id = pago?.external_reference;
  if (!id || (reservaId && id !== reservaId)) return { estado: 'desconocido' };
  let r = await repo.reservaPorId(deps.db, id);
  if (!r) return { estado: 'desconocido' };

  const montoPagado = Math.round(Number(pago.transaction_amount) * 100);
  // Lo que queda tras la comisión de Mercado Pago; un pago pendiente aún no lo trae (0 o sin dato).
  const neto = Number(pago.transaction_details?.net_received_amount);
  await repo.registrarPago(deps.db, { reserva_id: r.id, mp_payment_id: String(pago.id), estado: pago.status,
    monto_centimos: montoPagado, metodo: pago.payment_method_id || null, neto_centimos: neto > 0 ? Math.round(neto * 100) : null,
    ahora: deps.ahora() });

  if (pago.status !== 'approved') return { estado: r.estado, pago: pago.status };
  if (r.estado === 'confirmada' || r.estado === 'pagada_sin_hora') {
    const otro = await repo.otroPagoAprobado(deps.db, r.id, String(pago.id));
    if (otro) {
      await alertaEquipo(deps, env, 'Pago duplicado: devolver',
        `${r.nombre} (${r.whatsapp}) pagó dos veces la reserva ${r.id}: pagos ${otro.mp_payment_id} y ${pago.id}. Devuelve uno desde Mercado Pago.`);
    }
    return { estado: r.estado };
  }
  if (pago.currency_id !== 'PEN' || montoPagado !== r.monto_centimos) {
    await alertaEquipo(deps, env, 'Pago con monto distinto',
      `Reserva ${r.id}: Mercado Pago cobró ${pago.transaction_amount} ${pago.currency_id}; se esperaba ${r.monto_centimos / 100} PEN. Pago ${pago.id}.`);
    return { estado: 'monto_invalido' };
  }

  if (r.estado === 'expirada') {
    // Pagó tarde: solo se revive si la hora sigue libre de verdad.
    try {
      const eventos = await deps.google.listarEventos(inicioUtc(r.fecha_lima, 0), inicioUtc(sumarDias(r.fecha_lima, 1), 0));
      const reservas = await repo.reservasActivasEntre(deps.db, r.fecha_lima, sumarDias(r.fecha_lima, 1), deps.ahora());
      const sigue = horasLibres({ fecha: r.fecha_lima, modalidad: r.modalidad, nutricionistas: deps.nutricionistas,
        eventos, reservas, ahora: deps.ahora(), filtroNutricionista: r.nutricionista_id, desdeDias: 0,
        // Con la duración real de la cita; paso de 30 porque una cita corta puede empezar a y media.
        duracionMin: r.duracion_min ?? 60, pasoMin: 30 })
        .some((h) => h.inicio === r.inicio_utc);
      if (!sigue) return sinHora(deps, env, r);
    } catch (e) {
      console.error('verificar hora vencida', e);
      return sinHora(deps, env, r);
    }
  }

  const res = await repo.confirmarReserva(deps.db, { id: r.id, fecha_lima: r.fecha_lima, tope: topeMinutosDia(r.fecha_lima), ahora: deps.ahora() });
  if (!res.ok) {
    if (res.motivo === 'ya_confirmada') return { estado: 'confirmada' };
    return sinHora(deps, env, r);
  }
  r = await repo.reservaPorId(deps.db, r.id);
  try {
    await finalizarConfirmacion(deps, env, r);
  } catch (e) {
    console.error('finalizarConfirmacion', e);
    await alertaEquipo(deps, env, 'Reserva confirmada sin aviso',
      `Reserva ${r.id} quedó confirmada pero falló el aviso: ${e.message}. Revisa el calendario y escríbele al paciente.`);
  }
  return { estado: 'confirmada' };
}
