// Título y descripción del evento en el calendario del equipo. Una sola fuente
// para la web (confirmar.mjs) y los links (agenda/finalizar.mjs): los dos
// flujos mandan los mismos datos (Joaquín y Alejandro, 2026-10-19).
// El paciente está invitado y ve todo esto: es su propio plan.
// Título: «Nombre · 2 sesiones al mes · 2 de 7»; pago único: «Nombre · 1 de 1».
import { plans } from '../../src/data/plans.js';
import { etiquetaPlan, etiquetaCita, PAGO_UNICO, clavePlan } from '../agenda/opciones.mjs';

const UNICO = new Set(['evaluacion', 'basico']);

// La web guarda producto y meses; el link, la clave de opciones.mjs. Se lleva todo a esa clave.
function planYCita(r) {
  if (r.link_id) return { plan: r.link_plan ?? null, cita: r.link_cita ?? null };
  const plan = UNICO.has(r.producto) ? clavePlan(r.producto, PAGO_UNICO) : clavePlan(r.producto, String(r.duracion_meses));
  return { plan, cita: '1' };
}

function sesionesAlMes(plan) {
  const producto = String(plan ?? '').split(':')[0];
  if (!plan?.includes(':') || !Object.hasOwn(plans, producto)) return null;
  const n = plans[producto].sessionsPerMonth;
  return n === 1 ? '1 sesión al mes' : `${n} sesiones al mes`;
}

export function eventoEquipo(r, nutricionista) {
  const { plan, cita } = planYCita(r);
  const producto = etiquetaPlan(plan)?.replace(', ', ' · ') ?? null;
  const citaTexto = etiquetaCita(plan, cita ?? '1') ?? '1ra sesión';
  const titulo = [r.nombre, sesionesAlMes(plan), citaTexto].filter(Boolean).join(' · ');
  const descripcion = [
    producto && `Producto: ${producto}`,
    `Cita: ${citaTexto}`,
    `Nutricionista: ${nutricionista.nombre}`,
    `WhatsApp: ${r.whatsapp}`,
    `Correo: ${r.email}`,
    `Procedencia: ${r.link_id ? 'Link de un solo uso' : 'Web (pagado)'}`,
    `Reserva: ${r.id}`,
  ].filter(Boolean).join('\n');
  return { titulo, descripcion };
}
