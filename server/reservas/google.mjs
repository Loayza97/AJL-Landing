// Google Calendar del equipo (Gmail normal, sin Workspace): OAuth con el
// refresh token de la cuenta dueña del calendario. Se lee para saber qué está
// ocupado y se escribe al confirmar un pago.
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://www.googleapis.com/calendar/v3';
const CACHE_EVENTOS_MS = 60 * 1000;

// Caché a nivel de módulo: sobrevive entre requests del mismo isolate.
let tokenCacheado = null;
const eventosCacheados = new Map();
export function _limpiarCachesGoogle() { tokenCacheado = null; eventosCacheados.clear(); }

export function normalizarEvento(ev) {
  const todoElDia = Boolean(ev.start?.date);
  return {
    titulo: ev.summary || '',
    todoElDia,
    desde: todoElDia ? ev.start.date : ev.start?.dateTime,
    hasta: todoElDia ? ev.end.date : ev.end?.dateTime,
    propio: Boolean(ev.extendedProperties?.private?.ajl_reserva_id),
    bloquea: ev.transparency !== 'transparent',
  };
}

export function crearGoogle(env, fetchImpl = fetch, reloj = Date.now) {
  const calendario = encodeURIComponent(env.GOOGLE_CALENDAR_ID || '');

  async function token() {
    if (tokenCacheado && tokenCacheado.vence > reloj() + 60000) return tokenCacheado.valor;
    const r = await fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET,
        refresh_token: env.GOOGLE_REFRESH_TOKEN, grant_type: 'refresh_token',
      }),
    });
    if (!r.ok) throw new Error(`Google token ${r.status}: ${await r.text()}`);
    const d = await r.json();
    tokenCacheado = { valor: d.access_token, vence: reloj() + d.expires_in * 1000 };
    return tokenCacheado.valor;
  }

  async function listarEventos(desdeUtc, hastaUtc) {
    const clave = `${calendario}|${desdeUtc}|${hastaUtc}`;
    const enCache = eventosCacheados.get(clave);
    if (enCache && enCache.vence > reloj()) return enCache.eventos;
    const eventos = [];
    let pageToken;
    do {
      const q = new URLSearchParams({ timeMin: desdeUtc, timeMax: hastaUtc, singleEvents: 'true', maxResults: '2500' });
      if (pageToken) q.set('pageToken', pageToken);
      const r = await fetchImpl(`${API}/calendars/${calendario}/events?${q}`, {
        headers: { Authorization: `Bearer ${await token()}` },
      });
      if (!r.ok) throw new Error(`Google events.list ${r.status}: ${await r.text()}`);
      const d = await r.json();
      eventos.push(...(d.items || []).filter((ev) => ev.status !== 'cancelled').map(normalizarEvento));
      pageToken = d.nextPageToken;
    } while (pageToken);
    eventosCacheados.set(clave, { vence: reloj() + CACHE_EVENTOS_MS, eventos });
    return eventos;
  }

  async function crearEvento(e) {
    const cuerpo = {
      summary: e.titulo,
      description: e.descripcion,
      start: { dateTime: e.inicioUtc, timeZone: 'America/Lima' },
      end: { dateTime: e.finUtc, timeZone: 'America/Lima' },
      attendees: [{ email: e.invitado.email, displayName: e.invitado.nombre }],
      extendedProperties: { private: { ajl_reserva_id: e.reservaId } },
    };
    if (e.modalidad === 'presencial') cuerpo.location = e.direccion;
    else cuerpo.conferenceData = { createRequest: { requestId: e.reservaId, conferenceSolutionKey: { type: 'hangoutsMeet' } } };

    const r = await fetchImpl(`${API}/calendars/${calendario}/events?conferenceDataVersion=1&sendUpdates=all`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    });
    if (!r.ok) throw new Error(`Google events.insert ${r.status}: ${await r.text()}`);
    const d = await r.json();
    eventosCacheados.clear();
    return { id: d.id, meet: d.hangoutLink || null };
  }

  return { listarEventos, crearEvento };
}
