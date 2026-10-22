// Acceso a D1. Las reglas que no pueden fallar por concurrencia las impone la
// propia base: índices únicos parciales (hora del consultorio y de cada
// nutricionista), el cruce de horarios (CRUCE) y el tope dentro de la misma
// sentencia que inserta.
const ACTIVOS = "('apartada', 'pagando', 'confirmada')";
const UNIQUE = /UNIQUE constraint failed/i;
const MIN = 60000;

// Minutos ya tomados ese día por citas activas (web y links): el tope diario se
// compara con esto dentro de la misma sentencia que escribe.
export const MINUTOS_DIA = (fecha, excluir = null) => `(SELECT COALESCE(SUM(COALESCE(duracion_min, 60)), 0) FROM reservas
  WHERE fecha_lima = ${fecha} AND estado IN ${ACTIVOS}${excluir ? ` AND id <> ${excluir}` : ''})`;

const FIN = (col) => `COALESCE(${col}.fin_utc, strftime('%Y-%m-%dT%H:%M:%SZ', ${col}.inicio_utc, '+60 minutes'))`;

// Otra cita activa que se cruza con [ini, fin): de la misma nutricionista o, si
// las dos son presenciales, en el único consultorio. Cada argumento es un
// parámetro (?N) o una columna. Va dentro de la misma sentencia que escribe:
// D1 corre las sentencias en serie, así que nadie se cuela entre medio.
// La cota «un día atrás» deja usar el índice reservas_cruce: una cita dura pocas
// horas, así que las de más de un día antes no pueden cruzarse.
export const CRUCE = ({ ini, fin, nutri, modalidad, excluir }) => `EXISTS (SELECT 1 FROM reservas o
  WHERE o.id <> ${excluir} AND o.estado IN ${ACTIVOS}
    AND o.inicio_utc < ${fin} AND ${FIN('o')} > ${ini}
    AND o.inicio_utc > strftime('%Y-%m-%dT%H:%M:%SZ', ${ini}, '-1 day')
    AND (o.nutricionista_id = ${nutri} OR (${modalidad} = 'presencial' AND o.modalidad = 'presencial')))`;

// ¿Hay cruce para esta cita? Se pregunta solo cuando una escritura no entró,
// para distinguir «ocupada» de «tope».
export async function hayCruce(db, { id, nutri, inicio, modalidad, fin }) {
  const { c } = await db.prepare(`SELECT ${CRUCE({ ini: '?3', fin: '?5', nutri: '?2', modalidad: '?4', excluir: '?1' })} AS c`)
    .bind(id, nutri, inicio, modalidad, fin).first();
  return Boolean(c);
}

const finIso = (inicio, min) => new Date(Date.parse(inicio) + min * MIN).toISOString().replace('.000Z', 'Z');

export const expirar = (db, ahoraIso) => db.prepare(
  `UPDATE reservas SET estado = 'expirada', actualizado_en = ?1
   WHERE estado IN ('apartada', 'pagando') AND retencion_hasta < ?1`,
).bind(ahoraIso);

// link_plan y link_cita: el evento del calendario los muestra (evento-equipo.mjs).
const CON_CLIENTE = `SELECT r.*, c.nombre, c.whatsapp, c.email, c.dni, c.nombres, c.apellido_paterno, c.apellido_materno, c.fecha_nacimiento, c.tipo_documento,
  l.plan AS link_plan, l.cita AS link_cita
  FROM reservas r LEFT JOIN clientes c ON c.id = r.cliente_id LEFT JOIN links_agenda l ON l.id = r.link_id`;

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
  const duracion = r.duracion_min ?? 60;
  const fin = finIso(r.inicio_utc, duracion);
  const insertar = db.prepare(
    `INSERT INTO reservas (id, token, producto, duracion_meses, monto_centimos, peso_tope, nutricionista_id,
       inicio_utc, fecha_lima, modalidad, estado, retencion_hasta, huella, creado_en, actualizado_en, variante, fin_utc, duracion_min)
     SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'apartada', ?11, ?14, ?12, ?12, ?15, ?16, ?17
     WHERE ${MINUTOS_DIA('?9')} + ?17 <= ?13
       AND NOT ${CRUCE({ ini: '?8', fin: '?16', nutri: '?7', modalidad: '?10', excluir: '?1' })}`,
  ).bind(r.id, r.token, r.producto, r.duracion_meses, r.monto_centimos, r.peso_tope, r.nutricionista_id,
    r.inicio_utc, r.fecha_lima, r.modalidad, hasta, ahoraIso, r.tope, huella, r.variante ?? null, fin, duracion);
  try {
    const [, res] = await db.batch([expirar(db, ahoraIso), insertar]);
    if (res.meta.changes === 0) {
      const ocupada = await hayCruce(db, { id: r.id, nutri: r.nutricionista_id, inicio: r.inicio_utc, modalidad: r.modalidad, fin });
      return { ok: false, motivo: ocupada ? 'ocupada' : 'tope' };
    }
    return { ok: true, retencion_hasta: hasta };
  } catch (e) {
    if (UNIQUE.test(String(e?.message))) return { ok: false, motivo: 'ocupada' };
    throw e;
  }
}

export async function reservasActivasEntre(db, desde, hasta, ahora) {
  const { results } = await db.prepare(
    `SELECT id, inicio_utc, fin_utc, duracion_min, fecha_lima, nutricionista_id, modalidad, peso_tope FROM reservas
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
  // La ficha solo se escribe si la reserva todavía se puede pagar (la misma
  // condición que el UPDATE de abajo): con el token de una cita confirmada o
  // vencida no se reescriben los datos del paciente.
  const pagable = `EXISTS (SELECT 1 FROM reservas WHERE id = ?12 AND estado IN ('apartada', 'pagando') AND retencion_hasta >= ?11)`;
  const guardarCliente = reserva.cliente_id
    ? db.prepare(`UPDATE clientes SET nombre = ?2, whatsapp = ?3, email = ?4, dni = ?5, nombres = ?6,
        apellido_paterno = ?7, apellido_materno = ?8, fecha_nacimiento = ?9, tipo_documento = ?10 WHERE id = ?1 AND ${pagable}`)
      .bind(clienteId, ...campos, ahoraIso, reserva.id)
    : db.prepare(`INSERT INTO clientes (id, nombre, whatsapp, email, dni, nombres, apellido_paterno, apellido_materno,
        fecha_nacimiento, tipo_documento, creado_en) SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11 WHERE ${pagable}`)
      .bind(clienteId, ...campos, ahoraIso, reserva.id);
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

export async function confirmarReserva(db, { id, fecha_lima, tope, ahora }) {
  const ahoraIso = ahora.toISOString();
  try {
    // Expirar primero, en la misma transacción: si otra retención de esa hora
    // ya venció pero nadie la marcó todavía, no puede seguir bloqueando el
    // índice único ni contando para el tope del día.
    const [, res] = await db.batch([expirar(db, ahoraIso), db.prepare(
      `UPDATE reservas SET estado = 'confirmada', retencion_hasta = NULL, actualizado_en = ?2
       WHERE id = ?1 AND NOT ${CRUCE({ ini: 'reservas.inicio_utc', fin: FIN('reservas'), nutri: 'reservas.nutricionista_id', modalidad: 'reservas.modalidad', excluir: 'reservas.id' })}
         AND (
         estado IN ('apartada', 'pagando')
         OR (estado = 'expirada' AND ${MINUTOS_DIA('?3', '?1')} + COALESCE(duracion_min, 60) <= ?4))`,
    ).bind(id, ahoraIso, fecha_lima, tope)]);
    if (res.meta.changes === 1) return { ok: true };
    const actual = await reservaPorId(db, id);
    if (actual?.estado === 'confirmada') return { ok: false, motivo: 'ya_confirmada' };
    if (actual && await hayCruce(db, { id, nutri: actual.nutricionista_id, inicio: actual.inicio_utc, modalidad: actual.modalidad,
      fin: actual.fin_utc ?? finIso(actual.inicio_utc, 60) })) return { ok: false, motivo: 'ocupada' };
    return { ok: false, motivo: 'tope' };
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
    const fin = `strftime('%Y-%m-%dT%H:%M:%SZ', ?3, '+' || reservas.duracion_min || ' minutes')`;
    const [, res] = await db.batch([expirar(db, ahoraIso), db.prepare(
      `UPDATE reservas SET nutricionista_id = ?2, inicio_utc = ?3, fecha_lima = ?4, modalidad = ?5, fin_utc = ${fin},
         estado = 'confirmada', google_event_id = NULL, meet_url = NULL, actualizado_en = ?6
       WHERE id = ?1 AND estado = 'pagada_sin_hora'
         AND NOT ${CRUCE({ ini: '?3', fin, nutri: '?2', modalidad: '?5', excluir: '?1' })}
         AND ${MINUTOS_DIA('?4', '?1')} + COALESCE(duracion_min, 60) <= ?7`,
    ).bind(r.id, r.nutricionista_id, r.inicio_utc, r.fecha_lima, r.modalidad, ahoraIso, r.tope)]);
    if (res.meta.changes === 1) return { ok: true };
    const actual = await reservaPorId(db, r.id);
    const ocupada = await hayCruce(db, { id: r.id, nutri: r.nutricionista_id, inicio: r.inicio_utc, modalidad: r.modalidad,
      fin: finIso(r.inicio_utc, actual?.duracion_min ?? 60) });
    return { ok: false, motivo: ocupada ? 'ocupada' : 'tope' };
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
             WHERE cliente_id IS NOT NULL AND (estado IN ('confirmada', 'pagada_sin_hora') OR cancelada_en_panel IS NOT NULL))`,
  ).bind(limite)]);
};

// Quienes dejaron sus datos y no pagaron: su plazo para pagar venció dentro de
// la ventana y esa persona (por correo) no tiene ninguna reserva pagada.
export async function noPagadasEntre(db, desdeIso, hastaIso) {
  const { results } = await db.prepare(
    `SELECT r.id, r.producto, r.duracion_meses, r.inicio_utc, r.modalidad, r.nutricionista_id, c.nombre, c.whatsapp, c.email
     FROM reservas r JOIN clientes c ON c.id = r.cliente_id
     WHERE c.nombre IS NOT NULL AND r.estado IN ('apartada', 'pagando', 'expirada')
       AND r.retencion_hasta >= ?1 AND r.retencion_hasta < ?2
       AND NOT EXISTS (SELECT 1 FROM reservas r2 JOIN clientes c2 ON c2.id = r2.cliente_id
                       WHERE c2.email = c.email AND r2.estado IN ('confirmada', 'pagada_sin_hora'))
     ORDER BY r.retencion_hasta`,
  ).bind(desdeIso, hastaIso).all();
  return results;
}

export async function marcarResumen(db, fecha, ahora) {
  const r = await db.prepare('INSERT INTO resumenes_enviados (fecha, enviado_en) VALUES (?1, ?2) ON CONFLICT (fecha) DO NOTHING')
    .bind(fecha, ahora.toISOString()).run();
  return r.meta.changes === 1;
}

export const desmarcarResumen = (db, fecha) => db.prepare('DELETE FROM resumenes_enviados WHERE fecha = ?1').bind(fecha).run();

// Suelta la hora que la misma persona tenía apartada (quien tiene el token es
// su dueño) para que cambiar de hora no gaste el límite de retenciones.
export async function liberarRetencion(db, token, ahora) {
  const r = await db.prepare(
    `UPDATE reservas SET estado = 'expirada', huella = NULL, actualizado_en = ?2
     WHERE token = ?1 AND estado IN ('apartada', 'pagando')`,
  ).bind(token, ahora.toISOString()).run();
  return r.meta.changes === 1;
}

// Momento del último resumen enviado: el siguiente mira desde ahí, así ningún
// día se pierde aunque el cron no corra o el correo falle.
export async function ultimoResumen(db) {
  const r = await db.prepare('SELECT MAX(enviado_en) AS en FROM resumenes_enviados').first();
  return r?.en ?? null;
}

// ─── Sincronización con Google Calendar (spec 2026-10-19-sincronizar-calendario) ───

export const leerSync = async (db, clave) =>
  (await db.prepare('SELECT valor FROM sync_estado WHERE clave = ?1').bind(clave).first())?.valor ?? null;

export const guardarSync = (db, clave, valor) => db.prepare(
  'INSERT INTO sync_estado (clave, valor) VALUES (?1, ?2) ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor',
).bind(clave, valor).run();

// Todas las reservas candidatas de un lote de eventos en UNA consulta (D1 limita las
// consultas por invocación). Un evento borrado puede llegar de Google sin el id
// privado: por eso se busca también por el id del evento que guardamos al crearlo.
// Las listas van como un solo parámetro JSON.
export async function reservasPorEventos(db, { eventoIds = [], reservaIds = [] }) {
  if (!eventoIds.length && !reservaIds.length) return [];
  const { results } = await db.prepare(
    `SELECT id, estado, inicio_utc, fin_utc, duracion_min, fecha_lima, modalidad, nutricionista_id, calendario_revisar, google_event_id
     FROM reservas WHERE google_event_id IN (SELECT value FROM json_each(?1)) OR id IN (SELECT value FROM json_each(?2))`,
  ).bind(JSON.stringify(eventoIds), JSON.stringify(reservaIds)).all();
  return results;
}

// El cruce se comprueba dentro del mismo UPDATE (CRUCE): entre mirar y escribir
// nadie se cuela. Si no cambió nada, se lee el estado para saber por qué.
export async function aplicarCambioCalendario(db, { id, inicio, fin, duracion, fecha, modalidad, cambios, ahora }) {
  const ahoraIso = ahora.toISOString();
  try {
    const r = await db.prepare(
      `UPDATE reservas SET inicio_utc = ?2, fin_utc = ?3, duracion_min = ?4, fecha_lima = ?5, modalidad = ?6,
         calendario_cambios = ?7, calendario_editado_en = ?8, calendario_revisar = NULL, actualizado_en = ?8
       WHERE id = ?1 AND estado = 'confirmada'
         AND NOT ${CRUCE({ ini: '?2', fin: '?3', nutri: 'reservas.nutricionista_id', modalidad: '?6', excluir: 'reservas.id' })}`,
    ).bind(id, inicio, fin, duracion, fecha, modalidad, cambios, ahoraIso).run();
    if (r.meta.changes === 1) return { ok: true };
    const fila = await db.prepare('SELECT estado FROM reservas WHERE id = ?1').bind(id).first();
    return { ok: false, motivo: fila?.estado === 'confirmada' ? 'cruce' : 'no_confirmada' };
  } catch (e) {
    if (UNIQUE.test(String(e?.message))) return { ok: false, motivo: 'cruce' };
    throw e;
  }
}

export const marcarRevisar = (db, { id, motivo, cambios = null, ahora }) => db.prepare(
  `UPDATE reservas SET calendario_revisar = ?2, calendario_cambios = COALESCE(?3, calendario_cambios), calendario_editado_en = ?4
   WHERE id = ?1`,
).bind(id, motivo, cambios, ahora.toISOString()).run();

export const quitarBorrado = (db, id) => db.prepare(
  `UPDATE reservas SET calendario_revisar = NULL WHERE id = ?1 AND calendario_revisar = 'borrado'`,
).bind(id).run();

// Botones del panel. Cancelar libera la hora (deja de ser activa para los índices
// y el motor) pero la reserva sigue visible en rojo (cancelada_en_panel).
export async function resolverRevision(db, { id, accion, ahora }) {
  const ahoraIso = ahora.toISOString();
  const r = accion === 'cancelar'
    ? await db.prepare(
      `UPDATE reservas SET estado = 'cancelada', cancelada_en_panel = ?2, calendario_revisar = NULL, actualizado_en = ?2
       WHERE id = ?1 AND estado = 'confirmada' AND calendario_revisar IS NOT NULL`,
    ).bind(id, ahoraIso).run()
    : await db.prepare(
      `UPDATE reservas SET calendario_revisar = NULL WHERE id = ?1 AND calendario_revisar IS NOT NULL`,
    ).bind(id).run();
  return r.meta.changes === 1;
}
