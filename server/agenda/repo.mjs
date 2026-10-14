// Acceso a D1 de los links de agenda. Agendar es una sola transacción: cliente
// (si es nuevo), reserva y link usado, cada sentencia con las mismas condiciones
// (link vigente y sin cruce), así nunca queda una mitad guardada.
import { CRUCE, hayCruce, expirar } from '../reservas/repo.mjs';
import { VENCE_DIAS, REACTIVAR_DIAS } from './tipos.mjs';

const DIA = 86400000;

export function estadoLink(l, ahora) {
  if (l.usado_en) return 'agendado';
  return Date.parse(l.vence_en) <= ahora.getTime() ? 'vencido' : 'sin_usar';
}

export async function crearLink(db, { id, tokenHash, tipo, creadoPor, ahora }) {
  const vence = new Date(ahora.getTime() + VENCE_DIAS * DIA).toISOString();
  await db.prepare(`INSERT INTO links_agenda (id, token_hash, tipo, creado_en, creado_por, vence_en) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`)
    .bind(id, tokenHash, tipo, ahora.toISOString(), creadoPor, vence).run();
  return { vence_en: vence };
}

export const linkPorHash = (db, hash) => db.prepare(
  `SELECT l.*, r.inicio_utc, r.fin_utc, r.modalidad, r.nutricionista_id
   FROM links_agenda l LEFT JOIN reservas r ON r.id = l.reserva_id WHERE l.token_hash = ?1`,
).bind(hash).first();

export async function reactivarLink(db, id, ahora) {
  const vence = new Date(ahora.getTime() + REACTIVAR_DIAS * DIA).toISOString();
  const r = await db.prepare(
    `UPDATE links_agenda SET vence_en = ?2, reactivado_en = ?3
     WHERE id = ?1 AND usado_en IS NULL AND vence_en <= ?3`,
  ).bind(id, vence, ahora.toISOString()).run();
  return r.meta.changes === 1 ? vence : null;
}

export async function contarConsultaDni(db, id, max) {
  const r = await db.prepare('UPDATE links_agenda SET consultas_dni = consultas_dni + 1 WHERE id = ?1 AND consultas_dni < ?2')
    .bind(id, max).run();
  return r.meta.changes === 1;
}

// Es paciente quien tiene un cliente con ese DNI y alguna cita confirmada o
// pagada; se usan sus datos más recientes.
export const pacientePorDni = (db, dni) => db.prepare(
  `SELECT c.* FROM clientes c
   WHERE c.dni = ?1 AND c.tipo_documento = 'dni' AND c.nombre IS NOT NULL
     AND EXISTS (SELECT 1 FROM reservas r WHERE r.cliente_id = c.id AND r.estado IN ('confirmada', 'pagada_sin_hora'))
   ORDER BY c.creado_en DESC LIMIT 1`,
).bind(dni).first();

const VIGENTE = (id, ahora) => `EXISTS (SELECT 1 FROM links_agenda WHERE id = ${id} AND usado_en IS NULL AND vence_en > ${ahora})`;

export async function agendarConLink(db, a) {
  const ahoraIso = a.ahora.toISOString();
  const h = a.hora;
  const sentencias = [expirar(db, ahoraIso)];
  if (a.cliente) {
    const c = a.cliente;
    sentencias.push(db.prepare(
      `INSERT INTO clientes (id, nombre, whatsapp, email, dni, nombres, apellido_paterno, apellido_materno, fecha_nacimiento, tipo_documento, creado_en)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'dni', ?10
       WHERE ${VIGENTE('?11', '?10')}
         AND NOT ${CRUCE({ ini: '?12', fin: '?13', nutri: '?14', modalidad: '?15', excluir: "''" })}`,
    ).bind(a.clienteId, c.nombre, c.whatsapp, c.email, c.dni, c.nombres, c.apellido_paterno, c.apellido_materno ?? null, c.fecha_nacimiento,
      ahoraIso, a.link, h.inicio, h.fin, h.nutricionista_id, h.modalidad));
  }
  sentencias.push(db.prepare(
    `INSERT INTO reservas (id, token, cliente_id, producto, duracion_meses, monto_centimos, peso_tope, nutricionista_id, inicio_utc, fin_utc,
       duracion_min, fecha_lima, modalidad, estado, acepto_condiciones_version, link_id, creado_en, actualizado_en)
     SELECT ?1, ?2, ?3, ?4, 0, 0, 0, ?5, ?6, ?7, ?8, ?9, ?10, 'confirmada', ?11, ?12, ?13, ?13
     WHERE EXISTS (SELECT 1 FROM clientes WHERE id = ?3)
       AND ${VIGENTE('?12', '?13')}
       AND NOT ${CRUCE({ ini: '?6', fin: '?7', nutri: '?5', modalidad: '?10', excluir: '?1' })}`,
  ).bind(a.reservaId, a.token, a.clienteId, `link_${a.tipoId}`, h.nutricionista_id, h.inicio, h.fin, h.duracion_min, h.fecha_lima, h.modalidad,
    a.condicionesVersion ?? null, a.link, ahoraIso));
  sentencias.push(db.prepare(
    `UPDATE links_agenda SET usado_en = ?2, reserva_id = ?3, paciente_nuevo = ?4
     WHERE id = ?1 AND usado_en IS NULL AND EXISTS (SELECT 1 FROM reservas WHERE id = ?3)`,
  ).bind(a.link, ahoraIso, a.reservaId, a.pacienteNuevo ? 1 : 0));
  try {
    const res = await db.batch(sentencias);
    if (res.at(-1).meta.changes === 1) return { ok: true };
  } catch (e) {
    if (!/UNIQUE constraint failed/i.test(String(e?.message))) throw e;
    return { ok: false, motivo: 'ocupada' };
  }
  const l = await db.prepare('SELECT usado_en, vence_en FROM links_agenda WHERE id = ?1').bind(a.link).first();
  if (!l || l.usado_en || Date.parse(l.vence_en) <= a.ahora.getTime()) return { ok: false, motivo: 'link' };
  const ocupada = await hayCruce(db, { id: a.reservaId, nutri: h.nutricionista_id, inicio: h.inicio, modalidad: h.modalidad, fin: h.fin });
  return { ok: false, motivo: ocupada ? 'ocupada' : 'link' };
}
