// ─── Dependencias externas de las funciones, creadas desde env ──────────────
// En Workers no hay process.env: las variables llegan en context.env de cada
// request, así que el cliente se crea por request y no a nivel de módulo.

import { createClient } from '@supabase/supabase-js';

const RESEND_URL = 'https://api.resend.com/emails';

export function makeDeps(env) {
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  async function sendEmail({ from, to, subject, html }) {
    const r = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!r.ok) console.error('Resend error', r.status, await r.text());
    return r.ok;
  }

  return { db, sendEmail };
}
