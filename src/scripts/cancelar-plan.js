// /suscripcion/cancelar/?s=…: pagar la penalidad y cancelar, o seguir con el plan.
// Darse de baja nunca depende de pagar (spec 2026-10-27).
import { formatoSoles } from '../data/duraciones.js';

const $ = (s) => document.querySelector(s);
const soles = (c) => formatoSoles(Math.round(c / 100));
const q = new URLSearchParams(location.search);
const s = q.get('s') || '';
const raiz = $('#cp');
const h = (tag, texto, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; if (texto != null) e.textContent = texto; return e; };
const boton = (texto, cls, alClic) => { const b = h('button', texto, cls); b.type = 'button'; b.addEventListener('click', alClic); return b; };

async function enviar(pagar, b) {
  b.disabled = true;
  $('#cp-error').textContent = '';
  try {
    const r = await fetch('/api/suscripciones/cancelar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ s, pagar }) });
    const d = await r.json();
    if (!r.ok) { $('#cp-error').textContent = d.error || 'No pudimos procesarlo. Intenta de nuevo.'; b.disabled = false; return; }
    if (d.url) { location.href = d.url; return; }
    raiz.replaceChildren(h('h1', 'Tu plan quedó cancelado'), h('p', d.penalidad_centimos > 0
      ? `Ya no se te cobra nada más. Los ${soles(d.penalidad_centimos)} de la penalidad quedan pendientes y se pagan si vuelves a reservar.`
      : 'Ya no se te cobra nada más. Te enviamos la confirmación a tu correo.', 'rs-lead'));
  } catch {
    $('#cp-error').textContent = 'Revisa tu conexión e intenta de nuevo.';
    b.disabled = false;
  }
}

function pintar(d) {
  const resumen = h('div', null, 'rs-resumen');
  resumen.append(h('b', d.titulo), h('div', d.duracion_meses > 1 ? `Pagaste ${d.cobros_aprobados} de ${d.duracion_meses} cobros` : `Pagaste ${d.cobros_aprobados} meses`));
  if (d.modo === 'cerrada') { raiz.replaceChildren(h('h1', 'Tu plan ya está cerrado'), h('p', 'No tienes nada pendiente con nosotros.', 'rs-lead')); return; }
  if (d.modo === 'deuda') {
    raiz.replaceChildren(h('h1', 'Tienes una penalidad pendiente'), resumen, h('p', `Para volver a reservar, primero se paga la penalidad de ${soles(d.penalidad_centimos)}.`, 'rs-lead'),
      boton(`Pagar ${soles(d.penalidad_centimos)}`, 'rs-btn', (e) => enviar(true, e.currentTarget)));
    return;
  }
  const hijos = [h('h1', 'Cancelar mi plan'), resumen];
  if (d.penalidad_centimos > 0) {
    hijos.push(h('p', `Cancelar antes del último cobro tiene una penalidad de ${soles(d.penalidad_centimos)}: la diferencia de los meses que usaste con el precio que les correspondía (${d.detalle}). Después ya no se te cobra nada más.`, 'rs-aviso'),
      boton(`Pagar ${soles(d.penalidad_centimos)} y cancelar`, 'rs-btn', (e) => enviar(true, e.currentTarget)),
      h('p', 'Pagas en Mercado Pago con tarjeta o Yape. Al confirmarse, tu plan queda cancelado.', 'rs-nota'));
    // «Cancelar sin pagar ahora» se quitó de la página (Joaquín, 2026-10-29) para ver cómo responden
    // los pacientes. La API lo sigue aceptando y la baja desde la cuenta de Mercado Pago deja la
    // penalidad pendiente como antes.
  } else {
    hijos.push(h('p', 'No tienes penalidad. Al cancelar ya no se te cobra nada más.', 'rs-lead'), boton('Cancelar mi plan', 'rs-btn', (e) => enviar(false, e.currentTarget)));
  }
  const seguir = h('a', 'Prefiero seguir con mi plan', 'rs-link');
  seguir.href = '/';
  hijos.push(seguir);
  raiz.replaceChildren(...hijos);
}

const cargar = async (extra = '') => {
  const r = await fetch(`/api/suscripciones/cancelar?s=${encodeURIComponent(s)}${extra}`, { cache: 'no-store' });
  return { r, d: await r.json() };
};
const espera = (ms) => new Promise((ok) => { setTimeout(ok, ms); });

(async () => {
  const paymentId = q.get('pago') === '1' && /^\d+$/.test(q.get('payment_id') ?? '') ? q.get('payment_id') : '';
  const conPago = paymentId ? `&payment_id=${paymentId}` : '';
  try {
    let { r, d } = await cargar(conPago);
    if (!r.ok) { raiz.replaceChildren(h('h1', 'No encontramos tu plan'), h('p', 'Escríbenos por WhatsApp y te ayudamos.', 'rs-lead')); return; }
    // Vuelta de Mercado Pago tras pagar la penalidad: se sondea (con el payment_id, el servidor procesa
    // el pago si el webhook no llegó) y nunca se vuelve a ofrecer pagar. Un pago rechazado sí deja reintentar.
    const estadoMp = q.get('status') ?? q.get('collection_status');
    if (q.get('pago') === '1' && d.modo !== 'cerrada' && !['rejected', 'cancelled', 'null'].includes(estadoMp)) {
      raiz.replaceChildren(h('h1', 'Estamos confirmando tu pago…'), h('p', 'Esto toma unos segundos. Te llega un correo cuando quede listo.', 'rs-lead'));
      for (let i = 0; i < 20 && d.modo !== 'cerrada'; i++) {
        await espera(3000);
        try {
          ({ d } = await cargar(conPago));
        } catch { /* se reintenta en el siguiente sondeo */ }
      }
      if (d.modo !== 'cerrada') {
        raiz.replaceChildren(h('h1', 'Gracias'), h('p', 'Recibimos tu pago. Te llega un correo cuando tu plan quede cancelado.', 'rs-lead'));
        return;
      }
    }
    pintar(d);
  } catch {
    raiz.replaceChildren(h('h1', 'No pudimos cargar tu plan'), h('p', 'Revisa tu conexión y recarga la página.', 'rs-lead'));
  }
})();
