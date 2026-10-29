// Acceso a D1 de las suscripciones. Las reglas que no pueden fallar por concurrencia
// (webhook y página de regreso a la vez) van dentro de la misma sentencia o batch.
import { penalidadAlCancelar } from './calculo.mjs';

const COLUMNAS = ['id', 'token', 'link_token_hash', 'link_usado_en', 'vence_en', 'reserva_id', 'nombre', 'email', 'dni', 'whatsapp',
  'producto', 'duracion_meses', 'cuota_centimos', 'precio_mes_centimos', 'precio_3m_centimos', 'penalidad_centimos', 'mp_plan_id', 'mp_preapproval_id', 'estado', 'cobros_aprobados',
  'penalidad_estado', 'creado_por', 'acepto_condiciones_version', 'creado_en'];
const normalDni = (d) => String(d ?? '').replace(/[\s.-]+/g, '').toUpperCase();

export async function crear(db, s) {
  const fila = { cobros_aprobados: 0, penalidad_estado: 'no_aplica', ...s, dni: s.dni ? normalDni(s.dni) : null };
  const cols = COLUMNAS.filter((c) => fila[c] !== undefined);
  await db.prepare(`INSERT INTO suscripciones (${cols.join(', ')}, actualizado_en) VALUES (${cols.map((_, i) => `?${i + 1}`).join(', ')}, ?${cols.length + 1})`)
    .bind(...cols.map((c) => fila[c]), fila.creado_en).run();
}

const una = (campo) => (db, v) => db.prepare(`SELECT * FROM suscripciones WHERE ${campo} = ?1`).bind(v).first();
export const porId = una('id');
export const porToken = una('token');
export const porLinkHash = una('link_token_hash');
export const porPreapproval = una('mp_preapproval_id');
export const porReserva = una('reserva_id');
export const porPlan = una('mp_plan_id');

// Los datos de contacto de un reintento de pago: la fila debe coincidir con lo enviado a Mercado Pago.
export const actualizarContacto = (db, id, { nombre, email, dni, whatsapp, ahora }) => db.prepare(
  "UPDATE suscripciones SET nombre = ?2, email = ?3, dni = ?4, whatsapp = ?5, actualizado_en = ?6 WHERE id = ?1 AND estado = 'pendiente'",
).bind(id, nombre, email, dni ? normalDni(dni) : null, whatsapp, ahora.toISOString()).run();

export const guardarPreapproval = (db, id, mpId, ahora) => db.prepare(
  'UPDATE suscripciones SET mp_preapproval_id = ?2, actualizado_en = ?3 WHERE id = ?1',
).bind(id, mpId, ahora.toISOString()).run();

// Un reintento de pago suelta el preapproval guardado (/pagar solo reintenta si no está autorizado y lo
// cancela): el que cuente será el que salga del plan nuevo.
// Cada plan queda también en suscripcion_planes, para reconocer después los cobros de uno reemplazado.
export async function guardarPlan(db, id, planId, ahora) {
  const a = ahora.toISOString();
  await db.batch([
    db.prepare(
      'UPDATE suscripciones SET mp_plan_id = ?2, mp_preapproval_id = NULL, actualizado_en = ?3 WHERE id = ?1',
    ).bind(id, planId, a),
    db.prepare('INSERT INTO suscripcion_planes (plan_id, suscripcion_id, creado_en) VALUES (?1, ?2, ?3) ON CONFLICT (plan_id) DO NOTHING').bind(planId, id, a),
  ]);
}

export async function contarPlanes(db, id) {
  const f = await db.prepare('SELECT COUNT(*) AS n FROM suscripcion_planes WHERE suscripcion_id = ?1').bind(id).first();
  return f?.n ?? 0;
}

// La suscripción a la que perteneció un plan (vigente o reemplazado).
export const suscripcionDePlan = (db, planId) => db.prepare(
  'SELECT s.* FROM suscripcion_planes p JOIN suscripciones s ON s.id = p.suscripcion_id WHERE p.plan_id = ?1',
).bind(planId).first();

// Asocia el preapproval que salió del plan solo si la fila todavía no tiene uno: si llegan dos
// preapprovals del mismo plan a la vez, gana uno y el otro queda como anómalo.
export async function asociarPreapproval(db, id, mpId, ahora) {
  const r = await db.prepare('UPDATE suscripciones SET mp_preapproval_id = ?2, actualizado_en = ?3 WHERE id = ?1 AND mp_preapproval_id IS NULL')
    .bind(id, mpId, ahora.toISOString()).run();
  return r.meta.changes === 1;
}

// El link sirve una vez y solo vigente; quien lo toma escribe sus datos en la misma sentencia.
export async function usarLink(db, { hash, nombre, email, dni, whatsapp, condicionesVersion, ahora }) {
  const a = ahora.toISOString();
  const r = await db.prepare(
    `UPDATE suscripciones SET link_usado_en = ?2, nombre = ?3, email = ?4, dni = ?5, whatsapp = ?6, acepto_condiciones_version = ?7, actualizado_en = ?2
     WHERE link_token_hash = ?1 AND link_usado_en IS NULL AND vence_en > ?2 AND estado = 'pendiente'`,
  ).bind(hash, a, nombre, email, dni ? normalDni(dni) : null, whatsapp, condicionesVersion).run();
  return r.meta.changes === 1;
}

// Un cobro aprobado suma una sola vez aunque llegue repetido o por dos caminos a la vez:
// el UPDATE solo pasa si ese pago todavía no figura como aprobado, en el mismo batch.
// contar = false: un cobro que no corresponde (tras la baja o de otro preapproval) queda registrado,
// con numero 0, sin sumar a los cobros del plan. pagoNuevoAprobado dice si esta llamada lo dejó aprobado.
export async function registrarCobro(db, { suscripcionId, mpPaymentId, cobroAutorizadoId = null, estado, montoCentimos, netoCentimos = null, metodo = null, ahora, contar = true }) {
  const a = ahora.toISOString();
  const aprobado = estado === 'approved';
  // Si el cobro se registró antes de tener pago (fila `ap-<id>`), esa fila pasa a llevar el id real del pago.
  if (cobroAutorizadoId && !mpPaymentId.startsWith('ap-')) {
    await db.prepare("UPDATE suscripcion_cobros SET mp_payment_id = ?1 WHERE mp_payment_id = ?2 AND suscripcion_id = ?3 AND estado <> 'approved' AND NOT EXISTS (SELECT 1 FROM suscripcion_cobros WHERE mp_payment_id = ?1)")
      .bind(mpPaymentId, `ap-${cobroAutorizadoId}`, suscripcionId).run();
  }
  const sumar = db.prepare(
    `UPDATE suscripciones SET cobros_aprobados = cobros_aprobados + 1, ultimo_cobro_en = ?3, actualizado_en = ?3,
       estado = CASE WHEN estado = 'pendiente' THEN 'activa' ELSE estado END
     WHERE id = ?1 AND ?4 = 1 AND NOT EXISTS (SELECT 1 FROM suscripcion_cobros WHERE mp_payment_id = ?2 AND estado = 'approved')`,
  ).bind(suscripcionId, mpPaymentId, a, aprobado && contar ? 1 : 0);
  const guardar = db.prepare(
    `INSERT INTO suscripcion_cobros (id, suscripcion_id, mp_payment_id, numero, estado, monto_centimos, neto_centimos, metodo, creado_en)
     VALUES (?1, ?2, ?3, CASE WHEN ?10 = 1 THEN (SELECT cobros_aprobados + ?9 FROM suscripciones WHERE id = ?2) ELSE 0 END, ?4, ?5, ?6, ?7, ?8)
     ON CONFLICT (mp_payment_id) DO UPDATE SET estado = excluded.estado, numero = excluded.numero,
       neto_centimos = COALESCE(excluded.neto_centimos, suscripcion_cobros.neto_centimos)
     WHERE suscripcion_cobros.estado <> 'approved'`,
  ).bind(crypto.randomUUID(), suscripcionId, mpPaymentId, estado, montoCentimos, netoCentimos, metodo, a, aprobado ? 0 : 1, contar ? 1 : 0);
  const [res, reg] = await db.batch([sumar, guardar]);
  const { numero } = await db.prepare('SELECT numero FROM suscripcion_cobros WHERE mp_payment_id = ?1').bind(mpPaymentId).first();
  return { nuevoAprobado: res.meta.changes === 1, pagoNuevoAprobado: aprobado && reg.meta.changes === 1, numero };
}

export async function marcarTerminada(db, id, ahora) {
  const r = await db.prepare("UPDATE suscripciones SET estado = 'terminada', actualizado_en = ?2 WHERE id = ?1 AND estado = 'activa'")
    .bind(id, ahora.toISOString()).run();
  return r.meta.changes === 1;
}

// La penalidad se calcula con los cobros de este momento. Una penalidad ya pagada no se toca.
// Si un cobro entra entre la lectura y el UPDATE, se relee y se reintenta.
export async function cancelar(db, { id, motivo, ahora }) {
  for (let intento = 0; intento < 3; intento++) {
    const s = await porId(db, id);
    if (!s) return { cambio: false, penalidad_centimos: 0, penalidad_estado: 'no_aplica' };
    if (!['pendiente', 'activa'].includes(s.estado)) return { cambio: false, penalidad_centimos: s.penalidad_centimos, penalidad_estado: s.penalidad_estado };
    const pen = penalidadAlCancelar(s);
    const r = await db.prepare(
      `UPDATE suscripciones SET estado = ?2, motivo_cancelacion = ?3, cancelada_en = ?4, actualizado_en = ?4,
         penalidad_centimos = CASE WHEN penalidad_estado = 'pagada' THEN penalidad_centimos ELSE ?5 END,
         penalidad_estado = CASE WHEN penalidad_estado = 'pagada' THEN 'pagada' WHEN ?5 > 0 THEN 'pendiente' ELSE 'no_aplica' END
       WHERE id = ?1 AND estado IN ('pendiente', 'activa') AND cobros_aprobados = ?6`,
    ).bind(id, motivo === 'cobro_fallido' ? 'cobro_fallido' : 'cancelada', motivo, ahora.toISOString(), pen, s.cobros_aprobados).run();
    if (r.meta.changes === 1) {
      const f = await porId(db, id);
      return { cambio: true, penalidad_centimos: f.penalidad_centimos, penalidad_estado: f.penalidad_estado };
    }
  }
  throw new Error('cancelar: conflicto de concurrencia');
}

export const cotizarPenalidad = (db, id, monto, ahora) => db.prepare(
  "UPDATE suscripciones SET penalidad_centimos = ?2, actualizado_en = ?3 WHERE id = ?1 AND penalidad_estado <> 'pagada'",
).bind(id, monto, ahora.toISOString()).run();

export async function marcarPenalidadPagada(db, { id, mpPaymentId = null, por = null, ahora }) {
  const r = await db.prepare(
    `UPDATE suscripciones SET penalidad_estado = 'pagada', penalidad_mp_payment_id = ?2, penalidad_marcada_por = ?3, actualizado_en = ?4
     WHERE id = ?1 AND penalidad_estado <> 'pagada'`,
  ).bind(id, mpPaymentId, por, ahora.toISOString()).run();
  return r.meta.changes === 1;
}

// Toma el turno del aviso de deuda: solo pasa si no se avisó en las últimas 24 h.
export async function tomarAvisoDeuda(db, id, ahora) {
  const r = await db.prepare(
    'UPDATE suscripciones SET aviso_deuda_en = ?2 WHERE id = ?1 AND (aviso_deuda_en IS NULL OR aviso_deuda_en <= ?3)',
  ).bind(id, ahora.toISOString(), new Date(ahora.getTime() - 24 * 3600000).toISOString()).run();
  return r.meta.changes === 1;
}

export const deudaPorDni = (db, dni) => db.prepare(
  "SELECT * FROM suscripciones WHERE dni = ?1 AND penalidad_estado = 'pendiente' ORDER BY cancelada_en DESC LIMIT 1",
).bind(normalDni(dni)).first();

const FILTROS = {
  // Las pendientes que ya autorizaron en Mercado Pago (tienen preapproval) sí se listan:
  // esperan el primer cobro y el equipo puede sincronizarlas.
  todas: "(estado <> 'pendiente' OR mp_preapproval_id IS NOT NULL)",
  activas: "estado = 'activa'",
  terminan: "estado = 'activa' AND duracion_meses > 1 AND cobros_aprobados = duracion_meses - 1",
  fallido: "estado = 'cobro_fallido'",
  penalidad: "penalidad_estado = 'pendiente'",
  canceladas: "estado IN ('cancelada', 'cobro_fallido')",
};
export const FILTROS_SUSCRIPCION = Object.keys(FILTROS);

export async function listar(db, { filtro }) {
  if (!Object.hasOwn(FILTROS, filtro)) throw new Error('filtro inválido');
  const { results } = await db.prepare(`SELECT * FROM suscripciones WHERE ${FILTROS[filtro]} ORDER BY actualizado_en DESC LIMIT 200`).all();
  return results;
}

export async function conteos(db) {
  const fila = await db.prepare(`SELECT ${Object.entries(FILTROS).map(([k, w]) => `SUM(CASE WHEN ${w} THEN 1 ELSE 0 END) AS ${k}`).join(', ')} FROM suscripciones`).first();
  return Object.fromEntries(Object.keys(FILTROS).map((k) => [k, fila?.[k] ?? 0]));
}
