// «Links de reserva web» del panel: el dominio de donde se abre el panel (en la
// versión de prueba, la de prueba) y el botón «Copiar» de cada fila.
const filas = document.getElementById('r-links');
if (filas) {
  // «Copiar (mensual)» solo mientras el pago mensual esté abierto; apagado, el link con &forma=mensual no sirve.
  fetch('/api/reservas/opciones', { cache: 'no-store' }).then((r) => r.json()).then((d) => d?.suscripciones === true).catch(() => false)
    .then((abiertas) => { if (!abiertas) filas.querySelectorAll('[data-mensual]').forEach((b) => b.remove()); });
  for (const u of filas.querySelectorAll('[data-ruta]')) u.value = location.origin + u.dataset.ruta;
  filas.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-copiar-ruta]');
    if (!b) return;
    const u = b.closest('tr').querySelector('[data-ruta]');
    filas.querySelectorAll('[data-copiar-ruta]').forEach((x) => { x.textContent = x.dataset.mensual ? 'Copiar (mensual)' : 'Copiar'; });
    const valor = b.dataset.mensual ? location.origin + b.dataset.mensual : u.value;
    try {
      await navigator.clipboard.writeText(valor);
      b.textContent = 'Copiado';
    } catch {
      u.value = valor;
      u.select();
    }
  });
}
