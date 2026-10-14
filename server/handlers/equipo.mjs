// ─── Panel del equipo · AJL Nutrición ───────────────────────────────────────
// GET  /api/equipo/reservas    quién pagó y quién dejó datos sin pagar (30 días)
// POST /api/equipo/contactado  marca o desmarca «ya contactado»
// GET  /api/equipo/excel       lo mismo en un CSV que abre Excel
// Todas exigen sesión del equipo (server/equipo/acceso.mjs) antes de leer nada.
import { json, readJson } from '../http.mjs';
import { cotizar } from '../reservas/catalogo.mjs';
import { etiquetaLima, fechaLima } from '../reservas/tiempo.mjs';

const CAMPOS = `r.id, r.estado, r.producto, r.duracion_meses, r.monto_centimos, r.inicio_utc, r.modalidad, r.nutricionista_id,
  r.creado_en, r.retencion_hasta, r.contactado_en, r.contactado_por,
  c.nombre, c.nombres, c.apellido_paterno, c.apellido_materno, c.tipo_documento, c.dni, c.fecha_nacimiento, c.whatsapp, c.email`;

async function listar(db, ahora) {
  const ahoraIso = ahora.toISOString();
  const desde = new Date(ahora.getTime() - 30 * 86400000).toISOString();
  const { results: pagadas } = await db.prepare(
    `SELECT ${CAMPOS}, p.creado_en AS pagado_en, p.metodo
     FROM reservas r LEFT JOIN clientes c ON c.id = r.cliente_id
     LEFT JOIN pagos p ON p.id = (SELECT id FROM pagos WHERE reserva_id = r.id AND estado = 'approved' ORDER BY creado_en DESC LIMIT 1)
     WHERE r.estado IN ('confirmada', 'pagada_sin_hora') AND r.link_id IS NULL
     ORDER BY p.creado_en DESC`,
  ).all();
  const { results: noPagadas } = await db.prepare(
    `SELECT ${CAMPOS}
     FROM reservas r JOIN clientes c ON c.id = r.cliente_id
     WHERE c.nombre IS NOT NULL AND r.estado IN ('apartada', 'pagando', 'expirada')
       AND r.retencion_hasta < ?1 AND r.retencion_hasta >= ?2
       AND NOT EXISTS (SELECT 1 FROM reservas r2 JOIN clientes c2 ON c2.id = r2.cliente_id
                       WHERE c2.email = c.email AND r2.estado IN ('confirmada', 'pagada_sin_hora'))
     ORDER BY r.retencion_hasta DESC`,
  ).bind(ahoraIso, desde).all();
  return { pagadas, noPagadas };
}

function vistaEquipo(r, nutricionistas) {
  return {
    ...r,
    titulo: cotizar(r.producto, r.duracion_meses)?.titulo ?? r.producto,
    etiqueta: etiquetaLima(r.inicio_utc),
    nutricionista: nutricionistas.find((n) => n.id === r.nutricionista_id)?.nombre ?? r.nutricionista_id,
  };
}

const sinAcceso = () => json(401, { ok: false, error: 'Necesitas entrar con un correo autorizado del equipo.' });

export async function handleEquipoReservas(request, env, deps) {
  if (request.method !== 'GET') return json(405, { ok: false, error: 'Método no permitido' });
  const acceso = await deps.acceso(request, env);
  if (!acceso.ok) return sinAcceso();
  const { pagadas, noPagadas } = await listar(deps.db, deps.ahora());
  return json(200, {
    ok: true, email: acceso.email,
    pagadas: pagadas.map((r) => vistaEquipo(r, deps.nutricionistas)),
    no_pagadas: noPagadas.map((r) => vistaEquipo(r, deps.nutricionistas)),
  });
}

export async function handleEquipoContactado(request, env, deps) {
  if (request.method !== 'POST') return json(405, { ok: false, error: 'Método no permitido' });
  const acceso = await deps.acceso(request, env);
  if (!acceso.ok) return sinAcceso();
  const d = await readJson(request);
  if (typeof d.id !== 'string' || typeof d.contactado !== 'boolean') return json(400, { ok: false, error: 'Datos inválidos' });
  const r = await deps.db.prepare('UPDATE reservas SET contactado_en = ?2, contactado_por = ?3 WHERE id = ?1')
    .bind(d.id, d.contactado ? deps.ahora().toISOString() : null, d.contactado ? acceso.email : null).run();
  if (r.meta.changes !== 1) return json(404, { ok: false, error: 'No encontramos esa reserva.' });
  return json(200, { ok: true });
}

// CSV para Excel: BOM para las tildes, «sep=,» para que Excel en español separe
// bien, texto que empieza con = + - @ neutralizado (no se ejecuta como fórmula)
// y documento y WhatsApp como texto (no pierden ceros ni se vuelven 5,1E+10).
export const celda = (v) => {
  let s = String(v ?? '');
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const comoTexto = (v) => (v ? `\t${String(v).replace(/^\+/, '')}` : '');
const DOCS = { dni: 'DNI', ce: 'Carné de Extranjería', pasaporte: 'Pasaporte' };
export const lima = (iso) => (iso ? `${fechaLima(new Date(iso))} ${new Date(Date.parse(iso) - 5 * 3600000).toISOString().slice(11, 16)}` : '');

export async function handleEquipoExcel(request, env, deps) {
  if (request.method !== 'GET') return json(405, { ok: false, error: 'Método no permitido' });
  const acceso = await deps.acceso(request, env);
  if (!acceso.ok) return sinAcceso();
  const ahora = deps.ahora();
  const { pagadas, noPagadas } = await listar(deps.db, ahora);
  const cab = ['Estado', 'Pagado o venció (Lima)', 'Nombres', 'Apellido paterno', 'Apellido materno', 'Tipo de documento', 'Documento',
    'Fecha de nacimiento', 'WhatsApp', 'Correo', 'Plan', 'Monto (S/)', 'Medio de pago', 'Cita (Lima)', 'Modalidad', 'Nutricionista',
    'Contactado', 'Contactado por'];
  const fila = (r, pago) => {
    const v = vistaEquipo(r, deps.nutricionistas);
    return [pago ? 'Pagó' : 'No pagó', lima(pago ? r.pagado_en : r.retencion_hasta), r.nombres || r.nombre, r.apellido_paterno, r.apellido_materno,
      DOCS[r.tipo_documento] ?? '', comoTexto(r.dni), r.fecha_nacimiento, comoTexto(r.whatsapp), r.email, v.titulo,
      (r.monto_centimos / 100).toFixed(2), pago ? r.metodo : '', lima(r.inicio_utc), r.modalidad === 'video' ? 'Videollamada' : 'Presencial',
      v.nutricionista, r.contactado_en ? lima(r.contactado_en) : '', r.contactado_por].map(celda).join(',');
  };
  const csv = ['sep=,', cab.map(celda).join(','), ...pagadas.map((r) => fila(r, true)), ...noPagadas.map((r) => fila(r, false))].join('\r\n');
  return new Response(`﻿${csv}\r\n`, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="reservas-ajl-${fechaLima(ahora)}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
