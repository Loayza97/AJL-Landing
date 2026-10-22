// Duraciones de cada plan con acompañamiento y su ahorro frente a pagar mes a
// mes. Lo usan el servidor (cotizar), /reservar y la landing: una sola cuenta.
import { plans } from './plans.js';

// Semanas que se puede congelar cada paquete (condiciones del servicio).
const CONGELAR_SEMANAS = { 3: 1, 6: 2 };

export const formatoSoles = (n) => `S/${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;

export function duracionesDe(id) {
  if (!Object.hasOwn(plans, id)) return null;
  const p = plans[id];
  if (p.single || !Array.isArray(p.programs)) return null;
  const mes = { meses: 1, total: p.price, porMes: p.price, ahorro: 0, ahorroPct: 0, congelarSemanas: 0 };
  return [mes, ...p.programs.map((g) => {
    const normal = p.price * g.months;
    const ahorro = normal - g.totalSoles;
    return {
      meses: g.months, total: g.totalSoles, porMes: Math.round(g.totalSoles / g.months),
      ahorro, ahorroPct: Math.round((ahorro * 100) / normal), congelarSemanas: CONGELAR_SEMANAS[g.months],
    };
  })];
}
