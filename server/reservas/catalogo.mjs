// Precio, peso para el tope y título, a partir de src/data/plans.js (la misma
// fuente que pinta la web). El servidor cotiza siempre: nunca confía en un
// monto que mande el navegador. El documento se pide en toda compra.
import { plans } from '../../src/data/plans.js';
import { duracionesDe } from '../../src/data/duraciones.js';
import { PESO_EVALUACION } from './constantes.mjs';
import { condicionesSuscripcion } from '../suscripciones/calculo.mjs';

function armar(titulo, soles, duracion_meses, peso) {
  return { titulo, monto_centimos: Math.round(soles * 100), duracion_meses, peso, requiereDni: true };
}

// forma 'mensual' (spec 2026-10-27): la cuota del paquete, cobrada cada mes por Mercado Pago.
export function cotizar(producto, duracion, forma = 'completo') {
  if (forma === 'mensual') {
    if (!Object.hasOwn(plans, producto)) return null; // 'prueba' es interno: solo se crea desde el panel
    const c = condicionesSuscripcion(producto, duracion);
    if (!c) return null;
    return { ...armar(c.titulo, c.cuota_centimos / 100, c.duracion_meses, 1), forma: 'mensual',
      precio_mes_centimos: c.precio_mes_centimos, precio_3m_centimos: c.precio_3m_centimos, cobros: c.cobros };
  }
  if (forma !== 'completo') return null;
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
