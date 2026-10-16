// Panel /panel/, parte de Reservas: una sola lista con las citas agendadas con link
// y las pagadas en la página web, la última agendada primero; copiar para la base
// maestra y CSV de las elegidas; y la pestaña de quién dejó datos sin pagar, con
// «Marcar contactado». Todo el texto de la base se pinta con textContent.
import { limitarFilas } from './panel-filas.js';
import { mostrarLogin } from './panel-links.js';

const $ = (s) => document.querySelector(s);
const MAX_CSV = 200; // el mismo tope que /api/equipo/agendados-csv
const lima = (iso) => (iso ? new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)) : '');
const MOD = { presencial: 'Presencial', video: 'Virtual' };
// «jue 15 oct, 5:00 p. m.»: entra en una línea (la fecha larga partía la columna en 6).
const citaCorta = (iso) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
    .formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  const sinPunto = (t) => t.replace(/\.$/, '');
  return `${sinPunto(p.weekday)} ${p.day} ${sinPunto(p.month)}, ${p.hour}:${p.minute} ${p.dayPeriod}`;
};
const fechaLima = (iso) => new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso));
const dmy = (f) => (f ? f.split('-').reverse().join('/') : '');
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

const sinCorte = (c) => { c.className = 'lk-sin-corte'; return c; };

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

// Devuelve false sin sesión.
export async function cargarReservas() {
  pintarTramo();
  if (est.tramo === 'no_pagaron') return cargarNoPago();
  const p = filtros();
  if (!p) return;
  p.set('tramo', est.tramo); p.set('pagina', String(est.pagina));
  const r = await pedir(`/api/equipo/agendados?${p}`);
  if (r?.status === 401) { mostrarLogin(); return false; }
  const d = r?.ok ? await jsonDe(r) : null;
  if (!d) { $('#login').hidden = true; $('#app').hidden = false; aviso(MSJ_CARGA); return true; }
  entro(d);
  aviso();
  est.total = d.total; est.filas = d.filas;
  pintar();
  const desde = est.total ? (est.pagina - 1) * 20 + 1 : 0;
  $('#a-pag').textContent = est.total ? `${desde} a ${Math.min(est.pagina * 20, est.total)} de ${est.total}` : '0 resultados';
  $('#a-prev').disabled = est.pagina <= 1;
  $('#a-next').disabled = est.pagina * 20 >= est.total;
  return true;
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
    // Mismo orden que la base maestra: APELLIDOS, NOMBRES, DNI, CORREO, NÚMERO, NACIMIENTO, PAÍS, FECHA…
    const cita = f.sin_hora ? td(chip('Sin hora', 'lk-alerta'), f.tipo) : td(citaCorta(f.inicio_utc), f.tipo);
    tr.append(td(etq), td([f.apellido_paterno, f.apellido_materno].filter(Boolean).join(' ')), td(f.nombres), sinCorte(td(f.dni)), td(f.email),
      sinCorte(td(f.whatsapp)), sinCorte(td(dmy(f.fecha_nacimiento))), td(f.pais), sinCorte(cita), sinCorte(td(f.plan, f.cita)), sinCorte(td(f.pago, f.pago_detalle)),
      td(f.paciente_nuevo == null ? '' : f.paciente_nuevo ? 'Nuevo' : 'Ya paciente'), td(MOD[f.modalidad]), td(f.nutricionista),
      sinCorte(td(chip(PROC[f.procedencia], `lk-proc lk-proc--${f.procedencia}`), `Agendó ${lima(f.agendado_en)}`)));
    return tr;
  }) : [filaVacia(15, 'No hay citas con este filtro.')]));
  limitarFilas($('#a-scroll'));
  $('#a-todos').checked = filas.length > 0 && filas.every((f) => est.sel.has(f.id));
  const n = est.sel.size;
  $('#a-descargar').disabled = n === 0;
  $('#a-descargar').textContent = n ? `Descargar ${n} (.csv)` : 'Elige a quiénes descargar';
  $('#a-copiar').disabled = n === 0;
  $('#a-copiar').textContent = n ? `Copiar ${n} para la base maestra` : 'Copiar para la base maestra';
}

// Filas para pegar en la base maestra (Excel), de la columna A (APELLIDOS) a la Y
// (NOTA): lo que el panel no sabe va vacío para que cada dato caiga en su columna.
// Solo se copian las elegidas que están en esta página de la tabla.
const COLUMNAS_MAESTRA = 25;
function filaMaestra(f) {
  const c = Array(COLUMNAS_MAESTRA).fill('');
  c[0] = [f.apellido_paterno, f.apellido_materno].filter(Boolean).join(' '); // A APELLIDOS
  c[1] = f.nombres ?? ''; // B NOMBRES
  c[2] = f.dni ?? ''; // C DNI
  c[3] = f.email ?? ''; // D CORREO
  c[4] = f.whatsapp ?? ''; // E NÚMERO
  c[5] = dmy(f.fecha_nacimiento); // F NACIMIENTO
  c[6] = f.pais ?? ''; // G PAÍS, sacado del código del número
  c[7] = f.sin_hora ? '' : fechaLima(f.inicio_utc); // H FECHA
  c[12] = f.producto ?? ''; // M PRODUCTO
  c[13] = f.soles == null ? '' : String(f.soles); // N SOLES
  c[16] = f.paciente_nuevo == null ? '' : f.paciente_nuevo ? 'Nuevo' : 'Control'; // Q RECURRENCIA
  c[17] = MOD[f.modalidad] ?? ''; // R MODALIDAD
  c[21] = f.nutricionista ?? ''; // V NUTRICIONISTA
  return c.map((v) => String(v).replace(/[\t\r\n]+/g, ' ')).join('\t');
}

async function copiar() {
  const elegidas = est.filas.filter((f) => est.sel.has(f.id));
  if (!elegidas.length) { aviso('Las citas que elegiste están en otra página de la tabla. Vuelve a esa página para copiarlas.'); return; }
  const texto = elegidas.map(filaMaestra).join('\r\n');
  const b = $('#a-copiar');
  try {
    await navigator.clipboard.writeText(texto);
    aviso();
    b.textContent = elegidas.length === 1 ? 'Copiada. Pégala en la columna A' : `Copiadas ${elegidas.length}. Pégalas en la columna A`;
  } catch {
    aviso('No se pudo copiar. Usa «Descargar (.csv)».');
  }
}

// No pagaron: la lista de /api/equipo/reservas (30 días), igual que antes en /panel/.
async function cargarNoPago() {
  const r = await pedir('/api/equipo/reservas');
  if (r?.status === 401) { mostrarLogin(); return false; }
  const d = r?.ok ? await jsonDe(r) : null;
  if (!d) { aviso(MSJ_CARGA); return true; }
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
  limitarFilas($('#n-scroll'));
  return true;
}

async function marcar(f, contactado, b) {
  b.disabled = true;
  const r = await pedir('/api/equipo/contactado', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: f.id, contactado }) });
  if (r?.status === 401) { mostrarLogin(); return; }
  if (r?.ok) { await cargarNoPago(); return; }
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

document.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.tramo) { est.tramo = b.dataset.tramo; est.pagina = 1; cargarReservas(); }
  else if (b.id === 'a-prev' || b.id === 'a-next') { est.pagina += b.id === 'a-next' ? 1 : -1; cargarReservas(); }
  else if (b.id === 'a-descargar' && est.sel.size > MAX_CSV) aviso(`Puedes descargar hasta ${MAX_CSV} citas a la vez. Quita algunas de la selección.`);
  else if (b.id === 'a-descargar' && est.sel.size) descargarReservas();
  else if (b.id === 'a-copiar' && est.sel.size) copiar();
});

$('#a-todos').addEventListener('change', (e) => {
  est.filas.forEach((f) => (e.target.checked ? est.sel.add(f.id) : est.sel.delete(f.id)));
  pintar();
});

let espera;
$('#a-q').addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(() => { est.pagina = 1; cargarReservas(); }, 300); });
$('#a-periodo').addEventListener('change', (e) => { $('#a-rango').hidden = e.target.value !== 'rango'; est.pagina = 1; cargarReservas(); });
for (const lado of ['desde', 'hasta']) $(`#a-${lado}`).addEventListener('change', () => { est.pagina = 1; cargarReservas(); });
