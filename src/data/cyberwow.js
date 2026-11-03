// Campaña Cyber Wow (02-nov-2026). Todo lo de la campaña sale de acá: la fecha
// límite y los porcentajes. Los porcentajes NO se escriben a mano: salen de
// duracionesDe() (la misma cuenta que usa /reservar y el servidor), así la
// portada, la reserva y el cobro no se contradicen.
//
// Qué es un «descuento» acá: lo que ahorra cada paquete de 3 o 6 meses frente a
// pagar el mes regular por esos meses. El mes suelto no tiene descuento.
//
// Cómo termina: pasada CYBER_FIN, el navegador marca <html data-cw="off"> y todo
// elemento con la clase `cw` se oculta solo (src/styles/cyberwow.css). No hace
// falta publicar nada el lunes; igual conviene quitar la campaña del código.
import { monthlyPlans } from './plans.js';
import { duracionesDe } from './duraciones.js';

// Domingo 8 de noviembre de 2026, 11:59:59 p. m., hora de Lima (UTC-5, sin horario de verano).
export const CYBER_FIN = '2026-11-08T23:59:59-05:00';
export const CYBER_FIN_TEXTO = 'domingo 8 de noviembre, 11:59 p. m. (hora de Lima)';

export const cyberActivo = (ahora = Date.now()) => ahora < Date.parse(CYBER_FIN);

// Porcentaje de ahorro de un paquete (3 o 6 meses) de un plan.
export function descuentoDe(id, meses) {
  const d = duracionesDe(id)?.find((o) => o.meses === meses);
  return d ? d.ahorroPct : 0;
}

// El mayor descuento de un plan (el de su paquete más largo).
export function descuentoMaxDe(id) {
  const d = duracionesDe(id);
  return d ? Math.max(...d.map((o) => o.ahorroPct)) : 0;
}

// El «hasta X%» de la estrella y la franja: el mayor de todos los planes.
export const descuentoMaxGlobal = () => Math.max(...monthlyPlans.map((p) => descuentoMaxDe(p.id)));
