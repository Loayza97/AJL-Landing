// ─── Newsletter · AJL Nutrición ─────────────────────────────────────────────
// POST /api/newsletter                     alta con doble opt-in (queda 'pending')
// GET  /api/newsletter-confirm?token=XXX   confirma, emite cupón de 10% y redirige
// GET  /api/newsletter-unsubscribe?token=XXX  baja
// El cupón NO se entrega en el alta: se genera al confirmar.

import { json, empty, redirect, readJson, siteUrl, clientIp } from '../http.mjs';
import { randomToken, couponCode } from '../tokens.mjs';

const fromDe = (env) => env.NEWSLETTER_FROM || 'AJL Nutrición <hola@ajlnutricion.com>';

// Versión exacta del aviso de consentimiento (debe coincidir con el popup).
const CONSENT_TEXT =
  'Acepto recibir correos de AJL Nutrición (novedades, consejos y promociones) y he leído la Política de Privacidad. (v2026-07-20.2)';

function bad(status, message) {
  return json(status, { ok: false, error: message });
}
function esEmailValido(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s || '');
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
      <p style="font-size:12px;color:#5E6B63">AJL Nutrición · Jr. Almirante Manuel Villavicencio 1461, Lince, Lima.<br>
      Si no quieres recibir más correos, <a href="${unsubUrl}" style="color:#5E6B63">date de baja aquí</a>.</p>
    </div>`;
}

export async function handleSubscribe(request, env, { db, sendEmail }) {
  if (request.method === 'OPTIONS') return empty(204);
  if (request.method !== 'POST') return bad(405, 'Método no permitido');

  const data = await readJson(request);

  // Honeypot: si un bot rellena el campo oculto, respondemos "ok" y no hacemos nada.
  if (data.website && String(data.website).trim() !== '') {
    return json(200, { ok: true, mensaje: 'Listo' });
  }

  const email = String(data.email || '').trim().toLowerCase();
  if (!esEmailValido(email)) return bad(400, 'Ingresa un correo válido');
  if (data.consent !== true) return bad(400, 'Debes aceptar la Política de Privacidad');

  // ¿Ya existe?
  const { data: existing, error: selErr } = await db
    .from('newsletter_subscribers')
    .select('id, status, confirm_token')
    .eq('email', email)
    .maybeSingle();
  if (selErr) {
    console.error('select error', selErr);
    return bad(500, 'Error interno');
  }

  if (existing && existing.status === 'confirmed') {
    return json(200, { ok: true, already: true, mensaje: 'Ya estás suscrito.' });
  }

  const ip = clientIp(request);
  const ua = request.headers.get('user-agent') || null;
  const confirm_token = existing?.confirm_token || randomToken();

  if (existing) {
    // Reenvía confirmación (sigue pending): refresca consentimiento.
    const { error } = await db
      .from('newsletter_subscribers')
      .update({ consent_text: CONSENT_TEXT, consent_at: new Date().toISOString(), ip_origen: ip, user_agent: ua })
      .eq('id', existing.id);
    if (error) { console.error(error); return bad(500, 'Error interno'); }
  } else {
    const { error } = await db.from('newsletter_subscribers').insert({
      email,
      status: 'pending',
      consent_text: CONSENT_TEXT,
      consent_at: new Date().toISOString(),
      confirm_token,
      unsubscribe_token: randomToken(),
      source: (data.source || null),
      ip_origen: ip,
      user_agent: ua,
    });
    if (error) { console.error(error); return bad(500, 'Error guardando la suscripción'); }
  }

  await sendEmail({
    from: fromDe(env),
    to: email,
    subject: 'Confirma tu correo y recibe tu 10% · AJL Nutrición',
    html: htmlConfirmacion(`${siteUrl(env)}/api/newsletter-confirm?token=${confirm_token}`),
  });

  return json(200, {
    ok: true,
    mensaje: 'Te enviamos un correo para confirmar. Revisa tu bandeja (y spam).',
  });
}

export async function handleConfirm(request, env, { db, sendEmail }) {
  const SITE = siteUrl(env);
  const token = new URL(request.url).searchParams.get('token') || '';
  if (!token) return redirect(SITE, '/newsletter/gracias/?estado=invalido');

  const { data: sub, error } = await db
    .from('newsletter_subscribers')
    .select('id, email, status, unsubscribe_token')
    .eq('confirm_token', token)
    .maybeSingle();

  if (error) { console.error(error); return redirect(SITE, '/newsletter/gracias/?estado=error'); }
  if (!sub) return redirect(SITE, '/newsletter/gracias/?estado=invalido');

  // Confirmar (idempotente).
  if (sub.status !== 'confirmed') {
    await db
      .from('newsletter_subscribers')
      .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
      .eq('id', sub.id);
  }

  // ¿Ya tiene un cupón activo? Reutilizarlo (no emitir de más).
  let code;
  const { data: existingCode } = await db
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
      const candidato = couponCode();
      const { error: insErr } = await db
        .from('discount_codes')
        .insert({ code: candidato, email: sub.email, percent: 10 });
      if (!insErr) code = candidato;
      else if (insErr.code !== '23505') { // 23505 = unique_violation → reintenta
        console.error('insert code error', insErr);
        break;
      }
    }
  }

  if (!code) return redirect(SITE, '/newsletter/gracias/?estado=error');

  const unsubUrl = `${SITE}/api/newsletter-unsubscribe?token=${sub.unsubscribe_token}`;
  await sendEmail({
    from: fromDe(env),
    to: sub.email,
    subject: `Tu cupón de 10%: ${code} · AJL Nutrición`,
    html: htmlBienvenida({ code, unsubUrl }),
  });

  return redirect(SITE, `/newsletter/gracias/?code=${encodeURIComponent(code)}`);
}

export async function handleUnsubscribe(request, env, { db }) {
  const SITE = siteUrl(env);
  const token = new URL(request.url).searchParams.get('token') || '';
  if (!token) return redirect(SITE, '/newsletter/baja/?estado=invalido');

  const { data: sub, error } = await db
    .from('newsletter_subscribers')
    .select('id')
    .eq('unsubscribe_token', token)
    .maybeSingle();

  if (error) { console.error(error); return redirect(SITE, '/newsletter/baja/?estado=error'); }
  if (!sub) return redirect(SITE, '/newsletter/baja/?estado=invalido');

  await db
    .from('newsletter_subscribers')
    .update({ status: 'unsubscribed', unsubscribed_at: new Date().toISOString() })
    .eq('id', sub.id);

  return redirect(SITE, '/newsletter/baja/?estado=ok');
}
