import { test } from 'node:test';
import assert from 'node:assert/strict';
import { correoConfirmacion, correoEquipoConfirmada } from './correos.mjs';
import { icsDeReserva } from './ics.mjs';
import { crearSendEmail } from '../correo.mjs';

test('los correos escapan lo que escribe el paciente', () => {
  const c = correoEquipoConfirmada({ nombre: '<script>x</script>', whatsapp: '+51', email: 'a@x.pe', dni: null, titulo: 'T',
    etiqueta: 'E', modalidad: 'video', nutricionista: 'Nico', monto: 1080, calendarioPendiente: true, novedades: false });
  assert.ok(!c.html.includes('<script>'));
  assert.ok(c.html.includes('&lt;script&gt;'));
  assert.match(c.html, /a mano/);
});

test('confirmación por video incluye el Meet; presencial, la dirección', () => {
  const v = correoConfirmacion({ nombre: 'Ana', titulo: 'T', etiqueta: 'jueves', modalidad: 'video', direccion: 'Lince', meet: 'https://meet/x', nutricionista: 'Nico', urlIcs: 'https://i' });
  assert.match(v.html, /https:\/\/meet\/x/);
  const p = correoConfirmacion({ nombre: 'Ana', titulo: 'T', etiqueta: 'jueves', modalidad: 'presencial', direccion: 'Jr. Almirante', meet: null, nutricionista: 'Nico', urlIcs: 'https://i' });
  assert.match(p.html, /Jr\. Almirante/);
});

test('ics con horas UTC y texto escapado', () => {
  const t = icsDeReserva({ uid: 'r1', titulo: 'Sesión, AJL', inicioUtc: '2026-10-06T17:00:00Z', finUtc: '2026-10-06T18:00:00Z',
    ubicacion: 'Lince; Lima', descripcion: 'a\nb', ahora: new Date('2026-10-05T15:00:00Z') });
  assert.match(t, /DTSTART:20261006T170000Z/);
  assert.match(t, /SUMMARY:Sesión\\, AJL/);
  assert.match(t, /LOCATION:Lince\\; Lima/);
  assert.match(t, /\r\nEND:VCALENDAR\r\n$/);
});

test('sendEmail devuelve false si la red falla, sin lanzar', async () => {
  const send = crearSendEmail({ RESEND_API_KEY: 'k' }, async () => { throw new Error('red'); });
  assert.equal(await send({ from: 'a', to: 'b', subject: 's', html: 'h' }), false);
});
