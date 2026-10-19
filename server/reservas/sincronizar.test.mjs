import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1DePrueba } from './d1-prueba.mjs';
import * as repo from './repo.mjs';
import { compararEvento, textoCambios, sincronizarCalendario, CURSOR, MAX_CAMBIOS_POR_CORRIDA } from './sincronizar.mjs';

const ahora = new Date('2026-10-19T17:00:00Z');
const r = { id: 'r1', estado: 'confirmada', inicio_utc: '2026-10-21T15:00:00Z', fin_utc: '2026-10-21T15:30:00Z', duracion_min: 30,
  fecha_lima: '2026-10-21', modalidad: 'presencial', nutricionista_id: 'jussara', calendario_revisar: null };
const c = (o = {}) => ({ id: 'ev1', borrado: false, reservaId: 'r1', inicio: '2026-10-21T15:00:00Z', fin: '2026-10-21T15:30:00Z',
  meet: false, ubicacion: true, ...o });

test('compararEvento: sin cambios, reserva inexistente o no confirmada → ignorar', () => {
  assert.deepEqual(compararEvento(r, c()), { accion: 'ignorar' });
  assert.deepEqual(compararEvento(null, c()), { accion: 'ignorar' });
  assert.deepEqual(compararEvento({ ...r, estado: 'cancelada' }, c({ inicio: '2026-10-21T14:00:00Z' })), { accion: 'ignorar' });
});

test('compararEvento: caso Cecilia, 10:00 presencial → 9:00 virtual', () => {
  const d = compararEvento(r, c({ inicio: '2026-10-21T14:00:00Z', fin: '2026-10-21T14:30:00Z', meet: true, ubicacion: false }));
  assert.deepEqual(d, { accion: 'aplicar', texto: '10:00 → 9:00 · presencial → virtual',
    nuevo: { inicio: '2026-10-21T14:00:00Z', fin: '2026-10-21T14:30:00Z', duracion: 30, fecha: '2026-10-21', modalidad: 'video' } });
});

test('compararEvento: duración, cambio de día, virtual → presencial, sin Meet ni ubicación', () => {
  assert.equal(compararEvento(r, c({ fin: '2026-10-21T16:00:00Z' })).texto, '30 → 60 min');
  assert.equal(compararEvento(r, c({ inicio: '2026-10-22T15:00:00Z', fin: '2026-10-22T15:30:00Z' })).texto, '21/10 10:00 → 22/10 10:00');
  assert.equal(compararEvento(r, c({ inicio: '2026-10-22T15:00:00Z', fin: '2026-10-22T15:30:00Z' })).nuevo.fecha, '2026-10-22');
  const virtual = { ...r, modalidad: 'video' };
  assert.equal(compararEvento(virtual, c({ meet: false, ubicacion: true })).texto, 'virtual → presencial');
  assert.deepEqual(compararEvento(virtual, c({ meet: false, ubicacion: false })), { accion: 'ignorar' });
});

test('compararEvento: borrado, ya marcado, deshacer y día completo', () => {
  assert.deepEqual(compararEvento(r, c({ borrado: true })), { accion: 'revisar', motivo: 'borrado' });
  assert.deepEqual(compararEvento({ ...r, calendario_revisar: 'borrado' }, c({ borrado: true })), { accion: 'ignorar' });
  assert.deepEqual(compararEvento({ ...r, calendario_revisar: 'borrado' }, c()), { accion: 'quitarBorrado' });
  assert.deepEqual(compararEvento(r, c({ inicio: null, fin: null })), { accion: 'ignorar' });
});

test('compararEvento: fin_utc nulo (reservas viejas) se toma como inicio + duración', () => {
  assert.deepEqual(compararEvento({ ...r, fin_utc: null }, c()), { accion: 'ignorar' });
});

test('textoCambios: une las partes con « · »', () => {
  assert.equal(textoCambios(r, { inicio: '2026-10-21T14:00:00Z', fin: '2026-10-21T15:00:00Z', duracion: 60, fecha: '2026-10-21', modalidad: 'video' }),
    '10:00 → 9:00 · 30 → 60 min · presencial → virtual');
});

// ─── sincronizarCalendario con D1 de prueba y Google falso ───

const sembrar = (db, o = {}) => db.prepare(
  `INSERT INTO reservas (id, token, producto, duracion_meses, monto_centimos, peso_tope, nutricionista_id, inicio_utc, fin_utc, duracion_min,
     fecha_lima, modalidad, estado, retencion_hasta, creado_en, actualizado_en, google_event_id)
   VALUES (?1, ?1, 'link_c30p', 1, 0, 0, ?2, ?3, ?4, 30, ?5, ?6, 'confirmada', NULL, 'x', 'x', ?7)`,
).bind(o.id ?? 'r1', o.nutri ?? 'jussara', o.inicio ?? '2026-10-21T15:00:00Z', o.fin ?? '2026-10-21T15:30:00Z', o.fecha ?? '2026-10-21',
  o.modalidad ?? 'presencial', o.evento ?? 'ev1').run();

function deps(cambios, o = {}) {
  const pedidos = [];
  return {
    db: d1DePrueba(), ahora: () => ahora, pedidos,
    google: { listarCambios: async (desde) => { pedidos.push(desde); if (cambios instanceof Error) throw cambios; return cambios; } },
    ...o,
  };
}
const fila = (d, id = 'r1') => d.db.prepare('SELECT * FROM reservas WHERE id = ?1').bind(id).first();

test('sincronizar: aplica el caso Cecilia y guarda el cursor', async () => {
  const d = deps([c({ inicio: '2026-10-21T14:00:00Z', fin: '2026-10-21T14:30:00Z', meet: true, ubicacion: false })]);
  await sembrar(d.db);
  const res = await sincronizarCalendario(d);
  assert.deepEqual(res, { aplicados: 1, revisar: 0, fallidos: [] });
  const f = await fila(d);
  assert.equal(f.inicio_utc, '2026-10-21T14:00:00Z');
  assert.equal(f.modalidad, 'video');
  assert.equal(f.calendario_cambios, '10:00 → 9:00 · presencial → virtual');
  assert.equal(await repo.leerSync(d.db, CURSOR), ahora.toISOString());
  // Primera vez: 30 días atrás.
  assert.equal(d.pedidos[0], new Date(ahora.getTime() - 30 * 86400000).toISOString());
});

test('sincronizar: segunda vez pide desde el cursor menos 2 minutos; repetir no cambia nada', async () => {
  const cambio = c({ inicio: '2026-10-21T14:00:00Z', fin: '2026-10-21T14:30:00Z' });
  const d = deps([cambio]);
  await sembrar(d.db);
  await repo.guardarSync(d.db, CURSOR, '2026-10-19T16:50:00.000Z');
  await sincronizarCalendario(d);
  const antes = await fila(d);
  const res = await sincronizarCalendario(d);
  assert.equal(d.pedidos[0], '2026-10-19T16:48:00.000Z');
  assert.deepEqual(res, { aplicados: 0, revisar: 0, fallidos: [] });
  assert.deepEqual(await fila(d), antes);
});

test('sincronizar: borrado sin extendedProperties se encuentra por id de evento y se marca', async () => {
  const d = deps([{ id: 'ev1', borrado: true, reservaId: null, inicio: null, fin: null, meet: false, ubicacion: false }]);
  await sembrar(d.db);
  const res = await sincronizarCalendario(d);
  assert.deepEqual(res, { aplicados: 0, revisar: 1, fallidos: [] });
  const f = await fila(d);
  assert.equal(f.estado, 'confirmada');
  assert.equal(f.calendario_revisar, 'borrado');
});

test('sincronizar: eventos del equipo sin id de reserva se ignoran sin consultar', async () => {
  const d = deps([c({ id: 'manual', reservaId: null }), c({ id: 'dia', reservaId: null, inicio: null, fin: null })]);
  const res = await sincronizarCalendario(d);
  assert.deepEqual(res, { aplicados: 0, revisar: 0, fallidos: [] });
});

test('sincronizar: moverla a una hora ocupada por duración marca cruce y no mueve; sigue con los demás', async () => {
  const d = deps([
    c({ id: 'ev1', reservaId: 'r1', inicio: '2026-10-21T13:45:00Z', fin: '2026-10-21T14:15:00Z' }),
    c({ id: 'ev3', reservaId: 'r3', inicio: '2026-10-23T14:00:00Z', fin: '2026-10-23T14:30:00Z' }),
  ]);
  await sembrar(d.db, { id: 'r1', evento: 'ev1' });
  await sembrar(d.db, { id: 'r2', evento: 'ev2', inicio: '2026-10-21T14:00:00Z', fin: '2026-10-21T14:30:00Z' });
  await sembrar(d.db, { id: 'r3', evento: 'ev3', inicio: '2026-10-23T15:00:00Z', fin: '2026-10-23T15:30:00Z', fecha: '2026-10-23' });
  const res = await sincronizarCalendario(d);
  assert.deepEqual(res, { aplicados: 1, revisar: 1, fallidos: [] });
  const r1 = await fila(d, 'r1');
  assert.equal(r1.inicio_utc, '2026-10-21T15:00:00Z');
  assert.equal(r1.calendario_revisar, 'cruce');
  assert.equal(r1.calendario_cambios, '10:00 → 8:45');
  assert.equal((await fila(d, 'r3')).inicio_utc, '2026-10-23T14:00:00Z');
});

test('sincronizar: si Google falla lanza y el cursor no avanza', async () => {
  const d = deps(new Error('Google events.list 500'));
  await repo.guardarSync(d.db, CURSOR, '2026-10-19T16:50:00.000Z');
  await assert.rejects(sincronizarCalendario(d), /500/);
  assert.equal(await repo.leerSync(d.db, CURSOR), '2026-10-19T16:50:00.000Z');
});

test('sincronizar: con minIntervaloMs no corre si la última fue hace menos', async () => {
  const d = deps([]);
  await repo.guardarSync(d.db, CURSOR, new Date(ahora.getTime() - 30000).toISOString());
  assert.deepEqual(await sincronizarCalendario(d, { minIntervaloMs: 60000 }), { omitida: true });
  assert.equal(d.pedidos.length, 0);
});

test('sincronizar: un evento que falla al aplicarse se reporta y el resto sigue', async () => {
  const d = deps([c({ id: 'ev1', reservaId: 'r1', inicio: '2026-10-21T14:00:00Z', fin: '2026-10-21T14:30:00Z' })]);
  await sembrar(d.db);
  const prepareReal = d.db.prepare.bind(d.db);
  d.db.prepare = (sql) => (sql.startsWith('UPDATE reservas SET inicio_utc') ? { bind: () => ({ run: async () => { throw new Error('D1 caído'); } }) } : prepareReal(sql));
  const res = await sincronizarCalendario(d);
  assert.deepEqual(res, { aplicados: 0, revisar: 0, fallidos: ['ev1'] });
  assert.equal(await repo.leerSync(d.db, CURSOR), ahora.toISOString());
});

test('sincronizar: pasa el tiempo máximo a Google solo si se pide', async () => {
  const opciones = [];
  const d = deps([], { google: { listarCambios: async (_desde, o) => { opciones.push(o); return []; } } });
  await sincronizarCalendario(d, { timeoutMs: 3000 });
  await sincronizarCalendario(d);
  assert.deepEqual(opciones, [{ timeoutMs: 3000 }, undefined]);
});

test('sincronizar: busca todas las reservas en una sola consulta, sin una por evento', async () => {
  const cambios = [];
  const d = deps(cambios);
  for (let i = 1; i <= 5; i++) {
    await sembrar(d.db, { id: `r${i}`, evento: `ev${i}`, inicio: `2026-10-2${i}T15:00:00Z`, fin: `2026-10-2${i}T15:30:00Z`, fecha: `2026-10-2${i}` });
    cambios.push(c({ id: `ev${i}`, reservaId: `r${i}`, inicio: `2026-10-2${i}T15:00:00Z`, fin: `2026-10-2${i}T15:30:00Z` }));
  }
  const lecturas = [];
  const prepareReal = d.db.prepare.bind(d.db);
  d.db.prepare = (sql) => { if (/FROM reservas WHERE google_event_id/.test(sql)) lecturas.push(sql); return prepareReal(sql); };
  assert.deepEqual(await sincronizarCalendario(d), { aplicados: 0, revisar: 0, fallidos: [] });
  assert.equal(lecturas.length, 1);
});

test('sincronizar: evento repetido con el mismo id privado pero otro id de evento se salta', async () => {
  const d = deps([c({ id: 'copia', reservaId: 'r1', inicio: '2026-10-21T14:00:00Z', fin: '2026-10-21T14:30:00Z' })]);
  await sembrar(d.db); // r1 es del evento ev1
  const res = await sincronizarCalendario(d);
  assert.deepEqual(res, { aplicados: 0, revisar: 0, fallidos: [] });
  assert.equal((await fila(d)).inicio_utc, '2026-10-21T15:00:00Z');
});

test('sincronizar: una reserva sin evento guardado se encuentra por el id privado', async () => {
  const d = deps([c({ id: 'nuevo', reservaId: 'r1', inicio: '2026-10-21T14:00:00Z', fin: '2026-10-21T14:30:00Z' })]);
  await sembrar(d.db);
  await d.db.prepare(`UPDATE reservas SET google_event_id = NULL WHERE id = 'r1'`).run();
  assert.equal((await sincronizarCalendario(d)).aplicados, 1);
});

test('sincronizar: con más cambios que el tope atiende los primeros, no guarda el cursor y avisa pendientes; la repetición termina', async () => {
  const total = MAX_CAMBIOS_POR_CORRIDA + 3;
  const cambios = [];
  const d = deps(cambios);
  for (let i = 1; i <= total; i++) {
    const dia = String(i).padStart(2, '0');
    await sembrar(d.db, { id: `r${i}`, evento: `ev${i}`, inicio: `2026-11-${dia}T15:00:00Z`, fin: `2026-11-${dia}T15:30:00Z`, fecha: `2026-11-${dia}` });
    cambios.push(c({ id: `ev${i}`, reservaId: `r${i}`, inicio: `2026-11-${dia}T14:00:00Z`, fin: `2026-11-${dia}T14:30:00Z` }));
  }
  const res = await sincronizarCalendario(d);
  assert.deepEqual(res, { aplicados: MAX_CAMBIOS_POR_CORRIDA, revisar: 0, fallidos: [], pendientes: true });
  assert.equal(await repo.leerSync(d.db, CURSOR), null);
  assert.equal((await fila(d, 'r1')).inicio_utc, '2026-11-01T14:00:00Z');
  assert.equal((await fila(d, `r${total}`)).inicio_utc, `2026-11-${total}T15:00:00Z`);
  // Segunda corrida: lo ya aplicado no cuenta y entran los que faltaban.
  assert.deepEqual(await sincronizarCalendario(d), { aplicados: 3, revisar: 0, fallidos: [] });
  assert.equal(await repo.leerSync(d.db, CURSOR), ahora.toISOString());
});
