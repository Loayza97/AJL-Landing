// Controlador de /agenda/?l=TOKEN: horario → DNI → (ya paciente: confirmar |
// nuevo: datos) → listo. Las horas, el DNI y la cita los decide el servidor.
import { montarSelector } from './selector-horas.js';
import { NOMBRE_MODALIDAD as MOD, nodoDonde } from './donde.js';
import { validarDatos, hoyEnLima } from '../data/validar-datos.js';
import { contacto } from '../data/contacto.js';
import { telefonoCompleto, placeholderTelefono } from '../data/telefono.js';

const $ = (s) => document.querySelector(s);
const token = new URLSearchParams(location.search).get('l') || '';
// volverA: tras un 409 (hora tomada) el paciente vuelve directo al paso donde
// estaba (conocido o datos) con lo que ya respondió /dni: no repite el DNI ni
// gasta otra consulta del cupo del link.
const estado = { link: null, hora: null, dni: null, selector: null, volverA: null };

function irA(paso) {
  document.querySelectorAll('.rs-paso').forEach((s) => { s.hidden = s.dataset.paso !== paso; });
  window.scrollTo(0, 0);
}

function fin(titulo, detalle, reintentar = false) {
  $('#a-fin-t').textContent = titulo;
  $('#a-fin-d').textContent = detalle;
  $('#a-fin-donde').replaceChildren();
  $('#a-reintentar').hidden = !reintentar;
  irA('fin');
}

function pintarResumen() {
  const h = estado.hora;
  const t = estado.link.tipo;
  document.querySelectorAll('[data-resumen]').forEach((el) => {
    el.replaceChildren();
    const b = document.createElement('b');
    b.textContent = h.etiqueta;
    const s = document.createElement('span');
    s.textContent = `${t.nombre} · ${MOD[h.modalidad]} · con ${h.nutricionistaNombre}`;
    el.append(b, document.createElement('br'), s);
  });
}

const fmt = new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' });
const etiqueta = (iso) => { const s = fmt.format(new Date(iso)); return s.charAt(0).toUpperCase() + s.slice(1); };

// Nunca lanza: una caída de red o una respuesta que no es JSON vuelven como
// status 0 / cuerpo vacío, y cada llamador decide qué mensaje mostrar.
async function api(ruta, cuerpo) {
  let r;
  try {
    r = await fetch(ruta, cuerpo ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) } : undefined);
  } catch {
    return { status: 0, d: {} };
  }
  let d = {};
  try { d = await r.json(); } catch {}
  return { status: r.status, d };
}

const MSJ_RED = 'No pudimos conectarnos. Revisa tu conexión e inténtalo de nuevo.';
const MSJ_RED_CONFIRMAR = 'No pudimos confirmar por un problema de conexión. Si te llega el correo de confirmación, tu cita ya quedó agendada; si no, inténtalo de nuevo.';

function linkNoVigente() {
  fin('Este link ya no sirve', 'Ya se usó o venció. Escríbenos por WhatsApp y lo reactivamos.');
}

async function confirmar(datos, errorSel) {
  const btns = document.querySelectorAll('.rs-btn');
  btns.forEach((b) => { b.disabled = true; });
  const h = estado.hora;
  const { status, d } = await api('/api/agenda/confirmar', { l: token, inicio: h.inicio, modalidad: h.modalidad, nutricionista: h.nutricionista, dni: estado.dni, datos });
  btns.forEach((b) => { b.disabled = false; });
  if (status === 0) {
    $(errorSel).textContent = MSJ_RED_CONFIRMAR;
  } else if (status === 200) {
    $('#a-listo').textContent = `${d.etiqueta} · ${d.titulo} · ${MOD[d.modalidad]} · con ${d.nutricionista}`;
    $('#a-listo').append(nodoDonde(d.modalidad, d.meet));
    const donde = d.modalidad === 'video' ? 'por videollamada' : 'en el consultorio de Lince';
    // «viernes, 16 de octubre, 5:00 p. m.» → «el viernes 16 de octubre a las 5:00 p. m.»
    const f = d.etiqueta.match(/^(\S+), (.+), (\d.+)$/);
    const cuando = f ? `el ${f[1]} ${f[2]} ${f[3].startsWith('1:') ? 'a la' : 'a las'} ${f[3]}` : d.etiqueta;
    const texto = `Hola, ya agendé mi evaluación nutricional para ${cuando} con ${d.nutricionista} ${donde}.`;
    $('#a-wa').href = `https://wa.me/${contacto.whatsappNumber}?text=${encodeURIComponent(texto)}`;
    $('#a-gcal').href = d.google_calendar;
    $('#a-ics').href = d.ics;
    irA('listo');
  } else if (status === 409) {
    estado.volverA = datos ? 'datos' : 'conocido';
    $('#a-error-horario').textContent = d.error || 'Esa hora acaba de ocuparse. Elige otra.';
    irA('horario');
    estado.selector.recargar();
  } else if (status === 410) {
    linkNoVigente();
  } else if (d.motivo === 'datos') {
    irA('datos');
  } else {
    $(errorSel).textContent = d.error || 'No pudimos agendar tu cita. Intenta en un momento.';
  }
}

$('#a-form-dni').addEventListener('submit', async (e) => {
  e.preventDefault();
  const dni = $('#a-dni').value.replace(/[\s.-]+/g, '');
  if (!/^\d{8}$/.test(dni)) { $('#a-error-dni').textContent = 'Escribe tu DNI (8 dígitos).'; return; }
  $('#a-error-dni').textContent = '';
  const { status, d } = await api('/api/agenda/dni', { l: token, dni });
  if (status === 410) return linkNoVigente();
  if (status === 0) { $('#a-error-dni').textContent = MSJ_RED; return; }
  if (status !== 200) { $('#a-error-dni').textContent = d.error || 'No pudimos revisar tu DNI. Intenta de nuevo.'; return; }
  estado.dni = dni;
  estado.volverA = null;
  if (!d.conocido) return irA('datos');
  $('#a-hola').textContent = `Hola, ${d.nombre}`;
  const lista = $('#a-contactos');
  lista.replaceChildren(...[d.email, d.whatsapp].map((t) => { const li = document.createElement('li'); li.textContent = t; return li; }));
  irA('conocido');
});

$('#a-confirmar-conocido').addEventListener('click', () => confirmar(undefined, '#a-error-conocido'));

$('#a-pais').addEventListener('change', () => { $('#a-whatsapp').placeholder = placeholderTelefono($('#a-pais').value); });

$('#a-form-datos').addEventListener('submit', (e) => {
  e.preventDefault();
  const whatsapp = telefonoCompleto($('#a-pais').value, $('#a-whatsapp').value);
  const datos = {
    apellido_paterno: $('#a-paterno').value, apellido_materno: $('#a-materno').value, nombres: $('#a-nombres').value,
    email: $('#a-email').value, whatsapp,
    fecha_nacimiento: `${$('#a-nac-anio').value}-${$('#a-nac-mes').value}-${$('#a-nac-dia').value}`,
    acepto: $('#a-acepto').checked,
  };
  const v = validarDatos({ ...datos, tipo_documento: 'dni', documento: estado.dni }, hoyEnLima(new Date()));
  if (!v.ok) { $('#a-error-datos').textContent = v.error; return; }
  $('#a-error-datos').textContent = '';
  confirmar(datos, '#a-error-datos');
});

$('#a-reintentar').addEventListener('click', () => { irA('cargando'); iniciar(); });

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-volver], [data-ir]');
  if (b) irA(b.dataset.volver || b.dataset.ir);
});

async function iniciar() {
  if (!token) return fin('Falta el link', 'Abre el link completo que te mandamos por WhatsApp.');
  const { status, d } = await api(`/api/agenda/link?l=${encodeURIComponent(token)}`);
  if (status === 0) return fin('No pudimos abrir tu link', MSJ_RED, true);
  if (status === 404) return fin('Este link no existe', d.error || 'Escríbenos por WhatsApp y te mandamos uno nuevo.');
  if (status !== 200) return fin('No pudimos abrir tu link', 'Intenta de nuevo en un momento.');
  estado.link = d;
  if (d.estado === 'agendado') {
    fin('Este link ya se usó', `Con él se agendó tu cita: ${d.cita.etiqueta}, ${MOD[d.cita.modalidad]}, con ${d.cita.nutricionista}. Si necesitas cambiarla, escríbenos.`);
    return $('#a-fin-donde').append(nodoDonde(d.cita.modalidad, d.cita.meet));
  }
  if (d.estado === 'vencido') return fin('Este link venció', 'Escríbenos por WhatsApp y lo reactivamos.');
  $('#a-tipo').textContent = `${d.tipo.nombre} · ${d.tipo.etiqueta}`;
  estado.selector = montarSelector($('#a-selector'), {
    modalidades: d.tipo.modalidades,
    // Elegida de entrada por turnos al crear el link; el paciente puede cambiarla o quitarla.
    nutricionista: d.nutricionista_sugerida || '',
    urlHoras: (p) => { p.set('l', token); return `/api/agenda/horas?${p}`; },
    // El link venció o se usó en otra pestaña mientras elegía: pantalla de link no vigente.
    onError: (status) => { if (status !== 410) return false; linkNoVigente(); return true; },
    onElegir: (h) => {
      estado.hora = { ...h, etiqueta: etiqueta(h.inicio) };
      $('#a-error-horario').textContent = '';
      pintarResumen();
      irA(estado.dni && estado.volverA ? estado.volverA : 'dni');
    },
  });
  irA('horario');
}

iniciar();
