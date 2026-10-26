// «Links de reserva web» del panel: el dominio de donde se abre el panel (en la
// versión de prueba, la de prueba) y el botón «Copiar» de cada fila.
const filas = document.getElementById('r-links');
if (filas) {
  for (const u of filas.querySelectorAll('[data-ruta]')) u.value = location.origin + u.dataset.ruta;
  filas.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-copiar-ruta]');
    if (!b) return;
    const u = b.closest('tr').querySelector('[data-ruta]');
    filas.querySelectorAll('[data-copiar-ruta]').forEach((x) => { x.textContent = 'Copiar'; });
    try {
      await navigator.clipboard.writeText(u.value);
      b.textContent = 'Copiado';
    } catch {
      u.select();
    }
  });
}
