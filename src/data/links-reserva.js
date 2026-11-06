// Links directos a /reservar/ por producto y duración (Joaquín, 2026-10-26): con
// `meses` caen en el calendario. Los usa /reservar/ para leerlos y escribirlos en
// la barra de direcciones, y el panel para la lista «Links de reserva».
import { plans, monthlyPlans } from './plans.js';
import { duracionesDe } from './duraciones.js';

const meses = (n) => (n === 1 ? 'Mes a mes' : `${n} meses`);

export const linkReserva = (plan, n, forma) => `/reservar/?plan=${plan}${n ? `&meses=${n}` : ''}${forma === 'mensual' ? '&forma=mensual' : ''}`;

// Qué paso abre un link: duración válida → calendario; plan mensual sin ella → duraciones;
// plan de pago único → calendario (siempre pago completo); plan desconocido → paso 1.
export function destinoLink(plan, n, forma) {
  if (!plan || !Object.hasOwn(plans, plan)) return { paso: 'p1' };
  const durs = duracionesDe(plan);
  if (!durs) return { paso: 'p3', plan, forma: 'completo' };
  const d = durs.find((x) => String(x.meses) === String(n));
  // El mes a mes no tiene pago mensual automático: un link con &forma=mensual abre el pago único (2026-11-06).
  return d ? { paso: 'p3', plan, meses: d.meses, forma: forma === 'mensual' && d.meses > 1 ? 'mensual' : 'completo' } : { paso: 'p2', plan };
}

export const LINKS_RESERVA = [
  ...monthlyPlans.flatMap((p) => duracionesDe(p.id).map((d) => ({
    producto: p.internalName, detalle: `${p.name}, ${meses(d.meses).toLowerCase()}`, ruta: linkReserva(p.id, d.meses), // Sin «Copiar (mensual)» en el mes a mes: cobraría sin fin (Alejandro, 2026-11-06).
    rutaMensual: d.meses > 1 ? linkReserva(p.id, d.meses, 'mensual') : null,
  }))),
  { producto: plans.basico.internalName, detalle: plans.basico.name, ruta: linkReserva('basico') },
  { producto: 'Evaluación', detalle: 'Una evaluación', ruta: linkReserva('evaluacion') },
];
