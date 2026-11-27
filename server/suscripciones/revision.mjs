// Revisión de cobros cada 15 min (spec 2026-11-26-citas-por-cobro), respaldo del webhook. Pide UNA lista de
// suscripciones vigentes; solo pregunta por los cobros de las que llevan más de los que la web tiene.
import { procesarCobro } from './procesar.mjs';
import { esHechaAMano, guardarExterna, registrarCobroExterno } from './externas.mjs';
import { conReintento, dormir, PAUSA_MS } from './reintento.mjs';
import { correoRevisionFallida } from './correos.mjs';
import { avisarRespaldo } from '../reservas/aviso-equipo.mjs';
import { leerSync, guardarSync } from '../reservas/repo.mjs';

export const CLAVE_FALLOS = 'citas_revision_fallos';
export const FALLOS_PARA_AVISAR = 4;
// Cloudflare corta una invocación a las 50 consultas a la base (plan gratuito), y un cobro cortado a
// medias pierde sus correos. Un cobro cuesta hasta unas 15: no se empieza otro pasadas MAX_CONSULTAS.
// Lo que no cabe sale en las vueltas siguientes (la carga inicial se reparte así).
export const MAX_POR_VUELTA = 5;
const MAX_CONSULTAS = 30;
const SIN_RESOLVER = new Set(['pending', 'in_process', 'authorized']);
const UN_DIA = 86400000;
const VUELTA_MS = 15 * 60000;

const cobrosEnMp = (pre) => Number(pre?.summarized?.charged_quantity) || 0;

// La misma base, contando las consultas de esta vuelta.
function contando(db) {
  const cuenta = { n: 0 };
  return { cuenta, db: { prepare: (sql) => { cuenta.n += 1; return db.prepare(sql); }, batch: (s) => db.batch(s) } };
}

// Devuelve true si no quedó nada por mirar: ni cobros sin resolver ni cobros que no cupieron.
async function revisarExterna(deps, env, pre, pedir, quedaCupo) {
  const guardados = new Set((await deps.db.prepare('SELECT mp_payment_id FROM sus_externa_cobros WHERE preapproval_id = ?1').bind(String(pre.id)).all())
    .results.map((c) => c.mp_payment_id));
  let completa = true;
  for (const ap of await pedir(() => deps.mp.buscarCobrosSuscripcion(String(pre.id)))) {
    if (ap?.status === 'recycling') completa = false; // Mercado Pago todavía lo está reintentando
    if (!ap?.payment?.id || guardados.has(String(ap.payment.id))) continue;
    if (!quedaCupo()) return false;
    const pago = await pedir(() => deps.mp.obtenerPago(String(ap.payment.id)));
    if (SIN_RESOLVER.has(pago?.status)) completa = false;
    await registrarCobroExterno(deps, env, pre, ap, pago);
  }
  return completa;
}

async function revisarWeb(deps, env, id, pedir, quedaCupo) {
  const aprobados = new Set((await deps.db.prepare(`SELECT c.mp_payment_id FROM suscripcion_cobros c JOIN suscripciones s ON s.id = c.suscripcion_id
    WHERE s.mp_preapproval_id = ?1 AND c.estado = 'approved'`).bind(id).all()).results.map((c) => c.mp_payment_id));
  for (const ap of await pedir(() => deps.mp.buscarCobrosSuscripcion(id))) {
    if (ap?.payment?.id && aprobados.has(String(ap.payment.id))) continue;
    if (!quedaCupo()) return;
    await pedir(() => procesarCobro(deps, env, String(ap.id)));
  }
}

// Por si el contador no sube: la fecha del último cobro en Mercado Pago es posterior a todo lo guardado.
const fechaAvanzo = (pre, guardada) => Date.parse(pre?.summarized?.last_charged_date) > (Date.parse(guardada) || 0) + UN_DIA;

// Qué suscripciones hay que consultar: las de la lista con cobros que faltan, y las hechas a mano que ya
// no salen en ella (el último cobro suele llegar cuando Mercado Pago ya la dio por terminada).
async function pendientes(deps, env, lista, pedir, quedaCupo) {
  const [mano, web] = await Promise.all([
    deps.db.prepare(`SELECT x.preapproval_id AS id, x.estado_mp, COUNT(c.mp_payment_id) AS n, MAX(c.cobrado_en) AS ultimo FROM sus_externas x
      LEFT JOIN sus_externa_cobros c ON c.preapproval_id = x.preapproval_id GROUP BY x.preapproval_id`).all(),
    deps.db.prepare('SELECT mp_preapproval_id AS id, cobros_aprobados AS n FROM suscripciones WHERE mp_preapproval_id IS NOT NULL').all(),
  ]);
  const deMano = new Map(mano.results.map((x) => [x.id, x]));
  const deWeb = new Map(web.results.map((s) => [s.id, s.n]));
  const tareas = [];
  for (const pre of lista) {
    const id = String(pre.id);
    if (esHechaAMano(pre.reason)) {
      if (cobrosEnMp(pre) > (deMano.get(id)?.n ?? 0) || fechaAvanzo(pre, deMano.get(id)?.ultimo)) {
        tareas.push({ clave: id, hacer: () => revisarExterna(deps, env, pre, pedir, quedaCupo) });
      }
    } else if (deWeb.has(id) && cobrosEnMp(pre) > deWeb.get(id)) {
      tareas.push({ clave: id, hacer: () => revisarWeb(deps, env, id, pedir, quedaCupo) });
    }
  }
  const vistas = new Set(lista.map((p) => String(p.id)));
  for (const x of deMano.values()) {
    if (x.estado_mp !== 'authorized' || vistas.has(x.id)) continue;
    tareas.push({ clave: x.id, hacer: async () => {
      const pre = { ...(await pedir(() => deps.mp.obtenerSuscripcion(x.id))), id: x.id };
      // Sin el estado nuevo hasta que no quede nada pendiente: mientras figure vigente, se vuelve a mirar.
      if (await revisarExterna(deps, env, { ...pre, status: undefined }, pedir, quedaCupo)) await guardarExterna(deps.db, pre, deps.ahora());
    } });
  }
  return tareas;
}

export async function revisarCobros(original, env) {
  const { db, cuenta } = contando(original.db);
  const deps = { ...original, db };
  const quedaCupo = () => cuenta.n < MAX_CONSULTAS;
  const esperar = deps.esperar ?? dormir;
  const pedir = (fn) => conReintento(fn, esperar);
  const antes = (await leerSync(deps.db, CLAVE_FALLOS)) || '{}';
  const fallos = JSON.parse(antes);
  const avisar = [];
  const fallo = (clave, e) => {
    console.error('revisión de cobros', clave, e);
    fallos[clave] = (fallos[clave] ?? 0) + 1;
    if (fallos[clave] === FALLOS_PARA_AVISAR) avisar.push({ clave, error: String(e?.message ?? e).slice(0, 300) });
  };
  let vigentes = 0;
  let consultadas = 0;
  let errores = 0;
  let lista = null;
  try {
    lista = await pedir(() => deps.mp.listarSuscripcionesVigentes());
    vigentes = lista.length;
    delete fallos.lista;
  } catch (e) {
    errores += 1;
    fallo('lista', e);
  }
  if (lista) {
    // Si no caben todas, cada vuelta empieza una más adelante: una que siempre queda pendiente o
    // fallando no deja sin turno a las demás.
    const tareas = await pendientes(deps, env, lista, pedir, quedaCupo);
    const inicio = tareas.length > MAX_POR_VUELTA ? Math.floor(deps.ahora().getTime() / VUELTA_MS) % tareas.length : 0;
    for (const t of [...tareas.slice(inicio), ...tareas.slice(0, inicio)].slice(0, MAX_POR_VUELTA)) {
      if (!quedaCupo()) break;
      if (consultadas) await esperar(PAUSA_MS);
      consultadas += 1;
      try {
        await t.hacer();
        delete fallos[t.clave];
      } catch (e) {
        errores += 1;
        fallo(t.clave, e);
      }
    }
  }
  const despues = JSON.stringify(fallos);
  if (despues !== antes) await guardarSync(deps.db, CLAVE_FALLOS, despues);
  if (avisar.length) await avisarRespaldo(deps, env, correoRevisionFallida(avisar));
  return { vigentes, consultadas, errores };
}
