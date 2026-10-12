import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enlaceGoogleCalendar } from './ics.mjs';

test('enlace de Google Calendar con la cita ya cargada', () => {
  const u = new URL(enlaceGoogleCalendar({
    titulo: 'Tu sesión en AJL Nutrición · 2 sesiones al mes · 6 meses', inicioUtc: '2026-10-13T14:00:00.000Z',
    finUtc: '2026-10-13T15:00:00.000Z', ubicacion: 'Jr. Almirante Manuel Villavicencio 1461, Lince', descripcion: 'Si necesitas mover tu cita, escríbenos.',
  }));
  assert.equal(u.origin + u.pathname, 'https://calendar.google.com/calendar/render');
  assert.equal(u.searchParams.get('action'), 'TEMPLATE');
  assert.equal(u.searchParams.get('dates'), '20261013T140000Z/20261013T150000Z');
  assert.equal(u.searchParams.get('text'), 'Tu sesión en AJL Nutrición · 2 sesiones al mes · 6 meses');
  assert.equal(u.searchParams.get('location'), 'Jr. Almirante Manuel Villavicencio 1461, Lince');
});
