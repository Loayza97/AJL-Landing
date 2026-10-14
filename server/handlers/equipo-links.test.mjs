import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1DePrueba } from '../reservas/d1-prueba.mjs';
import { nutricionistas } from '../../src/data/nutricionistas.js';
import * as agenda from '../agenda/repo.mjs';
import { handleLinks, handleLinksReactivar, handleLinksBorrar, handleAgendados, handleAgendadosCsv } from './equipo-links.mjs';

const t0 = new Date('2026-10-12T20:00:00Z');
const env = { PUBLIC_SITE_URL: 'https://www.ajlnutricion.com' };
const dentro = async () => ({ ok: true, email: 'romi@x.pe' });
const fuera = async () => ({ ok: false });
const deps = (o = {}) => ({ db: d1DePrueba(), ahora: () => t0, nutricionistas, acceso: dentro, ...o });
const get = (ruta) => new Request(`https://x.test${ruta}`);
const post = (ruta, cuerpo) => new Request(`https://x.test${ruta}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
const lucia = { nombre: 'Lucía Ramos Quispe', nombres: 'Lucía', apellido_paterno: 'Ramos', apellido_materno: 'Quispe', fecha_nacimiento: '1992-03-08',
  tipo_documento: 'dni', dni: '70123456', whatsapp: '+51987654321', email: 'lucia@x.pe' };

async function sembrar(d) {
  const crear = (id, creado) => agenda.crearLink(d.db, { id, tokenHash: `h-${id}`, tipo: 'c30v', creadoPor: 'romi@x.pe', ahora: new Date(creado),
    plan: 'constancia:3', cita: '2' });
  await crear('sin', '2026-10-12T14:00:00Z');
  await crear('venc', '2026-10-01T14:00:00Z');
  await crear('viejo', '2026-08-01T14:00:00Z');
  await crear('usado', '2026-10-10T14:00:00Z');
  await agenda.agendarConLink(d.db, { link: 'usado', reservaId: 'r-lucia', token: 'tl', tipoId: 'c30v', cliente: lucia, clienteId: 'c-lucia',
    hora: { inicio: '2026-10-14T15:00:00Z', fin: '2026-10-14T15:30:00Z', nutricionista_id: 'nico', modalidad: 'video', fecha_lima: '2026-10-14', duracion_min: 30 },
    pacienteNuevo: true, condicionesVersion: 'v', ahora: new Date('2026-10-10T15:00:00Z') });
}

test('sin acceso: 401 en todo y no se lee nada', async () => {
  const d = deps({ acceso: fuera, db: { prepare() { throw new Error('no debía leer'); } } });
  for (const r of [await handleLinks(get('/api/equipo/links'), env, d), await handleLinks(post('/api/equipo/links', { tipo: 'c30v' }), env, d),
    await handleLinksReactivar(post('/api/equipo/links-reactivar', { id: 'x' }), env, d), await handleAgendados(get('/api/equipo/agendados'), env, d),
    await handleLinksBorrar(post('/api/equipo/links-borrar', { id: 'x' }), env, d),
    await handleAgendadosCsv(get('/api/equipo/agendados-csv?ids=x'), env, d)]) assert.equal(r.status, 401);
});

test('crear: devuelve la URL una sola vez; en la base solo queda el hash', async () => {
  const d = deps();
  const r = await (await handleLinks(post('/api/equipo/links', { tipo: 's60', plan: 'constancia:3', cita: '2' }), env, d)).json();
  assert.match(r.url, /^https:\/\/www\.ajlnutricion\.com\/agenda\/\?l=[\w-]{20,}$/);
  const token = new URL(r.url).searchParams.get('l');
  const fila = await d.db.prepare('SELECT * FROM links_agenda').first();
  assert.notEqual(fila.token_hash, token);
  assert.equal(fila.creado_por, 'romi@x.pe');
  assert.deepEqual([fila.plan, fila.cita], ['constancia:3', '2']);
  assert.equal((await handleLinks(post('/api/equipo/links', { tipo: 'zzz', plan: 'otro', cita: '1' }), env, d)).status, 400);
});

test('crear: plan y cita son obligatorios y salen de las listas (400 si no)', async () => {
  const d = deps();
  // «Otro» ya no se ofrece; la cita no puede pasar el total del plan (3 meses: 3 + 2 + 2 = 7).
  for (const cuerpo of [{ tipo: 's60' }, { tipo: 's60', plan: 'evaluacion' }, { tipo: 's60', cita: '1' }, { tipo: 's60', plan: 'zzz', cita: '1' },
    { tipo: 's60', plan: 'otro', cita: '1' }, { tipo: 's60', plan: 'acompanamiento:3', cita: '8' }, { tipo: 's60', plan: 'evaluacion', cita: '2' },
    { tipo: 's60', plan: '__proto__', cita: '1' }, { tipo: 's60', plan: 'basico', cita: 1 }, { tipo: 's60', plan: 'basico', cita: 'evaluacion_mes' }]) {
    const r = await handleLinks(post('/api/equipo/links', cuerpo), env, d);
    assert.equal(r.status, 400, JSON.stringify(cuerpo));
    assert.match((await r.json()).error, /producto|cita/i);
  }
  assert.equal(await d.db.prepare('SELECT 1 FROM links_agenda').first(), null);
  assert.equal((await handleLinks(post('/api/equipo/links', { tipo: 'c30p', plan: 'transformacion:6', cita: '13' }), env, d)).status, 200);
  assert.equal((await handleLinks(post('/api/equipo/links', { tipo: 'c30p', plan: 'constancia:1', cita: 'evaluacion_mes' }), env, d)).status, 400);
});

test('listar: por defecto 30 días (el vencido viejo no sale), con conteos por estado y datos del agendado', async () => {
  const d = deps();
  await sembrar(d);
  const r = await (await handleLinks(get('/api/equipo/links'), env, d)).json();
  assert.equal(r.email, 'romi@x.pe');
  assert.deepEqual(r.filas.map((f) => [f.id, f.estado]), [['sin', 'sin_usar'], ['usado', 'agendado'], ['venc', 'vencido']]);
  assert.deepEqual(r.conteos, { todos: 3, sin_usar: 1, agendado: 1, vencido: 1 });
  assert.equal(r.filas[1].paciente, 'Ramos Quispe, Lucía');
  assert.deepEqual([r.filas[0].plan, r.filas[0].cita_link], ['Constancia, 3 meses', '2 de 7']);
  const todo = await (await handleLinks(get('/api/equipo/links?periodo=todo&estado=vencido'), env, d)).json();
  assert.deepEqual(todo.filas.map((f) => f.id), ['venc', 'viejo']);
});

test('listar: buscar por apellido o DNI', async () => {
  const d = deps();
  await sembrar(d);
  for (const q of ['ramos', '7012']) {
    const r = await (await handleLinks(get(`/api/equipo/links?q=${q}`), env, d)).json();
    assert.deepEqual(r.filas.map((f) => f.id), ['usado'], q);
  }
});

test('buscar sin tildes ni mayúsculas: «maria» halla «María», «ramirez» halla «RAMÍREZ», «nunez» halla «NÚÑEZ»', async () => {
  const d = deps();
  await sembrar(d);
  await agenda.crearLink(d.db, { id: 'usado2', tokenHash: 'h-usado2', tipo: 'c30v', creadoPor: 'romi@x.pe', ahora: new Date('2026-10-11T14:00:00Z') });
  const maria = { ...lucia, nombre: 'María RAMÍREZ NÚÑEZ', nombres: 'María', apellido_paterno: 'RAMÍREZ', apellido_materno: 'NÚÑEZ', dni: '01234567', email: 'maria@x.pe' };
  await agenda.agendarConLink(d.db, { link: 'usado2', reservaId: 'r-maria', token: 'tm', tipoId: 'c30v', cliente: maria, clienteId: 'c-maria',
    hora: { inicio: '2026-10-15T15:00:00Z', fin: '2026-10-15T15:30:00Z', nutricionista_id: 'nico', modalidad: 'video', fecha_lima: '2026-10-15', duracion_min: 30 },
    pacienteNuevo: true, condicionesVersion: 'v', ahora: new Date('2026-10-11T15:00:00Z') });
  for (const q of ['maria', 'ramirez', 'nunez', 'MARÍA', 'Ramírez Núñez']) {
    const links = await (await handleLinks(get(`/api/equipo/links?q=${encodeURIComponent(q)}`), env, d)).json();
    assert.deepEqual(links.filas.map((f) => f.id), ['usado2'], `links ${q}`);
    const ags = await (await handleAgendados(get(`/api/equipo/agendados?q=${encodeURIComponent(q)}`), env, d)).json();
    assert.deepEqual(ags.filas.map((f) => f.id), ['r-maria'], `agendados ${q}`);
  }
  const lu = await (await handleAgendados(get('/api/equipo/agendados?q=lucia'), env, d)).json();
  assert.deepEqual(lu.filas.map((f) => f.id), ['r-lucia']);
  // Nombre guardado en forma descompuesta (letra + tilde suelta).
  await d.db.prepare("UPDATE clientes SET nombre = ?1 WHERE id = 'c-maria'").bind('María Ramírez'.normalize('NFD')).run();
  const nfd = await (await handleAgendados(get('/api/equipo/agendados?q=maria%20ramirez'), env, d)).json();
  assert.deepEqual(nfd.filas.map((f) => f.id), ['r-maria']);
});

test('reactivar: el vencido vuelve a «sin usar» y aparece en los 30 días; uno vigente da 409', async () => {
  const d = deps();
  await sembrar(d);
  const r = await (await handleLinksReactivar(post('/api/equipo/links-reactivar', { id: 'viejo' }), env, d)).json();
  assert.equal(r.vence_en, '2026-10-15T20:00:00.000Z');
  const lista = await (await handleLinks(get('/api/equipo/links?estado=sin_usar'), env, d)).json();
  assert.deepEqual(lista.filas.map((f) => f.id).sort(), ['sin', 'viejo']);
  assert.equal((await handleLinksReactivar(post('/api/equipo/links-reactivar', { id: 'sin' }), env, d)).status, 409);
});

test('agendados: próximas con datos completos; pasadas vacío; paginación de 20', async () => {
  const d = deps();
  await sembrar(d);
  const r = await (await handleAgendados(get('/api/equipo/agendados'), env, d)).json();
  assert.equal(r.total, 1);
  const f = r.filas[0];
  assert.deepEqual([f.apellido_paterno, f.nombres, f.dni, f.email, f.whatsapp, f.fecha_nacimiento, f.paciente_nuevo, f.tipo, f.nutricionista, f.modalidad],
    ['Ramos', 'Lucía', '70123456', 'lucia@x.pe', '+51987654321', '1992-03-08', 1, 'Control de 30 min', 'Nico', 'video']);
  assert.deepEqual([f.plan, f.cita], ['Constancia, 3 meses', '2 de 7']);
  assert.equal((await (await handleAgendados(get('/api/equipo/agendados?tramo=pasadas'), env, d)).json()).total, 0);
  assert.equal(r.por_pagina, 20);
});

test('csv: solo los ids pedidos, con columnas en el orden del formulario y DNI como texto', async () => {
  const d = deps();
  await sembrar(d);
  const res = await handleAgendadosCsv(get('/api/equipo/agendados-csv?ids=r-lucia,otro'), env, d);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('Content-Disposition'), /agendados-ajl-2026-10-12\.csv/);
  const texto = await res.text();
  const lineas = texto.replace(/^﻿/, '').trim().split('\r\n');
  // Sin la fila «sep=,» (Google Sheets la importaría como datos): la primera línea son los encabezados.
  assert.equal(lineas[0], 'Cita (Lima),Evento,Modalidad,Nutricionista,Plan,Cita,Apellido paterno,Apellido materno,Nombres,DNI,Correo,WhatsApp,Fecha de nacimiento,Paciente');
  assert.equal(lineas.length, 2);
  // DNI y WhatsApp como fórmula de texto ="…": Sheets y Excel conservan el cero inicial y el +.
  assert.match(lineas[1], /,Nico,"Constancia, 3 meses",2 de 7,Ramos,Quispe,Lucía,"=""70123456""",lucia@x\.pe,"=""\+51987654321""",1992-03-08,Nuevo$/);
  assert.equal((await handleAgendadosCsv(get('/api/equipo/agendados-csv?ids='), env, d)).status, 400);
});

test('csv: DNI con cero inicial queda como texto; un valor raro no se vuelve fórmula', async () => {
  const d = deps();
  await sembrar(d);
  await d.db.prepare(`UPDATE clientes SET dni = '01234567', whatsapp = '=HYPERLINK("x")' WHERE id = 'c-lucia'`).run();
  const lineas = (await (await handleAgendadosCsv(get('/api/equipo/agendados-csv?ids=r-lucia'), env, d)).text()).trim().split('\r\n');
  assert.match(lineas[1], /,"=""01234567""",lucia@x\.pe,"'=HYPERLINK\(""x""\)",/);
});

test('csv: 150 ids van en una sola consulta con un solo parámetro (D1 admite 100); 201 da 400', async () => {
  const d = deps();
  await sembrar(d);
  const binds = [];
  const prepare = d.db.prepare;
  d.db.prepare = (sql) => { const s = prepare(sql); return { ...s, bind: (...p) => { binds.push(p.length); return s.bind(...p); } }; };
  const ids = ['r-lucia', ...Array.from({ length: 149 }, (_, i) => `x${i}`)];
  const res = await handleAgendadosCsv(get(`/api/equipo/agendados-csv?ids=${ids.join(',')}`), env, d);
  assert.equal(res.status, 200);
  assert.deepEqual(binds, [1]);
  assert.equal((await res.text()).trim().split('\r\n').length, 2); // encabezados + Lucía
  const muchos = Array.from({ length: 201 }, (_, i) => `x${i}`).join(',');
  assert.equal((await handleAgendadosCsv(get(`/api/equipo/agendados-csv?ids=${muchos}`), env, d)).status, 400);
});

test('listar: la respuesta dice si quien entró es súper usuario', async () => {
  assert.equal((await (await handleLinks(get('/api/equipo/links'), env, deps())).json()).admin, false);
  const admin = async () => ({ ok: true, email: 'ale@x.pe', admin: true });
  assert.equal((await (await handleLinks(get('/api/equipo/links'), env, deps({ acceso: admin }))).json()).admin, true);
});

// Caso del preview (13-oct, 22:05 Lima): link «Agendado» y la tabla Agendados
// vacía. La API sí la devuelve (la tabla quedó vieja en el navegador); esto fija
// las mismas formas: creado_en con milisegundos, inicio_utc sin ellos.
test('agendados: una cita recién agendada sale en próximas · 30 días con las mismas formas del preview', async () => {
  const ahora = new Date('2026-10-14T03:05:49.799Z');
  const d = deps({ ahora: () => ahora });
  await agenda.crearLink(d.db, { id: 'L', tokenHash: 'h-L', tipo: 'c30v', creadoPor: 'romi@x.pe', ahora: new Date('2026-10-14T02:53:58.232Z') });
  const koc = { ...lucia, nombre: 'prueba koc lopez', nombres: 'prueba', apellido_paterno: 'koc', apellido_materno: 'lopez' };
  assert.deepEqual(await agenda.agendarConLink(d.db, { link: 'L', reservaId: 'R', token: 'tk', tipoId: 'c30v', cliente: koc, clienteId: 'C',
    hora: { inicio: '2026-10-14T16:30:00Z', fin: '2026-10-14T17:00:00Z', nutricionista_id: 'nico', modalidad: 'video', fecha_lima: '2026-10-14', duracion_min: 30 },
    pacienteNuevo: true, condicionesVersion: 'v', ahora: new Date('2026-10-14T03:01:56.041Z') }), { ok: true });
  const links = await (await handleLinks(get('/api/equipo/links?periodo=30&estado=todos&pagina=1'), env, d)).json();
  assert.deepEqual(links.filas.map((f) => [f.estado, f.paciente, f.cita]), [['agendado', 'koc lopez, prueba', 'miércoles, 14 de octubre, 11:30 a. m.']]);
  const ags = await (await handleAgendados(get('/api/equipo/agendados?periodo=30&tramo=proximas&pagina=1'), env, d)).json();
  assert.deepEqual([ags.total, ags.filas[0]?.id, ags.filas[0]?.etiqueta], [1, 'R', 'miércoles, 14 de octubre, 11:30 a. m.']);
});

test('borrar: sin sesión 401 sin leer la base', async () => {
  const d = deps({ acceso: fuera, db: { prepare() { throw new Error('no debía leer'); } } });
  assert.equal((await handleLinksBorrar(post('/api/equipo/links-borrar', { id: 'sin' }), env, d)).status, 401);
});

test('borrar: el sin usar y el vencido se borran y los conteos bajan; el usado da 409; uno que no existe, 404', async () => {
  const d = deps();
  await sembrar(d);
  const borrar = (id) => handleLinksBorrar(post('/api/equipo/links-borrar', { id }), env, d);
  const r = await borrar('sin');
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true });
  assert.equal((await borrar('venc')).status, 200);
  const usado = await borrar('usado');
  assert.equal(usado.status, 409);
  assert.match((await usado.json()).error, /ya se usó/);
  assert.equal((await borrar('sin')).status, 404);
  assert.equal((await borrar('no-existe')).status, 404);
  assert.equal((await handleLinksBorrar(post('/api/equipo/links-borrar', { id: 7 }), env, d)).status, 400);
  assert.equal((await handleLinksBorrar(get('/api/equipo/links-borrar'), env, d)).status, 405);
  const lista = await (await handleLinks(get('/api/equipo/links'), env, d)).json();
  assert.deepEqual(lista.filas.map((f) => f.id), ['usado']);
  assert.deepEqual(lista.conteos, { todos: 1, sin_usar: 0, agendado: 1, vencido: 0 });
  // El link borrado ya no se encuentra por su hash: la agenda del paciente da «Este link no existe».
  assert.equal(await agenda.linkPorHash(d.db, 'h-sin'), null);
});

test('links viejos sin plan ni cita: agendados y CSV muestran «—», la lista los deja vacíos', async () => {
  const d = deps();
  await agenda.crearLink(d.db, { id: 'old', tokenHash: 'h-old', tipo: 'c30v', creadoPor: 'romi@x.pe', ahora: new Date('2026-10-10T14:00:00Z') });
  await agenda.agendarConLink(d.db, { link: 'old', reservaId: 'r-old', token: 'to', tipoId: 'c30v', cliente: lucia, clienteId: 'c-old',
    hora: { inicio: '2026-10-14T15:00:00Z', fin: '2026-10-14T15:30:00Z', nutricionista_id: 'nico', modalidad: 'video', fecha_lima: '2026-10-14', duracion_min: 30 },
    pacienteNuevo: true, condicionesVersion: 'v', ahora: new Date('2026-10-10T15:00:00Z') });
  const f = (await (await handleAgendados(get('/api/equipo/agendados'), env, d)).json()).filas[0];
  assert.deepEqual([f.plan, f.cita], ['—', '—']);
  const l = (await (await handleLinks(get('/api/equipo/links'), env, d)).json()).filas[0];
  assert.deepEqual([l.plan, l.cita_link], [null, null]);
  const csv = (await (await handleAgendadosCsv(get('/api/equipo/agendados-csv?ids=r-old'), env, d)).text()).trim().split('\r\n');
  assert.match(csv[1], /,Nico,—,—,Ramos,/);
});

test('crear: cualquier tipo admite la 1ra cita (venta por WhatsApp)', async () => {
  const d = deps();
  for (const tipo of ['c30v', 'c30p', 's60']) {
    assert.equal((await handleLinks(post('/api/equipo/links', { tipo, plan: 'evaluacion', cita: '1' }), env, d)).status, 200, tipo);
  }
});

test('crear: la nutricionista sugerida va por turnos y vuelve a empezar', async () => {
  const d = deps();
  const ids = d.nutricionistas.map((n) => n.id);
  const vistas = [];
  for (let i = 0; i < ids.length + 1; i++) {
    await handleLinks(post('/api/equipo/links', { tipo: 's60', plan: 'basico', cita: '1' }), env, d);
    vistas.push((await d.db.prepare('SELECT nutri_sugerida AS n FROM links_agenda ORDER BY rowid DESC LIMIT 1').first()).n);
  }
  assert.deepEqual(vistas, [...ids, ids[0]]);
});
