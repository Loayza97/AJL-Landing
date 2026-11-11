import { test } from 'node:test';
import assert from 'node:assert/strict';
import { motivoRechazo, motivoEquipo } from '../../src/data/motivos-pago.js';

test('time_out: reintentar con la misma tarjeta, no «otra tarjeta o Yape»', () => {
  assert.match(motivoRechazo('cc_rejected_time_out'), /misma tarjeta/);
  const m = motivoEquipo('rejected', 'cc_rejected_time_out');
  assert.equal(m.titulo, 'Rechazado · El banco no respondió a tiempo');
  assert.match(m.accion, /misma tarjeta/);
});

test('high_risk: antifraude de Mercado Pago, no el banco', () => {
  assert.equal(motivoEquipo('rejected', 'cc_rejected_high_risk').titulo, 'Rechazado · Antifraude de Mercado Pago');
  assert.match(motivoRechazo('cc_rejected_high_risk'), /No es tu banco/);
});

test('bad_filled_* y códigos desconocidos', () => {
  assert.equal(motivoEquipo('rejected', 'cc_rejected_bad_filled_security_code').titulo, 'Rechazado · Datos de tarjeta mal escritos');
  assert.deepEqual(motivoEquipo('rejected', 'algo_nuevo'), { titulo: 'Rechazado', accion: 'Otra tarjeta o Yape.' });
  assert.equal(motivoEquipo('approved', 'accredited').titulo, 'Aprobado');
  assert.equal(motivoEquipo(null, null), null);
});
