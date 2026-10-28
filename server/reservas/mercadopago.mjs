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

  // Suscripciones sin plan asociado y con pago pendiente: el paciente autoriza en
  // init_point. Mercado Pago pide payer_email (Task 1 verifica si debe coincidir).
  async function pedirSus(ruta, init = {}) {
    const r = await fetchImpl(`${API}${ruta}`, { ...init, headers: { ...auth, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers } });
    if (!r.ok) throw new Error(`Mercado Pago suscripción ${r.status}: ${await r.text()}`);
    return r.json();
  }

  async function crearSuscripcion({ suscripcionId, titulo, cuotaCentimos, email, urlRetorno, finEn }) {
    const d = await pedirSus('/preapproval', {
      method: 'POST', headers: { 'X-Idempotency-Key': `sus-${suscripcionId}` },
      body: JSON.stringify({
        reason: `AJL Nutrición · ${titulo}`, external_reference: suscripcionId, payer_email: email, back_url: urlRetorno, status: 'pending',
        auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: cuotaCentimos / 100, currency_id: 'PEN', ...(finEn ? { end_date: finEn } : {}) },
      }),
    });
    return { id: d.id, init_point: d.init_point };
  }
  const obtenerSuscripcion = (id) => pedirSus(`/preapproval/${encodeURIComponent(id)}`);
  const cancelarSuscripcion = (id) => pedirSus(`/preapproval/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ status: 'cancelled' }) });
  const obtenerCobroSuscripcion = (id) => pedirSus(`/authorized_payments/${encodeURIComponent(id)}`);
  const buscarCobrosSuscripcion = async (id) => (await pedirSus(`/authorized_payments/search?preapproval_id=${encodeURIComponent(id)}`)).results ?? [];

  return { crearPreferencia, obtenerPago, crearSuscripcion, obtenerSuscripcion, cancelarSuscripcion, obtenerCobroSuscripcion, buscarCobrosSuscripcion };
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
