// Precio, peso para el tope y si pide DNI, a partir de src/data/plans.js (la
// misma fuente que pinta la web). El servidor cotiza siempre: nunca confía en
// un monto que mande el navegador.
import { plans } from '../../src/data/plans.js';
import { PESO_EVALUACION } from './constantes.mjs';

const MENSUALES = new Set(['acompanamiento', 'constancia', 'transformacion']);
const DNI_DESDE_CENTIMOS = 70000; // boleta con DNI si el total supera S/700

function armar(titulo, soles, duracion_meses, peso) {
  const monto_centimos = Math.round(soles * 100);
  return { titulo, monto_centimos, duracion_meses, peso, requiereDni: monto_centimos > DNI_DESDE_CENTIMOS };
}

export function cotizar(producto, duracion) {
  if (!Object.hasOwn(plans, producto)) return null;
  const plan = plans[producto];
  if (MENSUALES.has(producto)) {
    if (duracion === 1) return armar(`${plan.name} · 1 mes`, plan.price, 1, 1);
    if (duracion === 3) return armar(`${plan.name} · 3 meses`, plan.programs[0].totalSoles, 3, 1);
    return null;
  }
  if (duracion !== 1) return null;
  if (producto === 'evaluacion') return armar(plan.name, plan.price, 1, PESO_EVALUACION);
  if (producto === 'basico') return armar(plan.name, plan.price, 1, 1);
  return null;
}
