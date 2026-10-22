import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1DePrueba } from './d1-prueba.mjs';
import * as repo from './repo.mjs';

const t0 = new Date('2026-10-05T15:00:00Z');
const mas = (min) => new Date(t0.getTime() + min * 60000);
let n = 0;
const ret = (db, o = {}) => repo.crearRetencion(db, {
  id: `r${++n}`, token: `t${n}`, producto: 'constancia', duracion_meses: 3, monto_centimos: 108000, peso_tope: 1,
  nutricionista_id: 'nico', inicio_utc: '2026-10-06T17:00:00Z', fecha_lima: '2026-10-06', modalidad: 'presencial',
  tope: 300, ahora: t0, ...o,
});

const cliente = {
  nombre: 'Ana Lucía Pérez Núñez', nombres: 'Ana Lucía', apellido_paterno: 'Pérez', apellido_materno: 'Núñez',
  fecha_nacimiento: '1990-05-04', tipo_documento: 'dni', dni: '12345678', whatsapp: '+51987654321', email: 'a@x.pe',
};

test('retención nueva queda apartada 15 minutos', async () => {
  const db = d1DePrueba();
  const r = await ret(db, { id: 'a', token: 'ta' });
  assert.deepEqual(r, { ok: true, retencion_hasta: mas(15).toISOString() });
  assert.equal((await repo.reservaPorToken(db, 'ta')).estado, 'apartada');
});

test('segunda retención presencial a la misma hora: ocupada', async () => {
  const db = d1DePrueba();
  await ret(db);
  assert.deepEqual(await ret(db, { nutricionista_id: 'jussara' }), { ok: false, motivo: 'ocupada' });
});

test('una retención vencida se libera al intentar otra', async () => {
  const db = d1DePrueba();
  await ret(db, { id: 'viejo' });
  assert.deepEqual((await ret(db, { ahora: mas(16) })).ok, true);
  assert.equal((await repo.reservaPorId(db, 'viejo')).estado, 'expirada');
});

test('tope en minutos: con 240 de 300 entra una de 60; con 300 ya no entra ni una de 30', async () => {
  const db = d1DePrueba();
  for (const h of ['14', '15', '16', '17']) await ret(db, { inicio_utc: `2026-10-06T${h}:00:00Z`, nutricionista_id: `n${h}` });
  assert.equal((await ret(db, { inicio_utc: '2026-10-06T19:00:00Z', nutricionista_id: 'n19' })).ok, true);
  assert.deepEqual(await ret(db, { inicio_utc: '2026-10-06T22:00:00Z', duracion_min: 30 }), { ok: false, motivo: 'tope' });
});

test('tope en minutos: se combinan 30 y 60; las vencidas no cuentan', async () => {
  const db = d1DePrueba();
  for (const h of ['14', '15', '16', '17']) await ret(db, { inicio_utc: `2026-10-06T${h}:00:00Z`, nutricionista_id: `n${h}` });
  await ret(db, { id: 'media', inicio_utc: '2026-10-06T19:00:00Z', nutricionista_id: 'n19', duracion_min: 30 });
  assert.deepEqual(await ret(db, { inicio_utc: '2026-10-06T22:00:00Z' }), { ok: false, motivo: 'tope' });
  assert.equal((await ret(db, { inicio_utc: '2026-10-06T22:00:00Z', duracion_min: 30 })).ok, true);
  assert.equal((await ret(db, { inicio_utc: '2026-10-06T23:00:00Z', nutricionista_id: 'otra', ahora: mas(16) })).ok, true);
});

test('límite de retenciones por huella: la tercera a la vez no entra; vencidas no cuentan', async () => {
  const db = d1DePrueba();
  const h = (hora, extra = {}) => ret(db, { inicio_utc: `2026-10-06T${hora}:00:00Z`, nutricionista_id: `n${hora}`, huella: 'abc', maxRetenciones: 2, ...extra });
  assert.equal((await h('14')).ok, true);
  assert.equal((await h('15')).ok, true);
  assert.deepEqual(await h('16'), { ok: false, motivo: 'limite' });
  assert.equal((await h('16', { ahora: mas(16) })).ok, true);
});

test('guardar datos extiende la retención a 30 minutos desde que se creó', async () => {
  const db = d1DePrueba();
  await ret(db, { id: 'p', token: 'tp' });
  const r = await repo.reservaPorToken(db, 'tp');
  const res = await repo.guardarDatosYPagar(db, {
    reserva: r, cliente: { nombre: 'Ana Pérez', whatsapp: '+51987654321', email: 'ana@x.pe', dni: '12345678' },
    condicionesVersion: '2026-10-01', novedades: true, ahora: mas(10),
  });
  assert.deepEqual(res, { ok: true, retencion_hasta: mas(30).toISOString() });
  const despues = await repo.reservaPorToken(db, 'tp');
  assert.equal(despues.estado, 'pagando');
  assert.equal(despues.nombre, 'Ana Pérez');
  assert.equal(despues.novedades_optin, 1);
});

test('guardar datos con la retención vencida: vencida', async () => {
  const db = d1DePrueba();
  await ret(db, { token: 'tv' });
  const r = await repo.reservaPorToken(db, 'tv');
  const res = await repo.guardarDatosYPagar(db, {
    reserva: r, cliente: { nombre: 'Ana', whatsapp: '+51987654321', email: 'a@x.pe', dni: null },
    condicionesVersion: 'v', novedades: false, ahora: mas(20),
  });
  assert.deepEqual(res, { ok: false, motivo: 'vencida' });
});

test('confirmar desde pagando; confirmar dos veces avisa ya_confirmada', async () => {
  const db = d1DePrueba();
  await ret(db, { id: 'c' });
  const args = { id: 'c', fecha_lima: '2026-10-06', tope: 300, ahora: mas(5) };
  assert.deepEqual(await repo.confirmarReserva(db, args), { ok: true });
  assert.deepEqual(await repo.confirmarReserva(db, args), { ok: false, motivo: 'ya_confirmada' });
});

test('confirmar una expirada cuya hora ya tomó otro: ocupada', async () => {
  const db = d1DePrueba();
  await ret(db, { id: 'tarde' });
  await ret(db, { id: 'otro', nutricionista_id: 'jussara', ahora: mas(16) });
  const res = await repo.confirmarReserva(db, { id: 'tarde', fecha_lima: '2026-10-06', tope: 300, ahora: mas(20) });
  assert.deepEqual(res, { ok: false, motivo: 'ocupada' });
});

test('confirmar una expirada cuyo cupo ocupaba otra retención también vencida y sin marcar: ya no da ocupada', async () => {
  const db = d1DePrueba();
  await ret(db, { id: 'A', token: 'tA', nutricionista_id: 'na', inicio_utc: '2026-10-06T17:00:00Z', ahora: t0 });
  // B toma la misma hora y nutricionista una vez que A ya venció: el propio
  // crearRetencion de B la expira al pasar, como parte de su propia inserción.
  await ret(db, { id: 'B', token: 'tB', nutricionista_id: 'na', inicio_utc: '2026-10-06T17:00:00Z', ahora: mas(16) });
  assert.equal((await repo.reservaPorId(db, 'A')).estado, 'expirada');
  // Pasa el tiempo: B también vence, pero nadie volvió a barrer la tabla (no
  // hubo ninguna otra retención nueva que disparara el expirar de B).
  const res = await repo.confirmarReserva(db, { id: 'A', fecha_lima: '2026-10-06', tope: 9999, ahora: mas(32) });
  assert.deepEqual(res, { ok: true });
  assert.equal((await repo.reservaPorId(db, 'B')).estado, 'expirada');
});

test('reubicar a una hora que tenía una retención vencida y sin marcar: ya no da ocupada', async () => {
  const db = d1DePrueba();
  await ret(db, { id: 'B', token: 'tB', nutricionista_id: 'paola', inicio_utc: '2026-10-07T19:00:00Z', fecha_lima: '2026-10-07', ahora: t0 });
  await ret(db, { id: 'R', token: 'tR' });
  await repo.marcarSinHora(db, 'R', mas(1));
  const res = await repo.reubicar(db, { id: 'R', nutricionista_id: 'paola', inicio_utc: '2026-10-07T19:00:00Z', fecha_lima: '2026-10-07',
    modalidad: 'presencial', tope: 9999, ahora: mas(20) });
  assert.deepEqual(res, { ok: true });
  const r = await repo.reservaPorId(db, 'R');
  assert.equal(r.estado, 'confirmada');
  assert.equal(r.nutricionista_id, 'paola');
  assert.equal((await repo.reservaPorId(db, 'B')).estado, 'expirada');
});

test('registrarPago es idempotente por mp_payment_id', async () => {
  const db = d1DePrueba();
  await ret(db, { id: 'pg' });
  const p = { reserva_id: 'pg', mp_payment_id: '999', estado: 'pending', monto_centimos: 108000, metodo: 'yape', ahora: t0 };
  await repo.registrarPago(db, p);
  await repo.registrarPago(db, { ...p, estado: 'approved' });
  const filas = await db.prepare('SELECT estado FROM pagos').all();
  assert.deepEqual(filas.results, [{ estado: 'approved' }]);
  assert.deepEqual(await repo.ultimoPago(db, 'pg'), { estado: 'approved' });
});

test('reubicar una pagada sin hora la deja confirmada en la nueva hora', async () => {
  const db = d1DePrueba();
  await ret(db, { id: 's' });
  await repo.marcarSinHora(db, 's', mas(1));
  const res = await repo.reubicar(db, { id: 's', nutricionista_id: 'paola', inicio_utc: '2026-10-07T19:00:00Z', fecha_lima: '2026-10-07', modalidad: 'presencial', tope: 300, ahora: mas(2) });
  assert.deepEqual(res, { ok: true });
  const r = await repo.reservaPorId(db, 's');
  assert.equal(r.estado, 'confirmada');
  assert.equal(r.nutricionista_id, 'paola');
});

test('purgar borra datos de contacto de reservas no pagadas con más de 30 días', async () => {
  const db = d1DePrueba();
  await ret(db, { id: 'np', token: 'tnp' });
  const r = await repo.reservaPorToken(db, 'tnp');
  await repo.guardarDatosYPagar(db, { reserva: r, cliente: { ...cliente, nombre: 'Ana' }, condicionesVersion: 'v', novedades: false, ahora: mas(1) });
  await repo.purgarNoPagadas(db, new Date(t0.getTime() + 31 * 86400000));
  assert.equal((await repo.reservaPorToken(db, 'tnp')).nombre, null);
});

test('purgar borra la huella apenas termina la retención', async () => {
  const db = d1DePrueba();
  await ret(db, { token: 'th', huella: 'abc' });
  await repo.purgarNoPagadas(db, mas(16));
  assert.equal((await repo.reservaPorToken(db, 'th')).huella, null);
});

test('guardarDatosYPagar guarda nombres, apellidos, nacimiento y documento', async () => {
  const db = d1DePrueba();
  await ret(db, { id: 'g', token: 'tg' });
  const r = await repo.reservaPorToken(db, 'tg');
  await repo.guardarDatosYPagar(db, { reserva: r, cliente, condicionesVersion: 'v', novedades: false, ahora: mas(1) });
  const c = await db.prepare('SELECT * FROM clientes').first();
  assert.equal(c.nombre, 'Ana Lucía Pérez Núñez');
  assert.equal(c.apellido_materno, 'Núñez');
  assert.equal(c.fecha_nacimiento, '1990-05-04');
  assert.equal(c.tipo_documento, 'dni');
  assert.equal((await repo.reservaPorToken(db, 'tg')).estado, 'pagando');
});

test('purgar también borra las columnas nuevas; una reserva vieja sin ellas sigue leyéndose', async () => {
  const db = d1DePrueba();
  await ret(db, { id: 'p2', token: 'tp2' });
  await repo.guardarDatosYPagar(db, { reserva: await repo.reservaPorToken(db, 'tp2'), cliente, condicionesVersion: 'v', novedades: false, ahora: mas(1) });
  await repo.purgarNoPagadas(db, new Date(t0.getTime() + 31 * 86400000));
  const c = await db.prepare('SELECT * FROM clientes').first();
  assert.deepEqual([c.nombres, c.apellido_paterno, c.apellido_materno, c.fecha_nacimiento, c.tipo_documento, c.dni], [null, null, null, null, null, null]);
  await db.prepare("INSERT INTO clientes (id, nombre, creado_en) VALUES ('viejo', 'Ana Pérez', 'x')").run();
  await ret(db, { id: 'v', token: 'tv', inicio_utc: '2026-10-06T19:00:00Z' });
  await db.prepare("UPDATE reservas SET cliente_id = 'viejo' WHERE id = 'v'").run();
  assert.equal((await repo.reservaPorToken(db, 'tv')).nombre, 'Ana Pérez');
});

test('noPagadasEntre: con datos y vencidas en la ventana; excluye a quien pagó después', async () => {
  const db = d1DePrueba();
  // Cada una en otro día.
  const pagando = async (id, dia, email) => {
    await ret(db, { id, token: `t${id}`, inicio_utc: `2026-10-${dia}T17:00:00Z`, fecha_lima: `2026-10-${dia}` });
    await repo.guardarDatosYPagar(db, { reserva: await repo.reservaPorToken(db, `t${id}`), cliente: { ...cliente, email }, condicionesVersion: 'v', novedades: false, ahora: mas(1) });
  };
  await pagando('a', '06', 'a@x.pe');
  await pagando('b', '07', 'b@x.pe');
  await ret(db, { id: 'sin', token: 'tsin', inicio_utc: '2026-10-08T17:00:00Z', fecha_lima: '2026-10-08' });
  await db.prepare("UPDATE reservas SET estado = 'confirmada' WHERE id = 'b'").run();
  await pagando('b2', '09', 'b@x.pe');
  const filas = await repo.noPagadasEntre(db, t0.toISOString(), mas(24 * 60).toISOString());
  assert.deepEqual(filas.map((f) => f.id), ['a']);
  assert.equal(filas[0].whatsapp, '+51987654321');
});

test('marcarResumen es una sola vez por fecha', async () => {
  const db = d1DePrueba();
  assert.equal(await repo.marcarResumen(db, '2026-10-09', t0), true);
  assert.equal(await repo.marcarResumen(db, '2026-10-09', t0), false);
  await repo.desmarcarResumen(db, '2026-10-09');
  assert.equal(await repo.marcarResumen(db, '2026-10-09', t0), true);
});

test('liberarRetencion suelta una hora apartada o en pago, pero nunca una confirmada', async () => {
  const db = d1DePrueba();
  await ret(db, { id: 'l1', token: 'tl1', huella: 'h' });
  assert.equal(await repo.liberarRetencion(db, 'tl1', mas(1)), true);
  const r = await repo.reservaPorToken(db, 'tl1');
  assert.deepEqual([r.estado, r.huella], ['expirada', null]);
  await ret(db, { id: 'l2', token: 'tl2', inicio_utc: '2026-10-06T18:00:00Z' });
  await db.prepare("UPDATE reservas SET estado = 'confirmada' WHERE id = 'l2'").run();
  assert.equal(await repo.liberarRetencion(db, 'tl2', mas(1)), false);
  assert.equal((await repo.reservaPorToken(db, 'tl2')).estado, 'confirmada');
  assert.equal(await repo.liberarRetencion(db, 'no-existe', mas(1)), false);
});

test('cruce: 30 min a las 10:30 contra 60 min a las 10:00, misma nutricionista: ocupada', async () => {
  const db = d1DePrueba();
  assert.equal((await ret(db, { inicio_utc: '2026-10-06T15:00:00Z', modalidad: 'video' })).ok, true);
  assert.deepEqual(await ret(db, { inicio_utc: '2026-10-06T15:30:00Z', modalidad: 'video', duracion_min: 30 }), { ok: false, motivo: 'ocupada' });
});

test('cruce: dos de 30 seguidas con la misma nutricionista sí entran', async () => {
  const db = d1DePrueba();
  assert.equal((await ret(db, { inicio_utc: '2026-10-06T15:00:00Z', modalidad: 'video', duracion_min: 30 })).ok, true);
  assert.equal((await ret(db, { inicio_utc: '2026-10-06T15:30:00Z', modalidad: 'video', duracion_min: 30 })).ok, true);
  const r = await db.prepare("SELECT fin_utc, duracion_min FROM reservas WHERE inicio_utc = '2026-10-06T15:30:00Z'").first();
  assert.deepEqual(r, { fin_utc: '2026-10-06T16:00:00Z', duracion_min: 30 });
});

test('cruce: presenciales de distintas nutricionistas chocan; videos no', async () => {
  const db = d1DePrueba();
  await ret(db, { inicio_utc: '2026-10-06T15:00:00Z', nutricionista_id: 'nico' });
  assert.deepEqual(await ret(db, { inicio_utc: '2026-10-06T15:30:00Z', nutricionista_id: 'jussara', duracion_min: 30 }), { ok: false, motivo: 'ocupada' });
  assert.equal((await ret(db, { inicio_utc: '2026-10-06T15:30:00Z', nutricionista_id: 'jussara', modalidad: 'video', duracion_min: 30 })).ok, true);
});

test('cruce: una retención vencida que se cruza no bloquea', async () => {
  const db = d1DePrueba();
  await ret(db, { id: 'vieja', inicio_utc: '2026-10-06T15:00:00Z', modalidad: 'video' });
  assert.equal((await ret(db, { inicio_utc: '2026-10-06T15:30:00Z', modalidad: 'video', duracion_min: 30, ahora: mas(16) })).ok, true);
});

test('cruce: una fila sin fin_utc cuenta como de 60 min', async () => {
  const db = d1DePrueba();
  await db.prepare(`INSERT INTO reservas (id, token, producto, duracion_meses, monto_centimos, peso_tope, nutricionista_id, inicio_utc, fecha_lima,
    modalidad, estado, creado_en, actualizado_en) VALUES ('m', 'tm', 'constancia', 3, 0, 1, 'nico', '2026-10-06T15:00:00Z', '2026-10-06', 'video', 'confirmada', 'x', 'x')`).run();
  assert.deepEqual(await ret(db, { inicio_utc: '2026-10-06T15:30:00Z', modalidad: 'video', duracion_min: 30 }), { ok: false, motivo: 'ocupada' });
});

test('cruce: el tope sigue dando «tope» y no «ocupada»', async () => {
  const db = d1DePrueba();
  assert.deepEqual(await ret(db, { tope: 30 }), { ok: false, motivo: 'tope' });
});

test('cruce: reubicar a una hora que se cruza da ocupada', async () => {
  const db = d1DePrueba();
  await ret(db, { id: 'otra', inicio_utc: '2026-10-07T15:00:00Z', fecha_lima: '2026-10-07', modalidad: 'video' });
  await ret(db, { id: 'sin', inicio_utc: '2026-10-06T15:00:00Z', modalidad: 'video' });
  await repo.marcarSinHora(db, 'sin', t0);
  const res = await repo.reubicar(db, { id: 'sin', nutricionista_id: 'nico', inicio_utc: '2026-10-07T15:30:00Z', fecha_lima: '2026-10-07',
    modalidad: 'video', tope: 300, ahora: t0 });
  assert.deepEqual(res, { ok: false, motivo: 'ocupada' });
});

test('cruce: reubicar recalcula fin_utc con la duración de la reserva', async () => {
  const db = d1DePrueba();
  await ret(db, { id: 'sin', inicio_utc: '2026-10-06T15:00:00Z', modalidad: 'video', duracion_min: 30 });
  await repo.marcarSinHora(db, 'sin', t0);
  assert.deepEqual(await repo.reubicar(db, { id: 'sin', nutricionista_id: 'nico', inicio_utc: '2026-10-07T16:00:00Z', fecha_lima: '2026-10-07',
    modalidad: 'video', tope: 300, ahora: t0 }), { ok: true });
  const r = await repo.reservaPorId(db, 'sin');
  assert.equal(r.fin_utc, '2026-10-07T16:30:00Z');
});

test('cruce: revivir una expirada que ahora se cruza con otra no confirma', async () => {
  const db = d1DePrueba();
  await ret(db, { id: 'tarde', inicio_utc: '2026-10-06T15:00:00Z', modalidad: 'video' });
  await ret(db, { id: 'nueva', inicio_utc: '2026-10-06T15:30:00Z', modalidad: 'video', duracion_min: 30, ahora: mas(16) });
  const res = await repo.confirmarReserva(db, { id: 'tarde', fecha_lima: '2026-10-06', tope: 300, ahora: mas(17) });
  assert.equal(res.ok, false);
  assert.equal((await repo.reservaPorId(db, 'tarde')).estado, 'expirada');
});

test('reservasActivasEntre devuelve fin y duración', async () => {
  const db = d1DePrueba();
  await ret(db, { inicio_utc: '2026-10-06T15:00:00Z', modalidad: 'video', duracion_min: 30 });
  const [r] = await repo.reservasActivasEntre(db, '2026-10-06', '2026-10-07', t0);
  assert.equal(r.fin_utc, '2026-10-06T15:30:00Z');
  assert.equal(r.duracion_min, 30);
});

test('guardar datos de una reserva ya confirmada: no toca la ficha ni crea otra', async () => {
  const db = d1DePrueba();
  await ret(db, { id: 'cf', token: 'tcf' });
  await repo.guardarDatosYPagar(db, { reserva: await repo.reservaPorToken(db, 'tcf'), cliente, condicionesVersion: 'v', novedades: false, ahora: mas(1) });
  await repo.confirmarReserva(db, { id: 'cf', fecha_lima: '2026-10-06', tope: 300, ahora: mas(2) });
  const otro = { ...cliente, nombre: 'Otra Persona', email: 'otra@x.pe', dni: '87654321' };
  const res = await repo.guardarDatosYPagar(db, { reserva: await repo.reservaPorToken(db, 'tcf'), cliente: otro, condicionesVersion: 'v', novedades: false, ahora: mas(3) });
  assert.deepEqual(res, { ok: false, motivo: 'vencida' });
  const c = await db.prepare('SELECT * FROM clientes').all();
  assert.equal(c.results.length, 1);
  assert.deepEqual([c.results[0].nombre, c.results[0].email, c.results[0].dni], ['Ana Lucía Pérez Núñez', 'a@x.pe', '12345678']);
  assert.equal((await repo.reservaPorToken(db, 'tcf')).estado, 'confirmada');
});

test('guardar datos sin ficha previa con la retención vencida: no crea ficha', async () => {
  const db = d1DePrueba();
  await ret(db, { token: 'tsf' });
  const res = await repo.guardarDatosYPagar(db, { reserva: await repo.reservaPorToken(db, 'tsf'), cliente, condicionesVersion: 'v', novedades: false, ahora: mas(20) });
  assert.deepEqual(res, { ok: false, motivo: 'vencida' });
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM clientes').first()).n, 0);
});

const confirmada = async (db, o) => { await ret(db, o); await db.prepare("UPDATE reservas SET estado = 'confirmada', retencion_hasta = NULL WHERE id = ?1").bind(o.id).run(); };
const editar = (db, o) => repo.editarReserva(db, { id: 'e', nutricionista_id: 'nico', inicio_utc: '2026-10-07T16:00:00Z', fecha_lima: '2026-10-07',
  modalidad: 'video', editadaPor: 'romi@x.pe', cambios: 'x', ahora: mas(5), ...o });

test('editarReserva: mueve hora, nutri y modalidad, conserva la duración y guarda quién', async () => {
  const db = d1DePrueba();
  await confirmada(db, { id: 'e', duracion_min: 30, modalidad: 'presencial' });
  assert.deepEqual(await editar(db, { nutricionista_id: 'paola', cambios: '10:00 → 11:00' }), { ok: true });
  const r = await repo.reservaPorId(db, 'e');
  assert.deepEqual([r.nutricionista_id, r.inicio_utc, r.fin_utc, r.fecha_lima, r.modalidad, r.estado, r.editada_por, r.edicion_cambios],
    ['paola', '2026-10-07T16:00:00Z', '2026-10-07T16:30:00Z', '2026-10-07', 'video', 'confirmada', 'romi@x.pe', '10:00 → 11:00']);
  assert.equal(r.editada_en, mas(5).toISOString());
});

test('editarReserva: se puede solapar consigo misma (media hora después)', async () => {
  const db = d1DePrueba();
  await confirmada(db, { id: 'e', inicio_utc: '2026-10-06T17:00:00Z' });
  assert.deepEqual(await editar(db, { nutricionista_id: 'nico', inicio_utc: '2026-10-06T17:30:00Z', fecha_lima: '2026-10-06', modalidad: 'presencial' }), { ok: true });
});

test('editarReserva: cruce con otra cita de la nutri o con otra presencial da ocupada y no cambia nada', async () => {
  const db = d1DePrueba();
  await confirmada(db, { id: 'e' });
  await confirmada(db, { id: 'otra', nutricionista_id: 'paola', inicio_utc: '2026-10-07T16:00:00Z', fecha_lima: '2026-10-07', modalidad: 'presencial' });
  assert.deepEqual(await editar(db, { nutricionista_id: 'paola' }), { ok: false, motivo: 'ocupada' });
  assert.deepEqual(await editar(db, { nutricionista_id: 'jussara', modalidad: 'presencial' }), { ok: false, motivo: 'ocupada' });
  assert.equal((await repo.reservaPorId(db, 'e')).inicio_utc, '2026-10-06T17:00:00Z');
});

test('editarReserva: no mira el tope del día', async () => {
  const db = d1DePrueba();
  for (const h of ['14', '15', '16', '17', '19']) await confirmada(db, { id: `l${h}`, inicio_utc: `2026-10-07T${h}:00:00Z`, fecha_lima: '2026-10-07', nutricionista_id: `n${h}`, modalidad: 'video' });
  await confirmada(db, { id: 'e' });
  assert.deepEqual(await editar(db, { inicio_utc: '2026-10-07T21:00:00Z' }), { ok: true });
});

test('editarReserva: cita pasada, cancelada o pagada sin hora da estado', async () => {
  const db = d1DePrueba();
  await confirmada(db, { id: 'e' });
  assert.deepEqual(await editar(db, { ahora: new Date('2026-10-06T17:00:00Z') }), { ok: false, motivo: 'estado' });
  await db.prepare("UPDATE reservas SET estado = 'pagada_sin_hora' WHERE id = 'e'").run();
  assert.deepEqual(await editar(db), { ok: false, motivo: 'estado' });
  await db.prepare("UPDATE reservas SET estado = 'cancelada' WHERE id = 'e'").run();
  assert.deepEqual(await editar(db), { ok: false, motivo: 'estado' });
});

test('editarReserva: un cupo vencido sin marcar en la hora de destino no la bloquea', async () => {
  const db = d1DePrueba();
  await confirmada(db, { id: 'e', nutricionista_id: 'nico', modalidad: 'presencial' });
  const viejo = await ret(db, { id: 'viejo', nutricionista_id: 'nico', inicio_utc: '2026-10-07T16:00:00Z', fecha_lima: '2026-10-07', ahora: new Date('2026-09-01T00:00:00Z') });
  assert.equal(viejo.ok, true);
  assert.deepEqual(await editar(db, {}), { ok: true });
  assert.equal((await repo.reservaPorId(db, 'viejo')).estado, 'expirada');
  assert.equal((await repo.reservaPorId(db, 'e')).inicio_utc, '2026-10-07T16:00:00Z');
});

test('cancelarCita: cancela una confirmada futura, guarda quién y libera la hora', async () => {
  const db = d1DePrueba();
  await ret(db, { id: 'k' });
  await db.prepare("UPDATE reservas SET estado = 'confirmada', retencion_hasta = NULL WHERE id = 'k'").run();
  assert.equal(await repo.cancelarCita(db, { id: 'k', por: 'romi@x.pe', ahora: mas(5) }), true);
  const r = await repo.reservaPorId(db, 'k');
  assert.deepEqual([r.estado, r.cancelada_en_panel, r.editada_por, r.edicion_cambios], ['cancelada', mas(5).toISOString(), 'romi@x.pe', 'Cancelada']);
  assert.equal((await ret(db, { id: 'otra', nutricionista_id: 'jussara' })).ok, true);
  assert.equal(await repo.cancelarCita(db, { id: 'k', por: 'romi@x.pe', ahora: mas(6) }), false);
});

test('cancelarCita: una cita pasada no se cancela', async () => {
  const db = d1DePrueba();
  await ret(db, { id: 'p' });
  await db.prepare("UPDATE reservas SET estado = 'confirmada', retencion_hasta = NULL WHERE id = 'p'").run();
  assert.equal(await repo.cancelarCita(db, { id: 'p', por: 'romi@x.pe', ahora: new Date('2026-10-06T17:00:00Z') }), false);
});
