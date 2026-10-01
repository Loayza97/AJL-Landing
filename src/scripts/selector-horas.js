// Selector de primera hora (P3). Lo usan /reservar/ y /reservar/reubicar/.
// La disponibilidad la decide el servidor; aquí solo se pinta y se elige.
const formatoDia = new Intl.DateTimeFormat('es-PE', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const hoyLima = () => new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
const sumarDias = (f, n) => { const d = new Date(`${f}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const hora12 = (h) => { const n = parseInt(h, 10); return `${n % 12 || 12}:00 ${n >= 12 ? 'p. m.' : 'a. m.'}`; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function montarSelector(raiz, { producto, duracion, onElegir }) {
  const manana = sumarDias(hoyLima(), 1);
  const limite = sumarDias(hoyLima(), 21);
  const estado = { modalidad: 'presencial', nutricionista: '', desde: manana, fecha: null, datos: null };
  raiz.innerHTML = `
    <div class="sel-modalidad">
      <button type="button" data-modalidad="presencial">En Lince</button>
      <button type="button" data-modalidad="video">Por videollamada</button>
    </div>
    <div class="sel-nutris"></div>
    <div class="sel-semana">
      <button type="button" class="sel-prev" aria-label="Semana anterior">‹</button>
      <div class="sel-dias"></div>
      <button type="button" class="sel-next" aria-label="Semana siguiente">›</button>
    </div>
    <div class="sel-horas" aria-live="polite"></div>`;
  const $ = (s) => raiz.querySelector(s);

  async function cargar() {
    $('.sel-horas').innerHTML = '<p class="sel-msg">Buscando horarios…</p>';
    const p = new URLSearchParams({ desde: estado.desde, modalidad: estado.modalidad, producto, duracion: String(duracion) });
    if (estado.nutricionista) p.set('nutricionista', estado.nutricionista);
    try {
      const r = await fetch(`/api/reservas/horas?${p}`);
      if (!r.ok) throw new Error(String(r.status));
      estado.datos = await r.json();
    } catch {
      $('.sel-horas').innerHTML = '<p class="sel-msg">No pudimos cargar los horarios. Intenta de nuevo en un momento.</p>';
      return;
    }
    const sigueValida = estado.datos.dias.some((d) => d.fecha === estado.fecha && d.horas.length);
    if (!sigueValida) estado.fecha = estado.datos.dias.find((d) => d.horas.length)?.fecha ?? null;
    pintar();
  }

  function pintar() {
    raiz.querySelectorAll('[data-modalidad]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.modalidad === estado.modalidad)));
    const equipo = estado.datos.nutricionistas;
    const nombre = Object.fromEntries(equipo.map((n) => [n.id, n.nombre]));
    $('.sel-nutris').innerHTML = `<button type="button" data-filtro="" aria-pressed="${!estado.nutricionista}">Todo el equipo</button>`
      + equipo.map((n) => `<button type="button" data-filtro="${esc(n.id)}" aria-pressed="${estado.nutricionista === n.id}">${esc(n.nombre)}</button>`).join('');
    $('.sel-dias').innerHTML = estado.datos.dias.map((d) => `<button type="button" data-fecha="${d.fecha}" ${d.horas.length ? '' : 'disabled'} aria-pressed="${d.fecha === estado.fecha}">${formatoDia.format(new Date(`${d.fecha}T12:00:00Z`))}</button>`).join('');
    const dia = estado.datos.dias.find((d) => d.fecha === estado.fecha);
    $('.sel-horas').innerHTML = dia
      ? dia.horas.map((h) => `<button type="button" class="sel-hora" data-inicio="${h.inicio}" data-nutri="${esc(h.nutricionista_id)}">${hora12(h.hora)}<small>${esc(nombre[h.nutricionista_id] ?? '')}</small></button>`).join('')
      : '<p class="sel-msg">No hay horas libres esta semana con estos filtros. Prueba la semana siguiente u otra modalidad.</p>';
    $('.sel-prev').disabled = estado.desde <= manana;
    $('.sel-next').disabled = sumarDias(estado.desde, 7) > limite;
  }

  raiz.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    if (b.classList.contains('sel-hora')) {
      onElegir({ inicio: b.dataset.inicio, nutricionista: b.dataset.nutri, modalidad: estado.modalidad, nutricionistaNombre: b.querySelector('small').textContent });
    } else if (b.dataset.modalidad) {
      estado.modalidad = b.dataset.modalidad; estado.fecha = null; cargar();
    } else if ('filtro' in b.dataset) {
      estado.nutricionista = b.dataset.filtro; estado.fecha = null; cargar();
    } else if (b.dataset.fecha) {
      estado.fecha = b.dataset.fecha; pintar();
    } else if (b.classList.contains('sel-prev')) {
      estado.desde = sumarDias(estado.desde, -7); estado.fecha = null; cargar();
    } else if (b.classList.contains('sel-next')) {
      estado.desde = sumarDias(estado.desde, 7); estado.fecha = null; cargar();
    }
  });

  cargar();
  return { recargar: cargar };
}
