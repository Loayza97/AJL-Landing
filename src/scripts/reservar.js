// Controlador del flujo /reservar/: P1 acompañamiento → P2 duración → P3 hora
// → P4 datos → Mercado Pago. Montos, disponibilidad y vencimientos los decide
// el servidor; esta página solo guía.
import { montarSelector } from './selector-horas.js';

const catalogo = JSON.parse(document.getElementById('catalogo').textContent);
const $ = (s) => document.querySelector(s);
const soles = (c) => `S/${(c / 100).toLocaleString('es-PE', { maximumFractionDigits: 2 })}`;
const estado = { producto: null, duracion: null, reserva: null, reloj: null, selector: null };
const params = new URLSearchParams(location.search);

function irA(paso) {
  document.querySelectorAll('.rs-paso').forEach((s) => { s.hidden = s.dataset.paso !== paso; });
  window.scrollTo(0, 0);
}

function medir(evento, extra = {}) {
  try {
    if (typeof window.gtag === 'function') window.gtag('event', evento.ga, extra.ga || {});
    if (typeof window.fbq === 'function') window.fbq('track', evento.meta, extra.meta || {});
  } catch {}
}

function elegirProducto(id) {
  estado.producto = id;
  const plan = catalogo[id];
  if (plan.mensual) {
    $('#p2-plan').textContent = plan.nombre;
    $('#p2-3m').querySelector('.rs-precio').textContent = `S/${plan.total3m.toLocaleString('es-PE')}`;
    $('#p2-3m').querySelector('small').textContent = plan.perMes3m;
    $('#p2-1m').querySelector('.rs-precio').textContent = `S/${plan.precio}`;
    $('#p2-1m').querySelector('small').textContent = `son S/${plan.precio - plan.perMes3mSoles} más cada mes`;
    irA('p2');
  } else {
    estado.duracion = 1;
    abrirP3();
  }
}

function abrirP3(mensaje = '') {
  $('#p3-error').textContent = mensaje;
  irA('p3');
  if (estado.selector) { estado.selector.recargar(); return; }
  estado.selector = montarSelector($('#p3-selector'), { producto: estado.producto, duracion: estado.duracion, onElegir: apartar });
}

async function apartar(eleccion) {
  $('#p3-error').textContent = 'Apartando tu hora…';
  try {
    const r = await fetch('/api/reservas/apartar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ producto: estado.producto, duracion: estado.duracion, ...eleccion }),
    });
    const d = await r.json();
    if (!r.ok) { $('#p3-error').textContent = d.error || 'Esa hora ya no está disponible.'; estado.selector.recargar(); return; }
    abrirP4(d);
  } catch {
    $('#p3-error').textContent = 'No pudimos apartar la hora. Revisa tu conexión e intenta de nuevo.';
  }
}

function abrirP4(reserva) {
  estado.reserva = reserva;
  $('#p4-resumen').innerHTML = '';
  const linea = (t) => { const p = document.createElement('div'); p.textContent = t; $('#p4-resumen').append(p); };
  linea(`${reserva.titulo} · ${soles(reserva.monto_centimos)}`);
  linea(`${reserva.etiqueta} · ${reserva.modalidad === 'video' ? 'Videollamada' : 'En Lince'} · con ${reserva.nutricionista?.nombre ?? 'el equipo'}`);
  $('#p4-dni').hidden = !reserva.requiere_dni;
  $('#f-dni').required = reserva.requiere_dni;
  $('#p4-yape').hidden = reserva.monto_centimos <= 50000;
  $('#p4-pagar').textContent = `Pagar ${soles(reserva.monto_centimos)}`;
  $('#p4-error').textContent = '';
  clearInterval(estado.reloj);
  const tick = () => {
    const resta = Date.parse(reserva.retencion_hasta) - Date.now();
    if (resta <= 0) { clearInterval(estado.reloj); abrirP3('Se venció el tiempo para apartar tu hora. Elige otra.'); return; }
    const m = Math.floor(resta / 60000);
    const s = String(Math.floor((resta % 60000) / 1000)).padStart(2, '0');
    $('#p4-reloj').textContent = `${m}:${s}`;
  };
  tick();
  estado.reloj = setInterval(tick, 1000);
  irA('p4');
  medir({ ga: 'begin_checkout', meta: 'InitiateCheckout' }, {
    ga: { currency: 'PEN', value: reserva.monto_centimos / 100, items: [{ item_name: reserva.titulo }] },
    meta: { currency: 'PEN', value: reserva.monto_centimos / 100, content_name: reserva.titulo },
  });
}

async function pagar(e) {
  e.preventDefault();
  const boton = $('#p4-pagar');
  boton.disabled = true;
  $('#p4-error').textContent = '';
  try {
    const r = await fetch('/api/reservas/pagar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: estado.reserva.token, nombre: $('#f-nombre').value, whatsapp: $('#f-whatsapp').value, email: $('#f-email').value,
        dni: $('#f-dni').value, acepto: $('#f-acepto').checked, novedades: $('#f-novedades').checked,
      }),
    });
    const d = await r.json();
    if (r.status === 410) { abrirP3(d.error); return; }
    if (!r.ok) { $('#p4-error').textContent = d.error || 'Revisa tus datos.'; boton.disabled = false; return; }
    location.href = d.url;
  } catch {
    $('#p4-error').textContent = 'No pudimos conectar con Mercado Pago. Intenta de nuevo.';
    boton.disabled = false;
  }
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-producto],[data-duracion],[data-volver]');
  if (!b) return;
  if (b.dataset.producto) elegirProducto(b.dataset.producto);
  else if (b.dataset.duracion) { estado.duracion = Number(b.dataset.duracion); abrirP3(); }
  else if (b.dataset.volver) irA(b.dataset.volver);
});
$('#p4-form').addEventListener('submit', pagar);

// Retomar una reserva apartada (volver desde Mercado Pago tras un rechazo).
async function retomar(token) {
  try {
    const r = await fetch(`/api/reservas/estado?r=${encodeURIComponent(token)}`);
    const d = await r.json();
    if (r.ok && ['apartada', 'pagando'].includes(d.estado)) {
      estado.producto = d.producto;
      estado.duracion = d.duracion_meses;
      abrirP4({ ...d, token });
      return true;
    }
  } catch {}
  return false;
}

function leerGuardado(clave) {
  try { return sessionStorage.getItem(clave); } catch { return null; }
}

(async () => {
  const token = params.get('r') || leerGuardado('ajl_reserva_r');
  if (token && await retomar(token)) return;
  const plan = params.get('plan');
  if (plan && catalogo[plan]) elegirProducto(plan);
  else irA('p1');
})();
