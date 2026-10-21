// ─── Panel del equipo · links de agenda ─────────────────────────────────────
// GET  /api/equipo/links             links con filtro, búsqueda, periodo y páginas
// POST /api/equipo/links             crea un link (la URL solo se ve aquí)
// POST /api/equipo/links-reactivar   +3 días a un link vencido sin usar
// POST /api/equipo/links-borrar      borra un link sin usar (vigente o vencido)
// GET  /api/equipo/agendados         citas agendadas con link o pagadas en la web, con datos del paciente
// GET  /api/equipo/agendados-csv     las elegidas, en CSV para Google Sheets o Excel
// Todas exigen sesión del equipo antes de leer nada.
import { json, readJson, siteUrl } from '../http.mjs';
import { randomToken, sha256Hex } from '../tokens.mjs';
import { TIPOS_LINK, tipoDeReserva } from '../agenda/tipos.mjs';
import * as agenda from '../agenda/repo.mjs';
import { rangoPeriodo } from '../agenda/periodo.mjs';
import { etiquetaPlan, etiquetaCita, planValido, citaValida, PRODUCTOS } from '../agenda/opciones.mjs';
import { etiquetaLima, fechaLima } from '../reservas/tiempo.mjs';
import { celda, lima } from './equipo.mjs';
import { cotizar } from '../reservas/catalogo.mjs';
import { sincronizarCalendario, alertarFallidos } from '../reservas/sincronizar.mjs';
import { resolverRevision } from '../reservas/repo.mjs';
import { paisDeTelefono } from '../../src/data/telefono.js';

const POR_PAGINA = 20;
const MAX_CSV = 200; // ids por descarga: D1 recibe la lista en un solo parámetro JSON
const ESTADOS = ['sin_usar', 'agendado', 'vencido'];
const sinAcceso = () => json(401, { ok: false, error: 'Necesitas entrar con un correo autorizado del equipo.' });
const bad = (status, error) => json(status, { ok: false, error });
const SIN_DATO = '—'; // links creados antes de pedir plan y cita

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

const BASE_LINKS = `SELECT l.id, l.tipo, l.plan, l.cita AS cita_link, l.creado_en, l.vence_en, l.reactivado_en, l.usado_en,
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
    cita: r.inicio_utc ? etiquetaLima(r.inicio_utc) : null, plan: etiquetaPlan(r.plan), cita_link: etiquetaCita(r.plan, r.cita_link),
  }));
  return json(200, { ok: true, email, admin: admin === true, filas, conteos, total: estado === 'todos' ? conteos.todos : conteos[estado], pagina: p, por_pagina: POR_PAGINA });
}

async function crearLink(request, env, deps, email) {
  const d = await readJson(request);
  if (!Object.hasOwn(TIPOS_LINK, d.tipo)) return bad(400, 'Tipo de evento inválido');
  if (!planValido(d.plan)) return bad(400, 'Elige el producto y la duración.');
  if (!citaValida(d.plan, d.cita)) return bad(400, 'Elige qué cita es.');
  const token = randomToken();
  const id = crypto.randomUUID();
  const nutri = await agenda.siguienteNutri(deps.db, deps.nutricionistas.map((n) => n.id));
  const { vence_en } = await agenda.crearLink(deps.db, { id, tokenHash: await sha256Hex(token), tipo: d.tipo, creadoPor: email, ahora: deps.ahora(),
    plan: d.plan, cita: d.cita, nutri });
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

// Reservas del panel /panel/: una sola lista con las citas agendadas con link y
// las pagadas en la página web (pedido de Alejandro, 2026-10-15). «Agendó» es
// cuándo se usó el link o, en la web, cuándo se aprobó el pago.
const CAMPOS_AGENDADO = `r.id, r.estado, r.producto, r.duracion_meses, r.monto_centimos, r.duracion_min, r.inicio_utc, r.modalidad, r.nutricionista_id,
  r.link_id, l.paciente_nuevo, l.plan, l.cita, l.creado_por, u.nombre AS creado_por_nombre, p.metodo,
  COALESCE(l.usado_en, p.creado_en, r.creado_en) AS agendado_en,
  c.apellido_paterno, c.apellido_materno, c.nombres, c.nombre, c.dni, c.email, c.whatsapp, c.fecha_nacimiento,
  r.calendario_editado_en, r.calendario_cambios, r.calendario_revisar, r.cancelada_en_panel`;
const FROM_AGENDADO = `FROM reservas r JOIN clientes c ON c.id = r.cliente_id
  LEFT JOIN links_agenda l ON l.reserva_id = r.id AND r.link_id IS NOT NULL
  LEFT JOIN equipo_usuarios u ON u.email = l.creado_por
  LEFT JOIN pagos p ON p.id = (SELECT id FROM pagos WHERE reserva_id = r.id AND estado = 'approved' ORDER BY creado_en DESC LIMIT 1)
  WHERE ((r.link_id IS NOT NULL AND l.id IS NOT NULL AND (r.estado = 'confirmada' OR r.cancelada_en_panel IS NOT NULL))
    OR (r.link_id IS NULL AND (r.estado IN ('confirmada', 'pagada_sin_hora') OR r.cancelada_en_panel IS NOT NULL)))`;
const ORDEN_AGENDADO = 'ORDER BY agendado_en DESC, r.id DESC';

// Clave del plan como la guardan los links, para que la web y los links digan lo mismo.
const planWeb = (r) => (['evaluacion', 'basico'].includes(r.producto) ? r.producto : `${r.producto}:${r.duracion_meses}`);
const eventoWeb = (min) => (min === 60 ? 'Sesión de 1 hora' : `Sesión de ${min} min`);
const soles = (c) => `S/${String(Math.round(c / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
// metodo es el payment_method_id de Mercado Pago (visa, master, yape, account_money…).
const metodoPago = (m) => (!m ? 'Mercado Pago' : m === 'account_money' ? 'Saldo de Mercado Pago' : `Mercado Pago, ${m === 'yape' ? 'Yape' : m.toUpperCase()}`);
const quienCreo = (r) => r.creado_por_nombre || String(r.creado_por || '').split('@')[0] || null;

const vistaAgendado = (r, deps) => {
  const link = r.link_id != null;
  return {
    id: r.id, procedencia: link ? 'link' : 'web', agendado_en: r.agendado_en,
    inicio_utc: r.inicio_utc, etiqueta: etiquetaLima(r.inicio_utc),
    tipo: link ? tipoDeReserva(r)?.nombre ?? r.producto : eventoWeb(r.duracion_min),
    modalidad: r.modalidad, nutricionista: deps.nutricionistas.find((n) => n.id === r.nutricionista_id)?.nombre ?? r.nutricionista_id,
    plan: (link ? etiquetaPlan(r.plan) : etiquetaPlan(planWeb(r)) ?? cotizar(r.producto, r.duracion_meses)?.titulo ?? r.producto) ?? SIN_DATO,
    cita: link ? etiquetaCita(r.plan, r.cita) ?? SIN_DATO : null,
    apellido_paterno: r.apellido_paterno, apellido_materno: r.apellido_materno, nombres: r.nombres || r.nombre, dni: r.dni, email: r.email,
    whatsapp: r.whatsapp, pais: paisDeTelefono(r.whatsapp), fecha_nacimiento: r.fecha_nacimiento, paciente_nuevo: link ? r.paciente_nuevo : null,
    pago: link ? 'Pagó por fuera' : soles(r.monto_centimos),
    pago_detalle: link ? (quienCreo(r) ? `Link de ${quienCreo(r)}` : null)
      : r.estado === 'pagada_sin_hora' ? 'Pagó pero perdió la hora: elegir otra' : metodoPago(r.metodo),
    sin_hora: r.estado === 'pagada_sin_hora',
    // Para pegar en la base maestra: el producto sin la duración y los soles como número.
    producto: PRODUCTOS.find((x) => x.id === String(link ? r.plan : r.producto).split(':')[0])?.etiqueta ?? null,
    soles: link ? null : r.monto_centimos / 100,
    cancelada: r.cancelada_en_panel != null,
    revisar: r.calendario_revisar ?? null,
    calendario: r.calendario_editado_en ? { editado_en: r.calendario_editado_en, cambios: r.calendario_cambios } : null,
  };
};

// Las últimas agendadas primero (pedido de Alejandro, 2026-10-15), no por fecha de la cita.
// La pagada que perdió su hora sale siempre en Próximas: hay que darle otra.
export async function handleAgendados(request, env, deps) {
  if (request.method !== 'GET') return bad(405, 'Método no permitido');
  const acceso = await deps.acceso(request, env);
  if (!acceso.ok) return sinAcceso();
  // Trae al panel los cambios manuales del calendario (como mucho una vez por minuto).
  // Si Google falla, el panel carga igual con lo que hay.
  // Google lento: a los 3 s se corta y el panel carga igual. Los eventos que no se
  // pudieron aplicar se avisan al equipo (el cursor ya avanzó, el cron no los vería).
  if (deps.google) {
    try {
      const res = await sincronizarCalendario(deps, { minIntervaloMs: 60 * 1000, timeoutMs: 3000 });
      await alertarFallidos(deps, env, res.fallidos);
    } catch (e) { console.error('agendados/sincronizar', e); }
  }
  const q = new URL(request.url).searchParams;
  const tramo = q.get('tramo') || 'proximas';
  if (!['proximas', 'pasadas'].includes(tramo)) return bad(400, 'Filtros inválidos');
  const ahoraIso = deps.ahora().toISOString();
  const rango = rangoPeriodo({ periodo: q.get('periodo') || '30', desde: q.get('desde'), hasta: q.get('hasta') }, deps.ahora(),
    tramo === 'proximas' ? 'futuro' : 'pasado');
  if (!rango) return bad(400, 'Filtros inválidos');
  const p = pagina(q.get('pagina'));
  const enRango = `(?1 IS NULL OR r.inicio_utc >= ?1) AND (?2 IS NULL OR r.inicio_utc < ?2)`;
  const donde = `${FROM_AGENDADO} AND ${filtroTexto} AND ${tramo === 'proximas'
    ? `(r.estado = 'pagada_sin_hora' OR (${enRango} AND r.inicio_utc >= ?4))`
    : `r.estado <> 'pagada_sin_hora' AND ${enRango} AND r.inicio_utc < ?4`}`;
  const args = [rango.desde, rango.hasta, busqueda(q.get('q')), ahoraIso];
  const { n } = await deps.db.prepare(`SELECT COUNT(*) AS n ${donde}`).bind(...args).first();
  const { results } = await deps.db.prepare(
    `SELECT ${CAMPOS_AGENDADO} ${donde} ${ORDEN_AGENDADO} LIMIT ${POR_PAGINA} OFFSET ?5`,
  ).bind(...args, (p - 1) * POR_PAGINA).all();
  return json(200, { ok: true, email: acceso.email, admin: acceso.admin === true,
    filas: results.map((r) => vistaAgendado(r, deps)), total: n, pagina: p, por_pagina: POR_PAGINA });
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
    `SELECT ${CAMPOS_AGENDADO} ${FROM_AGENDADO} AND r.cancelada_en_panel IS NULL AND r.id IN (SELECT value FROM json_each(?1)) ${ORDEN_AGENDADO}`,
  ).bind(JSON.stringify(ids)).all();
  // Mismo orden que la tabla del panel, que sigue a la base maestra: APELLIDOS, NOMBRES, DNI, CORREO, NÚMERO,
  // NACIMIENTO, PAÍS, FECHA (pedido de Alejandro, 2026-10-16) y después el resto.
  const cab = ['Apellidos', 'Nombres', 'DNI', 'Correo', 'Número', 'Nacimiento', 'País', 'Fecha (Lima)', 'Evento', 'Plan', 'Cita', 'Pago',
    'Detalle del pago', 'Paciente', 'Modalidad', 'Nutricionista', 'Procedencia', 'Agendó (Lima)'];
  const filas = results.map((r) => {
    const v = vistaAgendado(r, deps);
    return [celda([v.apellido_paterno, v.apellido_materno].filter(Boolean).join(' ')), celda(v.nombres), textoFijo(v.dni), celda(v.email), textoFijo(v.whatsapp),
      celda(v.fecha_nacimiento), celda(v.pais), celda(v.sin_hora ? 'Sin hora' : lima(v.inicio_utc)), celda(v.tipo), celda(v.plan), celda(v.cita ?? ''), celda(v.pago),
      celda(v.pago_detalle), celda(v.paciente_nuevo == null ? '' : v.paciente_nuevo ? 'Nuevo' : 'Ya paciente'),
      celda(v.modalidad === 'video' ? 'Virtual' : 'Presencial'), celda(v.nutricionista),
      celda(v.procedencia === 'link' ? 'Link enviado' : 'Página web'), celda(lima(v.agendado_en))].join(',');
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

// Botones de las reservas marcadas para revisar (evento borrado o movido a una hora ocupada).
export async function handleRevision(request, env, deps) {
  if (request.method !== 'POST') return bad(405, 'Método no permitido');
  const acceso = await deps.acceso(request, env);
  if (!acceso.ok) return sinAcceso();
  const d = await readJson(request);
  if (typeof d.id !== 'string' || !['cancelar', 'mantener'].includes(d.accion)) return bad(400, 'Datos inválidos');
  const hecho = await resolverRevision(deps.db, { id: d.id, accion: d.accion, ahora: deps.ahora() });
  if (!hecho) return bad(404, 'Esa reserva ya no está para revisar. Recarga la página.');
  return json(200, { ok: true });
}

// Citas nuevas desde la última visita de quien abre el panel. Se llama una vez
// al cargar la página: devuelve la visita anterior (la primera vez, las últimas
// 24 h) y cuántas citas se agendaron después, y guarda esta visita.
const PRIMERA_VISITA_MS = 24 * 3600 * 1000;

export async function handleVisita(request, env, deps) {
  if (request.method !== 'POST') return bad(405, 'Método no permitido');
  const acceso = await deps.acceso(request, env);
  if (!acceso.ok) return sinAcceso();
  const ahora = deps.ahora();
  const previa = await deps.db.prepare('SELECT visto_en FROM equipo_visitas WHERE email = ?1').bind(acceso.email).first();
  const desde = previa?.visto_en ?? new Date(ahora.getTime() - PRIMERA_VISITA_MS).toISOString();
  const { n } = await deps.db.prepare(
    `SELECT COUNT(*) AS n ${FROM_AGENDADO} AND r.cancelada_en_panel IS NULL AND COALESCE(l.usado_en, p.creado_en, r.creado_en) > ?1`,
  ).bind(desde).first();
  await deps.db.prepare(`INSERT INTO equipo_visitas (email, visto_en) VALUES (?1, ?2)
    ON CONFLICT (email) DO UPDATE SET visto_en = excluded.visto_en`).bind(acceso.email, ahora.toISOString()).run();
  return json(200, { ok: true, desde, primera: !previa, nuevas: n });
}
