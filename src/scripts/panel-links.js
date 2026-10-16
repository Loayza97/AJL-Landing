// Panel /panel/, partes de links: crea links, lista y filtra los creados, reactiva y
// borra los sin usar. Las citas agendadas son panel-reservas.js; el login y la
// carga inicial, panel.js. Todo el texto de la base se pinta con textContent.
import { limitarFilas } from './panel-filas.js';
import { duracionesDeProducto, clavePlan, citasDePlan } from '../../server/agenda/opciones.mjs';

const $ = (s) => document.querySelector(s);
const lima = (iso) => (iso ? new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)) : '');
const ESTADO = { sin_usar: 'Sin usar', agendado: 'Agendado', vencido: 'Vencido' };
const est = {
  links: { estado: 'todos', pagina: 1, total: 0 },
};

const MSJ_CARGA = 'No pudimos cargar. Revisa tu conexión y recarga la página.';
// Mensaje visible de la sección (#l-msg); sin texto se oculta.
function aviso(sel, texto = '') { $(sel).textContent = texto; $(sel).hidden = !texto; }
// GET del panel que no lanza: una caída de red vuelve como null.
async function pedir(url) {
  try { return await fetch(url, { cache: 'no-store' }); } catch { return null; }
}
const jsonDe = async (r) => (r ? r.json().catch(() => null) : null);

const td = (...partes) => {
  const c = document.createElement('td');
  partes.filter((p) => p != null && p !== '').forEach((p, i) => {
    if (p instanceof Node) c.append(p);
    else { const e = document.createElement(i === 0 ? 'span' : 'small'); e.textContent = p; if (i > 0) e.style.display = 'block'; c.append(e); }
  });
  return c;
};

function periodo(prefijo) {
  const p = new URLSearchParams({ periodo: $(`#${prefijo}-periodo`).value });
  if (p.get('periodo') === 'rango') {
    if (!$(`#${prefijo}-desde`).value || !$(`#${prefijo}-hasta`).value) return null;
    p.set('desde', $(`#${prefijo}-desde`).value); p.set('hasta', $(`#${prefijo}-hasta`).value);
  }
  const q = $(`#${prefijo}-q`).value.trim();
  if (q.length >= 2) p.set('q', q);
  return p;
}

function paginar(prefijo, s) {
  const desde = s.total ? (s.pagina - 1) * 20 + 1 : 0;
  $(`#${prefijo}-pag`).textContent = s.total ? `${desde} a ${Math.min(s.pagina * 20, s.total)} de ${s.total}` : '0 resultados';
  $(`#${prefijo}-prev`).disabled = s.pagina <= 1;
  $(`#${prefijo}-next`).disabled = s.pagina * 20 >= s.total;
}

// Devuelve false sin sesión (panel.js no pide entonces las reservas).
export async function cargarLinks() {
  const p = periodo('l');
  if (!p) return;
  p.set('estado', est.links.estado); p.set('pagina', String(est.links.pagina));
  const r = await pedir(`/api/equipo/links?${p}`);
  if (r?.status === 401) { mostrarLogin(); return false; }
  const d = r?.ok ? await jsonDe(r) : null;
  $('#login').hidden = true; $('#app').hidden = false;
  // Error del servidor o de red: se avisa y la tabla queda como estaba.
  if (!d) { aviso('#l-msg', MSJ_CARGA); return; }
  aviso('#l-msg');
  $('#salir').hidden = false;
  $('#quien').textContent = `Entraste como ${d.email}`;
  $('#usuarios').hidden = !d.admin;
  est.links.total = d.total;
  document.querySelectorAll('#l-estados button').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.estado === est.links.estado));
    b.querySelector('span').textContent = String(d.conteos[b.dataset.estado]);
  });
  $('#l-filas').replaceChildren(...(d.filas.length ? d.filas.map((f) => {
    const tr = document.createElement('tr');
    const chip = document.createElement('span');
    chip.className = `lk-estado lk-estado--${f.estado}`; chip.textContent = ESTADO[f.estado];
    // Plan y cita que eligió el equipo (los links viejos no los tienen).
    const planCita = [f.plan, f.cita_link].filter(Boolean).join(' · ') || null;
    let detalle;
    if (f.estado === 'agendado') {
      detalle = td(`${f.paciente ?? ''} · ${f.cita}`, planCita);
    } else {
      // Sin usar o vencido: se puede borrar (no tiene datos del paciente).
      const acciones = document.createElement('div');
      acciones.className = 'lk-acciones';
      if (f.estado === 'vencido') {
        const re = document.createElement('button');
        re.type = 'button'; re.className = 'lk-btn lk-btn--borde'; re.textContent = 'Reactivar 3 días más';
        re.addEventListener('click', () => reactivar(f.id, re));
        acciones.append(re);
      }
      const borra = document.createElement('button');
      borra.type = 'button'; borra.className = 'lk-btn lk-btn--chico'; borra.textContent = 'Borrar';
      borra.setAttribute('aria-label', `Borrar el link de ${f.nombre_tipo} · ${f.etiqueta_tipo} creado el ${lima(f.creado_en)}`);
      borra.addEventListener('click', () => borrar(f.id, borra));
      acciones.append(borra);
      detalle = f.estado === 'vencido' ? td(planCita, acciones) : td(`Esperando al paciente · vence el ${lima(f.vence_en)}`, planCita, acciones);
    }
    tr.append(td(lima(f.reactivado_en || f.creado_en)), td(`${f.nombre_tipo} · ${f.etiqueta_tipo}`), td(chip), detalle);
    return tr;
  }) : [Object.assign(document.createElement('tr'), { innerHTML: '<td colspan="4">No hay links con este filtro.</td>' })]));
  paginar('l', est.links);
  limitarFilas($('#l-scroll'));
}

async function reactivar(id, b) {
  b.disabled = true;
  const r = await fetch('/api/equipo/links-reactivar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }).catch(() => null);
  if (r?.status === 401) return mostrarLogin();
  if (!r?.ok) { b.disabled = false; alert('No se pudo reactivar. Recarga la página.'); return; }
  refrescar();
}

// Borrado de verdad, solo de links sin usar. Si ya se usó o ya no existe, se
// recarga la lista (que dirá cómo está) y se avisa en #l-msg.
async function borrar(id, b) {
  if (!window.confirm('¿Borrar este link? El paciente ya no podrá usarlo.')) return;
  b.disabled = true;
  const r = await fetch('/api/equipo/links-borrar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }).catch(() => null);
  if (r?.status === 401) return mostrarLogin();
  if (r?.ok) {
    // Si era la única fila de una página que no es la primera, se vuelve a la anterior.
    if (est.links.pagina > 1 && $('#l-filas').children.length === 1) est.links.pagina -= 1;
    return refrescar();
  }
  const error = (await jsonDe(r))?.error || 'No se pudo borrar. Revisa tu conexión e intenta de nuevo.';
  if (r?.status === 404 || r?.status === 409) await refrescar();
  else b.disabled = false;
  aviso('#l-msg', error);
}

// Cada link nuevo vuelve a «Copiar»: si quedara «Copiado», quien atiende podría
// pegar el link anterior (que está en el portapapeles) a otro paciente.
function reiniciarCopia(tarjeta) {
  tarjeta.querySelector('[data-copiar]').textContent = 'Copiar';
  tarjeta.querySelector('[data-copia-msg]').textContent = '';
}

async function copiar(b) {
  const tarjeta = b.closest('[data-tipo]');
  const u = tarjeta.querySelector('.lk-url');
  const valor = u.value;
  try {
    // Sin la API (http o navegador viejo) esto lanza y cae en el aviso.
    await navigator.clipboard.writeText(valor);
    // Si mientras tanto se creó otro link, no se marca «Copiado» sobre el nuevo.
    if (u.value !== valor) return;
    b.textContent = 'Copiado';
    tarjeta.querySelector('[data-copia-msg]').textContent = '';
  } catch {
    b.textContent = 'Copiar';
    tarjeta.querySelector('[data-copia-msg]').textContent = 'No se pudo copiar, selecciónalo a mano.';
    u.select();
  }
}

// Llena un <select> con sus opciones; si hay una sola, la deja elegida.
function opciones(sel, lista, vacio) {
  sel.replaceChildren(new Option(vacio, ''), ...lista.map((o) => new Option(o.etiqueta, o.id)));
  sel.disabled = !lista.length;
  if (lista.length === 1) sel.value = lista[0].id;
}

// Cada lista depende de la anterior: el producto da las duraciones y los dos dan las citas.
function planDe(tarjeta) {
  const producto = tarjeta.querySelector('[data-producto]').value;
  const duracion = tarjeta.querySelector('[data-duracion]').value;
  return producto && duracion ? clavePlan(producto, duracion) : '';
}
function alCambiarProducto(tarjeta) {
  const producto = tarjeta.querySelector('[data-producto]').value;
  opciones(tarjeta.querySelector('[data-duracion]'), duracionesDeProducto(producto), producto ? 'Elige la duración' : 'Primero elige el producto');
  alCambiarDuracion(tarjeta);
}
function alCambiarDuracion(tarjeta) {
  const plan = planDe(tarjeta);
  opciones(tarjeta.querySelector('[data-cita]'), plan ? citasDePlan(plan) : [], plan ? 'Elige qué cita es' : 'Primero elige la duración');
  revisarForm(tarjeta);
}

// «Crear link» se habilita solo con producto, duración y cita elegidos.
function revisarForm(tarjeta) {
  tarjeta.querySelector('[data-crear]').disabled = !planDe(tarjeta) || !tarjeta.querySelector('[data-cita]').value;
}

async function crear(tipo, tarjeta) {
  const plan = planDe(tarjeta);
  const cita = tarjeta.querySelector('[data-cita]').value;
  if (!plan || !cita) return;
  const b = tarjeta.querySelector('[data-crear]');
  b.disabled = true;
  reiniciarCopia(tarjeta);
  let r = null;
  try {
    r = await fetch('/api/equipo/links', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo, plan, cita }) });
  } catch {}
  revisarForm(tarjeta);
  if (r?.status === 401) return mostrarLogin();
  if (!r?.ok) { alert((await jsonDe(r))?.error || 'No se pudo crear el link. Intenta de nuevo.'); return; }
  const d = await r.json();
  tarjeta.querySelector('.lk-url').value = d.url;
  reiniciarCopia(tarjeta);
  tarjeta.querySelector('[data-wa]').href = `https://wa.me/?text=${encodeURIComponent(`Agenda tu cita en AJL Nutrición aquí (sirve una sola vez): ${d.url}`)}`;
  // Las listas vuelven a cero: el próximo link es de otro paciente.
  tarjeta.querySelector('[data-producto]').value = '';
  alCambiarProducto(tarjeta);
  tarjeta.querySelector('[data-form]').hidden = true;
  tarjeta.querySelector('[data-creado]').hidden = false;
  refrescar();
}

// «Crear otro link»: vuelve al formulario con las listas sin elegir.
function otro(tarjeta) {
  tarjeta.querySelector('[data-creado]').hidden = true;
  tarjeta.querySelector('.lk-url').value = '';
  reiniciarCopia(tarjeta);
  tarjeta.querySelector('[data-form]').hidden = false;
  tarjeta.querySelector('[data-producto]').focus();
}

export function mostrarLogin() {
  $('#login').hidden = false; $('#app').hidden = true; $('#salir').hidden = true; $('#quien').textContent = '';
  $('#usuarios').hidden = true;
}

const refrescar = cargarLinks;

document.addEventListener('click', (e) => {
  const b = e.target.closest('button, a');
  if (!b) return;
  if (b.dataset.crear) crear(b.dataset.crear, b.closest('[data-tipo]'));
  else if (b.dataset.otro !== undefined) otro(b.closest('[data-tipo]'));
  else if (b.dataset.copiar !== undefined) copiar(b);
  else if (b.dataset.estado) { est.links.estado = b.dataset.estado; est.links.pagina = 1; cargarLinks(); }
  else if (b.id === 'l-prev' || b.id === 'l-next') { est.links.pagina += b.id === 'l-next' ? 1 : -1; cargarLinks(); }
});

document.querySelectorAll('[data-tipo]').forEach((t) => {
  t.querySelector('[data-producto]').addEventListener('change', () => alCambiarProducto(t));
  t.querySelector('[data-duracion]').addEventListener('change', () => alCambiarDuracion(t));
  t.querySelector('[data-cita]').addEventListener('change', () => revisarForm(t));
  alCambiarProducto(t); // por si el navegador recuerda el producto al recargar
});

let espera;
for (const [prefijo, cargar, s] of [['l', cargarLinks, est.links]]) {
  $(`#${prefijo}-q`).addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(() => { s.pagina = 1; cargar(); }, 300); });
  $(`#${prefijo}-periodo`).addEventListener('change', (e) => { $(`#${prefijo}-rango`).hidden = e.target.value !== 'rango'; s.pagina = 1; cargar(); });
  for (const lado of ['desde', 'hasta']) $(`#${prefijo}-${lado}`).addEventListener('change', () => { s.pagina = 1; cargar(); });
}
