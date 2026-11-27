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
async function web(db, { id = 's1', cobros = 1, conReserva = true, producto = 'constancia', estado = 'activa' } = {}) {
  if (conReserva) {
    await repo.crearRetencion(db, { id: `r-${id}`, token: `tr-${id}`, producto, duracion_meses: 3, monto_centimos: 36000, peso_tope: 1,
      nutricionista_id: 'nico', inicio_utc: `2026-10-06T${15 + Number(id.slice(1))}:00:00Z`, fecha_lima: '2026-10-06', modalidad: 'presencial', tope: 600, ahora: t0, forma_pago: 'mensual' });
    await db.prepare("UPDATE reservas SET estado = 'confirmada' WHERE id = ?1").bind(`r-${id}`).run();
  }
  await sus.crear(db, { id, token: `t-${id}`, reserva_id: conReserva ? `r-${id}` : null, producto, duracion_meses: 3, cuota_centimos: 36000, precio_mes_centimos: 44000,
    estado: 'pendiente', nombre: 'Ana Pérez', whatsapp: '+51987654321', mp_preapproval_id: `pre-${id}`, creado_en: t0.toISOString() });
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
async function agendar(db, { clave, cita = '2', plan = 'constancia:3', paciente = ana, cpc = null }) {
  n += 1;
  const link = `L${n}`;
  await agenda.crearLink(db, { id: link, tokenHash: `h${n}`, tipo: 's60', creadoPor: 'romi@x.pe', ahora: t0, plan, cita, susClave: clave, susCpc: cpc });
  const dia = String(7 + (n % 3)).padStart(2, '0');
  const r = await agenda.agendarConLink(db, { link, reservaId: `rl${n}`, token: `tk${n}`, tipoId: 's60', cliente: paciente, clienteId: `c${n}`,
    hora: { inicio: `2026-10-${dia}T15:00:00Z`, fin: `2026-10-${dia}T16:00:00Z`, nutricionista_id: 'nico', modalidad: 'video', fecha_lima: `2026-10-${dia}`, duracion_min: 60 },
    pacienteNuevo: true, condicionesVersion: 'v', ahora: t0 });
  assert.equal(r.ok, true, JSON.stringify(r));
  return { link, reserva: `rl${n}` };
}
const de = (db, clave) => citas.filaPorClave(db, clave, t0);

test('web nueva: la cita elegida al comprar cuenta como usada y cada cobro suma las suyas', async () => {
  const db = d1DePrueba();
  await web(db, { cobros: 1 });
  let f = await de(db, 's:s1');
  assert.deepEqual([f.origen, f.nombre, f.plan, f.cobros, f.cobros_total, f.dadas, f.faltan, f.sin_asignar, f.por_revisar],
    ['web', 'Ana Pérez', 'constancia:3', 1, 3, 3, 2, false, false]);
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

test('web sin reserva (link «ya tiene cita») sale por revisar y no inventa citas; al revisar, cuenta desde ese número', async () => {
  const db = d1DePrueba();
  await web(db, { cobros: 2, conReserva: false });
  let f = await de(db, 's:s1');
  assert.deepEqual([f.por_revisar, f.faltan, f.dadas], [true, null, null]);
  assert.equal(await citas.revisar(db, { clave: 's:s1', usadas: 3, por: 'romi@x.pe', ahora: t0 }), true);
  f = await de(db, 's:s1');
  assert.deepEqual([f.por_revisar, f.dadas, f.usadas, f.faltan], [false, 5, 3, 2]);
});

test('web revisada con reserva: la primera cita ya va dentro del número revisado, no se resta dos veces', async () => {
  const db = d1DePrueba();
  await web(db, { cobros: 1 });
  await db.prepare("INSERT INTO citas_suscripcion (clave, por_revisar, actualizado_en) VALUES ('s:s1', 1, ?1)").bind(t0.toISOString()).run();
  assert.equal((await de(db, 's:s1')).por_revisar, true);
  await citas.revisar(db, { clave: 's:s1', usadas: 1, por: 'romi@x.pe', ahora: t0 });
  assert.equal((await de(db, 's:s1')).faltan, 2);
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

test('hecha a mano sin cobros aprobados no sale', async () => {
  const db = d1DePrueba();
  await externa(db, { cobros: 0 });
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

test('orden: por revisar, sin asignar y después el resto; dentro, el cobro más reciente primero', async () => {
  const db = d1DePrueba();
  await web(db, { id: 's1', cobros: 1 });
  await externa(db, { pre: 'abc', cobros: 1 });
  await web(db, { id: 's3', cobros: 1, conReserva: false });
  await web(db, { id: 's4', cobros: 2 });
  assert.deepEqual((await citas.filasPorAgendar(db, t0)).map((f) => f.clave), ['s:s3', 'x:abc', 's:s4', 's:s1']);
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
