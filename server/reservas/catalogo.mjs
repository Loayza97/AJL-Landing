// Precio, peso para el tope y título, a partir de src/data/plans.js (la misma
// fuente que pinta la web). El servidor cotiza siempre: nunca confía en un
// monto que mande el navegador. El documento se pide en toda compra.
import { plans } from '../../src/data/plans.js';
import { duracionesDe } from '../../src/data/duraciones.js';
import { PESO_EVALUACION } from './constantes.mjs';

function armar(titulo, soles, duracion_meses, peso) {
  return { titulo, monto_centimos: Math.round(soles * 100), duracion_meses, peso, requiereDni: true };
}

export function cotizar(producto, duracion) {
  if (!Object.hasOwn(plans, producto)) return null;
  const plan = plans[producto];
  const opciones = duracionesDe(producto);
  if (opciones) {
    const o = opciones.find((x) => x.meses === duracion);
    if (!o) return null;
    return armar(`${plan.name} · ${o.meses === 1 ? '1 mes' : `${o.meses} meses`}`, o.total, o.meses, 1);
  }
  if (duracion !== 1) return null;
  if (producto === 'evaluacion') return armar(plan.name, plan.price, 1, PESO_EVALUACION);
  if (producto === 'basico') return armar(plan.name, plan.price, 1, 1);
  return null;
}
