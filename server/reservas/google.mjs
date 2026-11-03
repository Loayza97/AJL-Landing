// Google Calendar del equipo (Gmail normal, sin Workspace): OAuth con el
// refresh token de la cuenta dueña del calendario. Se lee para saber qué está
// ocupado y se escribe al confirmar un pago.
import { correosEquipo } from './aviso-equipo.mjs';
import { nutricionistas } from '../../src/data/nutricionistas.js';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://www.googleapis.com/calendar/v3';
const MEET_API = 'https://meet.googleapis.com/v2';
const CORREO = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
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

  // Correos de las nutricionistas (secreto CORREOS_EQUIPO). La de la cita va
  // como invitada del evento (Joaquín, 2026-11-02): así la cita sale en su
  // calendario y entra al Meet sin depender de la cuenta dueña.
  const correoDe = (id) => {
    const c = String(correosEquipo(env)[id] ?? '').trim().toLowerCase();
    return CORREO.test(c) ? c : null;
  };
  const correosNutris = () => new Set(nutricionistas.map((n) => correoDe(n.id)).filter(Boolean));

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

  // Meet con acceso abierto (Joaquín, 2026-11-02): el paciente con Hotmail u
  // otro correo sin cuenta de Google no queda en «Pedir unirse», que en un
  // Gmail normal solo la cuenta dueña puede aceptar. Necesita el permiso
  // meetings.space.settings en el token. Nunca lanza: si falla, el Meet queda
  // como lo crea Google y la cita sigue.
  async function abrirMeet(ev) {
    const codigo = ev?.conferenceData?.conferenceId;
    if (!codigo) return;
    try {
      const auth = { Authorization: `Bearer ${await token()}` };
      const g = await fetchImpl(`${MEET_API}/spaces/${encodeURIComponent(codigo)}`, { headers: auth });
      if (!g.ok) throw new Error(`Meet spaces.get ${g.status}: ${await g.text()}`);
      const { name } = await g.json();
      const p = await fetchImpl(`${MEET_API}/${name}?updateMask=config.accessType`, {
        method: 'PATCH',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: { accessType: 'OPEN' } }),
      });
      if (!p.ok) throw new Error(`Meet spaces.patch ${p.status}: ${await p.text()}`);
    } catch (err) {
      console.warn('abrirMeet', err.message);
    }
  }

  async function crearEvento(e) {
    const nutri = correoDe(e.nutricionistaId);
    const cuerpo = {
      summary: e.titulo,
      description: e.descripcion,
      start: { dateTime: e.inicioUtc, timeZone: 'America/Lima' },
      end: { dateTime: e.finUtc, timeZone: 'America/Lima' },
      attendees: [{ email: e.invitado.email, displayName: e.invitado.nombre }, ...(nutri ? [{ email: nutri }] : [])],
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
    await abrirMeet(d);
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
    // Nutricionista de la cita como invitada: se lee la lista actual para
    // conservar al paciente (y a quien se haya agregado a mano) y cambiar solo
    // a la nutricionista si se reasignó.
    const nutri = correoDe(e.nutricionistaId);
    if (nutri) {
      const g = await fetchImpl(`${API}/calendars/${calendario}/events/${encodeURIComponent(eventId)}?fields=attendees`, {
        headers: { Authorization: `Bearer ${await token()}` },
      });
      if (g.ok) {
        const equipo = correosNutris();
        const otros = ((await g.json()).attendees || []).filter((a) => !equipo.has(String(a.email).toLowerCase()));
        cuerpo.attendees = [...otros, { email: nutri }];
      }
    }
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
    if (e.cambiaModalidad && e.modalidad !== 'presencial') await abrirMeet(d);
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
