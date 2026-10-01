// Qué pasa cuando Mercado Pago dice que hubo un pago. Lo llaman el webhook y,
// como respaldo, la página de regreso del paciente: los dos pueden llegar a la
// vez, así que todo es idempotente y solo el que confirma en la base crea el
// evento y manda los correos.
import * as repo from './repo.mjs';
import { horasLibres, primerasManuales } from './disponibilidad.mjs';
import { cotizar } from './catalogo.mjs';
import { etiquetaLima, inicioUtc, sumarDias } from './tiempo.mjs';
import { TOPE_PRIMERAS } from './constantes.mjs';
import { correoConfirmacion, correoEquipoConfirmada, correoSinHora, correoEquipoAlerta } from './correos.mjs';
import { siteUrl } from '../http.mjs';
import { contacto } from '../../src/data/contacto.js';

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
  const prefijo = r.producto === 'evaluacion' ? 'Eval' : '1ra';
  let meet = null;
  let pendiente = false;
  try {
    const ev = await deps.google.crearEvento({
      reservaId: r.id,
      titulo: `${prefijo} · ${r.nombre} · ${titulo}`,
      descripcion: `WhatsApp: ${r.whatsapp}\nCorreo: ${r.email}\nPlan: ${titulo}\nNutricionista: ${nutricionista.nombre}\nReservado y pagado en la web (${r.id}).`,
      inicioUtc: r.inicio_utc,
      finUtc: new Date(Date.parse(r.inicio_utc) + 3600 * 1000).toISOString(),
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
      ...correoEquipoConfirmada({ nombre: r.nombre, whatsapp: r.whatsapp, email: r.email, dni: r.dni, titulo, etiqueta,
        modalidad: r.modalidad, nutricionista: nutricionista.nombre, monto: r.monto_centimos / 100,
        calendarioPendiente: pendiente, novedades: Boolean(r.novedades_optin) }),
    }),
  ]);
}

export async function procesarPago(deps, env, paymentId, { reservaId = null } = {}) {
  const pago = await deps.mp.obtenerPago(paymentId);
  const id = pago?.external_reference;
  if (!id || (reservaId && id !== reservaId)) return { estado: 'desconocido' };
  let r = await repo.reservaPorId(deps.db, id);
  if (!r) return { estado: 'desconocido' };

  const montoPagado = Math.round(Number(pago.transaction_amount) * 100);
  await repo.registrarPago(deps.db, { reserva_id: r.id, mp_payment_id: String(pago.id), estado: pago.status,
    monto_centimos: montoPagado, metodo: pago.payment_method_id || null, ahora: deps.ahora() });

  if (pago.status !== 'approved') return { estado: r.estado, pago: pago.status };
  if (r.estado === 'confirmada' || r.estado === 'pagada_sin_hora') return { estado: r.estado };
  if (pago.currency_id !== 'PEN' || montoPagado !== r.monto_centimos) {
    await alertaEquipo(deps, env, 'Pago con monto distinto',
      `Reserva ${r.id}: Mercado Pago cobró ${pago.transaction_amount} ${pago.currency_id}; se esperaba ${r.monto_centimos / 100} PEN. Pago ${pago.id}.`);
    return { estado: 'monto_invalido' };
  }

  let manuales = 0;
  if (r.estado === 'expirada') {
    // Pagó tarde: solo se revive si la hora sigue libre de verdad.
    try {
      const eventos = await deps.google.listarEventos(inicioUtc(r.fecha_lima, 0), inicioUtc(sumarDias(r.fecha_lima, 1), 0));
      const reservas = await repo.reservasActivasEntre(deps.db, r.fecha_lima, sumarDias(r.fecha_lima, 1), deps.ahora());
      manuales = primerasManuales(eventos, r.fecha_lima);
      const sigue = horasLibres({ fecha: r.fecha_lima, modalidad: r.modalidad, peso: r.peso_tope, nutricionistas: deps.nutricionistas,
        eventos, reservas, ahora: deps.ahora(), filtroNutricionista: r.nutricionista_id, tope: TOPE_PRIMERAS, desdeDias: 0 })
        .some((h) => h.inicio === r.inicio_utc);
      if (!sigue) return sinHora(deps, env, r);
    } catch (e) {
      console.error('verificar hora vencida', e);
      return sinHora(deps, env, r);
    }
  }

  const res = await repo.confirmarReserva(deps.db, { id: r.id, fecha_lima: r.fecha_lima, primerasManuales: manuales, tope: TOPE_PRIMERAS, ahora: deps.ahora() });
  if (!res.ok) {
    if (res.motivo === 'ya_confirmada') return { estado: 'confirmada' };
    return sinHora(deps, env, r);
  }
  r = await repo.reservaPorId(deps.db, r.id);
  await finalizarConfirmacion(deps, env, r);
  return { estado: 'confirmada' };
}
