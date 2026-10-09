// Acceso a D1. Las reglas que no pueden fallar por concurrencia las impone la
// propia base: índices únicos parciales (hora del consultorio y de cada
// nutricionista) y el tope dentro de la misma sentencia que inserta.
const ACTIVOS = "('apartada', 'pagando', 'confirmada')";
const UNIQUE = /UNIQUE constraint failed/i;
const MIN = 60000;

const expirar = (db, ahoraIso) => db.prepare(
  `UPDATE reservas SET estado = 'expirada', actualizado_en = ?1
   WHERE estado IN ('apartada', 'pagando') AND retencion_hasta < ?1`,
).bind(ahoraIso);

const CON_CLIENTE = `SELECT r.*, c.nombre, c.whatsapp, c.email, c.dni, c.nombres, c.apellido_paterno, c.apellido_materno, c.fecha_nacimiento, c.tipo_documento
  FROM reservas r LEFT JOIN clientes c ON c.id = r.cliente_id`;

export async function crearRetencion(db, r) {
  const ahoraIso = r.ahora.toISOString();
  const hasta = new Date(r.ahora.getTime() + (r.minutos ?? 15) * MIN).toISOString();
  const huella = r.huella ?? null;
  if (huella) {
    // Antiabuso: nadie aparta más de N horas a la vez sin pagar.
    const { n } = await db.prepare(
      `SELECT COUNT(*) AS n FROM reservas
       WHERE huella = ?1 AND estado IN ('apartada', 'pagando') AND retencion_hasta >= ?2`,
    ).bind(huella, ahoraIso).first();
    if (n >= (r.maxRetenciones ?? 2)) return { ok: false, motivo: 'limite' };
  }
  const insertar = db.prepare(
    `INSERT INTO reservas (id, token, producto, duracion_meses, monto_centimos, peso_tope, nutricionista_id,
       inicio_utc, fecha_lima, modalidad, estado, retencion_hasta, huella, creado_en, actualizado_en)
     SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'apartada', ?11, ?15, ?12, ?12
     WHERE (SELECT COALESCE(SUM(peso_tope), 0) FROM reservas
            WHERE fecha_lima = ?9 AND estado IN ${ACTIVOS}) + ?6 + ?13 <= ?14`,
  ).bind(r.id, r.token, r.producto, r.duracion_meses, r.monto_centimos, r.peso_tope, r.nutricionista_id,
    r.inicio_utc, r.fecha_lima, r.modalidad, hasta, ahoraIso, r.primerasManuales, r.tope, huella);
  try {
    const [, res] = await db.batch([expirar(db, ahoraIso), insertar]);
    if (res.meta.changes === 0) return { ok: false, motivo: 'tope' };
    return { ok: true, retencion_hasta: hasta };
  } catch (e) {
    if (UNIQUE.test(String(e?.message))) return { ok: false, motivo: 'ocupada' };
    throw e;
  }
}

export async function reservasActivasEntre(db, desde, hasta, ahora) {
  const { results } = await db.prepare(
    `SELECT id, inicio_utc, fecha_lima, nutricionista_id, modalidad, peso_tope FROM reservas
     WHERE fecha_lima >= ?1 AND fecha_lima < ?2
       AND (estado = 'confirmada' OR (estado IN ('apartada', 'pagando') AND retencion_hasta >= ?3))`,
  ).bind(desde, hasta, ahora.toISOString()).all();
  return results;
}

export const reservaPorToken = (db, token) => db.prepare(`${CON_CLIENTE} WHERE r.token = ?1`).bind(token).first();
export const reservaPorId = (db, id) => db.prepare(`${CON_CLIENTE} WHERE r.id = ?1`).bind(id).first();

export async function guardarDatosYPagar(db, { reserva, cliente, condicionesVersion, novedades, ahora }) {
  const ahoraIso = ahora.toISOString();
  const hasta = new Date(Date.parse(reserva.creado_en) + 30 * MIN).toISOString();
  const clienteId = reserva.cliente_id || crypto.randomUUID();
  const c = cliente;
  const campos = [c.nombre ?? null, c.whatsapp ?? null, c.email ?? null, c.dni ?? null, c.nombres ?? null, c.apellido_paterno ?? null, c.apellido_materno ?? null,
    c.fecha_nacimiento ?? null, c.tipo_documento ?? null];
  const guardarCliente = reserva.cliente_id
    ? db.prepare(`UPDATE clientes SET nombre = ?2, whatsapp = ?3, email = ?4, dni = ?5, nombres = ?6,
        apellido_paterno = ?7, apellido_materno = ?8, fecha_nacimiento = ?9, tipo_documento = ?10 WHERE id = ?1`)
      .bind(clienteId, ...campos)
    : db.prepare(`INSERT INTO clientes (id, nombre, whatsapp, email, dni, nombres, apellido_paterno, apellido_materno,
        fecha_nacimiento, tipo_documento, creado_en) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`)
      .bind(clienteId, ...campos, ahoraIso);
  const actualizar = db.prepare(
    `UPDATE reservas SET cliente_id = ?1, estado = 'pagando', retencion_hasta = ?2,
       acepto_condiciones_version = ?3, novedades_optin = ?4, actualizado_en = ?5
     WHERE id = ?6 AND estado IN ('apartada', 'pagando') AND retencion_hasta >= ?5`,
  ).bind(clienteId, hasta, condicionesVersion, novedades ? 1 : 0, ahoraIso, reserva.id);
  const [, res] = await db.batch([guardarCliente, actualizar]);
  if (res.meta.changes === 0) return { ok: false, motivo: 'vencida' };
  return { ok: true, retencion_hasta: hasta };
}

export const guardarPreferencia = (db, id, pref, ahora) => db.prepare(
  'UPDATE reservas SET mp_preference_id = ?2, actualizado_en = ?3 WHERE id = ?1',
).bind(id, pref, ahora.toISOString()).run();

export const registrarPago = (db, p) => db.prepare(
  `INSERT INTO pagos (id, reserva_id, mp_payment_id, estado, monto_centimos, metodo, creado_en)
   VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
   ON CONFLICT (mp_payment_id) DO UPDATE SET estado = excluded.estado`,
).bind(crypto.randomUUID(), p.reserva_id, p.mp_payment_id, p.estado, p.monto_centimos, p.metodo, p.ahora.toISOString()).run();

export const ultimoPago = (db, reservaId) => db.prepare(
  'SELECT estado FROM pagos WHERE reserva_id = ?1 ORDER BY creado_en DESC LIMIT 1',
).bind(reservaId).first();

export const otroPagoAprobado = (db, reservaId, mpPaymentId) => db.prepare(
  `SELECT mp_payment_id FROM pagos WHERE reserva_id = ?1 AND estado = 'approved' AND mp_payment_id <> ?2`,
).bind(reservaId, mpPaymentId).first();

export async function confirmarReserva(db, { id, fecha_lima, primerasManuales, tope, ahora }) {
  const ahoraIso = ahora.toISOString();
  try {
    // Expirar primero, en la misma transacción: si otra retención de esa hora
    // ya venció pero nadie la marcó todavía, no puede seguir bloqueando el
    // índice único ni contando para el tope del día.
    const [, res] = await db.batch([expirar(db, ahoraIso), db.prepare(
      `UPDATE reservas SET estado = 'confirmada', retencion_hasta = NULL, actualizado_en = ?2
       WHERE id = ?1 AND (
         estado IN ('apartada', 'pagando')
         OR (estado = 'expirada' AND (SELECT COALESCE(SUM(peso_tope), 0) FROM reservas
               WHERE fecha_lima = ?3 AND estado IN ${ACTIVOS} AND id <> ?1) + peso_tope + ?4 <= ?5))`,
    ).bind(id, ahoraIso, fecha_lima, primerasManuales, tope)]);
    if (res.meta.changes === 1) return { ok: true };
    const actual = await reservaPorId(db, id);
    return { ok: false, motivo: actual?.estado === 'confirmada' ? 'ya_confirmada' : 'tope' };
  } catch (e) {
    if (UNIQUE.test(String(e?.message))) return { ok: false, motivo: 'ocupada' };
    throw e;
  }
}

export const marcarSinHora = (db, id, ahora) => db.prepare(
  `UPDATE reservas SET estado = 'pagada_sin_hora', retencion_hasta = NULL, actualizado_en = ?2
   WHERE id = ?1 AND estado IN ('apartada', 'pagando', 'expirada')`,
).bind(id, ahora.toISOString()).run();

export const guardarEvento = (db, id, eventId, meetUrl, ahora) => db.prepare(
  `UPDATE reservas SET google_event_id = ?2, meet_url = ?3, calendario_pendiente = 0, actualizado_en = ?4
   WHERE id = ?1`,
).bind(id, eventId, meetUrl, ahora.toISOString()).run();

export const marcarCalendarioPendiente = (db, id, ahora) => db.prepare(
  'UPDATE reservas SET calendario_pendiente = 1, actualizado_en = ?2 WHERE id = ?1',
).bind(id, ahora.toISOString()).run();

export async function reubicar(db, r) {
  const ahoraIso = r.ahora.toISOString();
  try {
    // Mismo cuidado que en confirmarReserva: expirar antes de comprobar la
    // hora de destino, para que un cupo vencido sin marcar no la bloquee.
    const [, res] = await db.batch([expirar(db, ahoraIso), db.prepare(
      `UPDATE reservas SET nutricionista_id = ?2, inicio_utc = ?3, fecha_lima = ?4, modalidad = ?5,
         estado = 'confirmada', google_event_id = NULL, meet_url = NULL, actualizado_en = ?6
       WHERE id = ?1 AND estado = 'pagada_sin_hora'
         AND (SELECT COALESCE(SUM(peso_tope), 0) FROM reservas
              WHERE fecha_lima = ?4 AND estado IN ${ACTIVOS} AND id <> ?1) + peso_tope + ?7 <= ?8`,
    ).bind(r.id, r.nutricionista_id, r.inicio_utc, r.fecha_lima, r.modalidad, ahoraIso, r.primerasManuales, r.tope)]);
    return res.meta.changes === 1 ? { ok: true } : { ok: false, motivo: 'tope' };
  } catch (e) {
    if (UNIQUE.test(String(e?.message))) return { ok: false, motivo: 'ocupada' };
    throw e;
  }
}

export const purgarNoPagadas = (db, ahora, dias = 30) => {
  const limite = new Date(ahora.getTime() - dias * 86400000).toISOString();
  const sinHuella = db.prepare(
    `UPDATE reservas SET huella = NULL
     WHERE huella IS NOT NULL AND (estado NOT IN ('apartada', 'pagando') OR retencion_hasta < ?1)`,
  ).bind(ahora.toISOString());
  return db.batch([sinHuella, db.prepare(
    `UPDATE clientes SET nombre = NULL, whatsapp = NULL, email = NULL, dni = NULL, nombres = NULL,
       apellido_paterno = NULL, apellido_materno = NULL, fecha_nacimiento = NULL, tipo_documento = NULL
     WHERE nombre IS NOT NULL
       AND id IN (SELECT cliente_id FROM reservas WHERE cliente_id IS NOT NULL AND (
             (estado IN ('expirada', 'cancelada') AND actualizado_en < ?1)
             OR (estado IN ('apartada', 'pagando') AND retencion_hasta < ?1)))
       AND id NOT IN (SELECT cliente_id FROM reservas
             WHERE cliente_id IS NOT NULL AND estado IN ('confirmada', 'pagada_sin_hora'))`,
  ).bind(limite)]);
};
