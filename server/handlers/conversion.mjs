// ─── Registro de conversiones propias · AJL Nutrición ───────────────────────
// POST /api/conversion  { evento, seccion, paquete, utm_source, utm_medium,
//                          utm_campaign, utm_content, path }
//
// El clic a WhatsApp es la conversión real del negocio. Este endpoint la guarda
// en nuestra propia base para no depender de que el visitante acepte cookies,
// de bloqueadores, ni de lo que Meta o Google decidan reportar.
//
// PRIVACIDAD: no se persiste NADA identificable —ni IP, ni user-agent, ni
// identificador de sesión—, solo el evento y su origen de campaña. Es
// tratamiento anónimo a propósito. Ver la nota en db/conversiones.sql antes de
// añadir cualquier campo nuevo.

import { json, empty, readJson } from '../http.mjs';

// Allowlist estricta: cualquier campo que no esté aquí se descarta en silencio.
// Un endpoint público sin esto acaba siendo un vertedero de lo que a cualquiera
// se le ocurra mandar.
const EVENTOS_VALIDOS = new Set(['whatsapp_click']);
const MAX_LARGO = 120;

function limpiar(valor) {
  if (valor === null || valor === undefined) return null;
  const s = String(valor).trim();
  if (!s) return null;
  return s.slice(0, MAX_LARGO);
}

export async function handleConversion(request, env, { db }) {
  if (request.method === 'OPTIONS') return empty(204);
  if (request.method !== 'POST') return json(405, { ok: false, error: 'Método no permitido' });

  const data = await readJson(request);

  const evento = limpiar(data.evento);
  if (!EVENTOS_VALIDOS.has(evento)) {
    return json(400, { ok: false, error: 'Evento no reconocido' });
  }

  // El path se recorta a la ruta: si alguna vez llega con query string, no
  // queremos guardar parámetros arbitrarios de la URL.
  const path = limpiar(data.path);

  const fila = {
    evento,
    seccion: limpiar(data.seccion),
    paquete: limpiar(data.paquete),
    utm_source: limpiar(data.utm_source),
    utm_medium: limpiar(data.utm_medium),
    utm_campaign: limpiar(data.utm_campaign),
    utm_content: limpiar(data.utm_content),
    path: path ? path.split('?')[0] : null,
  };

  const { error } = await db.from('conversiones').insert(fila);

  if (error) {
    // Que falle el registro no debe romper nada para el visitante: ya se fue a
    // WhatsApp. Se loguea para verlo en los logs de Cloudflare Pages.
    console.error('conversion insert', error);
    return json(500, { ok: false });
  }

  // 204: sendBeacon ignora el cuerpo de la respuesta.
  return empty(204);
}
