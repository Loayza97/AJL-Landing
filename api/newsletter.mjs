// ─── Endpoint de suscripción al newsletter · AJL Nutrición ──────────────────
// POST /api/newsletter  { email, consent:true, website:"" (honeypot), source }
// Doble opt-in: guarda como 'pending' y manda un correo de confirmación.
// El cupón NO se entrega aquí: se genera al confirmar (ver newsletter-confirm.mjs).

import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } }
);

const RESEND_URL = 'https://api.resend.com/emails';
const FROM = process.env.NEWSLETTER_FROM || 'AJL Nutrición <hola@ajlnutricion.com>';
const SITE = (process.env.PUBLIC_SITE_URL || 'https://www.ajlnutricion.com').replace(/\/$/, '');

// Versión exacta del aviso de consentimiento (debe coincidir con el popup).
const CONSENT_TEXT =
  'Acepto recibir correos de AJL Nutrición (novedades, consejos y promociones) y he leído la Política de Privacidad. (v2026-07-20.2)';

function bad(res, status, message) {
  return res.status(status).json({ ok: false, error: message });
}
function esEmailValido(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s || '');
}
function token() {
  return randomBytes(24).toString('base64url');
}

async function enviarEmail({ to, subject, html }) {
  const r = await fetch(RESEND_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });
  if (!r.ok) console.error('Resend error', r.status, await r.text());
  return r.ok;
}

function htmlConfirmacion(confirmUrl) {
  return `
    <div style="font-family:system-ui,Arial,sans-serif;max-width:520px;margin:auto;color:#20302A">
      <h2 style="font-family:Georgia,serif;color:#173C2C">Confirma tu correo y recibe tu 10%</h2>
      <p>¡Gracias por suscribirte a AJL Nutrición! Solo falta un paso: confirma que este correo es tuyo y te enviamos tu cupón de <strong>10% de descuento</strong>.</p>
      <p style="margin:28px 0">
        <a href="${confirmUrl}" style="background:#D68A5C;color:#fff;text-decoration:none;font-weight:700;padding:13px 26px;border-radius:999px;display:inline-block">Confirmar y obtener mi 10%</a>
      </p>
      <p style="font-size:13px;color:#5E6B63">Si no fuiste tú, ignora este correo y no pasará nada.</p>
      <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
      <p style="font-size:12px;color:#5E6B63">AJL Nutrición · Jr. Almirante Manuel Villavicencio 1461, Lince, Lima</p>
    </div>`;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return bad(res, 405, 'Método no permitido');

  const data = req.body || {};

  // Honeypot: si un bot rellena el campo oculto, respondemos "ok" y no hacemos nada.
  if (data.website && String(data.website).trim() !== '') {
    return res.status(200).json({ ok: true, mensaje: 'Listo' });
  }

  const email = String(data.email || '').trim().toLowerCase();
  if (!esEmailValido(email)) return bad(res, 400, 'Ingresa un correo válido');
  if (data.consent !== true) return bad(res, 400, 'Debes aceptar la Política de Privacidad');

  // ¿Ya existe?
  const { data: existing, error: selErr } = await supabase
    .from('newsletter_subscribers')
    .select('id, status, confirm_token')
    .eq('email', email)
    .maybeSingle();
  if (selErr) {
    console.error('select error', selErr);
    return bad(res, 500, 'Error interno');
  }

  if (existing && existing.status === 'confirmed') {
    return res.status(200).json({ ok: true, already: true, mensaje: 'Ya estás suscrito.' });
  }

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || null;
  const ua = req.headers['user-agent'] || null;
  const confirm_token = existing?.confirm_token || token();

  if (existing) {
    // Reenvía confirmación (sigue pending): refresca consentimiento.
    const { error } = await supabase
      .from('newsletter_subscribers')
      .update({ consent_text: CONSENT_TEXT, consent_at: new Date().toISOString(), ip_origen: ip, user_agent: ua })
      .eq('id', existing.id);
    if (error) { console.error(error); return bad(res, 500, 'Error interno'); }
  } else {
    const { error } = await supabase.from('newsletter_subscribers').insert({
      email,
      status: 'pending',
      consent_text: CONSENT_TEXT,
      consent_at: new Date().toISOString(),
      confirm_token,
      unsubscribe_token: token(),
      source: (data.source || null),
      ip_origen: ip,
      user_agent: ua,
    });
    if (error) { console.error(error); return bad(res, 500, 'Error guardando la suscripción'); }
  }

  await enviarEmail({
    to: email,
    subject: 'Confirma tu correo y recibe tu 10% · AJL Nutrición',
    html: htmlConfirmacion(`${SITE}/api/newsletter-confirm?token=${confirm_token}`),
  });

  return res.status(200).json({
    ok: true,
    mensaje: 'Te enviamos un correo para confirmar. Revisa tu bandeja (y spam).',
  });
}
