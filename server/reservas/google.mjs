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

const isoUtc = (dt) => (dt ? new Date(dt).toISOString().replace('.000Z', 'Z') : null);

// Lo que la sincronización necesita de cada evento modificado. Un evento borrado
// puede venir solo con id y status: el resto queda en null/false.
export function cambioDeEvento(ev) {
  return {
    id: ev.id,
    borrado: ev.status === 'cancelled',
    reservaId: ev.extendedProperties?.private?.ajl_reserva_id ?? null,
    inicio: isoUtc(ev.start?.dateTime),
    fin: isoUtc(ev.end?.dateTime),
    meet: Boolean(ev.hangoutLink || ev.conferenceData?.entryPoints?.length),
    ubicacion: Boolean(String(ev.location ?? '').trim()),
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

  // Eventos modificados desde `desdeIso`, incluidos los borrados (con updatedMin
  // Google siempre los devuelve). Sin caché: lo usa la sincronización.
  async function listarCambios(desdeIso, { timeoutMs } = {}) {
    const cambios = [];
    let pageToken;
    do {
      const q = new URLSearchParams({ updatedMin: desdeIso, singleEvents: 'true', showDeleted: 'true', maxResults: '2500' });
      if (pageToken) q.set('pageToken', pageToken);
      const r = await fetchImpl(`${API}/calendars/${calendario}/events?${q}`, {
        headers: { Authorization: `Bearer ${await token()}` },
        ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
      });
      if (!r.ok) throw new Error(`Google events.list ${r.status}: ${await r.text()}`);
      const d = await r.json();
      cambios.push(...(d.items || []).map(cambioDeEvento));
      pageToken = d.nextPageToken;
    } while (pageToken);
    return cambios;
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

  // Editar desde el panel: mismo evento (un solo aviso al paciente). Solo si cambia
  // la modalidad se tocan ubicación y Meet; si no, el Meet existente se conserva.
  async function actualizarEvento(eventId, e) {
    const cuerpo = {
      summary: e.titulo,
      description: e.descripcion,
      start: { dateTime: e.inicioUtc, timeZone: 'America/Lima' },
      end: { dateTime: e.finUtc, timeZone: 'America/Lima' },
    };
    if (e.cambiaModalidad) {
      if (e.modalidad === 'presencial') {
        cuerpo.location = e.direccion;
        cuerpo.conferenceData = null;
      } else {
        cuerpo.location = null;
        cuerpo.conferenceData = { createRequest: { requestId: `${eventId}-${Date.now()}`, conferenceSolutionKey: { type: 'hangoutsMeet' } } };
      }
    }
    const r = await fetchImpl(`${API}/calendars/${calendario}/events/${encodeURIComponent(eventId)}?conferenceDataVersion=1&sendUpdates=all`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    });
    if (!r.ok) {
      const err = new Error(`Google events.patch ${r.status}: ${await r.text()}`);
      if (r.status === 404 || r.status === 410) err.noExiste = true;
      throw err;
    }
    const d = await r.json();
    eventosCacheados.clear();
    // Un evento borrado a mano sigue existiendo en Google con status 'cancelled':
    // el PATCH responde 200 pero no se ve. Se trata como inexistente y se crea otro.
    if (d.status === 'cancelled') throw Object.assign(new Error(`Google: evento ${eventId} borrado`), { noExiste: true });
    return { id: d.id, meet: e.modalidad === 'presencial' ? null : d.hangoutLink || null };
  }

  // Cancelar desde el panel: Google avisa al paciente. Si ya no existe, no hay nada que borrar.
  async function eliminarEvento(eventId) {
    const r = await fetchImpl(`${API}/calendars/${calendario}/events/${encodeURIComponent(eventId)}?sendUpdates=all`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${await token()}` },
    });
    if (!r.ok && r.status !== 404 && r.status !== 410) throw new Error(`Google events.delete ${r.status}: ${await r.text()}`);
    eventosCacheados.clear();
  }

  return { listarEventos, listarCambios, crearEvento, actualizarEvento, eliminarEvento };
}
