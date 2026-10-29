// Panel /panel/, suscripciones: crear el link de suscripción y la lista con filtros.
// Todo el texto de la base se pinta con textContent.
import { formatoSoles } from '../data/duraciones.js';

const $ = (s) => document.querySelector(s);
const soles = (c) => formatoSoles(Math.round(c / 100));
const fecha = (iso) => (iso ? new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', day: 'numeric', month: 'short' }).format(new Date(iso)) : '—');
const ESTADO = { pendiente: 'Esperando primer cobro', activa: 'Activa', terminada: 'Terminó', cobro_fallido: 'Cobro fallido', cancelada: 'Cancelada' };
let filtro = 'todas';
let esAdmin = false;

function aviso(t = '') { $('#sus-msg').textContent = t; $('#sus-msg').hidden = !t; }
const celda = (...lineas) => {
  const td = document.createElement('td');
  lineas.filter((l) => l != null && l !== '').forEach((l, i) => {
    if (l instanceof Node) { td.append(l); return; }
    const e = document.createElement(i === 0 ? 'span' : 'small'); e.textContent = l; if (i > 0) e.style.display = 'block'; td.append(e);
  });
  return td;
};

function filaDe(s) {
  const tr = document.createElement('tr');
  const acciones = document.createElement('div');
  if (s.whatsapp) {
    const a = document.createElement('a');
    a.href = `https://wa.me/${s.whatsapp.replace(/\D/g, '')}`; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'WhatsApp';
    acciones.append(a);
  }
  if (s.penalidad_estado === 'pendiente') {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'lk-btn lk-btn--borde lk-btn--mini'; b.textContent = 'Marcar penalidad pagada';
    b.addEventListener('click', () => marcarPagada(s, b));
    acciones.append(b);
  }
  if (esAdmin) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'lk-btn lk-btn--borde lk-btn--mini'; b.textContent = 'Sincronizar con Mercado Pago';
    b.addEventListener('click', () => sincronizar(s, b));
    acciones.append(b);
  }
  const penalidad = s.penalidad_estado === 'pendiente' ? `Penalidad ${soles(s.penalidad_centimos)} pendiente`
    : s.penalidad_estado === 'pagada' ? `Penalidad ${soles(s.penalidad_centimos)} pagada` : null;
  tr.append(
    celda(s.nombre ?? '—', s.dni ? `Doc. ${s.dni}` : null),
    celda(s.titulo),
    celda(s.duracion_meses > 1 ? `${s.cobros_aprobados} de ${s.duracion_meses}` : String(s.cobros_aprobados)),
    celda(soles(s.cuota_centimos)),
    celda(s.estado === 'activa' ? fecha(s.proximo_cobro) : '—'),
    celda(ESTADO[s.estado] ?? s.estado, penalidad),
    celda(acciones),
  );
  return tr;
}

async function marcarPagada(s, b) {
  if (!confirm(`¿${s.nombre} ya pagó la penalidad de ${soles(s.penalidad_centimos)}?`)) return;
  b.disabled = true;
  const r = await fetch('/api/equipo/suscripciones-penalidad', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: s.id }) }).catch(() => null);
  if (!r?.ok) { b.disabled = false; aviso('No se pudo marcar. Intenta de nuevo.'); return; }
  cargarSuscripciones();
}

async function sincronizar(s, b) {
  b.disabled = true;
  const r = await fetch('/api/equipo/suscripciones-sincronizar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: s.id }) }).catch(() => null);
  const d = await r?.json().catch(() => null);
  b.disabled = false;
  if (!d?.ok) { aviso(d?.error || 'No se pudo sincronizar. Intenta de nuevo.'); return; }
  cargarSuscripciones();
}

function filaVacia() {
  const tr = document.createElement('tr');
  const td = document.createElement('td');
  td.colSpan = 7; td.textContent = 'No hay suscripciones con este filtro.';
  tr.append(td);
  return tr;
}

// «Cobrar con suscripción»: se ve si el pago mensual está abierto o si quien mira es administrador;
// el producto de prueba solo para administradores y los demás planes solo con el pago mensual abierto.
function ofrecer({ admin, abiertas }) {
  $('#sus-seccion').hidden = !(abiertas || admin);
  const prueba = $('#sus-prueba');
  prueba.hidden = prueba.disabled = !admin;
  document.querySelectorAll('#sus-plan optgroup[data-regular]').forEach((g) => { g.hidden = g.disabled = !abiertas; });
}
const opcionesAbiertas = fetch('/api/reservas/opciones', { cache: 'no-store' }).then((r) => r.json()).then((d) => d?.suscripciones === true).catch(() => false);

export async function cargarSuscripciones() {
  const r = await fetch(`/api/equipo/suscripciones?filtro=${filtro}`, { cache: 'no-store' }).catch(() => null);
  if (r?.status === 401) return false;
  const d = await r?.json().catch(() => null);
  if (!d?.ok) { aviso('No pudimos cargar las suscripciones. Recarga la página.'); return; }
  aviso();
  esAdmin = d.admin === true;
  ofrecer({ admin: d.admin === true, abiertas: await opcionesAbiertas });
  document.querySelectorAll('#sus-filtros [data-filtro]').forEach((b) => { b.querySelector('span').textContent = d.conteos[b.dataset.filtro] ?? 0; });
  $('#sus-filas').replaceChildren(...(d.filas.length ? d.filas.map(filaDe) : [filaVacia()]));
}

$('#sus-filtros').addEventListener('click', (e) => {
  const b = e.target.closest('[data-filtro]');
  if (!b) return;
  filtro = b.dataset.filtro;
  document.querySelectorAll('#sus-filtros [data-filtro]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  cargarSuscripciones();
});

const revisar = () => { $('#sus-crear-btn').disabled = !$('#sus-nombre').value.trim() || !$('#sus-plan').value; };
$('#sus-nombre').addEventListener('input', revisar);
$('#sus-plan').addEventListener('change', revisar);
$('#sus-crear-btn').addEventListener('click', async () => {
  const [producto, meses] = $('#sus-plan').value.split(':');
  const b = $('#sus-crear-btn');
  b.disabled = true;
  const r = await fetch('/api/equipo/suscripciones', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre: $('#sus-nombre').value, producto, meses: Number(meses) }) }).catch(() => null);
  const d = await r?.json().catch(() => null);
  if (!d?.ok) { alert(d?.error || 'No se pudo crear el link. Intenta de nuevo.'); revisar(); return; }
  $('#sus-url').value = d.url;
  $('#sus-copiar').textContent = 'Copiar';
  $('#sus-wa').href = `https://wa.me/?text=${encodeURIComponent(`Activa tu plan de AJL Nutrición aquí (sirve una sola vez): ${d.url}`)}`;
  $('#sus-creado').hidden = false;
  $('#sus-nombre').value = '';
  $('#sus-plan').value = '';
  revisar();
});
$('#sus-copiar').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('#sus-url').value); $('#sus-copiar').textContent = 'Copiado'; } catch { $('#sus-url').select(); }
});
