import { test } from 'node:test';
import assert from 'node:assert/strict';
import { correoRecibo, correoBaja, correoEquipoSuscripcion, correoPenalidadPendiente } from './correos.mjs';

test('recibo: cobro N de M, último cobro y enlace para cancelar con la penalidad', () => {
  const c = correoRecibo({ nombre: 'Lucía', titulo: '2 sesiones al mes · 3 meses · pago mensual', numero: 2, cobros: 3, cuota: 36000,
    urlCancelar: 'https://w/suscripcion/cancelar/?s=t', penalidadHoy: 16000 });
  assert.equal(c.subject, 'Recibimos tu pago · cobro 2 de 3 · AJL Nutrición');
  assert.match(c.html, /S\/360/);
  assert.match(c.html, /href="https:\/\/w\/suscripcion\/cancelar\/\?s=t"/);
  assert.match(c.html, /hoy serían S\/160/);
});

test('recibo del último cobro: dice que termina y no ofrece penalidad', () => {
  const c = correoRecibo({ nombre: 'Lucía', titulo: 't', numero: 3, cobros: 3, cuota: 36000, urlCancelar: 'u', penalidadHoy: 0 });
  assert.match(c.html, /último cobro/);
  assert.doesNotMatch(c.html, /penalidad/);
});

test('recibo de mes a mes: sin total de cobros ni penalidad', () => {
  const c = correoRecibo({ nombre: 'Ana', titulo: 't', numero: 4, cobros: null, cuota: 44000, urlCancelar: 'u', penalidadHoy: 0 });
  assert.equal(c.subject, 'Recibimos tu pago · AJL Nutrición');
  assert.doesNotMatch(c.html, /penalidad/);
});

test('baja: con penalidad pendiente explica que se paga al volver; escapa el nombre', () => {
  const c = correoBaja({ nombre: '<b>x</b>', titulo: 't', penalidad: 8000, penalidadPagada: false });
  assert.match(c.html, /&lt;b&gt;x&lt;\/b&gt;/);
  assert.match(c.html, /S\/80 quedan pendientes/);
});

test('equipo: asunto según el tipo', () => {
  const s = { nombre: 'Ana Torres', titulo: 'x', producto: 'transformacion', duracion_meses: 3, cobros_aprobados: 2, whatsapp: '+51987654321', dni: '72345678' };
  assert.equal(correoEquipoSuscripcion('fallido', s, { penalidad: 9000 }).subject, 'Cobro fallido: Ana Torres · penalidad S/90');
  assert.equal(correoEquipoSuscripcion('ultimo', s).subject, 'Ana Torres pagó su último cobro: ofrécele seguir');
  assert.equal(correoEquipoSuscripcion('nueva', s).subject, 'Suscripción nueva: Ana Torres');
});

test('penalidad pendiente: asunto, monto, botón con el link y nombre escapado', () => {
  const c = correoPenalidadPendiente({ nombre: '<i>Ana</i>', monto: 8000, url: 'https://w/suscripcion/cancelar/?s=t' });
  assert.equal(c.subject, 'Tu penalidad pendiente · AJL Nutrición');
  assert.match(c.html, /S\/80/);
  assert.match(c.html, /href="https:\/\/w\/suscripcion\/cancelar\/\?s=t"/);
  assert.match(c.html, /Pagar la penalidad/);
  assert.match(c.html, /&lt;i&gt;/);
});
