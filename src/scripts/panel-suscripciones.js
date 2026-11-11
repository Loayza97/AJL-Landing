// Panel /panel/, suscripciones: la lista con filtros, plegada al final del panel (Alejandro, 2026-11-11: «casi
// nunca lo usamos»). El link de un solo uso se crea desde «Generar link de reserva» (panel-links-reserva.js).
// Todo el texto de la base se pinta con textContent.
import { formatoSoles } from '../data/duraciones.js';

const $ = (s) => document.querySelector(s);
const soles = (c) => formatoSoles(Math.round(c / 100));
// El neto lleva céntimos (la comisión no es redonda): «S/257,70».
const solesExactos = (c) => `S/${(c / 100).toFixed(2).replace('.', ',')}`;
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
    // Arriba lo que nos dejó Mercado Pago en el último cobro; debajo lo que se le cobra al cliente.
    s.neto_ultimo_centimos != null ? celda(`Recibimos ${solesExactos(s.neto_ultimo_centimos)}`, `Cliente paga ${soles(s.cuota_centimos)}`)
      : s.con_cobro ? celda(`Cliente paga ${soles(s.cuota_centimos)}`, 'Neto sin dato: ver en Mercado Pago')
        : celda(`Cliente paga ${soles(s.cuota_centimos)}`, 'Aún sin cobro'),
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

// Plegada no se ve: si hay algo que atender, lo dice el resumen junto al título.
function resumen(c) {
  const avisos = [c.fallido && `${c.fallido} con cobro fallido`, c.penalidad && `${c.penalidad} con penalidad pendiente`].filter(Boolean);
  const r = $('#sus-resumen');
  r.textContent = avisos.length ? `${avisos.join(' · ')} · toca para abrir` : `${c.activas ?? 0} activas · toca para abrir`;
  r.classList.toggle('lk-nota--alerta', avisos.length > 0);
}

export async function cargarSuscripciones() {
  const r = await fetch(`/api/equipo/suscripciones?filtro=${filtro}`, { cache: 'no-store' }).catch(() => null);
  if (r?.status === 401) return false;
  const d = await r?.json().catch(() => null);
  if (!d?.ok) { aviso('No pudimos cargar las suscripciones. Recarga la página.'); return; }
  aviso();
  esAdmin = d.admin === true;
  resumen(d.conteos ?? {});
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
