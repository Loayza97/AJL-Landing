// Acceso a D1 de los links de agenda. Agendar es una sola transacción: cliente
// (si es nuevo), reserva y link usado, cada sentencia con las mismas condiciones
// (link vigente, sin cruce y con cupo en el tope del día), así nunca queda una
// mitad guardada.
import { CRUCE, MINUTOS_DIA, NUTRI_CON_CUPO, hayCruce, expirar } from '../reservas/repo.mjs';
import { topeMinutosDia } from '../reservas/disponibilidad.mjs';
import { VENCE_DIAS, REACTIVAR_DIAS } from './tipos.mjs';

const DIA = 86400000;

export function estadoLink(l, ahora) {
  if (l.usado_en) return 'agendado';
  return Date.parse(l.vence_en) <= ahora.getTime() ? 'vencido' : 'sin_usar';
}

// Plan y cita ya vienen validados por el handler (server/agenda/opciones.mjs).
export async function crearLink(db, { id, tokenHash, tipo, creadoPor, ahora, plan = null, cita = null, nutri = null }) {
  const vence = new Date(ahora.getTime() + VENCE_DIAS * DIA).toISOString();
  await db.prepare(`INSERT INTO links_agenda (id, token_hash, tipo, creado_en, creado_por, vence_en, plan, cita, nutri_sugerida)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`)
    .bind(id, tokenHash, tipo, ahora.toISOString(), creadoPor, vence, plan, cita, nutri).run();
  return { vence_en: vence };
}

// Por turnos: la que sigue a la del último link creado, en el orden del equipo.
export async function siguienteNutri(db, ids) {
  const u = await db.prepare(`SELECT nutri_sugerida AS id FROM links_agenda WHERE nutri_sugerida IS NOT NULL
    ORDER BY creado_en DESC, rowid DESC LIMIT 1`).first();
  return ids[(ids.indexOf(u?.id) + 1) % ids.length];
}

export const linkPorHash = (db, hash) => db.prepare(
  `SELECT l.*, r.inicio_utc, r.fin_utc, r.modalidad, r.nutricionista_id, r.meet_url
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

// Borrado de verdad: un link sin usar no tiene datos de pacientes. Una sola
// sentencia con la condición, así un link que se usa justo ahora no se borra.
// Devuelve 'borrado', 'usado' o null si no existe.
export async function borrarLink(db, id) {
  const r = await db.prepare('DELETE FROM links_agenda WHERE id = ?1 AND usado_en IS NULL').bind(id).run();
  if (r.meta.changes === 1) return 'borrado';
  return (await db.prepare('SELECT 1 AS hay FROM links_agenda WHERE id = ?1').bind(id).first()) ? 'usado' : null;
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
  const tope = topeMinutosDia(h.fecha_lima);
  const sentencias = [expirar(db, ahoraIso)];
  if (a.cliente) {
    const c = a.cliente;
    sentencias.push(db.prepare(
      `INSERT INTO clientes (id, nombre, whatsapp, email, dni, nombres, apellido_paterno, apellido_materno, fecha_nacimiento, tipo_documento, creado_en)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'dni', ?10
       WHERE ${VIGENTE('?11', '?10')}
         AND NOT ${CRUCE({ ini: '?12', fin: '?13', nutri: '?14', modalidad: '?15', excluir: "''" })}
         AND ${MINUTOS_DIA('?16')} + ?17 <= ?18
         AND ${NUTRI_CON_CUPO({ fecha: '?16', nutri: '?14', dur: '?17' })}`,
    ).bind(a.clienteId, c.nombre, c.whatsapp, c.email, c.dni, c.nombres, c.apellido_paterno, c.apellido_materno ?? null, c.fecha_nacimiento,
      ahoraIso, a.link, h.inicio, h.fin, h.nutricionista_id, h.modalidad, h.fecha_lima, h.duracion_min, tope));
  }
  sentencias.push(db.prepare(
    `INSERT INTO reservas (id, token, cliente_id, producto, duracion_meses, monto_centimos, peso_tope, nutricionista_id, inicio_utc, fin_utc,
       duracion_min, fecha_lima, modalidad, estado, acepto_condiciones_version, link_id, creado_en, actualizado_en)
     SELECT ?1, ?2, ?3, ?4, 0, 0, 0, ?5, ?6, ?7, ?8, ?9, ?10, 'confirmada', ?11, ?12, ?13, ?13
     WHERE EXISTS (SELECT 1 FROM clientes WHERE id = ?3)
       AND ${VIGENTE('?12', '?13')}
       AND NOT ${CRUCE({ ini: '?6', fin: '?7', nutri: '?5', modalidad: '?10', excluir: '?1' })}
       AND ${MINUTOS_DIA('?9')} + ?8 <= ?14
       AND ${NUTRI_CON_CUPO({ fecha: '?9', nutri: '?5', dur: '?8' })}`,
  ).bind(a.reservaId, a.token, a.clienteId, `link_${a.tipoId}`, h.nutricionista_id, h.inicio, h.fin, h.duracion_min, h.fecha_lima, h.modalidad,
    a.condicionesVersion ?? null, a.link, ahoraIso, tope));
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
  return { ok: false, motivo: ocupada ? 'ocupada' : 'tope' };
}
