// ─── Endpoint del Libro de Reclamaciones · AJL Nutrición ────────────────────
// POST /api/reclamaciones
// Recibe el form, asigna correlativo, persiste en Supabase, manda 2 emails.

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } }
);

const RESEND_URL = 'https://api.resend.com/emails';
const FROM = process.env.FROM_EMAIL || 'reclamos@ajlnutricion.com';
const NOTIFY = process.env.NOTIFICATION_EMAIL || 'asesor@ajlnutricion.com';

// ── Helpers ─────────────────────────────────────────────────────────────────
function bad(res, status, message) {
  return res.status(status).json({ ok: false, error: message });
}

function esEmailValido(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s || '');
}

function esDniValido(s) {
  return /^[0-9A-Za-z]{8,12}$/.test(s || '');
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
  if (!r.ok) {
    const detail = await r.text();
    console.error('Resend error', r.status, detail);
  }
  return r.ok;
}

function htmlClienteRecibido({ correlativo, nombre, tipo }) {
  return `
    <div style="font-family:system-ui,Arial,sans-serif;max-width:560px;margin:auto;color:#1D1D1F">
      <h2>Recibimos tu ${tipo === 'reclamo' ? 'reclamo' : 'queja'}</h2>
      <p>Hola ${nombre},</p>
      <p>Confirmamos la recepción de tu ${tipo} en AJL Nutrición. Tu número de seguimiento es:</p>
      <p style="font-size:22px;font-weight:700;color:#C8973A;letter-spacing:0.04em">${correlativo}</p>
      <p>Te responderemos dentro de los próximos <strong>30 días calendario</strong>, conforme a lo establecido en el Código de Protección y Defensa del Consumidor (Ley N° 29571).</p>
      <p>Si necesitas hacer seguimiento, menciona este número de correlativo.</p>
      <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
      <p style="font-size:13px;color:#6E6E73">AJL Nutrición · Av. Almirante Manuel Villavicencio 1461, Lince, Lima</p>
    </div>
  `;
}

function htmlAsesorNotificacion(data) {
  const f = (k, v) => v ? `<tr><td style="padding:4px 8px;color:#6E6E73">${k}</td><td style="padding:4px 8px;color:#1D1D1F">${v}</td></tr>` : '';
  return `
    <div style="font-family:system-ui,Arial,sans-serif;max-width:680px;margin:auto;color:#1D1D1F">
      <h2 style="color:#C8973A">Nuevo ${data.reclamo_tipo}: ${data.correlativo}</h2>
      <p>Recibido el ${new Date(data.fecha_creacion).toLocaleString('es-PE')}</p>
      <table style="border-collapse:collapse;width:100%;margin-top:16px">
        ${f('Nombre', data.consumidor_nombre)}
        ${f('DNI/CE', data.consumidor_dni)}
        ${f('Email', data.consumidor_email)}
        ${f('Teléfono', data.consumidor_telefono)}
        ${f('Domicilio', data.consumidor_domicilio)}
        ${f('Edad', data.consumidor_edad)}
        ${f('Apoderado', data.apoderado_nombre)}
        ${f('Tipo de bien', data.bien_tipo)}
        ${f('Monto', data.bien_monto ? `S/${data.bien_monto}` : '')}
        ${f('Descripción del bien/servicio', data.bien_descripcion)}
        ${f('Tipo', data.reclamo_tipo)}
        ${f('Detalle', data.reclamo_detalle)}
        ${f('Pedido del cliente', data.reclamo_pedido)}
      </table>
      <p style="margin-top:24px"><strong>Plazo legal de respuesta: 30 días calendario</strong> (vence el ${
        new Date(new Date(data.fecha_creacion).getTime() + 30 * 24 * 3600 * 1000).toLocaleDateString('es-PE')
      }).</p>
      <p>Gestiona desde el dashboard de Supabase.</p>
    </div>
  `;
}

// ── Handler ────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // CORS no es necesario (todo en el mismo dominio Vercel) pero por las dudas
  // si alguien hace POST desde otro origen, lo rechazamos.
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return bad(res, 405, 'Método no permitido');

  const data = req.body || {};

  // 1. Validación de campos requeridos
  const req_fields = ['nombre', 'dni', 'email', 'tipo', 'detalle', 'pedido'];
  for (const k of req_fields) {
    if (!data[k] || String(data[k]).trim().length === 0) {
      return bad(res, 400, `Campo requerido faltante: ${k}`);
    }
  }
  if (!esEmailValido(data.email)) return bad(res, 400, 'Email inválido');
  if (!esDniValido(data.dni)) return bad(res, 400, 'DNI o CE inválido');
  if (!['reclamo', 'queja'].includes(data.tipo)) {
    return bad(res, 400, 'Tipo inválido (debe ser "reclamo" o "queja")');
  }

  // Edad y apoderado: si menor de 18, apoderado es obligatorio
  const edad = data.edad ? parseInt(data.edad, 10) : null;
  if (edad !== null && (isNaN(edad) || edad < 0 || edad > 120)) {
    return bad(res, 400, 'Edad inválida');
  }
  if (edad !== null && edad < 18 && !data.apoderado_nombre) {
    return bad(res, 400, 'Apoderado requerido si el consumidor es menor de edad');
  }

  // 2. Asignar correlativo (usa la función SQL definida en schema.sql)
  const { data: corrData, error: corrErr } = await supabase.rpc('generar_correlativo');
  if (corrErr) {
    console.error('Error generando correlativo:', corrErr);
    return bad(res, 500, 'Error interno al generar correlativo');
  }
  const correlativo = corrData;

  // 3. Insertar en Supabase
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || null;
  const ua = req.headers['user-agent'] || null;

  const row = {
    correlativo,
    consumidor_nombre: data.nombre.trim(),
    consumidor_dni: data.dni.trim(),
    consumidor_domicilio: data.domicilio?.trim() || null,
    consumidor_telefono: data.telefono?.trim() || null,
    consumidor_email: data.email.trim().toLowerCase(),
    consumidor_edad: edad,
    apoderado_nombre: data.apoderado_nombre?.trim() || null,
    bien_tipo: ['producto', 'servicio'].includes(data.bien_tipo) ? data.bien_tipo : null,
    bien_monto: data.bien_monto ? parseFloat(data.bien_monto) : null,
    bien_descripcion: data.bien_descripcion?.trim() || null,
    reclamo_tipo: data.tipo,
    reclamo_detalle: data.detalle.trim(),
    reclamo_pedido: data.pedido.trim(),
    ip_origen: ip,
    user_agent: ua,
  };

  const { data: inserted, error: insErr } = await supabase
    .from('reclamos')
    .insert(row)
    .select('correlativo, fecha_creacion')
    .single();

  if (insErr) {
    console.error('Error insertando:', insErr);
    return bad(res, 500, 'Error guardando el reclamo');
  }

  // 4. Emails: cliente + asesor (en paralelo)
  await Promise.all([
    enviarEmail({
      to: row.consumidor_email,
      subject: `Tu ${row.reclamo_tipo} fue recibido — ${correlativo}`,
      html: htmlClienteRecibido({
        correlativo,
        nombre: row.consumidor_nombre,
        tipo: row.reclamo_tipo,
      }),
    }),
    enviarEmail({
      to: NOTIFY,
      subject: `Nuevo ${row.reclamo_tipo} ${correlativo} — ${row.consumidor_nombre}`,
      html: htmlAsesorNotificacion({ ...row, fecha_creacion: inserted.fecha_creacion }),
    }),
  ]);

  // 5. Respuesta al cliente
  return res.status(200).json({
    ok: true,
    correlativo,
    mensaje: 'Reclamo recibido. Te enviamos confirmación por email.',
  });
}
