// Panel /panel/links/: crea links, lista y filtra links y agendados, reactiva y
// descarga CSV. Todo el texto de la base se pinta con textContent.
import { montarLogin } from './panel-login.js';

const $ = (s) => document.querySelector(s);
const MAX_CSV = 200; // el mismo tope que /api/equipo/agendados-csv
const lima = (iso) => (iso ? new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)) : '');
const MOD = { presencial: 'Presencial', video: 'Virtual' };
const ESTADO = { sin_usar: 'Sin usar', agendado: 'Agendado', vencido: 'Vencido' };
const est = {
  links: { estado: 'todos', pagina: 1, total: 0 },
  ag: { tramo: 'proximas', pagina: 1, total: 0, filas: [] },
  sel: new Set(),
};

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

// Devuelve true si hay sesión (la usa iniciar() para saber si sigue).
async function cargarLinks() {
  const p = periodo('l');
  if (!p) return true;
  p.set('estado', est.links.estado); p.set('pagina', String(est.links.pagina));
  const r = await fetch(`/api/equipo/links?${p}`, { cache: 'no-store' });
  if (r.status === 401) { mostrarLogin(); return false; }
  const d = await r.json();
  $('#login').hidden = true; $('#app').hidden = false; $('#salir').hidden = false;
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
    let detalle;
    if (f.estado === 'vencido') {
      detalle = document.createElement('button');
      detalle.type = 'button'; detalle.className = 'lk-btn lk-btn--borde'; detalle.textContent = 'Reactivar 3 días más';
      detalle.addEventListener('click', () => reactivar(f.id, detalle));
    } else if (f.estado === 'agendado') {
      detalle = `${f.paciente ?? ''} · ${f.cita}`;
    } else {
      detalle = `Esperando al paciente · vence el ${lima(f.vence_en)}`;
    }
    tr.append(td(lima(f.reactivado_en || f.creado_en)), td(`${f.nombre_tipo} · ${f.etiqueta_tipo}`), td(chip), td(detalle));
    return tr;
  }) : [Object.assign(document.createElement('tr'), { innerHTML: '<td colspan="4">No hay links con este filtro.</td>' })]));
  paginar('l', est.links);
  return true;
}

async function reactivar(id, b) {
  b.disabled = true;
  const r = await fetch('/api/equipo/links-reactivar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
  if (!r.ok) { b.disabled = false; alert('No se pudo reactivar. Recarga la página.'); return; }
  cargarLinks();
}

async function cargarAgendados() {
  const p = periodo('a');
  if (!p) return;
  p.set('tramo', est.ag.tramo); p.set('pagina', String(est.ag.pagina));
  const r = await fetch(`/api/equipo/agendados?${p}`, { cache: 'no-store' });
  if (r.status === 401) return mostrarLogin();
  const d = await r.json();
  est.ag.total = d.total; est.ag.filas = d.filas;
  document.querySelectorAll('#a-tramos button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tramo === est.ag.tramo)));
  pintarAgendados();
  paginar('a', est.ag);
}

function pintarAgendados() {
  const filas = est.ag.filas;
  $('#a-filas').replaceChildren(...(filas.length ? filas.map((f) => {
    const tr = document.createElement('tr');
    tr.dataset.sel = String(est.sel.has(f.id));
    const caja = document.createElement('input');
    caja.type = 'checkbox'; caja.checked = est.sel.has(f.id);
    caja.setAttribute('aria-label', `Seleccionar a ${f.nombres} ${f.apellido_paterno}`);
    caja.addEventListener('change', () => { caja.checked ? est.sel.add(f.id) : est.sel.delete(f.id); pintarAgendados(); });
    const etq = document.createElement('label'); etq.className = 'lk-check'; etq.append(caja);
    tr.append(td(etq), td(f.etiqueta, `${f.tipo} · ${MOD[f.modalidad]} · ${f.nutricionista}`),
      td([f.apellido_paterno, f.apellido_materno].filter(Boolean).join(' ')), td(f.nombres), td(f.dni), td(f.email), td(f.whatsapp),
      td(f.fecha_nacimiento ? f.fecha_nacimiento.split('-').reverse().join('/') : ''), td(f.paciente_nuevo ? 'Nuevo' : 'Ya paciente'));
    return tr;
  }) : [Object.assign(document.createElement('tr'), { innerHTML: '<td colspan="9">No hay citas con este filtro.</td>' })]));
  $('#a-todos').checked = filas.length > 0 && filas.every((f) => est.sel.has(f.id));
  const n = est.sel.size;
  $('#a-descargar').disabled = n === 0;
  $('#a-descargar').textContent = n ? `Descargar ${n} para Google Sheets (.csv)` : 'Elige a quiénes descargar';
}

async function crear(tipo, tarjeta) {
  const btns = tarjeta.querySelectorAll('[data-crear]');
  btns.forEach((b) => { b.disabled = true; });
  const r = await fetch('/api/equipo/links', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo }) });
  btns.forEach((b) => { b.disabled = false; });
  if (r.status === 401) return mostrarLogin();
  if (!r.ok) { alert('No se pudo crear el link. Intenta de nuevo.'); return; }
  const d = await r.json();
  tarjeta.querySelector('.lk-url').value = d.url;
  tarjeta.querySelector('[data-wa]').href = `https://wa.me/?text=${encodeURIComponent(`Agenda tu cita en AJL Nutrición aquí (sirve una sola vez): ${d.url}`)}`;
  tarjeta.querySelector('[data-crear]').hidden = true;
  tarjeta.querySelector('[data-creado]').hidden = false;
  cargarLinks();
}

function mostrarLogin() {
  $('#login').hidden = false; $('#app').hidden = true; $('#salir').hidden = true; $('#quien').textContent = '';
  $('#usuarios').hidden = true;
}

// Una sola petición para saber si hay sesión: la lista de links ya trae el
// correo de quien entró (no se pide /api/equipo/reservas, que trae fichas de pacientes).
async function iniciar() {
  if (await cargarLinks()) cargarAgendados();
}

// Login: el mismo módulo que /panel/ (código por correo, sesión en cookie).
montarLogin({ onEntrar: iniciar });

document.addEventListener('click', (e) => {
  const b = e.target.closest('button, a');
  if (!b) return;
  if (b.dataset.crear) crear(b.dataset.crear, b.closest('[data-tipo]'));
  else if (b.dataset.copiar !== undefined) { const u = b.closest('[data-tipo]').querySelector('.lk-url'); navigator.clipboard?.writeText(u.value); b.textContent = 'Copiado'; }
  else if (b.dataset.estado) { est.links.estado = b.dataset.estado; est.links.pagina = 1; cargarLinks(); }
  else if (b.dataset.tramo) { est.ag.tramo = b.dataset.tramo; est.ag.pagina = 1; cargarAgendados(); }
  else if (b.id === 'l-prev' || b.id === 'l-next') { est.links.pagina += b.id === 'l-next' ? 1 : -1; cargarLinks(); }
  else if (b.id === 'a-prev' || b.id === 'a-next') { est.ag.pagina += b.id === 'a-next' ? 1 : -1; cargarAgendados(); }
  else if (b.id === 'a-descargar' && est.sel.size > MAX_CSV) { alert(`Puedes descargar hasta ${MAX_CSV} citas a la vez. Quita algunas de la selección.`); }
  else if (b.id === 'a-descargar' && est.sel.size) { location.href = `/api/equipo/agendados-csv?ids=${encodeURIComponent([...est.sel].join(','))}`; }
});

$('#a-todos').addEventListener('change', (e) => {
  est.ag.filas.forEach((f) => (e.target.checked ? est.sel.add(f.id) : est.sel.delete(f.id)));
  pintarAgendados();
});

let espera;
for (const [prefijo, cargar, s] of [['l', cargarLinks, est.links], ['a', cargarAgendados, est.ag]]) {
  $(`#${prefijo}-q`).addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(() => { s.pagina = 1; cargar(); }, 300); });
  $(`#${prefijo}-periodo`).addEventListener('change', (e) => { $(`#${prefijo}-rango`).hidden = e.target.value !== 'rango'; s.pagina = 1; cargar(); });
  for (const lado of ['desde', 'hasta']) $(`#${prefijo}-${lado}`).addEventListener('change', () => { s.pagina = 1; cargar(); });
}

iniciar();
