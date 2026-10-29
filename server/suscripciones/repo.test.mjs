import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1DePrueba } from '../reservas/d1-prueba.mjs';
import * as sus from './repo.mjs';

const t0 = new Date('2026-11-03T15:00:00Z');
const base = (o = {}) => ({ id: 's1', token: 'tok1', producto: 'constancia', duracion_meses: 3, cuota_centimos: 36000, precio_mes_centimos: 44000,
  estado: 'pendiente', nombre: 'Lucía Ramos', email: 'lucia@x.pe', dni: '70123456', whatsapp: '+51987654321', creado_en: t0.toISOString(), ...o });

test('registrarCobro: el mismo pago dos veces cuenta una sola vez y activa la suscripción', async () => {
  const db = d1DePrueba();
  await sus.crear(db, base());
  const a = await sus.registrarCobro(db, { suscripcionId: 's1', mpPaymentId: 'p1', estado: 'approved', montoCentimos: 36000, ahora: t0 });
  const b = await sus.registrarCobro(db, { suscripcionId: 's1', mpPaymentId: 'p1', estado: 'approved', montoCentimos: 36000, ahora: t0 });
  assert.deepEqual(a, { nuevoAprobado: true, pagoNuevoAprobado: true, numero: 1 });
  assert.deepEqual(b, { nuevoAprobado: false, pagoNuevoAprobado: false, numero: 1 });
  const s = await sus.porId(db, 's1');
  assert.equal(s.cobros_aprobados, 1);
  assert.equal(s.estado, 'activa');
  assert.equal(s.ultimo_cobro_en, t0.toISOString());
});

test('registrarCobro: un rechazo no suma y no pisa un aprobado', async () => {
  const db = d1DePrueba();
  await sus.crear(db, base({ estado: 'activa' }));
  assert.deepEqual(await sus.registrarCobro(db, { suscripcionId: 's1', mpPaymentId: 'p1', estado: 'rejected', montoCentimos: 36000, ahora: t0 }), { nuevoAprobado: false, pagoNuevoAprobado: false, numero: 1 });
  await sus.registrarCobro(db, { suscripcionId: 's1', mpPaymentId: 'p2', estado: 'approved', montoCentimos: 36000, ahora: t0 });
  await sus.registrarCobro(db, { suscripcionId: 's1', mpPaymentId: 'p2', estado: 'rejected', montoCentimos: 36000, ahora: t0 });
  const { estado } = await db.prepare("SELECT estado FROM suscripcion_cobros WHERE mp_payment_id = 'p2'").first();
  assert.equal(estado, 'approved');
  assert.equal((await sus.porId(db, 's1')).cobros_aprobados, 1);
});

test('registrarCobro con contar=false: guarda el pago con numero 0 sin sumar, y avisa solo la primera vez', async () => {
  const db = d1DePrueba();
  await sus.crear(db, base({ estado: 'cancelada', cobros_aprobados: 1 }));
  const a = await sus.registrarCobro(db, { suscripcionId: 's1', mpPaymentId: 'px', estado: 'approved', montoCentimos: 36000, ahora: t0, contar: false });
  const b = await sus.registrarCobro(db, { suscripcionId: 's1', mpPaymentId: 'px', estado: 'approved', montoCentimos: 36000, ahora: t0, contar: false });
  assert.deepEqual(a, { nuevoAprobado: false, pagoNuevoAprobado: true, numero: 0 });
  assert.deepEqual(b, { nuevoAprobado: false, pagoNuevoAprobado: false, numero: 0 });
  assert.equal((await sus.porId(db, 's1')).cobros_aprobados, 1);
});

test('cancelar a mitad deja la penalidad pendiente; al final no; la segunda vez no cambia nada', async () => {
  const db = d1DePrueba();
  await sus.crear(db, base({ estado: 'activa', cobros_aprobados: 1 }));
  assert.deepEqual(await sus.cancelar(db, { id: 's1', motivo: 'paciente_boton', ahora: t0 }), { cambio: true, penalidad_centimos: 8000, penalidad_estado: 'pendiente' });
  assert.equal((await sus.porId(db, 's1')).penalidad_estado, 'pendiente');
  assert.equal((await sus.porId(db, 's1')).penalidad_centimos, 8000);
  assert.equal((await sus.cancelar(db, { id: 's1', motivo: 'paciente_mp', ahora: t0 })).cambio, false);
  await sus.crear(db, base({ id: 's2', token: 'tok2', estado: 'activa', cobros_aprobados: 3 }));
  assert.deepEqual(await sus.cancelar(db, { id: 's2', motivo: 'paciente_mp', ahora: t0 }), { cambio: true, penalidad_centimos: 0, penalidad_estado: 'no_aplica' });
  assert.equal((await sus.porId(db, 's2')).penalidad_estado, 'no_aplica');
});

test('cancelar por cobro fallido deja estado cobro_fallido; una penalidad ya pagada sigue pagada', async () => {
  const db = d1DePrueba();
  await sus.crear(db, base({ estado: 'activa', cobros_aprobados: 2 }));
  assert.equal(await sus.marcarPenalidadPagada(db, { id: 's1', mpPaymentId: 'pen1', ahora: t0 }), true);
  const r = await sus.cancelar(db, { id: 's1', motivo: 'cobro_fallido', ahora: t0 });
  assert.equal(r.cambio, true);
  assert.equal(r.penalidad_estado, 'pagada');
  assert.equal(r.penalidad_centimos, 0);
  const s = await sus.porId(db, 's1');
  assert.equal(s.estado, 'cobro_fallido');
  assert.equal(s.penalidad_estado, 'pagada');
  assert.equal(await sus.marcarPenalidadPagada(db, { id: 's1', mpPaymentId: 'pen1', ahora: t0 }), false);
});

test('deudaPorDni encuentra la penalidad pendiente sin importar mayúsculas ni espacios', async () => {
  const db = d1DePrueba();
  await sus.crear(db, base({ estado: 'activa', cobros_aprobados: 1, dni: 'CE12345' }));
  await sus.cancelar(db, { id: 's1', motivo: 'paciente_boton', ahora: t0 });
  assert.equal((await sus.deudaPorDni(db, ' ce12345 ')).id, 's1');
  assert.equal(await sus.deudaPorDni(db, '70123456'), null);
});

test('usarLink: solo una vez y solo vigente', async () => {
  const db = d1DePrueba();
  await sus.crear(db, base({ link_token_hash: 'h1', vence_en: '2026-11-10T00:00:00Z', email: null, dni: null }));
  const datos = { hash: 'h1', nombre: 'Lucía Ramos', email: 'l@x.pe', dni: '70123456', whatsapp: '+51987654321', condicionesVersion: 'v', ahora: t0 };
  assert.equal(await sus.usarLink(db, datos), true);
  assert.equal(await sus.usarLink(db, datos), false);
  await sus.crear(db, base({ id: 's2', token: 'tok2', link_token_hash: 'h2', vence_en: '2026-11-01T00:00:00Z' }));
  assert.equal(await sus.usarLink(db, { ...datos, hash: 'h2' }), false);
});

test('listar filtra por estado y por último mes', async () => {
  const db = d1DePrueba();
  await sus.crear(db, base({ id: 'a', token: 'a', estado: 'activa', cobros_aprobados: 1 }));
  await sus.crear(db, base({ id: 'b', token: 'b', estado: 'activa', cobros_aprobados: 2 }));
  await sus.crear(db, base({ id: 'c', token: 'c', estado: 'cancelada', penalidad_estado: 'pendiente' }));
  await sus.crear(db, base({ id: 'd', token: 'd', estado: 'pendiente' }));
  const ids = async (filtro) => (await sus.listar(db, { filtro })).map((s) => s.id).sort();
  assert.deepEqual(await ids('activas'), ['a', 'b']);
  assert.deepEqual(await ids('terminan'), ['b']);
  assert.deepEqual(await ids('penalidad'), ['c']);
  assert.deepEqual(await ids('canceladas'), ['c']);
  assert.deepEqual(await ids('todas'), ['a', 'b', 'c']); // las pendientes sin pagar no se listan
});

test('cancelar usa los cobros actuales (16000 con 2 cobros)', async () => {
  const db = d1DePrueba();
  await sus.crear(db, base({ estado: 'activa', cobros_aprobados: 1 }));
  await sus.registrarCobro(db, { suscripcionId: 's1', mpPaymentId: 'p9', estado: 'approved', montoCentimos: 36000, ahora: t0 });
  assert.deepEqual(await sus.cancelar(db, { id: 's1', motivo: 'paciente_mp', ahora: t0 }), { cambio: true, penalidad_centimos: 16000, penalidad_estado: 'pendiente' });
});

test('cancelar reintenta si un cobro entra entre la lectura y el UPDATE', async () => {
  const db = d1DePrueba();
  await sus.crear(db, base({ estado: 'activa', cobros_aprobados: 1 }));
  const prepare = db.prepare.bind(db);
  let bumped = false;
  db.prepare = (sql) => {
    const st = prepare(sql);
    if (bumped || !sql.includes('SET estado = ?2')) return st;
    return { bind: (...a) => { const b = st.bind(...a); return { run: async () => {
      bumped = true;
      await prepare("UPDATE suscripciones SET cobros_aprobados = 2 WHERE id = 's1'").run();
      return b.run();
    } }; } };
  };
  assert.deepEqual(await sus.cancelar(db, { id: 's1', motivo: 'paciente_mp', ahora: t0 }), { cambio: true, penalidad_centimos: 16000, penalidad_estado: 'pendiente' });
  assert.equal(bumped, true);
});

test('cancelar lanza si el conflicto persiste, y listar rechaza filtros inválidos', async () => {
  const db = d1DePrueba();
  await sus.crear(db, base({ estado: 'activa', cobros_aprobados: 1 }));
  const prepare = db.prepare.bind(db);
  db.prepare = (sql) => prepare(sql.includes('SET estado = ?2') ? sql.replace('cobros_aprobados = ?6', 'cobros_aprobados = ?6 AND 0 = 1') : sql);
  await assert.rejects(sus.cancelar(db, { id: 's1', motivo: 'paciente_mp', ahora: t0 }), /conflicto de concurrencia/);
  await assert.rejects(sus.listar(db, { filtro: 'x' }), /filtro inválido/);
});

test('guardarPlan y porPlan: la suscripción se encuentra por su plan de Mercado Pago', async () => {
  const db = d1DePrueba();
  await sus.crear(db, base());
  assert.equal(await sus.porPlan(db, 'plan1'), null);
  await sus.guardarPlan(db, 's1', 'plan1', t0);
  assert.equal((await sus.porPlan(db, 'plan1')).id, 's1');
  await sus.crear(db, base({ id: 's2', token: 'tok2' }));
  await assert.rejects(sus.guardarPlan(db, 's2', 'plan1', t0)); // un plan es de una sola suscripción
});

test('guardarPlan con un plan nuevo suelta el preapproval del anterior; con el mismo lo conserva', async () => {
  const db = d1DePrueba();
  await sus.crear(db, base({ mp_preapproval_id: 'pre1' }));
  await sus.guardarPlan(db, 's1', 'plan1', t0);
  assert.equal((await sus.porId(db, 's1')).mp_preapproval_id, null);
  await sus.guardarPreapproval(db, 's1', 'pre2', t0);
  await sus.guardarPlan(db, 's1', 'plan1', t0);
  assert.equal((await sus.porId(db, 's1')).mp_preapproval_id, 'pre2');
});

test('suscripcionDePlan recuerda los planes reemplazados', async () => {
  const db = d1DePrueba();
  await sus.crear(db, base());
  await sus.guardarPlan(db, 's1', 'plan1', t0);
  await sus.guardarPlan(db, 's1', 'plan2', t0);
  await sus.guardarPlan(db, 's1', 'plan2', t0); // el mismo plan otra vez no duplica
  assert.equal(await sus.porPlan(db, 'plan1'), null);
  assert.equal((await sus.suscripcionDePlan(db, 'plan1')).id, 's1');
  assert.equal((await sus.suscripcionDePlan(db, 'plan2')).id, 's1');
  assert.equal(await sus.suscripcionDePlan(db, 'otro'), null);
});

test('asociarPreapproval solo escribe si la fila no tiene uno', async () => {
  const db = d1DePrueba();
  await sus.crear(db, base());
  assert.equal(await sus.asociarPreapproval(db, 's1', 'pre1', t0), true);
  assert.equal(await sus.asociarPreapproval(db, 's1', 'pre2', t0), false);
  assert.equal((await sus.porId(db, 's1')).mp_preapproval_id, 'pre1');
});
