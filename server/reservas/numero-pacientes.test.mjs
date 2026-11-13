// Desde el 13-nov-2026, todo contacto con el paciente después de pagar va al número de pacientes (912);
// el de ventas (919) queda para quien todavía no compra (p. ej. la pantalla de «tu pago no pasó»).
import test from 'node:test';
import assert from 'node:assert/strict';
import { correoConfirmacion, correoCitaAgenda } from './correos.mjs';
import { eventoDe } from '../handlers/reservas.mjs';

const VENTAS = /919\s?151\s?237/;
const PACIENTES = /912 846 283/;

test('los correos al paciente muestran el número de pacientes, no el de ventas', () => {
  for (const c of [
    correoConfirmacion({ nombre: 'Ana', titulo: 'Plan', etiqueta: 'lunes', modalidad: 'video', direccion: '', meet: '', nutricionista: 'X', urlIcs: 'https://x' }),
    correoCitaAgenda({ nombre: 'Ana', titulo: 'Plan', etiqueta: 'lunes', duracion: 60, modalidad: 'video', direccion: '', meet: '', nutricionista: 'X', urlIcs: 'https://x' }),
  ]) {
    assert.match(c.html, PACIENTES);
    assert.doesNotMatch(c.html, VENTAS);
  }
});

test('la invitación de calendario manda a mover la cita por el número de pacientes', () => {
  const e = eventoDe({ producto: 'evaluacion', duracion_meses: 1, inicio_utc: '2026-12-01T15:00:00Z', modalidad: 'video' });
  assert.match(e.descripcion, PACIENTES);
  assert.doesNotMatch(e.descripcion, VENTAS);
});
