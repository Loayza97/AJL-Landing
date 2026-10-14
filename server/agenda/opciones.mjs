// Listas de «Plan» y «Qué cita es» de los links de agenda. Fuente única: la usan
// el servidor (validar, Agendados, CSV, calendario) y /panel/links/ (los <select>).
// En la base va la clave (`constancia:3`, `2`); la etiqueta se arma aquí.
import { plans, monthlyPlans } from '../../src/data/plans.js';
import { TIPOS_LINK } from './tipos.mjs';
import { duracionesDe } from '../../src/data/duraciones.js';

const meses = (n) => (n === 1 ? '1 mes' : `${n} meses`);

// Nombre interno del equipo + nombre que ve el paciente; los planes mensuales con su duración.
export const PLANES = [
  { id: 'evaluacion', etiqueta: 'Evaluación nutricional' },
  { id: plans.basico.id, etiqueta: `${plans.basico.internalName} · ${plans.basico.name}` },
  ...monthlyPlans.flatMap((p) => duracionesDe(p.id).map((d) => ({ id: `${p.id}:${d.meses}`, etiqueta: `${p.internalName} · ${p.name} · ${meses(d.meses)}` }))),
  { id: 'otro', etiqueta: 'Otro' },
];

// Abreviatura femenina del ordinal como se escribe en Perú: 1ra, 2da, 3ra, 4ta,
// 5ta, 6ta, 7ma, 8va, 9na, 10ma, 11va, 12va; desde la 13 la da la última cifra
// (decimotercera → 13ra, vigésima → 20ma, vigesimocuarta → 24ta).
const SUFIJOS = ['ra', 'da', 'ra', 'ta', 'ta', 'ta', 'ma', 'va', 'na', 'ma', 'va', 'va'];
export const ordinal = (n) => `${n}${n <= 12 ? SUFIJOS[n - 1] : SUFIJOS[(n % 10 || 10) - 1]}`;

export const MAX_CITA = 24;
export const CITAS = [
  ...Array.from({ length: MAX_CITA }, (_, i) => ({ id: String(i + 1), etiqueta: i === 0 ? '1ra sesión' : `${ordinal(i + 1)} sesión (control)` })),
  { id: 'evaluacion_mes', etiqueta: 'Evaluación de fin de mes' },
];

// Map y no objeto: así «__proto__» o «toString» no pasan como claves válidas.
const PLAN = new Map(PLANES.map((p) => [p.id, p.etiqueta]));
const CITA = new Map(CITAS.map((c) => [c.id, c.etiqueta]));

export const etiquetaPlan = (id) => PLAN.get(id) ?? null;

// Lo que el paciente ve del plan en el mensaje de WhatsApp: el nombre público,
// nunca el interno del equipo. «Otro» o sin plan devuelve null (va el tipo de sesión).
export function productoPaciente(id) {
  if (!planValido(id) || id === 'otro') return null;
  if (id === 'evaluacion') return 'Evaluación nutricional';
  const [planId, m] = id.split(':');
  const nombre = plans[planId].name.replace(/^U/, 'u');
  return `Plan de ${nombre}${m ? ` por ${meses(Number(m))}` : ''}`;
}
export const etiquetaCita = (id) => CITA.get(id) ?? null;
export const planValido = (id) => typeof id === 'string' && PLAN.has(id);
export const citaValida = (id) => typeof id === 'string' && CITA.has(id);

// Un control de 30 min nunca es la primera sesión: solo la sesión de 1 hora puede serlo.
export const MSJ_CITA_30 = 'Un control de 30 min no puede ser la primera sesión. Usa la sesión de 1 hora.';
export const citasDeTipo = (tipo) => (TIPOS_LINK[tipo]?.duracion_min === 30 ? CITAS.filter((c) => c.id !== '1') : CITAS);
export const citaValidaParaTipo = (tipo, id) => typeof id === 'string' && citasDeTipo(tipo).some((c) => c.id === id);
