// Panel /panel/, «Por agendar» (spec 2026-11-26-citas-por-cobro): cada suscripción con las citas que le
// faltan agendar y cuándo vuelve a pagar. «Agendar» crea el link de siempre, unido a esa suscripción.
// Todo el texto de la base se pinta con textContent.
import { limitarFilas } from './panel-filas.js';
import { cargarLinks, mostrarLogin } from './panel-links.js';
import { TIPOS_LINK } from '../../server/agenda/tipos.mjs';
import { productosDeTipo, productoDeTipo, duracionesDeProducto, clavePlan, citasDePlan, etiquetaPlan, etiquetaCita, MAX_CITA } from '../../server/agenda/opciones.mjs';
import { formatoSoles } from '../data/duraciones.js';
import { filasDeVista, conteos, ordenDeVista, alOrdenar, diaDeCobro } from '../../server/suscripciones/vista.mjs';

const $ = (s) => document.querySelector(s);
const soles = (c) => (c == null ? '' : formatoSoles(Math.round(c / 100)));
const fecha = (iso) => (iso ? new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) : '—');
let esAdmin = false;
let actual = null; // fila del diálogo abierto
// Lo que se está viendo; se conserva al recargar los datos.
const ver = { filas: [], vista: 'pendientes', q: '', orden: ordenDeVista('pendientes') };

function aviso(t = '') { $('#pa-msg').textContent = t; $('#pa-msg').hidden = !t; }
const nombreDe = (f) => f.nombre ?? f.pagador ?? 'Sin nombre en Mercado Pago';

const celda = (...lineas) => {
  const td = document.createElement('td');
  lineas.filter((l) => l != null && l !== '').forEach((l, i) => {
    if (l instanceof Node) { td.append(l); return; }
    const e = document.createElement(i === 0 ? 'span' : 'small'); e.textContent = l; if (i > 0) e.style.display = 'block'; td.append(e);
  });
  return td;
};
const boton = (texto, alTocar, clase = 'lk-btn lk-btn--borde lk-btn--mini') => {
  const b = document.createElement('button');
  b.type = 'button'; b.className = clase; b.textContent = texto; b.addEventListener('click', alTocar);
  return b;
};

function textoPlan(f) {
  if (f.plan) return f.plan === 'otro' ? `Otro · ${f.citas_por_cobro} citas por cobro` : etiquetaPlan(f.plan) ?? f.plan;
  const s = f.sugerido;
  if (!s) return 'Plan por elegir';
  return s.producto === 'otro' ? `Parece: ${s.citasPorCobro} citas por cobro` : `Parece: ${etiquetaPlan(clavePlan(s.producto, s.duracion))}`;
}

function textoFaltan(f) {
  if (!f.cobros) return '—';
  if (f.sin_asignar) return 'Sin asignar';
  if (f.faltan > 0) return f.faltan === 1 ? '1 cita' : `${f.faltan} citas`;
  return f.faltan < 0 ? `Al día · ${-f.faltan} de más` : 'Al día';
}

function celdaProximo(f) {
  if (!f.proximo) return celda('—');
  const { cuando, atrasado } = diaDeCobro(f.proximo, new Date());
  return celda(cuando ? `${cuando}, ${fecha(f.proximo)}` : fecha(f.proximo), atrasado ? 'Aún no se registra' : null);
}

function filaDe(f) {
  const tr = document.createElement('tr');
  const acciones = document.createElement('div');
  acciones.className = 'lk-acciones';
  if (f.nuevo) {
    tr.classList.add('lk-fila--nueva');
    acciones.append(boton('Visto', () => visto(f), 'lk-btn lk-btn--mini'));
  }
  if (f.cobros) {
    acciones.append(boton('Agendar', () => abrirAgendar(f), 'lk-btn lk-btn--mini'));
    if (!f.sin_asignar) acciones.append(boton('Ajustar', () => abrirAjuste(f)));
  }
  if (esAdmin && f.origen === 'mano' && !f.sin_asignar) acciones.append(boton('Quitar paciente', () => quitar(f)));
  if (f.whatsapp) {
    const a = document.createElement('a');
    a.href = `https://wa.me/${f.whatsapp.replace(/\D/g, '')}`; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'WhatsApp';
    acciones.append(a);
  }
  const quien = f.origen === 'web' ? 'Pagó en la web' : f.sin_asignar ? 'Nombre de quien paga en Mercado Pago' : 'Link hecho en Mercado Pago';
  const nombre = celda(nombreDe(f), quien);
  if (f.nuevo) {
    const chip = document.createElement('span');
    chip.className = 'lk-nueva lk-bloque'; chip.textContent = 'Nuevo pago';
    nombre.prepend(chip);
  }
  tr.append(
    nombre,
    // Sin asignar, también el nombre del plan tal cual está en Mercado Pago.
    celda(textoPlan(f), f.sin_asignar && f.reason ? `En Mercado Pago: «${f.reason}»` : null),
    f.cobros ? celda(`${fecha(f.cobrado_en)} · ${soles(f.monto_centimos)}`, `Cobro ${f.cobros}${f.cobros_total ? ` de ${f.cobros_total}` : ''}`)
      : celda('Aún sin cobro', soles(f.monto_centimos)),
    celdaProximo(f),
    celda(textoFaltan(f), f.links_sin_usar ? (f.links_sin_usar === 1 ? '1 link enviado sin usar' : `${f.links_sin_usar} links enviados sin usar`) : null),
    celda(acciones),
  );
  return tr;
}

const VACIO = { pendientes: 'No hay citas por agendar.', pronto: 'Nadie tiene un cobro en los próximos 30 días.', todas: 'No hay suscripciones.' };

// Con la sección cerrada las filas no miden nada: se ajusta el alto al abrirla.
const ajustarAlto = () => { if ($('#pa-plegable').open) limitarFilas($('#pa-scroll'), 6); };

function pintar() {
  const ahora = new Date();
  const n = conteos(ver.filas, ahora);
  $('#pa-nuevos').textContent = n.nuevos ? `🔔 ${n.nuevos === 1 ? '1 pago nuevo' : `${n.nuevos} pagos nuevos`}` : '';
  $('#pa-nuevos').hidden = !n.nuevos;
  $('#pa-cuenta').textContent = `${n.pendientes ? `${n.pendientes} por agendar` : 'todo al día'} · toca para abrir`;
  document.querySelectorAll('#pa-vistas [data-vista]').forEach((b) => {
    b.querySelector('span').textContent = n[b.dataset.vista];
    b.setAttribute('aria-pressed', String(b.dataset.vista === ver.vista));
  });
  document.querySelectorAll('#pa-plegable th[data-col]').forEach((th) => {
    if (ver.orden?.campo === th.dataset.col) th.setAttribute('aria-sort', ver.orden.asc ? 'ascending' : 'descending');
    else th.removeAttribute('aria-sort');
  });
  const filas = filasDeVista(ver.filas, { vista: ver.vista, q: ver.q, orden: ver.orden, ahora });
  $('#pa-filas').replaceChildren(...(filas.length ? filas.map(filaDe) : [filaVacia(ver.q ? 'Nadie con ese nombre en esta vista.' : VACIO[ver.vista])]));
  $('#pa-scroll').scrollTop = 0;
  ajustarAlto();
}

function filaVacia(texto) {
  const tr = document.createElement('tr');
  const td = document.createElement('td');
  td.colSpan = 6; td.textContent = texto;
  tr.append(td);
  return tr;
}

export async function cargarPorAgendar() {
  const r = await fetch('/api/equipo/por-agendar', { cache: 'no-store' }).catch(() => null);
  if (r?.status === 401) return false;
  const d = await r?.json().catch(() => null);
  if (!d?.ok) { aviso('No pudimos cargar «Por agendar». Recarga la página.'); return; }
  aviso();
  esAdmin = d.admin === true;
  ver.filas = d.filas;
  pintar();
}

// ── Visto y ajustar ──────────────────────────────────────────────────────────
async function visto(f) {
  const { error } = await enviar({ accion: 'visto', clave: f.clave, cobros: f.cobros });
  if (error) { aviso(error); return; }
  cargarPorAgendar();
}

function abrirAjuste(f) {
  actual = f;
  $('#pn-paciente').textContent = nombreDe(f);
  const n = $('#pn-numero');
  n.value = ''; n.min = String(-MAX_CITA); n.max = String(MAX_CITA);
  $('#pn-motivo').value = '';
  $('#pn-msg').hidden = true;
  $('#pn-dialogo').showModal();
}

async function enviar(cuerpo) {
  const r = await fetch('/api/equipo/por-agendar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) }).catch(() => null);
  if (r?.status === 401) { mostrarLogin(); return { error: 'Vuelve a entrar.' }; }
  const d = await r?.json().catch(() => null);
  return d?.ok ? {} : { error: d?.error || 'No se pudo guardar. Intenta de nuevo.' };
}

async function guardarAjuste(e) {
  e.preventDefault();
  const valor = $('#pn-numero').value.trim();
  const cantidad = /^-?\d+$/.test(valor) ? Number(valor) : null;
  $('#pn-guardar').disabled = true;
  const { error } = await enviar({ accion: 'ajuste', clave: actual.clave, cantidad, motivo: $('#pn-motivo').value });
  $('#pn-guardar').disabled = false;
  if (error) { $('#pn-msg').textContent = error; $('#pn-msg').hidden = false; return; }
  $('#pn-dialogo').close();
  cargarPorAgendar();
}

async function quitar(f) {
  if (!confirm(`¿Quitar a ${nombreDe(f)} de esta suscripción? Sus cobros se quedan y volverá a salir «sin asignar».`)) return;
  const { error } = await enviar({ accion: 'quitar', clave: f.clave });
  if (error) { aviso(error); return; }
  cargarPorAgendar();
}

// ── Agendar desde la fila ────────────────────────────────────────────────────
const opciones = (sel, lista, vacio, elegido = '') => {
  sel.replaceChildren(new Option(vacio, ''), ...lista.map((o) => new Option(o.etiqueta, o.id)));
  sel.value = lista.some((o) => o.id === elegido) ? elegido : lista.length === 1 ? lista[0].id : '';
};
const planElegido = () => {
  const p = $('#pg-producto').value;
  if (p === 'otro') return 'otro';
  const d = $('#pg-duracion').value;
  return p && d ? clavePlan(p, d) : '';
};
// La suscripción con plan no lo cambia; la hecha a mano sin plan puede ser «otro».
function productosDe(tipo) {
  const lista = productosDeTipo(tipo).map((p) => ({ id: p.id, etiqueta: p.etiqueta }));
  if (actual.origen === 'mano' && (!actual.plan || actual.plan === 'otro')) lista.push({ id: 'otro', etiqueta: 'Otro (la web no lo vende)' });
  return lista;
}
function alCambiarTipo() {
  const [producto] = String(actual.plan ?? '').split(':');
  const antes = $('#pg-producto').value || producto || actual.sugerido?.producto || '';
  opciones($('#pg-producto'), productosDe($('#pg-tipo').value), 'Elige el producto', antes);
  $('#pg-producto').disabled = Boolean(actual.plan);
  alCambiarProducto();
}
function alCambiarProducto() {
  const producto = $('#pg-producto').value;
  const otro = producto === 'otro';
  $('#pg-duracion-campo').hidden = otro;
  $('#pg-cpc-campo').hidden = !otro;
  if (!otro) {
    const antes = $('#pg-duracion').value || String(actual.plan ?? '').split(':')[1] || actual.sugerido?.duracion || '';
    opciones($('#pg-duracion'), producto ? duracionesDeProducto(producto) : [], 'Elige la duración', antes);
  }
  $('#pg-duracion').disabled = Boolean(actual.plan) || !producto;
  alCambiarDuracion();
}
function alCambiarDuracion() {
  const plan = planElegido();
  const lista = plan === 'otro' ? Array.from({ length: MAX_CITA }, (_, i) => ({ id: String(i + 1), etiqueta: etiquetaCita('otro', String(i + 1)) }))
    : plan ? citasDePlan(plan) : [];
  // Con paciente ya unido se propone la siguiente; sin asignar la elige quien agenda (de ahí sale lo ya usado).
  const siguiente = actual.sin_asignar || !lista.length ? ''
    : String(Math.min(Math.max(actual.usadas - actual.ajuste + 1, 1), lista.length));
  opciones($('#pg-cita'), lista, 'Elige qué cita es', siguiente);
  revisarAgendar();
}
function revisarAgendar() {
  const plan = planElegido();
  const cpc = Number($('#pg-cpc').value);
  $('#pg-crear').disabled = !$('#pg-tipo').value || !plan || !$('#pg-cita').value || (plan === 'otro' && !(Number.isInteger(cpc) && cpc >= 1));
}

function abrirAgendar(f) {
  actual = f;
  $('#pg-paciente').textContent = `${nombreDe(f)} · cobro ${f.cobros}${f.cobros_total ? ` de ${f.cobros_total}` : ''}`;
  $('#pg-ayuda').textContent = f.sin_asignar
    ? 'Es su primer link: elige con cuidado «Qué cita es». De ahí sale cuántas ya llevaba (cita 2 = ya usó 1). Al usarlo, la suscripción queda unida a quien lo llene.'
    : 'El link queda unido a esta suscripción.';
  const tipos = Object.entries(TIPOS_LINK).filter(([id]) => !f.plan || f.plan === 'otro' || productoDeTipo(id, f.plan))
    .map(([id, t]) => ({ id, etiqueta: `${t.nombre} · ${t.etiqueta}` }));
  opciones($('#pg-tipo'), tipos, 'Elige el tipo de cita', 's60');
  $('#pg-producto').value = ''; $('#pg-duracion').value = '';
  $('#pg-cpc').value = String(f.citas_por_cobro ?? f.sugerido?.citasPorCobro ?? '');
  $('#pg-cpc').disabled = f.citas_por_cobro != null;
  alCambiarTipo();
  $('#pg-form').hidden = false; $('#pg-creado').hidden = true; $('#pg-msg').hidden = true; $('#pg-copiar').textContent = 'Copiar';
  $('#pg-dialogo').showModal();
}

async function crearLink(e) {
  e.preventDefault();
  const plan = planElegido();
  const cuerpo = { tipo: $('#pg-tipo').value, plan, cita: $('#pg-cita').value, sus: actual.clave,
    ...(plan === 'otro' ? { citas_por_cobro: Number($('#pg-cpc').value) } : {}) };
  $('#pg-crear').disabled = true;
  const r = await fetch('/api/equipo/links', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) }).catch(() => null);
  if (r?.status === 401) return mostrarLogin();
  const d = await r?.json().catch(() => null);
  if (!d?.ok) { revisarAgendar(); $('#pg-msg').textContent = d?.error || 'No se pudo crear el link. Intenta de nuevo.'; $('#pg-msg').hidden = false; return; }
  $('#pg-url').value = d.url;
  const numero = actual.whatsapp ? actual.whatsapp.replace(/\D/g, '') : '';
  $('#pg-wa').href = `https://wa.me/${numero}?text=${encodeURIComponent(`Agenda tu cita en AJL Nutrición aquí (sirve una sola vez): ${d.url}`)}`;
  $('#pg-form').hidden = true; $('#pg-creado').hidden = false;
  cargarPorAgendar(); cargarLinks();
}

$('#pa-vistas').addEventListener('click', (e) => {
  const b = e.target.closest('[data-vista]');
  if (!b) return;
  ver.vista = b.dataset.vista; ver.orden = ordenDeVista(ver.vista);
  pintar();
});
$('#pa-plegable').addEventListener('click', (e) => {
  const b = e.target.closest('[data-orden]');
  if (!b) return;
  ver.orden = alOrdenar(ver.orden, b.dataset.orden);
  pintar();
});
$('#pa-q').addEventListener('input', () => { ver.q = $('#pa-q').value; pintar(); });
$('#pa-plegable').addEventListener('toggle', ajustarAlto);
$('#pn-form').addEventListener('submit', guardarAjuste);
$('#pn-cerrar').addEventListener('click', () => $('#pn-dialogo').close());
$('#pg-form').addEventListener('submit', crearLink);
$('#pg-tipo').addEventListener('change', alCambiarTipo);
$('#pg-producto').addEventListener('change', alCambiarProducto);
$('#pg-duracion').addEventListener('change', alCambiarDuracion);
$('#pg-cita').addEventListener('change', revisarAgendar);
$('#pg-cpc').addEventListener('input', revisarAgendar);
for (const id of ['#pg-cerrar', '#pg-listo']) $(id).addEventListener('click', () => $('#pg-dialogo').close());
$('#pg-copiar').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('#pg-url').value); $('#pg-copiar').textContent = 'Copiado'; }
  catch { $('#pg-url').select(); }
});
