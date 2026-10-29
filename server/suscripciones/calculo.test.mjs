import { test } from 'node:test';
import assert from 'node:assert/strict';
import { condicionesSuscripcion, penalidadAlCancelar, detallePenalidad, finDeCobros, esUltimoCobro } from './calculo.mjs';

test('cuotas y precios de referencia de los 9 casos (precios del 28-oct)', () => {
  const casos = [
    ['acompanamiento', 1, 32000, null, null], ['acompanamiento', 3, 27000, null, 3], ['acompanamiento', 6, 25000, 27000, 6],
    ['constancia', 1, 44000, null, null], ['constancia', 3, 36000, null, 3], ['constancia', 6, 32500, 36000, 6],
    ['transformacion', 1, 60000, null, null], ['transformacion', 3, 51000, null, 3], ['transformacion', 6, 46800, 51000, 6],
  ];
  const mes = { acompanamiento: 32000, constancia: 44000, transformacion: 60000 };
  for (const [p, m, cuota, tres, cobros] of casos) {
    const c = condicionesSuscripcion(p, m);
    assert.equal(c.cuota_centimos, cuota, `${p} ${m}`);
    assert.equal(c.precio_mes_centimos, mes[p], `${p} ${m}`);
    assert.equal(c.precio_3m_centimos, tres, `${p} ${m}`);
    assert.equal(c.ahorro_mes_centimos, mes[p] - cuota, `${p} ${m}`);
    assert.equal(c.cobros, cobros, `${p} ${m}`);
  }
});

test('título dice pago mensual; planes de pago único o duraciones raras no aplican', () => {
  assert.equal(condicionesSuscripcion('constancia', 3).titulo, '2 sesiones al mes · 3 meses · pago mensual');
  assert.equal(condicionesSuscripcion('constancia', 1).titulo, '2 sesiones al mes · mes a mes · pago mensual');
  assert.equal(condicionesSuscripcion('basico', 1), null);
  assert.equal(condicionesSuscripcion('evaluacion', 1), null);
  assert.equal(condicionesSuscripcion('constancia', 4), null);
  assert.equal(condicionesSuscripcion('toString', 1), null);
});

test('penalidades de la tabla de la spec (Joaquín, 28-oct)', () => {
  const tabla = {
    acompanamiento: { 3: [50, 100], 6: [70, 140, 60, 130, 200] },
    constancia: { 3: [80, 160], 6: [115, 230, 105, 220, 335] },
    transformacion: { 3: [90, 180], 6: [132, 264, 126, 258, 390] },
  };
  for (const [p, porDur] of Object.entries(tabla)) {
    for (const [m, esperadas] of Object.entries(porDur)) {
      const c = condicionesSuscripcion(p, Number(m));
      esperadas.forEach((soles, i) => {
        assert.equal(penalidadAlCancelar({ ...c, cobros_aprobados: i + 1 }), soles * 100, `${p} ${m} tras ${i + 1}`);
      });
    }
  }
});

test('penalidad 0: sin cobros, con todos los cobros, o en mes a mes', () => {
  const c = condicionesSuscripcion('constancia', 3);
  assert.equal(penalidadAlCancelar({ ...c, cobros_aprobados: 0 }), 0);
  assert.equal(penalidadAlCancelar({ ...c, cobros_aprobados: 3 }), 0);
  assert.equal(penalidadAlCancelar({ ...condicionesSuscripcion('constancia', 1), cobros_aprobados: 5 }), 0);
});

test('detalle de la penalidad para la página de cancelar', () => {
  const seis = condicionesSuscripcion('acompanamiento', 6);
  assert.equal(detallePenalidad({ ...seis, cobros_aprobados: 4 }), '3 meses a S/270 + 1 mes a S/320, menos los S/1.000 que pagaste');
  assert.equal(detallePenalidad({ ...condicionesSuscripcion('constancia', 3), cobros_aprobados: 2 }), '2 meses a S/440, menos los S/720 que pagaste');
  assert.equal(detallePenalidad({ ...seis, cobros_aprobados: 6 }), '');
});

test('fin de cobros: 15 días después del último cobro esperado; mes a mes sin fin', () => {
  assert.equal(finDeCobros(new Date('2026-11-03T15:00:00Z'), 3), '2027-01-18T15:00:00.000Z');
  assert.equal(finDeCobros(new Date('2026-11-03T15:00:00Z'), null), null);
});

test('último cobro: el número duracion_meses; mes a mes nunca', () => {
  assert.equal(esUltimoCobro({ duracion_meses: 3 }, 2), false);
  assert.equal(esUltimoCobro({ duracion_meses: 3 }, 3), true);
  assert.equal(esUltimoCobro({ duracion_meses: 1 }, 1), false);
});

test('la migración crea las tablas', async () => {
  const { d1DePrueba } = await import('../reservas/d1-prueba.mjs');
  const db = d1DePrueba();
  const { n } = await db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name IN ('suscripciones', 'suscripcion_cobros')").first();
  assert.equal(n, 2);
  const col = await db.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('reservas') WHERE name = 'forma_pago'").first();
  assert.equal(col.n, 1);
});

test('producto de prueba: S/5 al mes, 3 cobros, penalidad S/5 con 1 cobro; fuera de plans y de la cotización', async () => {
  assert.deepEqual(condicionesSuscripcion('prueba', 3), { producto: 'prueba', duracion_meses: 3, cuota_centimos: 500, precio_mes_centimos: 1000,
    precio_3m_centimos: null, ahorro_mes_centimos: 500, cobros: 3, titulo: 'Prueba interna · 3 meses · pago mensual' });
  assert.equal(condicionesSuscripcion('prueba', 1), null);
  assert.equal(condicionesSuscripcion('prueba', 6), null);
  assert.equal(penalidadAlCancelar({ ...condicionesSuscripcion('prueba', 3), cobros_aprobados: 1 }), 500);
  const { plans } = await import('../../src/data/plans.js');
  assert.equal(Object.hasOwn(plans, 'prueba'), false);
  const { cotizar } = await import('../reservas/catalogo.mjs');
  assert.equal(cotizar('prueba', 3, 'completo'), null);
  assert.equal(cotizar('prueba', 3, 'mensual'), null);
});
