// Panel /panel/ (Reservas): una sola lista con las citas agendadas con link y las
// pagadas en la página web, la última agendada primero; CSV de las elegidas; y la
// pestaña de quién dejó datos sin pagar, con «Marcar contactado».
// Todo el texto de la base se pinta con textContent.
import { montarLogin } from './panel-login.js';

const $ = (s) => document.querySelector(s);
const MAX_CSV = 200; // el mismo tope que /api/equipo/agendados-csv
const lima = (iso) => (iso ? new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)) : '');
const MOD = { presencial: 'Presencial', video: 'Virtual' };
const PROC = { web: 'Página web', link: 'Link enviado' };
const DOCS = { dni: 'DNI', ce: 'CE', pasaporte: 'Pasaporte' };
const soles = (c) => `S/${String(Math.round(c / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
const est = { tramo: 'proximas', pagina: 1, total: 0, filas: [], sel: new Set(), nopago: null };

const MSJ_CARGA = 'No pudimos cargar. Revisa tu conexión y recarga la página.';
function aviso(texto = '') { $('#a-msg').textContent = texto; $('#a-msg').hidden = !texto; }
async function pedir(url, opciones) {
  try { return await fetch(url, { cache: 'no-store', ...opciones }); } catch { return null; }
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
const chip = (texto, cls) => Object.assign(document.createElement('span'), { className: cls, textContent: texto });
const filaVacia = (n, texto) => {
  const tr = document.createElement('tr');
  const c = document.createElement('td');
  c.colSpan = n; c.textContent = texto;
  tr.append(c);
  return tr;
};

function filtros() {
  const p = new URLSearchParams({ periodo: $('#a-periodo').value });
  if (p.get('periodo') === 'rango') {
    if (!$('#a-desde').value || !$('#a-hasta').value) return null;
    p.set('desde', $('#a-desde').value); p.set('hasta', $('#a-hasta').value);
  }
  const q = $('#a-q').value.trim();
  if (q.length >= 2) p.set('q', q);
  return p;
}

function entro(d) {
  $('#login').hidden = true; $('#app').hidden = false; $('#salir').hidden = false;
  $('#quien').textContent = `Entraste como ${d.email}`;
  $('#usuarios').hidden = !d.admin;
}

function pintarTramo() {
  const nopago = est.tramo === 'no_pagaron';
  document.querySelectorAll('#a-tramos button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tramo === est.tramo)));
  $('#a-filtros').hidden = nopago; $('#tabla-reservas').hidden = nopago;
  $('#excel').hidden = !nopago; $('#tabla-nopago').hidden = !nopago;
}

async function cargar() {
  pintarTramo();
  if (est.tramo === 'no_pagaron') return cargarNoPago();
  const p = filtros();
  if (!p) return;
  p.set('tramo', est.tramo); p.set('pagina', String(est.pagina));
  const r = await pedir(`/api/equipo/agendados?${p}`);
  if (r?.status === 401) return mostrarLogin();
  const d = r?.ok ? await jsonDe(r) : null;
  if (!d) { $('#login').hidden = true; $('#app').hidden = false; aviso(MSJ_CARGA); return; }
  entro(d);
  aviso();
  est.total = d.total; est.filas = d.filas;
  pintar();
  const desde = est.total ? (est.pagina - 1) * 20 + 1 : 0;
  $('#a-pag').textContent = est.total ? `${desde} a ${Math.min(est.pagina * 20, est.total)} de ${est.total}` : '0 resultados';
  $('#a-prev').disabled = est.pagina <= 1;
  $('#a-next').disabled = est.pagina * 20 >= est.total;
}

function pintar() {
  const filas = est.filas;
  $('#a-filas').replaceChildren(...(filas.length ? filas.map((f) => {
    const tr = document.createElement('tr');
    tr.dataset.sel = String(est.sel.has(f.id));
    const caja = document.createElement('input');
    caja.type = 'checkbox'; caja.checked = est.sel.has(f.id);
    caja.setAttribute('aria-label', `Seleccionar a ${f.nombres} ${f.apellido_paterno ?? ''}`.trim());
    caja.addEventListener('change', () => { caja.checked ? est.sel.add(f.id) : est.sel.delete(f.id); pintar(); });
    const etq = document.createElement('label'); etq.className = 'lk-check'; etq.append(caja);
    const cita = f.sin_hora ? td(chip('Sin hora', 'lk-alerta'), `${f.tipo} · ${MOD[f.modalidad]} · ${f.nutricionista}`)
      : td(f.etiqueta, `${f.tipo} · ${MOD[f.modalidad]} · ${f.nutricionista}`);
    tr.append(td(etq), td(chip(PROC[f.procedencia], `lk-proc lk-proc--${f.procedencia}`), `Agendó ${lima(f.agendado_en)}`), cita, td(f.plan, f.cita),
      td([f.apellido_paterno, f.apellido_materno].filter(Boolean).join(' ')), td(f.nombres), td(f.dni), td(f.email), td(f.whatsapp),
      td(f.fecha_nacimiento ? f.fecha_nacimiento.split('-').reverse().join('/') : ''),
      td(f.paciente_nuevo == null ? '' : f.paciente_nuevo ? 'Nuevo' : 'Ya paciente'), td(f.pago, f.pago_detalle));
    return tr;
  }) : [filaVacia(12, 'No hay citas con este filtro.')]));
  $('#a-todos').checked = filas.length > 0 && filas.every((f) => est.sel.has(f.id));
  const n = est.sel.size;
  $('#a-descargar').disabled = n === 0;
  $('#a-descargar').textContent = n ? `Descargar ${n} para Google Sheets (.csv)` : 'Elige a quiénes descargar';
}

// No pagaron: la lista de /api/equipo/reservas (30 días), igual que antes en /panel/.
async function cargarNoPago() {
  const r = await pedir('/api/equipo/reservas');
  if (r?.status === 401) return mostrarLogin();
  const d = r?.ok ? await jsonDe(r) : null;
  if (!d) { aviso(MSJ_CARGA); return; }
  entro(d);
  aviso();
  const filas = d.no_pagadas;
  $('#n-filas').replaceChildren(...(filas.length ? filas.map((f) => {
    const tr = document.createElement('tr');
    const wa = Object.assign(document.createElement('a'), { className: 'lk-wa', textContent: f.whatsapp || '', target: '_blank', rel: 'noopener',
      href: `https://wa.me/${String(f.whatsapp || '').replace(/\D/g, '')}` });
    const seg = document.createElement('td');
    if (f.contactado_en) seg.append(chip(`Contactado ${lima(f.contactado_en)} por ${f.contactado_por}`, 'lk-hecho'));
    const b = Object.assign(document.createElement('button'), { type: 'button', className: 'lk-btn lk-btn--borde', textContent: f.contactado_en ? 'Desmarcar' : 'Marcar contactado' });
    b.addEventListener('click', () => marcar(f, !f.contactado_en, b));
    seg.append(b);
    tr.append(td(lima(f.retencion_hasta)),
      td([f.nombres || f.nombre, f.apellido_paterno, f.apellido_materno].filter(Boolean).join(' '), f.fecha_nacimiento ? `Nació el ${f.fecha_nacimiento.split('-').reverse().join('/')}` : null),
      td(`${DOCS[f.tipo_documento] ?? ''} ${f.dni ?? ''}`.trim()), td(wa, f.email), td(f.titulo, soles(f.monto_centimos)),
      td(f.etiqueta, `${MOD[f.modalidad]} · ${f.nutricionista}`), seg);
    return tr;
  }) : [filaVacia(7, 'Nadie dejó datos sin pagar en los últimos 30 días.')]));
}

async function marcar(f, contactado, b) {
  b.disabled = true;
  const r = await pedir('/api/equipo/contactado', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: f.id, contactado }) });
  if (r?.status === 401) return mostrarLogin();
  if (r?.ok) return cargarNoPago();
  b.disabled = false;
  aviso('No se pudo guardar. Intenta de nuevo.');
}

// Descarga con fetch: si la sesión venció se muestra el login y si hay error se
// avisa en el panel, en vez de navegar a un JSON crudo.
async function descargar() {
  const b = $('#a-descargar');
  b.disabled = true;
  const r = await pedir(`/api/equipo/agendados-csv?ids=${encodeURIComponent([...est.sel].join(','))}`);
  b.disabled = est.sel.size === 0;
  if (r?.status === 401) return mostrarLogin();
  let blob = null;
  if (r?.ok) blob = await r.blob().catch(() => null);
  if (!blob) { aviso((await jsonDe(r))?.error || 'No se pudo descargar. Intenta de nuevo.'); return; }
  aviso();
  const nombre = /filename="([^"]+)"/.exec(r.headers.get('Content-Disposition') || '')?.[1] || 'reservas-ajl.csv';
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: nombre });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

function mostrarLogin() {
  $('#login').hidden = false; $('#app').hidden = true; $('#salir').hidden = true; $('#quien').textContent = '';
  $('#usuarios').hidden = true;
}

montarLogin({ onEntrar: cargar });

document.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.tramo) { est.tramo = b.dataset.tramo; est.pagina = 1; cargar(); }
  else if (b.id === 'a-prev' || b.id === 'a-next') { est.pagina += b.id === 'a-next' ? 1 : -1; cargar(); }
  else if (b.id === 'a-descargar' && est.sel.size > MAX_CSV) aviso(`Puedes descargar hasta ${MAX_CSV} citas a la vez. Quita algunas de la selección.`);
  else if (b.id === 'a-descargar' && est.sel.size) descargar();
});

$('#a-todos').addEventListener('change', (e) => {
  est.filas.forEach((f) => (e.target.checked ? est.sel.add(f.id) : est.sel.delete(f.id)));
  pintar();
});

let espera;
$('#a-q').addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(() => { est.pagina = 1; cargar(); }, 300); });
$('#a-periodo').addEventListener('change', (e) => { $('#a-rango').hidden = e.target.value !== 'rango'; est.pagina = 1; cargar(); });
for (const lado of ['desde', 'hasta']) $(`#a-${lado}`).addEventListener('change', () => { est.pagina = 1; cargar(); });
// Al volver a la pestaña se recarga: un paciente pudo agendar o pagar mientras tanto.
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') cargar(); });

cargar();
