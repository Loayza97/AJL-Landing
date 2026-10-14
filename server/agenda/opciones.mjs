// Listas de «Producto», «Duración» y «Cita» de los links de agenda (pedido de
// Alejandro del 2026-10-14: tres campos, cada uno depende del anterior). Fuente
// única: la usan el servidor (validar, Agendados, CSV) y /panel/links/.
// En la base va la clave del plan (`evaluacion`, `basico`, `constancia:3`) y el
// número de cita (`2`); la etiqueta se arma aquí.
import { plans } from '../../src/data/plans.js';
import { duracionesDe } from '../../src/data/duraciones.js';

const meses = (n) => (n === 1 ? '1 mes' : `${n} meses`);

// Producto con el nombre interno del equipo. Evaluación y Básico son de pago único.
export const PRODUCTOS = [
  { id: 'evaluacion', etiqueta: 'Evaluación' },
  ...['basico', 'acompanamiento', 'constancia', 'transformacion'].map((id) => ({ id, etiqueta: plans[id].internalName })),
];
const UNICO = new Set(['evaluacion', 'basico']);
export const PAGO_UNICO = 'unico';

// Duraciones de un producto: «Pago único» o los meses de sus paquetes (1, 3 y 6).
export function duracionesDeProducto(producto) {
  if (UNICO.has(producto)) return [{ id: PAGO_UNICO, etiqueta: 'Pago único' }];
  if (!PRODUCTOS.some((p) => p.id === producto)) return [];
  return duracionesDe(producto).map((d) => ({ id: String(d.meses), etiqueta: meses(d.meses) }));
}

// Clave que va a la base: el producto solo si es de pago único, si no `producto:meses`.
export const clavePlan = (producto, duracion) => (duracion === PAGO_UNICO ? producto : `${producto}:${duracion}`);

const PLAN = new Map(PRODUCTOS.flatMap((p) => duracionesDeProducto(p.id).map((d) => [clavePlan(p.id, d.id),
  { etiqueta: d.id === PAGO_UNICO ? p.etiqueta : `${p.etiqueta}, ${d.etiqueta}`,
    total: d.id === PAGO_UNICO ? 1 : plans[p.id].sessionsPerMonth * Number(d.id), evalMes: Boolean(plans[p.id]?.firstMonthEval) }])));

// Links creados antes del 2026-10-14 pudieron guardar «Otro»: se sigue mostrando, ya no se ofrece.
const VIEJOS = new Map([['otro', 'Otro']]);

export const MAX_CITA = 24;
export const EVAL_MES = { id: 'evaluacion_mes', etiqueta: 'Evaluación de fin de mes' };

// Citas del plan: «1 de N» hasta N (sesiones al mes × meses), más la evaluación
// del primer mes en los planes que la incluyen.
export function citasDePlan(plan) {
  const p = PLAN.get(plan);
  if (!p) return [];
  const lista = Array.from({ length: p.total }, (_, i) => ({ id: String(i + 1), etiqueta: `${i + 1} de ${p.total}` }));
  return p.evalMes ? [...lista, EVAL_MES] : lista;
}

export const etiquetaPlan = (id) => PLAN.get(id)?.etiqueta ?? VIEJOS.get(id) ?? null;
export const planValido = (id) => typeof id === 'string' && PLAN.has(id);
export const citaValida = (plan, id) => typeof id === 'string' && citasDePlan(plan).some((c) => c.id === id);

// Abreviatura femenina del ordinal como se escribe en Perú (1ra, 2da, 3ra, 4ta…).
// Solo para links viejos cuyo plan no da el total de citas.
const SUFIJOS = ['ra', 'da', 'ra', 'ta', 'ta', 'ta', 'ma', 'va', 'na', 'ma', 'va', 'va'];
export const ordinal = (n) => `${n}${n <= 12 ? SUFIJOS[n - 1] : SUFIJOS[(n % 10 || 10) - 1]}`;

export function etiquetaCita(plan, id) {
  if (id === EVAL_MES.id) return EVAL_MES.etiqueta;
  if (typeof id !== 'string' || !/^\d{1,2}$/.test(id)) return null;
  const n = Number(id);
  if (n < 1 || n > MAX_CITA) return null;
  const total = PLAN.get(plan)?.total;
  if (total && n <= total) return `${n} de ${total}`;
  return n === 1 ? '1ra sesión' : `${ordinal(n)} sesión`;
}
