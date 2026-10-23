// Selector de primera hora (P3): calendario del mes con las horas del día
// elegido, separadas en mañana y tarde. Lo usan /reservar/ y /reservar/reubicar/.
// La disponibilidad la decide el servidor; aquí solo se pinta y se elige.
import { NOMBRE_MODALIDAD, nodoDonde } from './donde.js';
const hoyLima = () => new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
const sumarDias = (f, n) => { const d = new Date(`${f}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const hora12 = (h) => { const [hh, mm = '00'] = String(h).split(':'); const n = parseInt(hh, 10); return `${n % 12 || 12}:${mm} ${n >= 12 ? 'p. m.' : 'a. m.'}`; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDia = new Intl.DateTimeFormat('es-PE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const fmtMes = new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const conMayuscula = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const nombreDia = (f) => conMayuscula(fmtDia.format(new Date(`${f}T12:00:00Z`)).replace(',', ''));
const nombreMes = (mes) => conMayuscula(fmtMes.format(new Date(`${mes}-15T12:00:00Z`)).replace(' de ', ' '));
const DIAS_VENTANA = 42; // seis semanas, igual que HASTA_DIAS del servidor

// Celdas de un mes (AAAA-MM) con la semana empezando en lunes; null = hueco.
function celdasDelMes(mes) {
  const primero = `${mes}-01`;
  const lunesAntes = (new Date(`${primero}T12:00:00Z`).getUTCDay() + 6) % 7;
  const celdas = Array(lunesAntes).fill(null);
  for (let f = primero; f.slice(0, 7) === mes; f = sumarDias(f, 1)) celdas.push(f);
  return celdas;
}

export function montarSelector(raiz, { producto, duracion, onElegir, urlHoras, modalidades = ['presencial', 'video'], onError, nutricionista = '' }) {
  const manana = sumarDias(hoyLima(), 1);
  const limite = sumarDias(manana, DIAS_VENTANA - 1);
  // Todos los meses entre mañana y el límite (seis semanas pueden tocar tres meses).
  const meses = [];
  for (let f = manana; f <= limite; f = sumarDias(f, 1)) if (!meses.includes(f.slice(0, 7))) meses.push(f.slice(0, 7));
  const estado = { modalidad: modalidades[0], nutricionista, mes: meses[0], fecha: null, datos: null };
  raiz.innerHTML = `
    <div class="sel-filtros">
      <div class="sel-modalidad" role="group" aria-label="Modalidad"${modalidades.length < 2 ? ' hidden' : ''}>
        ${modalidades.map((m) => `<button type="button" data-modalidad="${m}">${NOMBRE_MODALIDAD[m]}</button>`).join('')}
      </div>
      <div class="sel-donde"></div>
      <p class="sel-etq">Elige a tu nutricionista</p>
      <div class="sel-nutris"></div>
    </div>
    <div class="sel-proxima" hidden></div>
    <div class="sel-cuerpo">
      <div class="sel-cal">
        <div class="sel-cal-cab"><button type="button" class="sel-prev" aria-label="Mes anterior">‹</button><b class="sel-mes"></b><button type="button" class="sel-next" aria-label="Mes siguiente">›</button></div>
        <div class="sel-grilla" role="grid"></div>
      </div>
      <div class="sel-dia" aria-live="polite"></div>
    </div>`;
  const $ = (s) => raiz.querySelector(s);
  const porFecha = () => new Map((estado.datos?.dias ?? []).map((d) => [d.fecha, d.horas]));

  async function cargar() {
    $('.sel-dia').innerHTML = '<p class="sel-msg">Buscando horarios…</p>';
    const p = new URLSearchParams({ desde: manana, dias: String(DIAS_VENTANA), modalidad: estado.modalidad });
    if (producto) { p.set('producto', producto); p.set('duracion', String(duracion)); }
    if (estado.nutricionista) p.set('nutricionista', estado.nutricionista);
    let r = null;
    try {
      r = await fetch(urlHoras ? urlHoras(p) : `/api/reservas/horas?${p}`);
      if (!r.ok) throw new Error(String(r.status));
      estado.datos = await r.json();
    } catch {
      // Quien monta el selector puede encargarse de un status (p. ej. 410 de un link vencido).
      if (r && !r.ok && onError?.(r.status)) return;
      $('.sel-dia').innerHTML = '<p class="sel-msg">No pudimos cargar los horarios. Intenta de nuevo en un momento.</p>';
      return;
    }
    const horas = porFecha();
    if (!horas.get(estado.fecha)?.length) estado.fecha = estado.datos.dias.find((d) => d.horas.length)?.fecha ?? null;
    if (estado.fecha) estado.mes = estado.fecha.slice(0, 7);
    pintar();
  }

  function botonHora(h, equipo) {
    const n = equipo[h.nutricionista_id];
    return `<button type="button" class="sel-hora" data-inicio="${esc(h.inicio)}" data-nutri="${esc(h.nutricionista_id)}" data-nombre="${esc(n?.nombre ?? '')}">`
      + `<b>${hora12(h.hora)}</b><span>${n?.foto ? `<img src="${esc(n.foto)}" alt="">` : ''}${esc(n?.nombre ?? '')}</span></button>`;
  }

  function pintar() {
    raiz.querySelectorAll('[data-modalidad]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.modalidad === estado.modalidad)));
    $('.sel-donde').replaceChildren(nodoDonde(estado.modalidad));
    const equipo = Object.fromEntries(estado.datos.nutricionistas.map((n) => [n.id, n]));
    $('.sel-nutris').innerHTML = estado.datos.nutricionistas.map((n) => `<button type="button" data-filtro="${esc(n.id)}" aria-pressed="${estado.nutricionista === n.id}">`
      + `${n.foto ? `<img src="${esc(n.foto)}" alt="">` : ''}${esc(n.nombre)}</button>`).join('');

    // Próxima hora disponible: la primera del primer día con horas.
    const horas = porFecha();
    const primerDia = estado.datos.dias.find((d) => d.horas.length);
    const prox = $('.sel-proxima');
    prox.hidden = !primerDia;
    if (primerDia) {
      const h = primerDia.horas[0];
      const n = equipo[h.nutricionista_id];
      prox.innerHTML = `<span><small>Próxima hora disponible</small><b>${esc(nombreDia(primerDia.fecha))}, ${hora12(h.hora)}</b> con ${esc(n?.nombre ?? 'el equipo')}</span>`
        + `<button type="button" class="sel-hora sel-hora--prox" data-inicio="${esc(h.inicio)}" data-nutri="${esc(h.nutricionista_id)}" data-nombre="${esc(n?.nombre ?? '')}">Elegir</button>`;
    }

    // Calendario del mes.
    $('.sel-mes').textContent = nombreMes(estado.mes);
    $('.sel-prev').disabled = estado.mes === meses[0];
    $('.sel-next').disabled = estado.mes === meses[meses.length - 1];
    const cab = ['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d) => `<span class="sel-sem">${d}</span>`).join('');
    $('.sel-grilla').innerHTML = cab + celdasDelMes(estado.mes).map((f) => {
      if (!f) return '<span></span>';
      const n = Number(f.slice(8));
      if (!horas.get(f)?.length) return `<span class="sel-d sel-d--off">${n}</span>`;
      return `<button type="button" class="sel-d" data-fecha="${f}" aria-pressed="${f === estado.fecha}" aria-label="${esc(nombreDia(f))}">${n}</button>`;
    }).join('');

    // Horas del día elegido, en mañana y tarde.
    const delDia = horas.get(estado.fecha) ?? [];
    if (!delDia.length) {
      $('.sel-dia').innerHTML = `<p class="sel-msg">${primerDia ? 'Elige un día marcado en el calendario.' : 'No hay horas libres en las próximas seis semanas con estos filtros. Prueba otra modalidad o quita el filtro de nutricionista.'}</p>`;
      return;
    }
    const grupo = (titulo, lista) => (lista.length ? `<p class="sel-etq">${titulo}</p><div class="sel-horas">${lista.map((h) => botonHora(h, equipo)).join('')}</div>` : '');
    $('.sel-dia').innerHTML = `<b class="sel-dia-t">${esc(nombreDia(estado.fecha))}</b>`
      + grupo('Mañana', delDia.filter((h) => parseInt(h.hora, 10) < 12)) + grupo('Tarde', delDia.filter((h) => parseInt(h.hora, 10) >= 12));
  }

  raiz.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    if (b.classList.contains('sel-hora')) {
      onElegir({ inicio: b.dataset.inicio, nutricionista: b.dataset.nutri, modalidad: estado.modalidad, nutricionistaNombre: b.dataset.nombre });
    } else if (b.dataset.modalidad) {
      estado.modalidad = b.dataset.modalidad; cargar();
    } else if (b.dataset.filtro) {
      // Tocar a la persona ya elegida quita el filtro y vuelve a mostrar a todas.
      estado.nutricionista = estado.nutricionista === b.dataset.filtro ? '' : b.dataset.filtro; cargar();
    } else if (b.dataset.fecha) {
      estado.fecha = b.dataset.fecha; pintar();
    } else if (b.classList.contains('sel-prev')) {
      estado.mes = meses[Math.max(0, meses.indexOf(estado.mes) - 1)]; pintar();
    } else if (b.classList.contains('sel-next')) {
      estado.mes = meses[Math.min(meses.length - 1, meses.indexOf(estado.mes) + 1)]; pintar();
    }
  });

  cargar();
  return { recargar: cargar };
}
