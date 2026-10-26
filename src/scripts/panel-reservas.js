// Panel /panel/, parte de Reservas: una sola lista con las citas agendadas con link
// y las pagadas en la página web, la última agendada primero; copiar para la base
// maestra y CSV de las elegidas; y la pestaña de quién dejó datos sin pagar, con
// «Marcar contactado». Todo el texto de la base se pinta con textContent.
import { limitarFilas } from './panel-filas.js';
import { numeroParaPegar } from '../data/telefono.js';
import { mostrarLogin } from './panel-links.js';
import { nutricionistas } from '../data/nutricionistas.js';

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
const REVISAR = { borrado: 'Evento borrado en el calendario, revisar', cruce: 'Movida en el calendario a una hora ocupada, revisar' };
const DOCS = { dni: 'DNI', ce: 'CE', pasaporte: 'Pasaporte' };
const soles = (c) => `S/${String(Math.round(c / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
const est = { tramo: 'proximas', pagina: 1, total: 0, filas: [], sel: new Set(), nopago: null, visita: null, editando: null, inicio: null, seqHoras: 0 };

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

// Una vez por carga de página: trae la visita anterior y guarda esta. Las citas
// agendadas después se marcan «Nueva» hasta que se vuelva a abrir el panel.
async function registrarVisita() {
  const r = await pedir('/api/equipo/visita', { method: 'POST' });
  const d = r?.ok ? await jsonDe(r) : null;
  if (!d) return;
  est.visita = d;
  const n = d.nuevas;
  const cuando = d.primera ? 'en las últimas 24 horas' : `desde tu última visita (${lima(d.desde)})`;
  $('#a-nuevas').textContent = n ? `${n} ${n === 1 ? 'cita nueva' : 'citas nuevas'} ${cuando}` : '';
  $('#a-nuevas').hidden = !n;
}
const esNueva = (f) => est.visita && !f.cancelada && Date.parse(f.agendado_en) > Date.parse(est.visita.desde);

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
  if (!est.visita) await registrarVisita();
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
  est.filas.forEach((f) => { if (f.cancelada) est.sel.delete(f.id); });
  $('#a-filas').replaceChildren(...(filas.length ? filas.map((f) => {
    const tr = document.createElement('tr');
    tr.dataset.sel = String(est.sel.has(f.id));
    if (f.cancelada) tr.classList.add('lk-fila--cancelada');
    else if (f.revisar) tr.classList.add('lk-fila--revisar');
    else if (esNueva(f)) tr.classList.add('lk-fila--nueva');
    const caja = document.createElement('input');
    caja.type = 'checkbox'; caja.checked = est.sel.has(f.id);
    caja.setAttribute('aria-label', `Seleccionar a ${f.nombres} ${f.apellido_paterno ?? ''}`.trim());
    caja.addEventListener('change', () => { caja.checked ? est.sel.add(f.id) : est.sel.delete(f.id); pintar(); });
    const etq = document.createElement('label'); etq.className = 'lk-check'; etq.append(caja);
    const celdaCaja = f.cancelada ? td() : td(etq);
    // Mismo orden que la base maestra: APELLIDOS, NOMBRES, DNI, CORREO, NÚMERO, NACIMIENTO, PAÍS, FECHA…
    const cita = f.sin_hora ? td(chip('Sin hora', 'lk-alerta'), f.tipo) : td(citaCorta(f.inicio_utc), f.tipo);
    if (f.cancelada) cita.prepend(chip('Cancelada', 'lk-alerta lk-bloque'));
    else if (esNueva(f)) cita.prepend(chip('Nueva', 'lk-nueva lk-bloque'));
    if (f.calendario) cita.append(chip(`Editada en calendario: ${f.calendario.cambios || 'sin cambios de hora'} · ${lima(f.calendario.editado_en)}`, 'lk-nota-cal'));
    if (f.edicion) {
      const quien = String(f.edicion.por).split('@')[0];
      cita.append(chip(f.edicion.cambios === 'Cancelada' ? `Cancelada por ${quien} · ${lima(f.edicion.en)}`
        : `Editada por ${quien} · ${lima(f.edicion.en)}: ${f.edicion.cambios}`, 'lk-nota-cal'));
    }
    if (f.editable && !f.revisar) {
      const be = document.createElement('button');
      be.type = 'button'; be.className = 'lk-btn lk-btn--mantener'; be.textContent = 'Editar';
      be.setAttribute('aria-label', `Editar cita de ${f.nombres} ${f.apellido_paterno ?? ''}`.trim());
      be.dataset.editar = f.id;
      const bc = document.createElement('button');
      bc.type = 'button'; bc.className = 'lk-btn lk-btn--cancelar'; bc.textContent = 'Cancelar cita';
      bc.setAttribute('aria-label', `Cancelar cita de ${f.nombres} ${f.apellido_paterno ?? ''}`.trim());
      bc.dataset.cancelar = f.id;
      const acciones = document.createElement('div');
      acciones.className = 'lk-acciones-cita';
      acciones.append(be);
      if (f.cancelable) acciones.append(bc);
      cita.append(acciones);
    }
    if (f.revisar && !f.cancelada) {
      const cajaRevisar = document.createElement('div');
      cajaRevisar.className = 'lk-revisar';
      cajaRevisar.append(chip(REVISAR[f.revisar], 'lk-alerta lk-bloque'));
      for (const [accion, texto] of [['cancelar', 'Cancelar reserva'], ['mantener', 'Mantener']]) {
        const bt = document.createElement('button');
        bt.type = 'button'; bt.className = `lk-btn lk-btn--${accion}`; bt.textContent = texto;
        bt.setAttribute('aria-label', `${texto} de ${f.nombres} ${f.apellido_paterno ?? ''}`.trim());
        bt.dataset.revision = accion; bt.dataset.id = f.id;
        cajaRevisar.append(bt);
      }
      cita.append(cajaRevisar);
    }
    tr.append(celdaCaja, td([f.apellido_paterno, f.apellido_materno].filter(Boolean).join(' ')), td(f.nombres), sinCorte(td(f.dni)), td(f.email),
      sinCorte(td(f.whatsapp)), sinCorte(td(dmy(f.fecha_nacimiento))), td(f.pais), sinCorte(cita), sinCorte(td(f.plan, f.cita)), sinCorte(td(f.pago, f.neto && `Neto ${f.neto}`, f.pago_detalle)),
      td(f.paciente_nuevo == null ? '' : f.paciente_nuevo ? 'Nuevo' : 'Ya paciente'), td(MOD[f.modalidad]), td(f.nutricionista),
      sinCorte(td(chip(PROC[f.procedencia], `lk-proc lk-proc--${f.procedencia}`), `Agendó ${lima(f.agendado_en)}`)));
    return tr;
  }) : [filaVacia(15, 'No hay citas con este filtro.')]));
  limitarFilas($('#a-scroll'));
  const elegibles = filas.filter((f) => !f.cancelada);
  $('#a-todos').checked = elegibles.length > 0 && elegibles.every((f) => est.sel.has(f.id));
  const n = est.sel.size;
  $('#a-descargar').disabled = n === 0;
  $('#a-descargar').textContent = n ? `Descargar ${n} (.csv)` : 'Elige a quiénes descargar';
  $('#a-copiar').disabled = n === 0;
  $('#a-copiar').textContent = n ? `Copiar ${n} para la base maestra` : 'Copiar para la base maestra';
}

// Filas para pegar en la base maestra (Excel), desde la columna A (APELLIDOS): lo
// que el panel no sabe va vacío para que cada dato caiga en su columna. Después
// de PRODUCTO (M) la base tiene una columna de sesiones (N, «1/1»), así que SOLES
// es la O, RECURRENCIA la R, MODALIDAD la S y NUTRICIONISTA la W (Romi, 2026-10-16).
// El neto de Mercado Pago va en la P, junto al bruto (Romi, 2026-10-22).
// Solo se copian las elegidas que están en esta página de la tabla.
const COLUMNAS_MAESTRA = 25; // A a Y
// En la base Paola y Jussara van como Pao y Yuyu (Romi, 2026-10-16); solo al copiar, nunca para pacientes.
const NOMBRE_EN_BASE = { Paola: 'Pao', Jussara: 'Yuyu' };
function filaMaestra(f) {
  const c = Array(COLUMNAS_MAESTRA).fill('');
  c[0] = [f.apellido_paterno, f.apellido_materno].filter(Boolean).join(' '); // A APELLIDOS
  c[1] = f.nombres ?? ''; // B NOMBRES
  c[2] = f.dni ?? ''; // C DNI
  c[3] = f.email ?? ''; // D CORREO
  c[4] = numeroParaPegar(f.whatsapp); // E NÚMERO, los de Perú sin +51
  c[5] = dmy(f.fecha_nacimiento); // F NACIMIENTO
  c[6] = f.pais ?? ''; // G PAÍS, sacado del código del número
  c[7] = f.sin_hora ? '' : fechaLima(f.inicio_utc); // H FECHA
  c[12] = f.producto ?? ''; // M PRODUCTO
  c[14] = f.soles == null ? '' : String(f.soles); // O SOLES (bruto)
  c[15] = f.neto_soles == null ? '' : String(f.neto_soles); // P NETO de Mercado Pago; Q queda vacía (Romi, 2026-10-22)
  c[17] = f.paciente_nuevo == null ? '' : f.paciente_nuevo ? 'Nuevo' : 'Control'; // R RECURRENCIA
  c[18] = MOD[f.modalidad] ?? ''; // S MODALIDAD
  c[22] = NOMBRE_EN_BASE[f.nutricionista] ?? f.nutricionista ?? ''; // W NUTRICIONISTA
  return c.map((v) => String(v).replace(/[\t\r\n]+/g, ' ')).join('\t');
}

async function copiar() {
  const elegidas = est.filas.filter((f) => est.sel.has(f.id) && !f.cancelada);
  if (!elegidas.length) { aviso('No hay citas para copiar: las canceladas no se copian, y las elegidas pueden estar en otra página de la tabla.'); return; }
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

async function revisar(b) {
  const accion = b.dataset.revision;
  if (accion === 'cancelar' && !confirm('¿Cancelar esta reserva? La hora queda libre en la web y la fila se queda en rojo.')) return;
  b.disabled = true;
  const r = await pedir('/api/equipo/revision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: b.dataset.id, accion }) });
  if (r?.status === 401) { mostrarLogin(); return; }
  if (r?.ok) { aviso(); await cargarReservas(); return; }
  b.disabled = false;
  aviso((await jsonDe(r))?.error || 'No se pudo guardar. Intenta de nuevo.');
}

// Cancela desde el panel: la hora queda libre, la fila sigue en rojo y Google
// borra el evento y le avisa al paciente.
async function cancelarCita(b) {
  if (!confirm('¿Cancelar esta cita? La hora queda libre, se borra el evento de Google Calendar y Google le avisa al paciente.')) return;
  b.disabled = true;
  const r = await pedir('/api/equipo/cancelar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: b.dataset.cancelar }) });
  if (r?.status === 401) { mostrarLogin(); return; }
  const d = await jsonDe(r);
  if (r?.ok && d?.ok) {
    await cargarReservas();
    if (d.calendario === 'pendiente') aviso('Cita cancelada. El evento de Google Calendar no se pudo borrar: bórralo a mano.');
    return;
  }
  b.disabled = false;
  aviso(d?.error || 'No se pudo cancelar. Intenta de nuevo.');
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
  if (b.dataset.revision) { revisar(b); return; }
  if (b.dataset.editar) { abrirEditar(est.filas.find((f) => f.id === b.dataset.editar)); return; }
  if (b.dataset.cancelar) { cancelarCita(b); return; }
  if (b.dataset.tramo) { est.tramo = b.dataset.tramo; est.pagina = 1; cargarReservas(); }
  else if (b.id === 'a-prev' || b.id === 'a-next') { est.pagina += b.id === 'a-next' ? 1 : -1; cargarReservas(); }
  else if (b.id === 'a-descargar' && est.sel.size > MAX_CSV) aviso(`Puedes descargar hasta ${MAX_CSV} citas a la vez. Quita algunas de la selección.`);
  else if (b.id === 'a-descargar' && est.sel.size) descargar();
  else if (b.id === 'a-copiar' && est.sel.size) copiar();
});

$('#a-todos').addEventListener('change', (e) => {
  est.filas.filter((f) => !f.cancelada).forEach((f) => (e.target.checked ? est.sel.add(f.id) : est.sel.delete(f.id)));
  pintar();
});

let espera;
$('#a-q').addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(() => { est.pagina = 1; cargarReservas(); }, 300); });
$('#a-periodo').addEventListener('change', (e) => { $('#a-rango').hidden = e.target.value !== 'rango'; est.pagina = 1; cargarReservas(); });
for (const lado of ['desde', 'hasta']) $(`#a-${lado}`).addEventListener('change', () => { est.pagina = 1; cargarReservas(); });

// Editar cita: nutricionista, modalidad, fecha y hora. Las horas libres las da el
// servidor (/api/equipo/editar-horas); solo se pinta lo que devuelve, con textContent.
const fechaIsoLima = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(d);
const DIAS_MAX_EDITAR = 60;
function mensajeEditar(texto = '') { $('#e-msg').textContent = texto; $('#e-msg').hidden = !texto; }

function abrirEditar(f) {
  if (!f) return;
  est.editando = f; est.inicio = null;
  $('#e-paciente').textContent = `${[f.nombres, f.apellido_paterno].filter(Boolean).join(' ')} · ${citaCorta(f.inicio_utc)}`;
  $('#e-nutri').replaceChildren(...nutricionistas.map((n) => Object.assign(document.createElement('option'), { value: n.id, textContent: n.nombre })));
  $('#e-nutri').value = f.nutricionista_id;
  $('#e-modalidad').value = f.modalidad;
  const hoy = new Date();
  $('#e-fecha').min = fechaIsoLima(hoy);
  $('#e-fecha').max = fechaIsoLima(new Date(hoy.getTime() + DIAS_MAX_EDITAR * 86400000));
  // Una cita pasada (no vino) abre en hoy: no se puede reagendar hacia atrás.
  $('#e-fecha').value = new Date(f.inicio_utc) > hoy ? fechaIsoLima(new Date(f.inicio_utc)) : $('#e-fecha').min;
  mensajeEditar();
  $('#e-dialogo').showModal();
  cargarHoras();
}

const igualActual = (f, inicio) => inicio === f.inicio_utc && $('#e-nutri').value === f.nutricionista_id && $('#e-modalidad').value === f.modalidad;

async function cargarHoras() {
  const f = est.editando;
  const seq = ++est.seqHoras;
  est.inicio = null; $('#e-guardar').disabled = true;
  const caja = $('#e-horas');
  if (!f || !$('#e-fecha').value) { caja.replaceChildren(); return; }
  const p = new URLSearchParams({ id: f.id, fecha: $('#e-fecha').value, modalidad: $('#e-modalidad').value, nutricionista: $('#e-nutri').value });
  const r = await pedir(`/api/equipo/editar-horas?${p}`);
  if (seq !== est.seqHoras || est.editando !== f) return;
  if (r?.status === 401) { $('#e-dialogo').close(); mostrarLogin(); return; }
  const d = await jsonDe(r);
  if (seq !== est.seqHoras || est.editando !== f) return;
  if (!r?.ok || !d?.horas) { caja.replaceChildren(); mensajeEditar(d?.error || 'No se pudieron cargar las horas. Intenta de nuevo.'); return; }
  mensajeEditar();
  if (!d.horas.length) { caja.textContent = 'No hay horas libres ese día.'; return; }
  caja.replaceChildren(...d.horas.map((h) => {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = h.hora; b.dataset.inicio = h.inicio;
    // La hora actual sale marcada, pero «Guardar cambio» espera a que se elija una.
    b.setAttribute('aria-pressed', String(h.inicio === f.inicio_utc));
    return b;
  }));
}

async function guardarEdicion(e) {
  e.preventDefault();
  const f = est.editando;
  if (!f || !est.inicio) return;
  if (fechaIsoLima(new Date(est.inicio)) !== $('#e-fecha').value) { await cargarHoras(); mensajeEditar('Esa hora no es del día elegido. Elige otra.'); return; }
  $('#e-guardar').disabled = true;
  const r = await pedir('/api/equipo/editar', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: f.id, inicio: est.inicio, modalidad: $('#e-modalidad').value, nutricionista: $('#e-nutri').value }) });
  if (r?.status === 401) { $('#e-dialogo').close(); mostrarLogin(); return; }
  const d = await jsonDe(r);
  if (r?.ok && d?.ok) {
    $('#e-dialogo').close();
    await cargarReservas();
    if (d.calendario === 'pendiente') aviso('Cita cambiada. El calendario no se pudo actualizar: revisa el evento a mano.');
    return;
  }
  await cargarHoras();
  mensajeEditar(d?.error || 'No se pudo guardar. Intenta de nuevo.');
}

$('#e-horas').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-inicio]');
  if (!b) return;
  est.inicio = b.dataset.inicio;
  document.querySelectorAll('#e-horas button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  $('#e-guardar').disabled = !est.editando || igualActual(est.editando, est.inicio);
});
$('#e-dialogo').addEventListener('close', () => { est.editando = null; est.inicio = null; est.seqHoras++; });
for (const id of ['e-nutri', 'e-modalidad', 'e-fecha']) $(`#${id}`).addEventListener('change', cargarHoras);
$('#e-form').addEventListener('submit', guardarEdicion);
$('#e-cancelar').addEventListener('click', () => $('#e-dialogo').close());
