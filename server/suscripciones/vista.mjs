// Lo que muestra «Por agendar» en el panel: qué filas entran en cada vista, en qué orden y con qué día de cobro
// (spec 2026-11-27-por-agendar-vistas). Sin DOM ni base: lo usa el navegador y se prueba aquí.
export const DIAS_PRONTO = 30;
const DIA = 86400000;
const diaLima = (ms) => new Date(ms - 5 * 3600000).toISOString().slice(0, 10);

const enVista = {
  pendientes: (f) => f.pendiente,
  // Incluye las atrasadas: Mercado Pago todavía no mueve su fecha.
  pronto: (f, ahora) => Boolean(f.proximo) && Date.parse(f.proximo) <= ahora.getTime() + DIAS_PRONTO * DIA,
  todas: () => true,
};

// «Por agendar» conserva el orden de prioridad que manda el servidor.
export const ordenDeVista = (vista) => ({ pronto: { campo: 'proximo', asc: true }, todas: { campo: 'cobrado_en', asc: false } }[vista] ?? null);
export const alOrdenar = (actual, campo) => (actual?.campo === campo ? { campo, asc: !actual.asc } : { campo, asc: campo === 'proximo' });

const llano = (t) => String(t ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export function filasDeVista(filas, { vista, q = '', orden = ordenDeVista(vista), ahora }) {
  const palabras = llano(q).split(/\s+/).filter(Boolean);
  const elegidas = filas.filter((f) => enVista[vista](f, ahora) && palabras.every((p) => llano(`${f.nombre ?? ''} ${f.pagador ?? ''}`).includes(p)));
  if (!orden) return elegidas;
  const { campo, asc } = orden;
  return elegidas.sort((a, b) => {
    if (!a[campo] || !b[campo]) return Number(!a[campo]) - Number(!b[campo]); // sin fecha, al final
    return (Date.parse(a[campo]) - Date.parse(b[campo])) * (asc ? 1 : -1);
  });
}

export const conteos = (filas, ahora) => ({
  pendientes: filas.filter((f) => enVista.pendientes(f)).length,
  pronto: filas.filter((f) => enVista.pronto(f, ahora)).length,
  todas: filas.length,
  nuevos: filas.filter((f) => f.nuevo).length,
});

export function diaDeCobro(iso, ahora) {
  const dia = diaLima(Date.parse(iso));
  const hoy = diaLima(ahora.getTime());
  const cuando = dia === hoy ? 'Hoy' : dia === diaLima(ahora.getTime() + DIA) ? 'Mañana' : null;
  return { cuando, atrasado: dia < hoy };
}
