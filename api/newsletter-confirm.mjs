// ─── Confirmación del newsletter + emisión del cupón · AJL Nutrición ────────
// GET /api/newsletter-confirm?token=XXX  (link del correo de confirmación)
// Confirma el suscriptor, emite un cupón único de 10% (un solo uso) y redirige
// a la página de gracias mostrando el código.

import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } }
);

const RESEND_URL = 'https://api.resend.com/emails';
const FROM = process.env.NEWSLETTER_FROM || 'AJL Nutrición <hola@ajlnutricion.com>';
const SITE = (process.env.PUBLIC_SITE_URL || 'https://ajlnutricion.com').replace(/\/$/, '');

// Alfabeto sin caracteres ambiguos (0/O, 1/I/L).
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function nuevoCodigo() {
  const bytes = randomBytes(6);
  let s = '';
  for (let i = 0; i < 6; i++) s += ALPHABET[bytes[i] % ALPHABET.length];
  return `AJL-${s}`;
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

function htmlBienvenida({ code, unsubUrl }) {
  return `
    <div style="font-family:system-ui,Arial,sans-serif;max-width:520px;margin:auto;color:#20302A">
      <h2 style="font-family:Georgia,serif;color:#173C2C">Tu 10% de descuento</h2>
      <p>¡Listo! Tu suscripción quedó confirmada. Este es tu cupón:</p>
      <p style="font-size:30px;font-weight:800;letter-spacing:.06em;color:#BE6E42;text-align:center;background:#F6E5D9;border-radius:14px;padding:18px 12px;margin:20px 0">${code}</p>
      <p><strong>Cómo usarlo:</strong> al momento de pagar tu plan, envíanos este código por WhatsApp junto con tu comprobante y aplicamos el 10%. Es de un solo uso y vence en 30 días.</p>
      <p style="margin:26px 0">
        <a href="https://wa.me/51919151237?text=Hola!%20Quiero%20usar%20mi%20cup%C3%B3n%20${encodeURIComponent(code)}%20de%2010%25" style="background:#25D366;color:#fff;text-decoration:none;font-weight:700;padding:13px 26px;border-radius:999px;display:inline-block">Usar mi cupón por WhatsApp</a>
      </p>
      <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
      <p style="font-size:12px;color:#5E6B63">AJL Nutrición · Av. Almirante Manuel Villavicencio 1461, Lince, Lima.<br>
      Si no quieres recibir más correos, <a href="${unsubUrl}" style="color:#5E6B63">date de baja aquí</a>.</p>
    </div>`;
}

function redir(res, path) {
  res.statusCode = 302;
  res.setHeader('Location', `${SITE}${path}`);
  return res.end();
}

export default async function handler(req, res) {
  const token = (req.query?.token || '').toString();
  if (!token) return redir(res, '/newsletter/gracias/?estado=invalido');

  const { data: sub, error } = await supabase
    .from('newsletter_subscribers')
    .select('id, email, status, unsubscribe_token')
    .eq('confirm_token', token)
    .maybeSingle();

  if (error) { console.error(error); return redir(res, '/newsletter/gracias/?estado=error'); }
  if (!sub)  return redir(res, '/newsletter/gracias/?estado=invalido');

  // Confirmar (idempotente).
  if (sub.status !== 'confirmed') {
    await supabase
      .from('newsletter_subscribers')
      .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
      .eq('id', sub.id);
  }

  // ¿Ya tiene un cupón activo? Reutilizarlo (no emitir de más).
  let code;
  const { data: existingCode } = await supabase
    .from('discount_codes')
    .select('code, status')
    .eq('email', sub.email)
    .in('status', ['issued'])
    .order('issued_at', { ascending: false })
    .maybeSingle();

  if (existingCode) {
    code = existingCode.code;
  } else {
    // Genera un código único (reintenta ante colisión del UNIQUE).
    for (let intento = 0; intento < 5 && !code; intento++) {
      const candidato = nuevoCodigo();
      const { error: insErr } = await supabase
        .from('discount_codes')
        .insert({ code: candidato, email: sub.email, percent: 10 });
      if (!insErr) code = candidato;
      else if (insErr.code !== '23505') { // 23505 = unique_violation → reintenta
        console.error('insert code error', insErr);
        break;
      }
    }
  }

  if (!code) return redir(res, '/newsletter/gracias/?estado=error');

  const unsubUrl = `${SITE}/api/newsletter-unsubscribe?token=${sub.unsubscribe_token}`;
  await enviarEmail({
    to: sub.email,
    subject: `Tu cupón de 10%: ${code} · AJL Nutrición`,
    html: htmlBienvenida({ code, unsubUrl }),
  });

  return redir(res, `/newsletter/gracias/?code=${encodeURIComponent(code)}`);
}
