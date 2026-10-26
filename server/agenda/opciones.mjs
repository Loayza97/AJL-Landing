// Listas de «Producto», «Duración» y «Cita» de los links de agenda (pedido de
// Alejandro del 2026-10-14: tres campos, cada uno depende del anterior). Fuente
// única: la usan el servidor (validar, Agendados, CSV) y /panel/links/.
// En la base va la clave del plan (`evaluacion`, `basico`, `constancia:3`) y el
// número de cita (`2`); la etiqueta se arma aquí.
import { plans } from '../../src/data/plans.js';
import { duracionesDe } from '../../src/data/duraciones.js';

const meses = (n) => (n === 1 ? '1 mes' : `${n} meses`);

// Producto con el nombre interno del equipo. Evaluación, Básico y Renovación
// Constancia son de pago único; la renovación trae 2 sesiones (Joaquín, 2026-10-21).
// Control Acompañamiento funciona igual que Acompañamiento (Joaquín, 2026-10-26).
export const PRODUCTOS = [
  { id: 'evaluacion', etiqueta: 'Evaluación' },
  ...['basico', 'acompanamiento'].map((id) => ({ id, etiqueta: plans[id].internalName })),
  { id: 'control_acompanamiento', etiqueta: 'Control Acompañamiento' },
  { id: 'constancia', etiqueta: plans.constancia.internalName },
  { id: 'renovacion_constancia', etiqueta: 'Renovación Constancia' },
  { id: 'transformacion', etiqueta: plans.transformacion.internalName },
];
// Producto que copia las duraciones y citas de un plan del catálogo.
const COMO = { control_acompanamiento: 'acompanamiento' };
const base = (producto) => COMO[producto] ?? producto;

// Productos que ofrece cada tarjeta de link (Joaquín, 2026-10-26): los controles de
// 30 min no son evaluación, básico ni acompañamiento; el presencial tampoco renovación.
const POR_TIPO = {
  c30v: ['constancia', 'renovacion_constancia', 'transformacion'],
  c30p: ['constancia', 'transformacion'],
  s60: PRODUCTOS.map((p) => p.id),
};
export const productosDeTipo = (tipo) => (Object.hasOwn(POR_TIPO, tipo) ? PRODUCTOS.filter((p) => POR_TIPO[tipo].includes(p.id)) : []);
export const productoDeTipo = (tipo, plan) => productosDeTipo(tipo).some((p) => p.id === String(plan).split(':')[0]);
// Citas de cada producto de pago único.
const CITAS_UNICO = { evaluacion: 1, basico: 1, renovacion_constancia: 2 };
const UNICO = new Set(Object.keys(CITAS_UNICO));
export const PAGO_UNICO = 'unico';

// Duraciones de un producto: «Pago único» o los meses de sus paquetes (1, 3 y 6).
export function duracionesDeProducto(producto) {
  if (UNICO.has(producto)) return [{ id: PAGO_UNICO, etiqueta: 'Pago único' }];
  if (!PRODUCTOS.some((p) => p.id === producto)) return [];
  return duracionesDe(base(producto)).map((d) => ({ id: String(d.meses), etiqueta: meses(d.meses) }));
}

// Clave que va a la base: el producto solo si es de pago único, si no `producto:meses`.
export const clavePlan = (producto, duracion) => (duracion === PAGO_UNICO ? producto : `${producto}:${duracion}`);

// Citas de un plan (Alejandro, 2026-10-14): pago único, las de CITAS_UNICO; los planes por meses,
// sus sesiones al mes × meses, y Constancia y Transformación una más el primer
// mes (la evaluación sin costo de plans.js, `firstMonthEval`).
const citasTotales = (producto, duracion) => (duracion === PAGO_UNICO ? CITAS_UNICO[producto]
  : plans[base(producto)].sessionsPerMonth * Number(duracion) + (plans[base(producto)].firstMonthEval ? 1 : 0));
const PLAN = new Map(PRODUCTOS.flatMap((p) => duracionesDeProducto(p.id).map((d) => [clavePlan(p.id, d.id),
  { etiqueta: d.id === PAGO_UNICO ? p.etiqueta : `${p.etiqueta}, ${d.etiqueta}`, total: citasTotales(p.id, d.id) }])));

// Links creados antes del 2026-10-14 pudieron guardar «Otro»: se sigue mostrando, ya no se ofrece.
const VIEJOS = new Map([['otro', 'Otro']]);

export const MAX_CITA = 25; // Transformación de 6 meses: 4 × 6 + 1
// Links del 2026-10-13 pudieron guardar esta cita: se sigue mostrando, ya no se ofrece.
const EVAL_MES = { id: 'evaluacion_mes', etiqueta: 'Evaluación de fin de mes' };

// Citas del plan: de «1 de N» a «N de N».
export function citasDePlan(plan) {
  const p = PLAN.get(plan);
  return p ? Array.from({ length: p.total }, (_, i) => ({ id: String(i + 1), etiqueta: `${i + 1} de ${p.total}` })) : [];
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
