import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1DePrueba } from '../reservas/d1-prueba.mjs';
import { nutricionistas } from '../../src/data/nutricionistas.js';
import * as agenda from '../agenda/repo.mjs';
import { handleLinks, handleLinksReactivar, handleAgendados, handleAgendadosCsv } from './equipo-links.mjs';

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
  const crear = (id, creado) => agenda.crearLink(d.db, { id, tokenHash: `h-${id}`, tipo: 'c30v', creadoPor: 'romi@x.pe', ahora: new Date(creado) });
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
    await handleAgendadosCsv(get('/api/equipo/agendados-csv?ids=x'), env, d)]) assert.equal(r.status, 401);
});

test('crear: devuelve la URL una sola vez; en la base solo queda el hash', async () => {
  const d = deps();
  const r = await (await handleLinks(post('/api/equipo/links', { tipo: 's60' }), env, d)).json();
  assert.match(r.url, /^https:\/\/www\.ajlnutricion\.com\/agenda\/\?l=[\w-]{20,}$/);
  const token = new URL(r.url).searchParams.get('l');
  const fila = await d.db.prepare('SELECT * FROM links_agenda').first();
  assert.notEqual(fila.token_hash, token);
  assert.equal(fila.creado_por, 'romi@x.pe');
  assert.equal((await handleLinks(post('/api/equipo/links', { tipo: 'zzz' }), env, d)).status, 400);
});

test('listar: por defecto 30 días (el vencido viejo no sale), con conteos por estado y datos del agendado', async () => {
  const d = deps();
  await sembrar(d);
  const r = await (await handleLinks(get('/api/equipo/links'), env, d)).json();
  assert.equal(r.email, 'romi@x.pe');
  assert.deepEqual(r.filas.map((f) => [f.id, f.estado]), [['sin', 'sin_usar'], ['usado', 'agendado'], ['venc', 'vencido']]);
  assert.deepEqual(r.conteos, { todos: 3, sin_usar: 1, agendado: 1, vencido: 1 });
  assert.equal(r.filas[1].paciente, 'Ramos Quispe, Lucía');
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
  assert.equal(lineas[0], 'Cita (Lima),Evento,Modalidad,Nutricionista,Apellido paterno,Apellido materno,Nombres,DNI,Correo,WhatsApp,Fecha de nacimiento,Paciente');
  assert.equal(lineas.length, 2);
  // DNI y WhatsApp como fórmula de texto ="…": Sheets y Excel conservan el cero inicial y el +.
  assert.match(lineas[1], /Ramos,Quispe,Lucía,"=""70123456""",lucia@x\.pe,"=""\+51987654321""",1992-03-08,Nuevo$/);
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
