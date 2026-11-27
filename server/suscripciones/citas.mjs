// «Por agendar» (spec 2026-11-26-citas-por-cobro): cuántas citas le faltan a cada suscripción, de la web
// ('s:<id>') o hecha a mano en Mercado Pago ('x:<preapproval>'). Nada se guarda por cita: se calcula
// con los cobros aprobados, lo usado antes, las citas de los links de la suscripción y los ajustes.
//   faltan = citas de los cobros − usadas antes − primera cita (web) − citas agendadas con link + ajuste
// Qué citas agendadas con link son de cada una: spec 2026-11-27-por-agendar-vistas.
import { citasDeCobros, sugerirPlan } from '../agenda/opciones.mjs';
import { PRODUCTO_PRUEBA } from './calculo.mjs';

const esWeb = (clave) => String(clave).startsWith('s:');
const MES = 30 * 86400000;
const UN_DIA = 86400000;
// «Control Acompañamiento» funciona igual que Acompañamiento. «Renovación Constancia» es un pago aparte: no entra.
const familia = (plan) => String(plan ?? '').split(':')[0].replace(/^control_/, '');
const palabras = (t) => String(t ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().split(/\s+/).filter(Boolean);
// Cuando el mismo documento es paciente de una suscripción y quien paga otra: para la segunda, la ficha tiene que
// llevar el primer nombre de esa suscripción.
const mismoNombre = (suscripcion, ficha) => {
  const a = palabras(suscripcion);
  const b = palabras(ficha);
  return !a.length || !b.length || b.includes(a[0]);
};
const documento = (d) => { const x = String(d ?? '').toUpperCase().replace(/[^A-Z0-9]/g, ''); return x.length >= 6 ? x : null; };
const diaLima = (ms) => new Date(ms - 5 * 3600000).toISOString().slice(0, 10);
const DESDE = "(SELECT valor FROM sync_estado WHERE clave = 'citas_por_cobro_desde') AS desde";

async function filasWeb(db) {
  const ultimo = (c) => `(SELECT c.${c} FROM suscripcion_cobros c WHERE c.suscripcion_id = s.id AND c.estado = 'approved' ORDER BY c.creado_en DESC LIMIT 1)`;
  const { results } = await db.prepare(
    `SELECT s.id, s.nombre, s.whatsapp, s.dni, s.creado_en, s.estado, s.producto, s.duracion_meses, s.cobros_aprobados, s.reserva_id,
       s.ultimo_cobro_en, r.estado AS primera_estado, r.cliente_id, cl.dni AS cliente_dni, p.fecha AS proximo, v.cobros AS vistos,
       ${ultimo('monto_centimos')} AS monto_centimos, ${ultimo('creado_en')} AS cobrado_en, ${DESDE}
     FROM suscripciones s LEFT JOIN reservas r ON r.id = s.reserva_id LEFT JOIN clientes cl ON cl.id = r.cliente_id
     LEFT JOIN sus_proximo p ON p.clave = 's:' || s.id LEFT JOIN cobros_vistos v ON v.clave = 's:' || s.id
     WHERE s.cobros_aprobados > 0 AND s.producto <> ?1`,
  ).bind(PRODUCTO_PRUEBA).all();
  return results.map((s) => ({
    fila: {
      clave: `s:${s.id}`, origen: 'web', nombre: s.nombre, pagador: null, reason: null, whatsapp: s.whatsapp, plan: `${s.producto}:${s.duracion_meses}`,
      citas_por_cobro: null, sin_asignar: false,
      cobros: s.cobros_aprobados, cobros_total: s.duracion_meses > 1 ? s.duracion_meses : null,
      monto_centimos: s.monto_centimos, cobrado_en: s.cobrado_en, sugerido: null,
      proximo: s.estado !== 'activa' ? null : s.proximo ?? (s.ultimo_cobro_en ? new Date(Date.parse(s.ultimo_cobro_en) + MES).toISOString() : null),
    },
    // Sus citas se reconocen por la ficha de la primera cita; sin ella, por el documento de quien se suscribió.
    paciente: { cliente: s.cliente_id, doc: documento(s.cliente_dni) ?? documento(s.dni), nombre: documento(s.cliente_dni) ? null : s.nombre,
      familia: familia(s.producto), inicio: Date.parse(s.creado_en), sinPrimera: !s.reserva_id },
    previas: 0, primera: s.primera_estado === 'confirmada' ? 1 : 0, registrado: s.cobrado_en, desde: s.desde, vistos: s.vistos,
  }));
}

async function filasMano(db) {
  const { results } = await db.prepare(
    `SELECT x.preapproval_id, x.pagador, x.reason, x.estado_mp, x.monto_centimos AS monto_plan, cs.cliente_id, cs.plan, cs.citas_por_cobro, cs.citas_previas,
       cs.actualizado_en AS asignada_en, cl.nombre, cl.whatsapp, cl.dni, p.fecha AS proximo, v.cobros AS vistos, ${DESDE},
       COUNT(c.mp_payment_id) AS cobros, MAX(c.cobrado_en) AS cobrado_en, MAX(c.creado_en) AS registrado,
       (SELECT u.monto_centimos FROM sus_externa_cobros u WHERE u.preapproval_id = x.preapproval_id ORDER BY u.cobrado_en DESC LIMIT 1) AS monto_centimos
     FROM sus_externas x LEFT JOIN sus_externa_cobros c ON c.preapproval_id = x.preapproval_id
     LEFT JOIN citas_suscripcion cs ON cs.clave = 'x:' || x.preapproval_id
     LEFT JOIN clientes cl ON cl.id = cs.cliente_id
     LEFT JOIN sus_proximo p ON p.clave = 'x:' || x.preapproval_id LEFT JOIN cobros_vistos v ON v.clave = 'x:' || x.preapproval_id
     GROUP BY x.preapproval_id HAVING COUNT(c.mp_payment_id) > 0 OR x.estado_mp = 'authorized'`,
  ).all();
  return results.map((x) => {
    const asignada = Boolean(x.cliente_id);
    const sugerido = asignada ? null : sugerirPlan(x.reason);
    const meses = Number(asignada ? String(x.plan).split(':')[1] : sugerido?.duracion);
    return {
      fila: {
        clave: `x:${x.preapproval_id}`, origen: 'mano', nombre: asignada ? x.nombre : null, pagador: x.pagador, whatsapp: asignada ? x.whatsapp : null,
        reason: x.reason, plan: asignada ? x.plan : null, citas_por_cobro: asignada ? x.citas_por_cobro : null, sin_asignar: !asignada,
        cobros: x.cobros, cobros_total: meses > 1 ? meses : null, monto_centimos: x.monto_centimos ?? x.monto_plan, cobrado_en: x.cobrado_en, sugerido,
        proximo: x.estado_mp === 'authorized' ? x.proximo : null,
      },
      // «otro» no dice qué producto es: solo cuentan los links de su fila.
      paciente: asignada && x.plan !== 'otro'
        ? { cliente: x.cliente_id, doc: documento(x.dni), nombre: null, familia: familia(x.plan), inicio: Date.parse(x.asignada_en), sinPrimera: false } : null,
      previas: x.citas_previas ?? 0, primera: 0, registrado: x.registrado, desde: x.desde, vistos: x.vistos,
    };
  });
}

// De quién es cada cita agendada con un link. La del link creado desde una fila, de esa fila. Las demás, de la
// suscripción del mismo paciente y producto que empezó más tarde antes de reservarla (spec 2026-11-27).
function repartir(filas, links, ahora) {
  const cuenta = new Map(filas.map((f) => [f.fila.clave, { agendadas: 0, ultima: 0, sin_usar: 0 }]));
  const sumar = (clave, creada) => {
    const c = cuenta.get(clave);
    if (!c) return;
    c.agendadas += 1;
    c.ultima = Math.max(c.ultima, creada);
  };
  // Una hecha a mano reconoce citas desde que se asignó: las anteriores ya van en «qué cita es».
  const candidatas = filas.filter((f) => f.paciente);
  for (const l of links) {
    if (l.clave) {
      const c = cuenta.get(l.clave);
      if (c && !l.usado_en && l.vence_en > ahora.toISOString()) c.sin_usar += 1;
    }
    if (l.estado !== 'confirmada') continue;
    const creada = Date.parse(l.creada);
    if (l.clave) { sumar(l.clave, creada); continue; }
    const doc = documento(l.dni);
    const delPaciente = candidatas.filter(({ paciente: p }) => p.familia === familia(l.plan)
      && ((p.cliente && p.cliente === l.cliente_id) || (p.doc && p.doc === doc)));
    // `nombre` solo lo llevan las reconocidas por el documento de quien paga.
    const firme = delPaciente.some((f) => f.paciente.nombre == null);
    const suyas = delPaciente.filter((f) => f.paciente.nombre == null || !firme || mismoNombre(f.paciente.nombre, l.paciente));
    const antes = suyas.filter((f) => creada >= f.paciente.inicio).sort((a, b) => b.paciente.inicio - a.paciente.inicio);
    // «Ya tiene cita»: la que reservó antes de suscribirse, si es desde el día anterior.
    const yaTenia = suyas.filter((f) => f.paciente.sinPrimera && l.fecha_lima >= diaLima(f.paciente.inicio - UN_DIA))
      .sort((a, b) => a.paciente.inicio - b.paciente.inicio);
    const duena = antes[0] ?? yaTenia[0];
    if (duena) sumar(duena.fila.clave, creada);
  }
  return cuenta;
}

async function todasLasFilas(db, ahora) {
  const [web, mano, links, ajustes] = await Promise.all([
    filasWeb(db), filasMano(db),
    // Solo lo que puede contar: los links de una fila y las citas confirmadas desde la suscripción más antigua. Este
    // cálculo corre dentro de cada cobro y no puede crecer con toda la historia de links.
    db.prepare(`SELECT l.sus_clave AS clave, l.plan, l.usado_en, l.vence_en,
        r.estado, r.cliente_id, r.creado_en AS creada, r.fecha_lima, cl.dni, cl.nombre AS paciente
      FROM links_agenda l LEFT JOIN reservas r ON r.id = l.reserva_id LEFT JOIN clientes cl ON cl.id = r.cliente_id
      WHERE l.sus_clave IS NOT NULL OR (r.estado = 'confirmada' AND r.fecha_lima >= COALESCE(
        (SELECT date(MIN(x.t), '-2 day') FROM (SELECT MIN(creado_en) AS t FROM suscripciones
          UNION ALL SELECT MIN(actualizado_en) FROM citas_suscripcion WHERE cliente_id IS NOT NULL) x), ''))`).all(),
    db.prepare('SELECT clave, SUM(cantidad) AS n FROM citas_ajustes GROUP BY clave').all(),
  ]);
  const todas = [...web, ...mano];
  const cuenta = repartir(todas, links.results, ahora);
  const porAjuste = new Map(ajustes.results.map((a) => [a.clave, a.n]));
  return todas.map(({ fila: f, previas, primera, registrado, desde, vistos }) => {
    const c = cuenta.get(f.clave);
    const ajuste = porAjuste.get(f.clave) ?? 0;
    const dadas = f.sin_asignar ? null : citasDeCobros(f.plan, f.cobros, f.citas_por_cobro);
    const usadas = previas + primera + c.agendadas;
    const faltan = dadas == null ? null : dadas - usadas + ajuste;
    // Aviso «Nuevo pago»: se apaga con «Visto» o al quedar al día con una cita reservada después del cobro.
    const atendido = faltan != null && faltan <= 0 && c.ultima > Date.parse(registrado);
    const nuevo = f.cobros > 0 && Date.parse(f.cobrado_en) > Date.parse(desde) && (vistos ?? 0) < f.cobros && !atendido;
    const pendiente = f.cobros > 0 && (f.sin_asignar || faltan == null || faltan > 0 || nuevo);
    return { ...f, dadas, usadas, ajuste, faltan, links_sin_usar: c.sin_usar, nuevo, pendiente };
  });
}

const grupo = (f) => (f.nuevo ? 0 : f.sin_asignar ? 1 : 2);

// Sin `todas`, solo las que tienen algo que hacer. La suscripción terminada o cancelada sigue
// mientras le falten citas (decisión 9).
export async function filasPorAgendar(db, ahora, { todas = false } = {}) {
  const filas = await todasLasFilas(db, ahora);
  return filas.filter((f) => todas || f.pendiente)
    .sort((a, b) => grupo(a) - grupo(b) || String(b.cobrado_en ?? '').localeCompare(String(a.cobrado_en ?? '')));
}

export async function filaPorClave(db, clave, ahora) {
  return (await todasLasFilas(db, ahora)).find((f) => f.clave === clave) ?? null;
}

// El equipo da por visto el aviso hasta ese número de cobro; el siguiente lo vuelve a encender.
export async function marcarVisto(db, { clave, cobros, por, ahora }) {
  await db.prepare(
    `INSERT INTO cobros_vistos (clave, cobros, visto_por, visto_en) VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT (clave) DO UPDATE SET cobros = excluded.cobros, visto_por = excluded.visto_por, visto_en = excluded.visto_en
     WHERE excluded.cobros > cobros_vistos.cobros`,
  ).bind(clave, cobros, por, ahora.toISOString()).run();
}

// Sentencia sin ejecutar: la revisión de cada 15 min cuenta cuántas lanza.
export const guardarProximo = (db, { clave, fecha, ahora }) => db.prepare(
  `INSERT INTO sus_proximo (clave, fecha, actualizado_en) VALUES (?1, ?2, ?3)
   ON CONFLICT (clave) DO UPDATE SET fecha = excluded.fecha, actualizado_en = excluded.actualizado_en`,
).bind(clave, fecha, ahora.toISOString());

export async function ajustar(db, { clave, cantidad, motivo, por, ahora }) {
  await db.prepare('INSERT INTO citas_ajustes (id, clave, cantidad, motivo, creado_por, creado_en) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
    .bind(crypto.randomUUID(), clave, cantidad, motivo, por, ahora.toISOString()).run();
}

// Corrige una unión equivocada de una hecha a mano: los cobros se quedan y las citas de sus links dejan de contar.
export async function quitarPaciente(db, { clave }) {
  if (esWeb(clave)) return false;
  const [, borrado] = await db.batch([
    // Los ajustes eran de ese paciente: no pasan al siguiente.
    db.prepare(`DELETE FROM citas_ajustes WHERE clave = ?1
      AND EXISTS (SELECT 1 FROM citas_suscripcion WHERE clave = ?1 AND cliente_id IS NOT NULL)`).bind(clave),
    db.prepare('DELETE FROM citas_suscripcion WHERE clave = ?1 AND cliente_id IS NOT NULL').bind(clave),
    db.prepare('UPDATE links_agenda SET sus_clave = NULL, sus_cpc = NULL WHERE sus_clave = ?1').bind(clave),
  ]);
  return borrado.meta.changes === 1;
}
