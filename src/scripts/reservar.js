// Controlador del flujo /reservar/: P1 acompañamiento → P2 duración → P3 hora
// → P4 datos → Mercado Pago. Montos, disponibilidad y vencimientos los decide
// el servidor; esta página solo guía.
import { montarSelector } from './selector-horas.js';
import { formatoSoles } from '../data/duraciones.js';
import { validarDatos, hoyEnLima } from '../data/validar-datos.js';

const catalogo = JSON.parse(document.getElementById('catalogo').textContent);
const $ = (s) => document.querySelector(s);
const soles = (c) => formatoSoles(Math.round(c / 100));
const estado = { producto: null, duracion: null, reserva: null, reloj: null, selector: null };
const params = new URLSearchParams(location.search);

const h = (tag, cls, texto) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (texto != null) e.textContent = texto;
  return e;
};

function tarjetaDuracion(o, precioMes) {
  const b = h('button', o.meses === 3 ? 'rs-dur rs-dur--star' : 'rs-dur');
  b.type = 'button';
  b.dataset.duracion = String(o.meses);
  if (o.meses === 3) b.append(h('span', 'rs-badge', 'Recomendado'));
  b.append(h('b', 'rs-dur-t', o.meses === 1 ? 'Mes a mes' : `${o.meses} meses`));
  const precio = h('span', 'rs-dur-p');
  if (o.ahorro) precio.append(h('s', null, formatoSoles(precioMes)));
  precio.append(h('strong', null, formatoSoles(o.porMes)), h('small', null, 'al mes'));
  b.append(precio);
  if (o.meses === 1) {
    b.append(h('span', 'rs-dur-d', 'Pagas cada mes, sin compromiso'));
  } else {
    b.append(h('span', 'rs-dur-d', `${formatoSoles(o.total)} en total`));
    b.append(h('span', 'rs-dur-cuotas', 'Puedes pagarlo en cuotas'));
    b.append(h('span', 'rs-dur-d', `Si viajas, puedes congelarlo ${o.congelarSemanas} ${o.congelarSemanas === 1 ? 'semana' : 'semanas'}`));
    b.append(h('span', 'rs-ahorro', `Ahorras ${formatoSoles(o.ahorro)} (${o.ahorroPct}%)`));
  }
  b.append(h('span', 'rs-btn rs-dur-cta', 'Elegir'));
  return b;
}

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
    $('#p2-plan').textContent = `${plan.nombre}, con tu plan y tu seguimiento entre sesiones.`;
    const precioMes = plan.duraciones[0].porMes;
    $('#p2-opciones').replaceChildren(...plan.duraciones.map((o) => tarjetaDuracion(o, precioMes)));
    const caja = $('#p2-consultas');
    caja.replaceChildren(h('b', null, 'Así son tus consultas cada mes'), ...plan.consultas.map((t) => h('span', null, t)));
    if (plan.regalo) caja.append(h('span', 'rs-regalo', 'De regalo: evaluación de cierre del primer mes'));
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

// La hora apartada se recuerda en el navegador hasta que vence su plazo, para
// soltarla si la persona elige otra (también si cerró la pestaña y volvió).
const CLAVE_APARTADA = 'ajl_reserva_apartada';
function horaApartada() {
  if (estado.reserva?.token) return estado.reserva.token;
  try {
    const g = JSON.parse(localStorage.getItem(CLAVE_APARTADA) || 'null');
    return g && Date.parse(g.hasta) > Date.now() ? g.token : null;
  } catch { return null; }
}

async function apartar(eleccion) {
  $('#p3-error').textContent = 'Apartando tu hora…';
  try {
    const r = await fetch('/api/reservas/apartar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ producto: estado.producto, duracion: estado.duracion, ...eleccion, liberar: horaApartada() }),
    });
    const d = await r.json();
    if (!r.ok) { $('#p3-error').textContent = d.error || 'Esa hora ya no está disponible.'; estado.selector.recargar(); return; }
    try {
      // 30 minutos: el plazo máximo para pagar una vez enviados los datos.
      localStorage.setItem(CLAVE_APARTADA, JSON.stringify({ token: d.token, hasta: new Date(Date.now() + 30 * 60000).toISOString() }));
    } catch {}
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

// WhatsApp con código de país: «Otro» deja que la persona escriba el +código.
function telefonoCompleto() {
  const numero = $('#f-whatsapp').value.replace(/[^\d+]/g, '');
  const codigo = $('#f-pais').value;
  if (!codigo || numero.startsWith('+')) return numero;
  return `+${codigo}${numero.replace(/^0+/, '')}`;
}

$('#f-pais').addEventListener('change', () => {
  $('#f-whatsapp').placeholder = $('#f-pais').value === '51' ? '9__ ___ ___' : ($('#f-pais').value ? 'Tu número' : '+código y número');
});

// AAAA-MM-DD a partir de las tres listas; vacío si falta alguna (el validador
// lo rechaza, y también un 31 de febrero).
function fechaNacimiento() {
  const [d, m, a] = ['#f-nac-dia', '#f-nac-mes', '#f-nac-anio'].map((s) => $(s).value);
  return d && m && a ? `${a}-${m}-${d}` : '';
}

$('#f-tipo-doc').addEventListener('change', () => {
  const dni = $('#f-tipo-doc').value === 'dni';
  $('#f-doc').inputMode = dni ? 'numeric' : 'text';
  $('#f-doc').maxLength = dni ? 8 : 12;
});

async function pagar(e) {
  e.preventDefault();
  const boton = $('#p4-pagar');
  boton.disabled = true;
  $('#p4-error').textContent = '';
  const datos = {
    token: estado.reserva.token, nombres: $('#f-nombres').value, apellido_paterno: $('#f-paterno').value,
    apellido_materno: $('#f-materno').value, whatsapp: telefonoCompleto(), email: $('#f-email').value,
    fecha_nacimiento: fechaNacimiento(), tipo_documento: $('#f-tipo-doc').value, documento: $('#f-doc').value,
    acepto: $('#f-acepto').checked, novedades: $('#f-novedades').checked,
  };
  const previa = validarDatos(datos, hoyEnLima(new Date()));
  if (!previa.ok) { $('#p4-error').textContent = previa.error; boton.disabled = false; return; }
  try {
    const r = await fetch('/api/reservas/pagar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datos),
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
  const abrir = e.target.closest('[data-ventana]');
  if (abrir) { e.preventDefault(); document.getElementById(`ventana-${abrir.dataset.ventana}`).showModal(); return; }
  const cerrar = e.target.closest('[data-cerrar]');
  if (cerrar) { cerrar.closest('dialog').close(); return; }
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
