// /suscribirse/?l=…: muestra el plan que armó el equipo y abre Mercado Pago.
import { formatoSoles } from '../data/duraciones.js';
import { telefonoCompleto } from '../data/telefono.js';

const $ = (s) => document.querySelector(s);
const soles = (c) => formatoSoles(Math.round(c / 100));
const l = new URLSearchParams(location.search).get('l') || '';
const h = (tag, texto, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; e.textContent = texto; return e; };

// DNI: 8 dígitos numéricos; CE y pasaporte admiten letras (como en /reservar/).
function ajustarDoc() {
  const dni = $('#s-tipo-doc').value === 'dni';
  $('#s-doc').inputMode = dni ? 'numeric' : 'text';
  $('#s-doc').maxLength = dni ? 8 : 12;
}
$('#s-tipo-doc').addEventListener('change', ajustarDoc);
ajustarDoc();

(async () => {
  let r = null;
  try { r = await fetch(`/api/suscripciones/link?l=${encodeURIComponent(l)}`, { cache: 'no-store' }); } catch {}
  const d = await r?.json().catch(() => null);
  if (!r?.ok || !d?.ok) { $('#sus').replaceChildren(h('h1', 'Este link ya no sirve'), h('p', d?.error || 'Pídele uno nuevo al equipo por WhatsApp.', 'rs-lead')); return; }
  const puntos = d.cobros
    ? [`Hoy pagas ${soles(d.cuota_centimos)}; luego se cobra solo cada mes.`, `Son ${d.cobros} cobros y termina, sin renovación.`,
      'Cancelas cuando quieras con el botón de cada recibo.', `Si cancelas antes de terminar, pagas la diferencia de los meses usados con el precio mes a mes (${soles(d.precio_mes_centimos)}).`]
    : [`Hoy pagas ${soles(d.cuota_centimos)}; luego se cobra solo cada mes.`, 'Cancelas cuando quieras, sin penalidad.'];
  const caja = h('div', '', 'rs-resumen');
  caja.append(h('b', d.titulo), h('div', `${soles(d.cuota_centimos)} cada mes`));
  const ul = document.createElement('ul');
  ul.append(...puntos.map((p) => h('li', p)));
  $('#sus').replaceChildren(h('h1', `Hola, ${d.nombre}. Este es tu plan`), caja, ul);
  $('#s-acepto-t').textContent = d.cobros
    ? `Acepto ${d.cobros} cobros mensuales automáticos de ${soles(d.cuota_centimos)}, y que si cancelo antes del último pagaré la diferencia entre lo que pagué y el precio que corresponde a los meses usados. Acepto también las condiciones del servicio.`
    : `Acepto el cobro mensual automático de ${soles(d.cuota_centimos)} hasta que cancele y las condiciones del servicio.`;
  $('#sus-form').hidden = false;
})();

$('#sus-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const b = $('#s-pagar');
  b.disabled = true;
  $('#s-error').textContent = '';
  try {
    const r = await fetch('/api/suscripciones/link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      l, email: $('#s-email').value, tipo_documento: $('#s-tipo-doc').value, documento: $('#s-doc').value,
      whatsapp: telefonoCompleto($('#s-pais').value, $('#s-whatsapp').value), acepto: $('#s-acepto').checked }) });
    const d = await r.json();
    if (r.ok && d.url) { location.href = d.url; return; }
    // Con penalidad pendiente (409) no hay url: el enlace de pago llega por correo.
    $('#s-error').textContent = d.error || 'Revisa tus datos.';
  } catch {
    $('#s-error').textContent = 'No pudimos conectar con Mercado Pago. Intenta de nuevo.';
  }
  b.disabled = false;
});
