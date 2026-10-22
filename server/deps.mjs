// ─── Dependencias externas de las funciones, creadas desde env ──────────────
// En Workers no hay process.env: las variables llegan en context.env de cada
// request, así que el cliente se crea por request y no a nivel de módulo.

import { createClient } from '@supabase/supabase-js';
import { crearSendEmail } from './correo.mjs';

export function makeDeps(env) {
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });
  return { db, sendEmail: crearSendEmail(env) };
}
