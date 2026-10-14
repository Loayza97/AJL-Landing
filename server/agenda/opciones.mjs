// Listas de «Plan» y «Qué cita es» de los links de agenda. Fuente única: la usan
// el servidor (validar, Agendados, CSV, calendario) y /panel/links/ (los <select>).
// En la base va la clave (`constancia:3`, `2`); la etiqueta se arma aquí.
import { plans, monthlyPlans } from '../../src/data/plans.js';
import { duracionesDe } from '../../src/data/duraciones.js';

const meses = (n) => (n === 1 ? '1 mes' : `${n} meses`);

// Mismos nombres que ve el paciente en la web, cada plan con sus duraciones.
export const PLANES = [
  { id: 'evaluacion', etiqueta: 'Evaluación nutricional' },
  { id: plans.basico.id, etiqueta: plans.basico.name },
  ...monthlyPlans.flatMap((p) => duracionesDe(p.id).map((d) => ({ id: `${p.id}:${d.meses}`, etiqueta: `${p.name} · ${meses(d.meses)}` }))),
  { id: 'otro', etiqueta: 'Otro' },
];

// Abreviatura femenina del ordinal como se escribe en Perú: 1ra, 2da, 3ra, 4ta,
// 5ta, 6ta, 7ma, 8va, 9na, 10ma y desde la 11 «va» (11va, 12va… 24va).
const SUFIJOS = ['ra', 'da', 'ra', 'ta', 'ta', 'ta', 'ma', 'va', 'na', 'ma'];
export const ordinal = (n) => `${n}${n <= 10 ? SUFIJOS[n - 1] : 'va'}`;

export const MAX_CITA = 24;
export const CITAS = [
  ...Array.from({ length: MAX_CITA }, (_, i) => ({ id: String(i + 1), etiqueta: i === 0 ? '1ra sesión' : `${ordinal(i + 1)} sesión (control)` })),
  { id: 'evaluacion_mes', etiqueta: 'Evaluación de fin de mes' },
];

// Map y no objeto: así «__proto__» o «toString» no pasan como claves válidas.
const PLAN = new Map(PLANES.map((p) => [p.id, p.etiqueta]));
const CITA = new Map(CITAS.map((c) => [c.id, c.etiqueta]));

export const etiquetaPlan = (id) => PLAN.get(id) ?? null;
export const etiquetaCita = (id) => CITA.get(id) ?? null;
export const planValido = (id) => typeof id === 'string' && PLAN.has(id);
export const citaValida = (id) => typeof id === 'string' && CITA.has(id);
