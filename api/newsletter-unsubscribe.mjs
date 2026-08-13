// ─── Baja del newsletter · AJL Nutrición ────────────────────────────────────
// GET /api/newsletter-unsubscribe?token=XXX  (link del pie de cada correo)

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } }
);

const SITE = (process.env.PUBLIC_SITE_URL || 'https://www.ajlnutricion.com').replace(/\/$/, '');

function redir(res, path) {
  res.statusCode = 302;
  res.setHeader('Location', `${SITE}${path}`);
  return res.end();
}

export default async function handler(req, res) {
  const token = (req.query?.token || '').toString();
  if (!token) return redir(res, '/newsletter/baja/?estado=invalido');

  const { data: sub, error } = await supabase
    .from('newsletter_subscribers')
    .select('id')
    .eq('unsubscribe_token', token)
    .maybeSingle();

  if (error) { console.error(error); return redir(res, '/newsletter/baja/?estado=error'); }
  if (!sub)  return redir(res, '/newsletter/baja/?estado=invalido');

  await supabase
    .from('newsletter_subscribers')
    .update({ status: 'unsubscribed', unsubscribed_at: new Date().toISOString() })
    .eq('id', sub.id);

  return redir(res, '/newsletter/baja/?estado=ok');
}
