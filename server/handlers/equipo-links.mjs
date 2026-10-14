// ─── Panel del equipo · links de agenda ─────────────────────────────────────
// GET  /api/equipo/links             links con filtro, búsqueda, periodo y páginas
// POST /api/equipo/links             crea un link (la URL solo se ve aquí)
// POST /api/equipo/links-reactivar   +3 días a un link vencido sin usar
// POST /api/equipo/links-borrar      borra un link sin usar (vigente o vencido)
// GET  /api/equipo/agendados         citas agendadas con link, con datos del paciente
// GET  /api/equipo/agendados-csv     las elegidas, en CSV para Google Sheets o Excel
// Todas exigen sesión del equipo antes de leer nada.
import { json, readJson, siteUrl } from '../http.mjs';
import { randomToken, sha256Hex } from '../tokens.mjs';
import { TIPOS_LINK, tipoDeReserva } from '../agenda/tipos.mjs';
import * as agenda from '../agenda/repo.mjs';
import { rangoPeriodo } from '../agenda/periodo.mjs';
import { etiquetaLima, fechaLima } from '../reservas/tiempo.mjs';
import { celda, lima } from './equipo.mjs';

const POR_PAGINA = 20;
const MAX_CSV = 200; // ids por descarga: D1 recibe la lista en un solo parámetro JSON
const ESTADOS = ['sin_usar', 'agendado', 'vencido'];
const sinAcceso = () => json(401, { ok: false, error: 'Necesitas entrar con un correo autorizado del equipo.' });
const bad = (status, error) => json(status, { ok: false, error });

// Búsqueda sin tildes ni mayúsculas, sin migración: el texto buscado se
// normaliza en JS y la columna en SQL con la misma tabla de letras (SQLite
// lower() solo baja ASCII y no quita tildes).
const sinMarcas = (t) => String(t || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const LETRAS = [['á', 'a'], ['é', 'e'], ['í', 'i'], ['ó', 'o'], ['ú', 'u'], ['ü', 'u'], ['ñ', 'n'],
  ['Á', 'a'], ['É', 'e'], ['Í', 'i'], ['Ó', 'o'], ['Ú', 'u'], ['Ü', 'u'], ['Ñ', 'n'],
  // Tildes sueltas (texto escrito en forma descompuesta, como en algunos teclados de Apple).
  ['\u0301', ''], ['\u0303', ''], ['\u0308', '']];
const sinTildesSql = (expr) => LETRAS.reduce((e, [de, a]) => `replace(${e}, '${de}', '${a}')`, `lower(${expr})`);

function busqueda(q) {
  const s = sinMarcas(q).trim().replace(/[\\%_]/g, (c) => `\\${c}`);
  return s.length >= 2 ? `%${s}%` : '';
}
const pagina = (p) => Math.max(1, Math.min(1000, Number.parseInt(p, 10) || 1));
const nombreCompleto = (r) => (r.nombres ? `${[r.apellido_paterno, r.apellido_materno].filter(Boolean).join(' ')}, ${r.nombres}` : null);
const filtroTexto = `(?3 = '' OR ${sinTildesSql("COALESCE(c.nombre, '') || ' ' || COALESCE(c.dni, '')")} LIKE ?3 ESCAPE '\\')`;

const BASE_LINKS = `SELECT l.id, l.tipo, l.creado_en, l.vence_en, l.reactivado_en, l.usado_en,
    CASE WHEN l.usado_en IS NOT NULL THEN 'agendado' WHEN l.vence_en <= ?4 THEN 'vencido' ELSE 'sin_usar' END AS estado,
    COALESCE(l.reactivado_en, l.creado_en) AS actividad,
    r.inicio_utc, r.modalidad, r.nutricionista_id, c.nombres, c.apellido_paterno, c.apellido_materno, c.dni
  FROM links_agenda l LEFT JOIN reservas r ON r.id = l.reserva_id LEFT JOIN clientes c ON c.id = r.cliente_id
  WHERE (?1 IS NULL OR COALESCE(l.reactivado_en, l.creado_en) >= ?1) AND (?2 IS NULL OR COALESCE(l.reactivado_en, l.creado_en) < ?2)
    AND ${filtroTexto}`;

async function listarLinks(request, deps, { email, admin }) {
  const q = new URL(request.url).searchParams;
  const rango = rangoPeriodo({ periodo: q.get('periodo') || '30', desde: q.get('desde'), hasta: q.get('hasta') }, deps.ahora(), 'pasado');
  const estado = q.get('estado') || 'todos';
  if (!rango || (estado !== 'todos' && !ESTADOS.includes(estado))) return bad(400, 'Filtros inválidos');
  const p = pagina(q.get('pagina'));
  const args = [rango.desde, rango.hasta, busqueda(q.get('q')), deps.ahora().toISOString()];
  const { results: grupos } = await deps.db.prepare(`SELECT estado, COUNT(*) AS n FROM (${BASE_LINKS}) GROUP BY estado`).bind(...args).all();
  const conteos = { todos: 0, sin_usar: 0, agendado: 0, vencido: 0 };
  for (const g of grupos) { conteos[g.estado] = g.n; conteos.todos += g.n; }
  const { results } = await deps.db.prepare(
    `SELECT * FROM (${BASE_LINKS}) WHERE (?5 = 'todos' OR estado = ?5) ORDER BY actividad DESC LIMIT ${POR_PAGINA} OFFSET ?6`,
  ).bind(...args, estado, (p - 1) * POR_PAGINA).all();
  const filas = results.map((r) => ({
    id: r.id, tipo: r.tipo, nombre_tipo: TIPOS_LINK[r.tipo].nombre, etiqueta_tipo: TIPOS_LINK[r.tipo].etiqueta, estado: r.estado,
    creado_en: r.creado_en, vence_en: r.vence_en, reactivado_en: r.reactivado_en, paciente: nombreCompleto(r),
    cita: r.inicio_utc ? etiquetaLima(r.inicio_utc) : null,
  }));
  return json(200, { ok: true, email, admin: admin === true, filas, conteos, total: estado === 'todos' ? conteos.todos : conteos[estado], pagina: p, por_pagina: POR_PAGINA });
}

async function crearLink(request, env, deps, email) {
  const d = await readJson(request);
  if (!Object.hasOwn(TIPOS_LINK, d.tipo)) return bad(400, 'Tipo de evento inválido');
  const token = randomToken();
  const id = crypto.randomUUID();
  const { vence_en } = await agenda.crearLink(deps.db, { id, tokenHash: await sha256Hex(token), tipo: d.tipo, creadoPor: email, ahora: deps.ahora() });
  return json(200, { ok: true, id, tipo: d.tipo, vence_en, url: `${siteUrl(env)}/agenda/?l=${token}` });
}

export async function handleLinks(request, env, deps) {
  if (!['GET', 'POST'].includes(request.method)) return bad(405, 'Método no permitido');
  const acceso = await deps.acceso(request, env);
  if (!acceso.ok) return sinAcceso();
  return request.method === 'POST' ? crearLink(request, env, deps, acceso.email) : listarLinks(request, deps, acceso);
}

export async function handleLinksReactivar(request, env, deps) {
  if (request.method !== 'POST') return bad(405, 'Método no permitido');
  const acceso = await deps.acceso(request, env);
  if (!acceso.ok) return sinAcceso();
  const d = await readJson(request);
  if (typeof d.id !== 'string') return bad(400, 'Datos inválidos');
  const vence = await agenda.reactivarLink(deps.db, d.id, deps.ahora());
  if (!vence) return bad(409, 'Este link no se puede reactivar: está vigente o ya se usó.');
  return json(200, { ok: true, vence_en: vence });
}

export async function handleLinksBorrar(request, env, deps) {
  if (request.method !== 'POST') return bad(405, 'Método no permitido');
  const acceso = await deps.acceso(request, env);
  if (!acceso.ok) return sinAcceso();
  const d = await readJson(request);
  if (typeof d.id !== 'string') return bad(400, 'Datos inválidos');
  const r = await agenda.borrarLink(deps.db, d.id);
  if (r === 'usado') return bad(409, 'Este link ya se usó: no se puede borrar.');
  if (!r) return bad(404, 'Este link ya no existe.');
  return json(200, { ok: true });
}

const CAMPOS_AGENDADO = `r.id, r.producto, r.inicio_utc, r.modalidad, r.nutricionista_id, l.paciente_nuevo,
  c.apellido_paterno, c.apellido_materno, c.nombres, c.dni, c.email, c.whatsapp, c.fecha_nacimiento`;
const FROM_AGENDADO = `FROM reservas r JOIN links_agenda l ON l.reserva_id = r.id JOIN clientes c ON c.id = r.cliente_id
  WHERE r.estado = 'confirmada'`;

const vistaAgendado = (r, deps) => ({
  id: r.id, inicio_utc: r.inicio_utc, etiqueta: etiquetaLima(r.inicio_utc), tipo: tipoDeReserva(r)?.nombre ?? r.producto,
  modalidad: r.modalidad, nutricionista: deps.nutricionistas.find((n) => n.id === r.nutricionista_id)?.nombre ?? r.nutricionista_id,
  apellido_paterno: r.apellido_paterno, apellido_materno: r.apellido_materno, nombres: r.nombres, dni: r.dni, email: r.email,
  whatsapp: r.whatsapp, fecha_nacimiento: r.fecha_nacimiento, paciente_nuevo: r.paciente_nuevo,
});

export async function handleAgendados(request, env, deps) {
  if (request.method !== 'GET') return bad(405, 'Método no permitido');
  const acceso = await deps.acceso(request, env);
  if (!acceso.ok) return sinAcceso();
  const q = new URL(request.url).searchParams;
  const tramo = q.get('tramo') || 'proximas';
  if (!['proximas', 'pasadas'].includes(tramo)) return bad(400, 'Filtros inválidos');
  const ahoraIso = deps.ahora().toISOString();
  const rango = rangoPeriodo({ periodo: q.get('periodo') || '30', desde: q.get('desde'), hasta: q.get('hasta') }, deps.ahora(),
    tramo === 'proximas' ? 'futuro' : 'pasado');
  if (!rango) return bad(400, 'Filtros inválidos');
  const p = pagina(q.get('pagina'));
  const donde = `${FROM_AGENDADO}
    AND (?1 IS NULL OR r.inicio_utc >= ?1) AND (?2 IS NULL OR r.inicio_utc < ?2) AND ${filtroTexto}
    AND ${tramo === 'proximas' ? 'r.inicio_utc >= ?4' : 'r.inicio_utc < ?4'}`;
  const args = [rango.desde, rango.hasta, busqueda(q.get('q')), ahoraIso];
  const { n } = await deps.db.prepare(`SELECT COUNT(*) AS n ${donde}`).bind(...args).first();
  const { results } = await deps.db.prepare(
    `SELECT ${CAMPOS_AGENDADO} ${donde} ORDER BY r.inicio_utc ${tramo === 'proximas' ? 'ASC' : 'DESC'} LIMIT ${POR_PAGINA} OFFSET ?5`,
  ).bind(...args, (p - 1) * POR_PAGINA).all();
  return json(200, { ok: true, filas: results.map((r) => vistaAgendado(r, deps)), total: n, pagina: p, por_pagina: POR_PAGINA });
}

// DNI y WhatsApp como texto en Google Sheets y en Excel: la celda va como
// fórmula ="…" (las dos la muestran como texto y conservan el cero inicial y el +).
// Solo se arma con letras y dígitos, así que no se puede colar otra fórmula;
// cualquier otra cosa sale como celda normal (neutralizada).
const textoFijo = (v) => {
  const s = String(v ?? '');
  return /^\+?[0-9A-Za-z]{1,20}$/.test(s) ? `"=""${s}"""` : celda(s);
};

export async function handleAgendadosCsv(request, env, deps) {
  if (request.method !== 'GET') return bad(405, 'Método no permitido');
  const acceso = await deps.acceso(request, env);
  if (!acceso.ok) return sinAcceso();
  const ids = String(new URL(request.url).searchParams.get('ids') || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!ids.length || ids.length > MAX_CSV) return bad(400, `Elige entre 1 y ${MAX_CSV} citas.`);
  // Un solo parámetro JSON: D1 no acepta más de 100 parámetros por consulta.
  const { results } = await deps.db.prepare(
    `SELECT ${CAMPOS_AGENDADO} ${FROM_AGENDADO} AND r.id IN (SELECT value FROM json_each(?1)) ORDER BY r.inicio_utc`,
  ).bind(JSON.stringify(ids)).all();
  const cab = ['Cita (Lima)', 'Evento', 'Modalidad', 'Nutricionista', 'Apellido paterno', 'Apellido materno', 'Nombres', 'DNI', 'Correo',
    'WhatsApp', 'Fecha de nacimiento', 'Paciente'];
  const filas = results.map((r) => {
    const v = vistaAgendado(r, deps);
    return [celda(lima(v.inicio_utc)), celda(v.tipo), celda(v.modalidad === 'video' ? 'Videollamada' : 'Presencial'), celda(v.nutricionista),
      celda(v.apellido_paterno), celda(v.apellido_materno), celda(v.nombres), textoFijo(v.dni), celda(v.email), textoFijo(v.whatsapp),
      celda(v.fecha_nacimiento), celda(v.paciente_nuevo ? 'Nuevo' : 'Ya paciente')].join(',');
  });
  // Sin «sep=,»: es una directiva de Excel y Google Sheets la importa como una fila más.
  const csv = [cab.map(celda).join(','), ...filas].join('\r\n');
  return new Response(`﻿${csv}\r\n`, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="agendados-ajl-${fechaLima(deps.ahora())}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
