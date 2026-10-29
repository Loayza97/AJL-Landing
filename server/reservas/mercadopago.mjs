// Mercado Pago Checkout Pro: preferencia (la página de pago de MP), consulta
// del pago y verificación de la firma del webhook. El monto nunca viene del
// navegador: lo calcula catalogo.mjs.

const API = 'https://api.mercadopago.com';

export function isoLima(fecha) {
  return new Date(fecha.getTime() - 5 * 3600 * 1000).toISOString().replace('Z', '-05:00');
}

export function crearMp(env, fetchImpl = fetch) {
  const auth = { Authorization: `Bearer ${env.MP_ACCESS_TOKEN}` };

  async function crearPreferencia({ reservaId, titulo, montoCentimos, venceEn, ahora, urlRetorno, urlNotificacion }) {
    const cuerpo = {
      items: [{ id: reservaId, title: titulo, quantity: 1, unit_price: montoCentimos / 100, currency_id: 'PEN' }],
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
    const r = await fetchImpl(`${API}/checkout/preferences`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json', 'X-Idempotency-Key': `${reservaId}-${venceEn.getTime()}` },
      body: JSON.stringify(cuerpo),
    });
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
        reason: `AJL Nutrición · ${titulo}`, back_url: urlRetorno,
        auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: cuotaCentimos / 100, currency_id: 'PEN', ...(cobros ? { repetitions: cobros } : {}) },
      }),
    });
    return { planId: d.id, init_point: d.init_point };
  }
  const buscarSuscripcionDePlan = async (planId) => (await pedirSus(`/preapproval/search?preapproval_plan_id=${encodeURIComponent(planId)}`)).results?.[0] ?? null;
  const desactivarPlan = (planId) => pedirSus(`/preapproval_plan/${encodeURIComponent(planId)}`, { method: 'PUT', body: JSON.stringify({ status: 'cancelled' }) });
  const obtenerSuscripcion = (id) => pedirSus(`/preapproval/${encodeURIComponent(id)}`);
  const cancelarSuscripcion = (id) => pedirSus(`/preapproval/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ status: 'cancelled' }) });
  const obtenerCobroSuscripcion = (id) => pedirSus(`/authorized_payments/${encodeURIComponent(id)}`);
  const buscarCobrosSuscripcion = async (id) => (await pedirSus(`/authorized_payments/search?preapproval_id=${encodeURIComponent(id)}`)).results ?? [];

  return { crearPreferencia, obtenerPago, crearSuscripcion, buscarSuscripcionDePlan, desactivarPlan, obtenerSuscripcion, cancelarSuscripcion, obtenerCobroSuscripcion, buscarCobrosSuscripcion };
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
