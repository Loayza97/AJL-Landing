// Periodos de los filtros del panel, en hora de Lima. Devuelve límites ISO en
// UTC (null = sin límite) o null si los parámetros no sirven.
import { fechaLima, inicioUtc, sumarDias } from '../reservas/tiempo.mjs';

const DIA = 86400000;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const primeroDelMes = (fecha) => `${fecha.slice(0, 7)}-01`;
const mesSiguiente = (primero) => {
  const [a, m] = primero.split('-').map(Number);
  return m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, '0')}-01`;
};
const mesAnterior = (primero) => {
  const [a, m] = primero.split('-').map(Number);
  return m === 1 ? `${a - 1}-12-01` : `${a}-${String(m - 1).padStart(2, '0')}-01`;
};

export function rangoPeriodo({ periodo = '30', desde, hasta } = {}, ahora, sentido) {
  const hoy = fechaLima(ahora);
  switch (periodo) {
    case '30':
      return sentido === 'futuro'
        ? { desde: null, hasta: new Date(ahora.getTime() + 30 * DIA).toISOString() }
        : { desde: new Date(ahora.getTime() - 30 * DIA).toISOString(), hasta: null };
    case 'mes': {
      const p = primeroDelMes(hoy);
      return { desde: inicioUtc(p, 0), hasta: inicioUtc(mesSiguiente(p), 0) };
    }
    case 'mes_anterior': {
      const p = mesAnterior(primeroDelMes(hoy));
      return { desde: inicioUtc(p, 0), hasta: inicioUtc(mesSiguiente(p), 0) };
    }
    case 'rango':
      if (!FECHA.test(desde || '') || !FECHA.test(hasta || '') || desde > hasta) return null;
      return { desde: inicioUtc(desde, 0), hasta: inicioUtc(sumarDias(hasta, 1), 0) };
    case 'todo':
      return { desde: null, hasta: null };
    default:
      return null;
  }
}
