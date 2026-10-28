// Cuota, penalidad y número de cobros de una suscripción (spec 2026-10-27). Todo sale
// de plans.js / duraciones.js: ningún monto escrito a mano.
// Cuota = porMes de la duración. Sin renovación: el paquete son duracion_meses cobros.
// Penalidad (Joaquín, 28-oct): los meses pagados se recalculan al precio que les habría
// tocado (en el paquete de 6, si ya pasaron 3 meses, esos 3 al precio del paquete de 3;
// los demás a mes a mes) y se paga la diferencia con lo pagado. Mes a mes: 0.
import { plans } from '../../src/data/plans.js';
import { duracionesDe, formatoSoles } from '../../src/data/duraciones.js';

const DIA = 86400000;

export function condicionesSuscripcion(producto, meses) {
  if (!Object.hasOwn(plans, producto)) return null;
  const durs = duracionesDe(producto);
  if (!durs) return null;
  const d = durs.find((x) => x.meses === Number(meses));
  if (!d) return null;
  const unMes = d.meses === 1;
  return {
    producto, duracion_meses: d.meses,
    cuota_centimos: d.porMes * 100,
    precio_mes_centimos: durs[0].porMes * 100,
    precio_3m_centimos: d.meses === 6 ? durs.find((x) => x.meses === 3).porMes * 100 : null,
    ahorro_mes_centimos: (durs[0].porMes - d.porMes) * 100,
    cobros: unMes ? null : d.meses,
    titulo: `${plans[producto].name} · ${unMes ? 'mes a mes' : `${d.meses} meses`} · pago mensual`,
  };
}

// Cuántos de los meses pagados van al precio del paquete de 3 (solo en el de 6, desde el mes 3).
const bloqueDe = (s) => (s.duracion_meses === 6 && s.cobros_aprobados >= 3 && s.precio_3m_centimos ? 3 : 0);
const aplica = (s) => s.duracion_meses > 1 && s.cobros_aprobados >= 1 && s.cobros_aprobados < s.duracion_meses;

// Se paga si ya hubo al menos un cobro y todavía falta alguno del paquete.
export function penalidadAlCancelar(s) {
  if (!aplica(s)) return 0;
  const n = s.cobros_aprobados;
  const b = bloqueDe(s);
  return Math.max(0, b * (s.precio_3m_centimos ?? 0) + (n - b) * s.precio_mes_centimos - n * s.cuota_centimos);
}

const soles = (c) => formatoSoles(Math.round(c / 100));
const meses = (n) => (n === 1 ? '1 mes' : `${n} meses`);
export function detallePenalidad(s) {
  if (!penalidadAlCancelar(s)) return '';
  const n = s.cobros_aprobados;
  const b = bloqueDe(s);
  const partes = [b ? `${meses(b)} a ${soles(s.precio_3m_centimos)}` : null, n - b ? `${meses(n - b)} a ${soles(s.precio_mes_centimos)}` : null].filter(Boolean);
  return `${partes.join(' + ')}, menos los ${soles(n * s.cuota_centimos)} que pagaste`;
}

// end_date para Mercado Pago, de respaldo: el sistema cancela tras el último cobro,
// pero si no pudiera, Mercado Pago tampoco cobra de más.
export function finDeCobros(desde, cobros) {
  if (!cobros) return null;
  const f = new Date(desde.getTime());
  f.setUTCMonth(f.getUTCMonth() + cobros - 1);
  return new Date(f.getTime() + 15 * DIA).toISOString();
}

export const esUltimoCobro = (s, numero) => s.duracion_meses > 1 && numero >= s.duracion_meses;
