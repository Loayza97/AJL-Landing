import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { crearGoogle, normalizarEvento, _limpiarCachesGoogle } from './google.mjs';

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
