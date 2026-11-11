// Mercado Pago Checkout Pro: preferencia (la página de pago de MP), consulta
// del pago y verificación de la firma del webhook. El monto nunca viene del
// navegador: lo calcula catalogo.mjs.

const API = 'https://api.mercadopago.com';

export function isoLima(fecha) {
  return new Date(fecha.getTime() - 5 * 3600 * 1000).toISOString().replace('Z', '-05:00');
}

// Todo plan que crea la web empieza así: la cuenta también tiene planes hechos a mano, que no son de la web.
export const PREFIJO_PLAN = 'AJL Nutrición · ';

// Datos del pagador para el antifraude de Mercado Pago (recomendación de su soporte, 10-nov-2026). Solo lo
// que tiene el formato que acepta en Perú: DNI de 8 dígitos, CE solo con números (pasaporte no: lleva letras),
// teléfono peruano partido en código y número. El correo ya no obliga a entrar con la cuenta: se probó el
// 10-nov-2026 con un correo con cuenta y Mercado Pago dejó pagar con tarjeta sin iniciar sesión.
export function pagadorMp({ nombres, apellidos, email, tipoDocumento, documento, whatsapp } = {}) {
  const p = {};
  if (nombres) p.name = nombres;
  if (apellidos) p.surname = apellidos;
  if (email) p.email = email;
  const tel = String(whatsapp ?? '').replace(/[^\d+]/g, '').match(/^(?:\+?51)?(9\d{8})$/);
  if (tel) p.phone = { area_code: '51', number: tel[1] };
  const doc = String(documento ?? '');
  if (tipoDocumento === 'dni' && /^\d{8}$/.test(doc)) p.identification = { type: 'DNI', number: doc };
  else if (tipoDocumento === 'ce' && /^\d{8,12}$/.test(doc)) p.identification = { type: 'C.E', number: doc };
  return Object.keys(p).length ? p : null;
}

export function crearMp(env, fetchImpl = fetch) {
  const auth = { Authorization: `Bearer ${env.MP_ACCESS_TOKEN}` };

  async function crearPreferencia({ reservaId, titulo, montoCentimos, venceEn, ahora, urlRetorno, urlNotificacion, pagador = null, dispositivo = null }) {
    const cuerpo = {
      items: [{ id: reservaId, title: titulo, description: `AJL Nutrición · ${titulo}`, quantity: 1, unit_price: montoCentimos / 100, currency_id: 'PEN' }],
      external_reference: reservaId,
      back_urls: { success: urlRetorno, pending: urlRetorno, failure: urlRetorno },
      auto_return: 'approved',
      payment_methods: { excluded_payment_types: [{ id: 'ticket' }, { id: 'atm' }], installments: 12 },
      expires: true,
      expiration_date_from: isoLima(ahora),
      expiration_date_to: isoLima(venceEn),
      statement_descriptor: 'AJLNUTRICION',
      notification_url: urlNotificacion,
    };
    const pedir = (body, key) => fetchImpl(`${API}/checkout/preferences`, {
      method: 'POST',
      // Device ID (recomendación de soporte, 10-nov-2026): el script security.js de /reservar lo genera.
      headers: { ...auth, 'Content-Type': 'application/json', 'X-Idempotency-Key': key, ...(dispositivo ? { 'X-meli-session-id': dispositivo } : {}) },
      body: JSON.stringify(body),
    });
    const key = `${reservaId}-${venceEn.getTime()}`;
    let r = await pedir(pagador ? { ...cuerpo, payer: pagador } : cuerpo, pagador ? `${key}-p` : key);
    // Si Mercado Pago rechaza los datos del pagador, se paga sin ellos, como antes: nunca peor que sin datos.
    if (!r.ok && pagador && r.status >= 400 && r.status < 500) {
      console.error('preferencia con pagador', r.status, await r.text());
      r = await pedir(cuerpo, key);
    }
    if (!r.ok) throw new Error(`Mercado Pago ${r.status}: ${await r.text()}`);
    const d = await r.json();
    return { id: d.id, init_point: d.init_point };
  }

  async function obtenerPago(id) {
    const r = await fetchImpl(`${API}/v1/payments/${encodeURIComponent(id)}`, { headers: auth });
    if (!r.ok) throw new Error(`Mercado Pago pago ${r.status}: ${await r.text()}`);
    return r.json();
  }

  // Suscripciones con un plan propio por suscripción: el paciente autoriza en el init_point del plan
  // y Mercado Pago crea el preapproval, que trae preapproval_plan_id. Sin payer_email: con él,
  // Mercado Pago exige que coincida con la cuenta que paga (verificado el 2026-10-28).
  async function pedirSus(ruta, init = {}) {
    const r = await fetchImpl(`${API}${ruta}`, { ...init, headers: { ...auth, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers } });
    if (!r.ok) throw new Error(`Mercado Pago suscripción ${r.status}: ${await r.text()}`);
    return r.json();
  }

  // numeroPlan: cuántos planes tuvo ya la suscripción. Un reintento de red repite la key (mismo plan);
  // un reintento de pago, ya con el plan anterior guardado, crea otro distinto.
  async function crearSuscripcion({ suscripcionId, titulo, cuotaCentimos, cobros, urlRetorno, numeroPlan = 0 }) {
    const d = await pedirSus('/preapproval_plan', {
      method: 'POST', headers: { 'X-Idempotency-Key': `plan-${suscripcionId}-${numeroPlan}` },
      body: JSON.stringify({
        reason: `${PREFIJO_PLAN}${titulo}`, back_url: urlRetorno,
        auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: cuotaCentimos / 100, currency_id: 'PEN', ...(cobros ? { repetitions: cobros } : {}) },
      }),
    });
    return { planId: d.id, init_point: d.init_point };
  }
  // Un plan puede tener varios preapprovals: Mercado Pago crea uno por cada tarjeta que el paciente intenta.
  const buscarSuscripcionesDePlan = async (planId) => (await pedirSus(`/preapproval/search?preapproval_plan_id=${encodeURIComponent(planId)}`)).results ?? [];
  const buscarSuscripcionDePlan = async (planId) => (await buscarSuscripcionesDePlan(planId))[0] ?? null;
  const desactivarPlan = (planId) => pedirSus(`/preapproval_plan/${encodeURIComponent(planId)}`, { method: 'PUT', body: JSON.stringify({ status: 'cancelled' }) });
  const obtenerSuscripcion = (id) => pedirSus(`/preapproval/${encodeURIComponent(id)}`);
  const cancelarSuscripcion = (id) => pedirSus(`/preapproval/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ status: 'cancelled' }) });
  const obtenerCobroSuscripcion = (id) => pedirSus(`/authorized_payments/${encodeURIComponent(id)}`);
  const buscarCobrosSuscripcion = async (id) => (await pedirSus(`/authorized_payments/search?preapproval_id=${encodeURIComponent(id)}`)).results ?? [];

  return { crearPreferencia, obtenerPago, crearSuscripcion, buscarSuscripcionDePlan, buscarSuscripcionesDePlan, desactivarPlan, obtenerSuscripcion, cancelarSuscripcion, obtenerCobroSuscripcion, buscarCobrosSuscripcion };
}

function iguales(a, b) {
  if (a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}

// x-signature: "ts=...,v1=<hmac-sha256 hex>"; manifiesto "id:<data.id>;request-id:<x-request-id>;ts:<ts>;"
export async function firmaValida({ xSignature, xRequestId, dataId, secreto }) {
  if (!xSignature || !secreto) return false;
  const partes = Object.fromEntries(xSignature.split(',').map((p) => p.trim().split('=')));
  if (!partes.ts || !partes.v1) return false;
  const id = /^[a-z0-9]+$/i.test(dataId || '') ? String(dataId).toLowerCase() : dataId;
  let manifiesto = '';
  if (id) manifiesto += `id:${id};`;
  if (xRequestId) manifiesto += `request-id:${xRequestId};`;
  manifiesto += `ts:${partes.ts};`;
  const clave = await crypto.subtle.importKey('raw', new TextEncoder().encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const firma = await crypto.subtle.sign('HMAC', clave, new TextEncoder().encode(manifiesto));
  const hex = [...new Uint8Array(firma)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return iguales(hex, partes.v1);
}
