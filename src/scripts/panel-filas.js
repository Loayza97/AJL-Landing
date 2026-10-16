// Las tablas del panel muestran hasta 4 filas y el resto con scroll adentro
// (pedido de Romi, 2026-10-16): con 10 o 20 links la página ya no crece.
// El alto se mide con las filas reales, que no miden todas lo mismo.
export function limitarFilas(caja, n = 4) {
  // Con la fuente aún cargando las filas miden menos: se vuelve a medir al llegar.
  if (document.fonts && document.fonts.status !== 'loaded') document.fonts.ready.then(() => limitarFilas(caja, n));
  caja.style.maxHeight = '';
  const filas = caja.querySelectorAll('tbody tr');
  if (filas.length <= n) return;
  const ultima = filas[n - 1];
  caja.style.maxHeight = `${Math.ceil(ultima.getBoundingClientRect().bottom - caja.getBoundingClientRect().top + caja.scrollTop) + 1}px`;
}
