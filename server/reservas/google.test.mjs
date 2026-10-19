import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { crearGoogle, normalizarEvento, cambioDeEvento, _limpiarCachesGoogle } from './google.mjs';

const env = { GOOGLE_CLIENT_ID: 'c', GOOGLE_CLIENT_SECRET: 's', GOOGLE_REFRESH_TOKEN: 'r', GOOGLE_CALENDAR_ID: 'cal@group.calendar.google.com' };
beforeEach(() => _limpiarCachesGoogle());

function fetchFalso(rutas) {
  const llamadas = [];
  const f = async (url, init = {}) => {
    llamadas.push({ url: String(url), init });
    const ruta = rutas.find(([patron]) => String(url).includes(patron));
    const [, cuerpo, status = 200] = ruta;
    return new Response(JSON.stringify(typeof cuerpo === 'function' ? cuerpo(url, init) : cuerpo), { status });
  };
  f.llamadas = llamadas;
  return f;
}

test('normaliza eventos con hora, de día completo, propios y transparentes', () => {
  assert.deepEqual(normalizarEvento({ summary: 'nico no viene', start: { date: '2026-10-07' }, end: { date: '2026-10-08' } }),
    { titulo: 'nico no viene', todoElDia: true, desde: '2026-10-07', hasta: '2026-10-08', propio: false, bloquea: true });
  const ev = normalizarEvento({ start: { dateTime: '2026-10-06T15:00:00-05:00' }, end: { dateTime: '2026-10-06T16:00:00-05:00' },
    transparency: 'transparent', extendedProperties: { private: { ajl_reserva_id: 'x' } } });
  assert.equal(ev.titulo, '');
  assert.equal(ev.propio, true);
  assert.equal(ev.bloquea, false);
});

test('listarEventos pide token, pagina, descarta cancelados y cachea 60 s', async () => {
  const f = fetchFalso([
    ['oauth2.googleapis.com/token', { access_token: 'AT', expires_in: 3600 }],
    ['/events', (url) => (String(url).includes('pageToken=p2')
      ? { items: [{ summary: 'B', start: { date: '2026-10-07' }, end: { date: '2026-10-08' } }] }
      : { items: [{ summary: 'A', start: { date: '2026-10-07' }, end: { date: '2026-10-08' } }, { status: 'cancelled', start: { date: '2026-10-07' }, end: { date: '2026-10-08' } }], nextPageToken: 'p2' })],
  ]);
  const g = crearGoogle(env, f, () => 1000);
  const eventos = await g.listarEventos('2026-10-06T05:00:00Z', '2026-10-13T05:00:00Z');
  assert.deepEqual(eventos.map((e) => e.titulo), ['A', 'B']);
  assert.match(f.llamadas[1].url, /calendars\/cal%40group\.calendar\.google\.com\/events/);
  assert.equal(f.llamadas[1].init.headers.Authorization, 'Bearer AT');
  await g.listarEventos('2026-10-06T05:00:00Z', '2026-10-13T05:00:00Z');
  assert.equal(f.llamadas.length, 3);
});

test('crearEvento por video pide Meet, invita al paciente y marca la reserva', async () => {
  const f = fetchFalso([
    ['oauth2.googleapis.com/token', { access_token: 'AT', expires_in: 3600 }],
    ['/events?', { id: 'ev1', hangoutLink: 'https://meet.google.com/abc' }],
  ]);
  const g = crearGoogle(env, f);
  const r = await g.crearEvento({ reservaId: 'r1', titulo: '1ra · Ana · Plan', descripcion: 'd', inicioUtc: '2026-10-09T20:00:00Z',
    finUtc: '2026-10-09T21:00:00Z', modalidad: 'video', direccion: 'Lince', invitado: { email: 'ana@x.pe', nombre: 'Ana' } });
  assert.deepEqual(r, { id: 'ev1', meet: 'https://meet.google.com/abc' });
  const { url, init } = f.llamadas[1];
  assert.match(url, /conferenceDataVersion=1/);
  assert.match(url, /sendUpdates=all/);
  const cuerpo = JSON.parse(init.body);
  assert.equal(cuerpo.conferenceData.createRequest.conferenceSolutionKey.type, 'hangoutsMeet');
  assert.equal(cuerpo.extendedProperties.private.ajl_reserva_id, 'r1');
  assert.deepEqual(cuerpo.attendees, [{ email: 'ana@x.pe', displayName: 'Ana' }]);
  assert.equal(cuerpo.location, undefined);
});

test('crearEvento presencial lleva la dirección y no pide Meet', async () => {
  const f = fetchFalso([['oauth2.googleapis.com/token', { access_token: 'AT', expires_in: 3600 }], ['/events?', { id: 'ev2' }]]);
  const g = crearGoogle(env, f);
  await g.crearEvento({ reservaId: 'r2', titulo: 't', descripcion: 'd', inicioUtc: '2026-10-06T17:00:00Z', finUtc: '2026-10-06T18:00:00Z',
    modalidad: 'presencial', direccion: 'Jr. Almirante 1461, Lince, Lima', invitado: { email: 'a@x.pe', nombre: 'A' } });
  const cuerpo = JSON.parse(f.llamadas[1].init.body);
  assert.equal(cuerpo.location, 'Jr. Almirante 1461, Lince, Lima');
  assert.equal(cuerpo.conferenceData, undefined);
});

test('cambioDeEvento: propio presencial, propio virtual, borrado mínimo y de día completo', () => {
  assert.deepEqual(cambioDeEvento({ id: 'e1', status: 'confirmed', location: 'Jr. Almirante Manuel Villavicencio 1461',
    start: { dateTime: '2026-10-21T10:00:00-05:00' }, end: { dateTime: '2026-10-21T10:30:00-05:00' },
    extendedProperties: { private: { ajl_reserva_id: 'r1' } } }),
  { id: 'e1', borrado: false, reservaId: 'r1', inicio: '2026-10-21T15:00:00Z', fin: '2026-10-21T15:30:00Z', meet: false, ubicacion: true });
  const v = cambioDeEvento({ id: 'e2', hangoutLink: 'https://meet.google.com/x', start: { dateTime: '2026-10-21T14:00:00Z' }, end: { dateTime: '2026-10-21T14:30:00Z' } });
  assert.equal(v.meet, true);
  assert.equal(v.ubicacion, false);
  assert.equal(v.reservaId, null);
  assert.deepEqual(cambioDeEvento({ id: 'e3', status: 'cancelled' }),
    { id: 'e3', borrado: true, reservaId: null, inicio: null, fin: null, meet: false, ubicacion: false });
  assert.equal(cambioDeEvento({ id: 'e4', start: { date: '2026-10-21' }, end: { date: '2026-10-22' } }).inicio, null);
});

test('listarCambios: updatedMin y showDeleted, pagina, incluye borrados y no cachea', async () => {
  const f = fetchFalso([
    ['oauth2.googleapis.com/token', { access_token: 'AT', expires_in: 3600 }],
    ['/events', (url) => (String(url).includes('pageToken=p2')
      ? { items: [{ id: 'b', status: 'cancelled' }] }
      : { items: [{ id: 'a', start: { dateTime: '2026-10-21T15:00:00Z' }, end: { dateTime: '2026-10-21T15:30:00Z' } }], nextPageToken: 'p2' })],
  ]);
  const g = crearGoogle(env, f, () => 1000);
  const cambios = await g.listarCambios('2026-10-19T16:58:00.000Z');
  assert.deepEqual(cambios.map((c) => [c.id, c.borrado]), [['a', false], ['b', true]]);
  const url = new URL(f.llamadas[1].url);
  assert.equal(url.searchParams.get('updatedMin'), '2026-10-19T16:58:00.000Z');
  assert.equal(url.searchParams.get('showDeleted'), 'true');
  assert.equal(url.searchParams.get('singleEvents'), 'true');
  await g.listarCambios('2026-10-19T16:58:00.000Z');
  assert.equal(f.llamadas.filter((l) => l.url.includes('/events')).length, 4); // 2 páginas × 2 llamadas: sin caché
});

test('listarCambios: error de Google lanza', async () => {
  const f = fetchFalso([
    ['oauth2.googleapis.com/token', { access_token: 'AT', expires_in: 3600 }],
    ['/events', { error: 'x' }, 500],
  ]);
  await assert.rejects(crearGoogle(env, f, () => 1000).listarCambios('2026-10-19T16:58:00.000Z'), /events\.list 500/);
});
