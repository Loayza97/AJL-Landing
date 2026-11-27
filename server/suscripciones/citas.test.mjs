import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1DePrueba } from '../reservas/d1-prueba.mjs';
import * as agenda from '../agenda/repo.mjs';
import * as repo from '../reservas/repo.mjs';
import * as sus from './repo.mjs';
import * as citas from './citas.mjs';

const t0 = new Date('2026-10-05T15:00:00Z');
const ana = { nombre: 'Ana Pérez', nombres: 'Ana', apellido_paterno: 'Pérez', whatsapp: '+51987654321', email: 'ana@x.pe', dni: '12345678', tipo_documento: 'dni', fecha_nacimiento: '1990-05-04' };
const luis = { ...ana, nombre: 'Luis Soto', nombres: 'Luis', apellido_paterno: 'Soto', dni: '87654321', email: 'luis@x.pe' };

// Suscripción de la web; con `conReserva`, su primera cita queda confirmada (como tras el primer cobro).
async function web(db, { id = 's1', cobros = 1, conReserva = true, producto = 'constancia', estado = 'activa', creada = t0, dni = '12345678' } = {}) {
  if (conReserva) {
    await repo.crearRetencion(db, { id: `r-${id}`, token: `tr-${id}`, producto, duracion_meses: 3, monto_centimos: 36000, peso_tope: 1,
      nutricionista_id: 'nico', inicio_utc: `2026-10-06T${15 + Number(id.slice(1))}:00:00Z`, fecha_lima: '2026-10-06', modalidad: 'presencial', tope: 600, ahora: t0, forma_pago: 'mensual' });
    await db.prepare("UPDATE reservas SET estado = 'confirmada' WHERE id = ?1").bind(`r-${id}`).run();
  }
  await sus.crear(db, { id, token: `t-${id}`, reserva_id: conReserva ? `r-${id}` : null, producto, duracion_meses: 3, cuota_centimos: 36000, precio_mes_centimos: 44000,
    estado: 'pendiente', nombre: 'Ana Pérez', dni, whatsapp: '+51987654321', mp_preapproval_id: `pre-${id}`, creado_en: creada.toISOString() });
  for (let n = 1; n <= cobros; n++) {
    await sus.registrarCobro(db, { suscripcionId: id, mpPaymentId: `${id}-p${n}`, estado: 'approved', montoCentimos: 36000, ahora: new Date(t0.getTime() + n * 1000) });
  }
  if (estado !== 'activa') await db.prepare('UPDATE suscripciones SET estado = ?2 WHERE id = ?1').bind(id, estado).run();
}

async function externa(db, { pre = 'abc', cobros = 2, reason = '3 meses - 2 sesiones mes' } = {}) {
  await db.prepare(`INSERT INTO sus_externas (preapproval_id, pagador, reason, monto_centimos, estado_mp, creado_en, actualizado_en)
    VALUES (?1, 'pagador01', ?2, 36000, 'authorized', ?3, ?3)`).bind(pre, reason, t0.toISOString()).run();
  for (let n = 1; n <= cobros; n++) {
    await db.prepare('INSERT INTO sus_externa_cobros (mp_payment_id, preapproval_id, numero, monto_centimos, cobrado_en, creado_en) VALUES (?1, ?2, ?3, 36000, ?4, ?4)')
      .bind(`${pre}-p${n}`, pre, n, new Date(t0.getTime() + n * 1000).toISOString()).run();
  }
}

let n = 0;
// Crea un link ligado a la suscripción y lo usa el paciente: queda una cita confirmada.
async function agendar(db, { clave = null, cita = '2', plan = 'constancia:3', paciente = ana, cpc = null, ahora = t0, fecha = null }) {
  n += 1;
  const link = `L${n}`;
  await agenda.crearLink(db, { id: link, tokenHash: `h${n}`, tipo: 's60', creadoPor: 'romi@x.pe', ahora, plan, cita, susClave: clave, susCpc: cpc });
  const dia = String(7 + (n % 3)).padStart(2, '0');
  const r = await agenda.agendarConLink(db, { link, reservaId: `rl${n}`, token: `tk${n}`, tipoId: 's60', cliente: paciente, clienteId: `c${n}`,
    hora: { inicio: `2026-10-${dia}T${10 + (n % 12)}:00:00Z`, fin: `2026-10-${dia}T${11 + (n % 12)}:00:00Z`, nutricionista_id: 'nico', modalidad: 'video', fecha_lima: `2026-10-${dia}`, duracion_min: 60 },
    pacienteNuevo: true, condicionesVersion: 'v', ahora });
  assert.equal(r.ok, true, JSON.stringify(r));
  if (fecha) await db.prepare('UPDATE reservas SET fecha_lima = ?2 WHERE id = ?1').bind(`rl${n}`, fecha).run();
  return { link, reserva: `rl${n}` };
}
const de = (db, clave) => citas.filaPorClave(db, clave, t0);
const despues = (horas) => new Date(t0.getTime() + horas * 3600000);
const desde = (db, iso = '2026-10-01T00:00:00.000Z') => db.prepare("UPDATE sync_estado SET valor = ?1 WHERE clave = 'citas_por_cobro_desde'").bind(iso).run();

test('web nueva: la cita elegida al comprar cuenta como usada y cada cobro suma las suyas', async () => {
  const db = d1DePrueba();
  await web(db, { cobros: 1 });
  let f = await de(db, 's:s1');
  assert.deepEqual([f.origen, f.nombre, f.plan, f.cobros, f.cobros_total, f.dadas, f.faltan, f.sin_asignar],
    ['web', 'Ana Pérez', 'constancia:3', 1, 3, 3, 2, false]);
  await sus.registrarCobro(db, { suscripcionId: 's1', mpPaymentId: 's1-p2', estado: 'approved', montoCentimos: 36000, ahora: t0 });
  f = await de(db, 's:s1');
  assert.equal(f.faltan, 4);
});

test('web: si la primera cita se canceló, vuelve a faltar', async () => {
  const db = d1DePrueba();
  await web(db);
  await db.prepare("UPDATE reservas SET estado = 'cancelada' WHERE id = 'r-s1'").run();
  assert.equal((await de(db, 's:s1')).faltan, 3);
});

test('web: cuentan las citas con link del mismo producto reservadas desde que se suscribió, sin pasar por la fila', async () => {
  const db = d1DePrueba();
  await web(db, { cobros: 2 });
  await agendar(db, { plan: 'constancia:3', ahora: despues(1) });
  await agendar(db, { plan: 'renovacion_constancia', ahora: despues(2) });
  await agendar(db, { plan: 'control_constancia:1', ahora: despues(3) });
  const f = await de(db, 's:s1');
  assert.deepEqual([f.dadas, f.usadas, f.faltan], [5, 4, 1]);
});

test('web: no cuentan las de otro producto, las de otro paciente, las canceladas ni las reservadas antes', async () => {
  const db = d1DePrueba();
  await web(db);
  await agendar(db, { plan: 'transformacion:3', ahora: despues(1) });
  await agendar(db, { plan: 'evaluacion', ahora: despues(1) });
  await agendar(db, { paciente: luis, ahora: despues(1) });
  const c = await agendar(db, { ahora: despues(1) });
  await db.prepare("UPDATE reservas SET estado = 'cancelada' WHERE id = ?1").bind(c.reserva).run();
  await agendar(db, { ahora: despues(-48), fecha: '2026-10-20' });
  assert.equal((await de(db, 's:s1')).faltan, 2);
});

test('web: reconoce al paciente por la ficha de su primera cita aunque quien paga tenga otro documento', async () => {
  const db = d1DePrueba();
  await web(db, { dni: '99999999' });
  await db.prepare("INSERT INTO clientes (id, nombre, dni, creado_en) VALUES ('cp', 'Luis', '87654321', ?1)").bind(t0.toISOString()).run();
  await db.prepare("UPDATE reservas SET cliente_id = 'cp' WHERE id = 'r-s1'").run();
  await agendar(db, { paciente: luis, ahora: despues(1) });
  await agendar(db, { paciente: { ...ana, dni: '99999999' }, ahora: despues(1) });
  assert.equal((await de(db, 's:s1')).faltan, 1);
});

test('web sin primera cita («ya tiene cita»): cuenta sus links, y la reservada antes si es desde el día anterior', async () => {
  const db = d1DePrueba();
  await web(db, { conReserva: false });
  assert.equal((await de(db, 's:s1')).faltan, 3);
  await agendar(db, { plan: 'control_constancia:1', ahora: despues(-24 * 30), fecha: '2026-10-04' });
  await agendar(db, { ahora: despues(-24 * 20), fecha: '2026-10-03' });
  await agendar(db, { ahora: despues(1), fecha: '2026-10-12' });
  assert.equal((await de(db, 's:s1')).faltan, 1);
});

test('una cita cuenta para una sola suscripción: la que empezó más tarde antes de reservarla', async () => {
  const db = d1DePrueba();
  await web(db, { id: 's1' });
  await web(db, { id: 's2', creada: despues(24) });
  await agendar(db, { ahora: despues(2) });
  await agendar(db, { ahora: despues(30) });
  assert.deepEqual([(await de(db, 's:s1')).faltan, (await de(db, 's:s2')).faltan], [1, 1]);
});

test('el link creado desde una fila manda sobre la regla y no se cuenta dos veces', async () => {
  const db = d1DePrueba();
  await web(db, { id: 's1' });
  await web(db, { id: 's2', creada: despues(1) });
  await agendar(db, { clave: 's:s1', ahora: despues(2) });
  assert.deepEqual([(await de(db, 's:s1')).faltan, (await de(db, 's:s2')).faltan], [1, 2]);
});

test('hecha a mano asignada: cuentan además las citas del paciente reservadas desde que se asignó', async () => {
  const db = d1DePrueba();
  await externa(db);
  await agendar(db, { ahora: despues(-5) });
  await agendar(db, { clave: 'x:abc', cita: '2', ahora: t0 });
  await agendar(db, { ahora: despues(5) });
  await agendar(db, { plan: 'acompanamiento:3', ahora: despues(5) });
  const f = await de(db, 'x:abc');
  assert.deepEqual([f.dadas, f.usadas, f.faltan], [5, 3, 2]);
});

test('aviso de pago nuevo: se enciende con un cobro posterior al arranque y se apaga con «Visto» hasta el siguiente', async () => {
  const db = d1DePrueba();
  await web(db);
  await desde(db, '2026-11-01T00:00:00.000Z');
  assert.equal((await de(db, 's:s1')).nuevo, false);
  await desde(db);
  assert.equal((await de(db, 's:s1')).nuevo, true);
  await citas.marcarVisto(db, { clave: 's:s1', cobros: 1, por: 'romi@x.pe', ahora: t0 });
  assert.equal((await de(db, 's:s1')).nuevo, false);
  await sus.registrarCobro(db, { suscripcionId: 's1', mpPaymentId: 's1-p2', estado: 'approved', montoCentimos: 36000, ahora: despues(1) });
  assert.equal((await de(db, 's:s1')).nuevo, true);
});

test('aviso de pago nuevo: se apaga al quedar al día con una cita reservada después del cobro; adelantada, sigue', async () => {
  const db = d1DePrueba();
  await desde(db);
  await web(db, { producto: 'acompanamiento', conReserva: false });
  await agendar(db, { plan: 'acompanamiento:3', ahora: despues(1), fecha: '2026-10-07' });
  const f = await de(db, 's:s1');
  assert.deepEqual([f.faltan, f.nuevo], [0, false]);
  await web(db, { id: 's2', producto: 'acompanamiento', dni: '87654321' });
  const g = await de(db, 's:s2');
  assert.deepEqual([g.faltan, g.nuevo], [0, true]);
});

test('aviso de pago nuevo en una hecha a mano: manda la fecha del cobro, no cuándo se cargó', async () => {
  const db = d1DePrueba();
  await externa(db);
  await desde(db, '2026-11-01T00:00:00.000Z');
  assert.equal((await de(db, 'x:abc')).nuevo, false);
  await desde(db);
  assert.equal((await de(db, 'x:abc')).nuevo, true);
});

test('próximo cobro: el de Mercado Pago; en la web activa sin dato, un mes tras el último; sin vigencia, ninguno', async () => {
  const db = d1DePrueba();
  await web(db);
  await db.prepare("UPDATE suscripciones SET estado = 'activa', ultimo_cobro_en = '2026-10-05T15:00:00.000Z' WHERE id = 's1'").run();
  assert.equal((await de(db, 's:s1')).proximo, '2026-11-04T15:00:00.000Z');
  await citas.guardarProximo(db, { clave: 's:s1', fecha: '2026-11-05T19:00:00.000Z', ahora: t0 }).run();
  assert.equal((await de(db, 's:s1')).proximo, '2026-11-05T19:00:00.000Z');
  await db.prepare("UPDATE suscripciones SET estado = 'cancelada' WHERE id = 's1'").run();
  assert.equal((await de(db, 's:s1')).proximo, null);
  await externa(db);
  assert.equal((await de(db, 'x:abc')).proximo, null);
  await citas.guardarProximo(db, { clave: 'x:abc', fecha: '2026-11-06T19:00:00.000Z', ahora: t0 }).run();
  assert.equal((await de(db, 'x:abc')).proximo, '2026-11-06T19:00:00.000Z');
  await db.prepare("UPDATE sus_externas SET estado_mp = 'cancelled'").run();
  assert.equal((await de(db, 'x:abc')).proximo, null);
});

test('hecha a mano sin asignar: sale con lo que sabe Mercado Pago y el plan sugerido', async () => {
  const db = d1DePrueba();
  await externa(db);
  const f = await de(db, 'x:abc');
  assert.deepEqual([f.origen, f.sin_asignar, f.nombre, f.pagador, f.cobros, f.faltan, f.monto_centimos],
    ['mano', true, null, 'pagador01', 2, null, 36000]);
  assert.deepEqual(f.sugerido, { producto: 'constancia', duracion: '3', citasPorCobro: null });
  assert.equal(f.reason, '3 meses - 2 sesiones mes');
});

test('hecha a mano sin cobros: sale solo mientras siga vigente, sin nada por agendar', async () => {
  const db = d1DePrueba();
  await externa(db, { cobros: 0 });
  const f = await de(db, 'x:abc');
  assert.deepEqual([f.cobros, f.pendiente, f.nuevo], [0, false, false]);
  assert.deepEqual(await citas.filasPorAgendar(db, t0), []);
  await db.prepare("UPDATE sus_externas SET estado_mp = 'cancelled'").run();
  assert.equal(await de(db, 'x:abc'), null);
});

test('al usar el primer link se une el paciente con su plan; lo usado antes sale de «qué cita»', async () => {
  const db = d1DePrueba();
  await externa(db);
  await agendar(db, { clave: 'x:abc', cita: '2' });
  const f = await de(db, 'x:abc');
  assert.deepEqual([f.sin_asignar, f.nombre, f.plan, f.dadas, f.usadas, f.faltan], [false, 'Ana Pérez', 'constancia:3', 5, 2, 3]);
});

test('un segundo link no cambia quién es ni lo usado antes; cancelar su cita hace que vuelva a faltar', async () => {
  const db = d1DePrueba();
  await externa(db);
  await agendar(db, { clave: 'x:abc', cita: '2' });
  const b = await agendar(db, { clave: 'x:abc', cita: '5', paciente: luis });
  let f = await de(db, 'x:abc');
  assert.deepEqual([f.nombre, f.faltan], ['Ana Pérez', 2]);
  await db.prepare("UPDATE reservas SET estado = 'cancelada' WHERE id = ?1").bind(b.reserva).run();
  f = await de(db, 'x:abc');
  assert.equal(f.faltan, 3);
});

test('hecha a mano fuera de catálogo: cuenta las citas por cobro que puso el equipo', async () => {
  const db = d1DePrueba();
  await externa(db, { reason: '2 meses-4 sesiones mes' });
  await agendar(db, { clave: 'x:abc', cita: '1', plan: 'otro', cpc: 4 });
  const f = await de(db, 'x:abc');
  assert.deepEqual([f.plan, f.citas_por_cobro, f.dadas, f.faltan], ['otro', 4, 8, 7]);
});

test('un link sin usar no resta, pero la fila lo muestra', async () => {
  const db = d1DePrueba();
  await web(db);
  await agenda.crearLink(db, { id: 'P', tokenHash: 'hp', tipo: 's60', creadoPor: 'r@x.pe', ahora: t0, plan: 'constancia:3', cita: '2', susClave: 's:s1' });
  const f = await de(db, 's:s1');
  assert.deepEqual([f.faltan, f.links_sin_usar], [2, 1]);
});

test('ajuste manual: se suma a «Faltan»; la fila al día solo sale al pedir todas', async () => {
  const db = d1DePrueba();
  await web(db);
  await desde(db, '2026-11-01T00:00:00.000Z');
  await citas.ajustar(db, { clave: 's:s1', cantidad: -2, motivo: 'agendadas por fuera', por: 'romi@x.pe', ahora: t0 });
  assert.equal((await de(db, 's:s1')).faltan, 0);
  assert.deepEqual(await citas.filasPorAgendar(db, t0), []);
  assert.equal((await citas.filasPorAgendar(db, t0, { todas: true })).length, 1);
});

test('la fila sigue aunque la suscripción terminara; la de prueba interna no sale', async () => {
  const db = d1DePrueba();
  await web(db, { id: 's1', estado: 'terminada' });
  await web(db, { id: 's2', producto: 'prueba', conReserva: false });
  assert.deepEqual((await citas.filasPorAgendar(db, t0)).map((f) => f.clave), ['s:s1']);
});

test('orden: pago nuevo, sin asignar y después el resto; dentro, el cobro más reciente primero', async () => {
  const db = d1DePrueba();
  await web(db, { id: 's1', cobros: 1, dni: '11111111' });
  await externa(db, { pre: 'abc', cobros: 1 });
  await web(db, { id: 's3', cobros: 3, dni: '33333333' });
  await web(db, { id: 's4', cobros: 2, dni: '44444444' });
  await desde(db, '2026-11-01T00:00:00.000Z');
  assert.deepEqual((await citas.filasPorAgendar(db, t0)).map((f) => f.clave), ['x:abc', 's:s3', 's:s4', 's:s1']);
  await db.prepare("INSERT INTO suscripcion_cobros (id, suscripcion_id, mp_payment_id, numero, estado, monto_centimos, creado_en) VALUES ('z', 's1', 'z', 2, 'approved', 36000, '2026-11-02T00:00:00.000Z')").run();
  assert.equal((await citas.filasPorAgendar(db, t0))[0].clave, 's:s1');
});

test('quitar paciente: la hecha a mano vuelve a «sin asignar», conserva sus cobros y suelta las citas de ese link', async () => {
  const db = d1DePrueba();
  await externa(db);
  await agendar(db, { clave: 'x:abc', cita: '2' });
  await citas.ajustar(db, { clave: 'x:abc', cantidad: -3, motivo: 'del paciente equivocado', por: 'r@x.pe', ahora: t0 });
  assert.equal(await citas.quitarPaciente(db, { clave: 'x:abc', ahora: t0 }), true);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM citas_ajustes').first()).n, 0);
  const f = await de(db, 'x:abc');
  assert.deepEqual([f.sin_asignar, f.nombre, f.cobros, f.faltan], [true, null, 2, null]);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM links_agenda WHERE sus_clave IS NOT NULL').first()).n, 0);
  assert.equal(await citas.quitarPaciente(db, { clave: 's:s1', ahora: t0 }), false);
});
