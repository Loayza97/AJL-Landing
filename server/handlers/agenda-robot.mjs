// ─── Agenda directa para el robot de la siguiente cita · AJL Nutrición ──────
// POST /api/agenda/robot  reserva una cita sin que nadie use un link (solo el robot, con su clave).
//
// El robot ya decidió qué cita toca (sesión, nutri, día y hora, con sus respaldos). Esto hace lo mismo que
// un link de agenda: revisa que la hora esté libre (incluido el Google Calendar), reserva con los mismos
// candados que /agenda/ (cruce, minutos del día, cupo de la nutri), crea el evento con Meet, invita a la
// nutri y al paciente y manda el correo de confirmación. Cada reserva queda como un link usado, así sale
// en «Agendados» del panel con su producto y su cita.
//
// Cuerpo (JSON):
//   clave          texto único de esta cita (el robot la arma con DNI + producto + sesión): repetirla no duplica
//   documento      { tipo: 'dni'|'ce'|'pasaporte', numero }
//   paciente       { nombres, apellido_paterno, apellido_materno?, email, whatsapp }  solo si aún no está en la web
//   producto       id del producto de la web (constancia, acompanamiento, …)
//   sesiones       { n, m }  «n de m» de la Base Maestra
//   nutricionista  id de la nutricionista
//   modalidad      'presencial' | 'video'
//   duracion_min   30 | 60
//   horas          hasta 6 inicios en UTC, por orden de preferencia: la primera libre gana
//   simular        true = modo sombra: hace todas las comprobaciones y dice qué hora tomaría, sin escribir nada
//
// Fuera de alcance a propósito: Plan Pareja (dos personas) y cualquier cambio de cita.
import { json, readJson } from '../http.mjs';
import { randomToken, sha256Hex } from '../tokens.mjs';
import { TIPOS_LINK } from '../agenda/tipos.mjs';
import * as agenda from '../agenda/repo.mjs';
import { planPorSesiones, citaValida, productoDeTipo, etiquetaPlan } from '../agenda/opciones.mjs';
import { finalizarAgenda, remitente } from '../agenda/finalizar.mjs';
import * as repo from '../reservas/repo.mjs';
import { fechaLima, etiquetaLima, sumarMinutos } from '../reservas/tiempo.mjs';
import { correoEquipoAlerta } from '../reservas/correos.mjs';
import { contexto, libresDelDia, mismoToken } from './reservas.mjs';
import { persona, revisarDocumento } from '../../src/data/validar-datos.js';

const bad = (status, error, extra = {}) => json(status, { ok: false, error, ...extra });
const CLAVE = /^[A-Za-z0-9:_.|-]{8,120}$/;
const INICIO = /^\d{4}-\d{2}-\d{2}T\d{2}:(00|30):00Z$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_HORAS = 6;

// 60 min → sesión de 1 hora; 30 min → control virtual o control presencial/virtual.
const tipoDe = (duracion, modalidad) => (duracion === 60 ? 's60' : modalidad === 'video' ? 'c30v' : 'c30p');

function validar(d, deps) {
  if (!d || typeof d !== 'object') return { error: 'Cuerpo inválido' };
  if (!CLAVE.test(String(d.clave ?? ''))) return { error: 'Falta la clave de la cita' };
  const doc = revisarDocumento(d.documento?.tipo ?? 'dni', d.documento?.numero);
  if (!doc.ok) return { error: doc.error };
  if (!['presencial', 'video'].includes(d.modalidad)) return { error: 'Modalidad inválida' };
  if (![30, 60].includes(d.duracion_min)) return { error: 'Duración inválida' };
  if (!deps.nutricionistas.some((n) => n.id === d.nutricionista)) return { error: 'Nutricionista inválida' };
  const horas = Array.isArray(d.horas) ? [...new Set(d.horas)] : [];
  if (!horas.length || horas.length > MAX_HORAS || !horas.every((h) => INICIO.test(String(h)))) return { error: 'Horas inválidas' };
  const tipo = tipoDe(d.duracion_min, d.modalidad);
  const m = Number(d.sesiones?.m);
  const n = String(d.sesiones?.n ?? '');
  const plan = typeof d.producto === 'string' ? planPorSesiones(d.producto, m) : null;
  if (!plan) return { error: 'Ese producto y total de sesiones no existen en la web', motivo: 'plan' };
  if (!citaValida(plan, n)) return { error: 'La sesión no existe en ese plan', motivo: 'plan' };
  if (!productoDeTipo(tipo, plan)) return { error: 'Ese producto no va con una cita de esa duración y modalidad', motivo: 'tipo' };
  return { clave: d.clave, doc: { tipo: d.documento?.tipo ?? 'dni', documento: doc.documento }, tipo, plan, cita: n, horas,
    nutricionista: d.nutricionista, modalidad: d.modalidad, duracion: d.duracion_min, paciente: d.paciente, simular: d.simular === true };
}

// Datos del paciente que aún no está en la web (salen de la Base Maestra). Sin fecha de nacimiento ni
// aceptación de condiciones: no las tenemos, y la web deja esos campos vacíos.
function pacienteNuevo(p, doc) {
  if (!p || typeof p !== 'object') return { error: 'El paciente no está en la web: faltan sus datos', motivo: 'paciente' };
  const q = persona(p.nombres, p.apellido_paterno, p.apellido_materno, doc.tipo, doc.documento, false);
  if (!q.ok) return { error: q.error, motivo: 'paciente' };
  const whatsapp = String(p.whatsapp ?? '').replace(/[^\d+]/g, '');
  const email = String(p.email ?? '').trim().toLowerCase();
  if (!/^\+?\d{9,15}$/.test(whatsapp)) return { error: 'WhatsApp inválido', motivo: 'paciente' };
  if (!EMAIL.test(email)) return { error: 'Correo inválido', motivo: 'paciente' };
  return { cliente: { nombre: [q.nombres, q.paterno, q.materno].filter(Boolean).join(' '), nombres: q.nombres, apellido_paterno: q.paterno,
    apellido_materno: q.materno || null, fecha_nacimiento: null, tipo_documento: q.tipo, dni: q.documento, whatsapp, email } };
}

const respuesta = (deps, r, extra) => ({
  ok: true, reserva_id: r.id ?? null, inicio: r.inicio_utc, fecha_lima: r.fecha_lima, etiqueta: etiquetaLima(r.inicio_utc), modalidad: r.modalidad,
  duracion_min: r.duracion_min, nutricionista: r.nutricionista_id, meet: r.meet_url ?? null,
  calendario: r.calendario_pendiente ? 'pendiente' : 'ok', ...extra,
});

// Modo sombra: mismas comprobaciones que la reserva real (paciente, plan, horas libres con el Calendar), sin crear
// link, paciente, reserva, evento ni correos. Si la clave ya se agendó, lo dice y devuelve esa cita.
async function simular(deps, v) {
  const link = await agenda.linkPorId(deps.db, `robot:${v.clave}`);
  if (link?.usado_en) return json(200, respuesta(deps, { ...link, id: link.reserva_id }, { simulada: true, ya_agendada: true, plan: v.plan, cita: v.cita }));
  const previo = await agenda.pacientePorDni(deps.db, v.doc.documento, v.doc.tipo);
  if (!previo) {
    const n = pacienteNuevo(v.paciente, v.doc);
    if (n.error) return bad(400, n.error, { motivo: n.motivo });
  }
  const contextos = new Map();
  const intentadas = [];
  try {
    for (const inicio of v.horas) {
      const fecha = fechaLima(new Date(inicio));
      if (!contextos.has(fecha)) contextos.set(fecha, await contexto(deps, fecha, 1));
      const libre = libresDelDia(deps, contextos.get(fecha), { fecha, modalidad: v.modalidad, filtro: v.nutricionista,
        duracionMin: v.duracion, pasoMin: v.duracion }).find((h) => h.inicio === inicio);
      if (!libre) { intentadas.push({ inicio, motivo: 'no_libre' }); continue; }
      return json(200, respuesta(deps, { inicio_utc: libre.inicio, fecha_lima: fecha, modalidad: v.modalidad, duracion_min: v.duracion,
        nutricionista_id: libre.nutricionista_id }, { simulada: true, ya_agendada: false, paciente_nuevo: !previo, plan: v.plan,
        plan_etiqueta: etiquetaPlan(v.plan), cita: v.cita, intentadas }));
    }
  } catch (e) {
    console.error('agenda/robot/simular', e);
    return bad(503, 'No pudimos revisar la agenda.', { motivo: 'agenda' });
  }
  return bad(409, 'Ninguna de las horas estaba libre', { motivo: 'sin_hora', intentadas });
}

export async function handleAgendaRobot(request, env, deps) {
  if (request.method !== 'POST') return bad(405, 'Método no permitido');
  if (!env.ROBOT_AGENDA_TOKEN) return bad(503, 'Agenda del robot sin configurar');
  if (!(await mismoToken(request.headers.get('Authorization') || '', `Bearer ${env.ROBOT_AGENDA_TOKEN}`))) return bad(401, 'No autorizado');
  const v = validar(await readJson(request), deps);
  if (v.error) return bad(400, v.error, v.motivo ? { motivo: v.motivo } : {});
  const ahora = deps.ahora();
  const linkId = `robot:${v.clave}`;

  if (v.simular) return simular(deps, v);

  // Repetir la misma clave no duplica: si ya se agendó, se devuelve esa cita.
  let link = await agenda.linkPorId(deps.db, linkId);
  if (link?.usado_en) {
    return json(200, respuesta(deps, { ...link, id: link.reserva_id, nutricionista_id: link.nutricionista_id }, { ya_agendada: true, plan: v.plan, cita: v.cita }));
  }
  if (!link) {
    try {
      await agenda.crearLink(deps.db, { id: linkId, tokenHash: await sha256Hex(randomToken()), tipo: v.tipo, creadoPor: 'robot-siguiente-cita', ahora,
        plan: v.plan, cita: v.cita, nutri: v.nutricionista });
    } catch (e) {
      if (!/UNIQUE constraint failed/i.test(String(e?.message))) throw e; // otra llamada con la misma clave llegó primero
    }
    link = await agenda.linkPorId(deps.db, linkId);
  } else if (agenda.estadoLink(link, ahora) === 'vencido') {
    await agenda.reactivarLink(deps.db, linkId, ahora);
  }

  const previo = await agenda.pacientePorDni(deps.db, v.doc.documento, v.doc.tipo);
  let cliente = null;
  let clienteId = previo?.id ?? null;
  if (!previo) {
    const n = pacienteNuevo(v.paciente, v.doc);
    if (n.error) return bad(400, n.error, { motivo: n.motivo });
    cliente = n.cliente;
    clienteId = crypto.randomUUID();
  }

  // Las horas libres salen del mismo motor de la web: horario de la nutri, Google Calendar, reservas y topes.
  const contextos = new Map();
  const intentadas = [];
  let reservaId = null;
  let hora = null;
  try {
    for (const inicio of v.horas) {
      const fecha = fechaLima(new Date(inicio));
      if (!contextos.has(fecha)) contextos.set(fecha, await contexto(deps, fecha, 1));
      const libre = libresDelDia(deps, contextos.get(fecha), { fecha, modalidad: v.modalidad, filtro: v.nutricionista,
        duracionMin: v.duracion, pasoMin: v.duracion }).find((h) => h.inicio === inicio);
      if (!libre) { intentadas.push({ inicio, motivo: 'no_libre' }); continue; }
      const id = crypto.randomUUID();
      const res = await agenda.agendarConLink(deps.db, {
        link: linkId, reservaId: id, token: randomToken(), tipoId: v.tipo, cliente, clienteId, ahora,
        hora: { inicio: libre.inicio, fin: sumarMinutos(libre.inicio, v.duracion), nutricionista_id: libre.nutricionista_id,
          modalidad: v.modalidad, fecha_lima: fecha, duracion_min: v.duracion },
        pacienteNuevo: !previo, condicionesVersion: null,
      });
      if (res.ok) { reservaId = id; hora = libre; break; }
      if (res.motivo === 'link') return bad(410, 'El link interno de esta cita ya no sirve', { motivo: 'link' });
      intentadas.push({ inicio, motivo: res.motivo });
    }
  } catch (e) {
    console.error('agenda/robot', e);
    // Sin saber si el calendario está libre no se reserva nada: el robot lo manda a resolver a mano.
    return bad(503, 'No pudimos revisar la agenda. No se reservó nada.', { motivo: 'agenda' });
  }
  if (!reservaId) return bad(409, 'Ninguna de las horas estaba libre', { motivo: 'sin_hora', intentadas });

  // La cita ya quedó guardada: desde aquí ningún error la deshace; el robot decide con `calendario`.
  let r = await repo.reservaPorId(deps.db, reservaId).catch(() => null);
  let calendario = 'pendiente';
  try {
    if (!r) throw new Error('la reserva no se pudo leer');
    await finalizarAgenda(deps, env, r, { avisarAlEquipo: false });
    r = await repo.reservaPorId(deps.db, reservaId);
    calendario = r.calendario_pendiente ? 'pendiente' : 'ok';
  } catch (e) {
    console.error('agenda/robot/finalizar', e);
    try {
      await deps.sendEmail({ from: remitente(env), to: env.NOTIFICATION_EMAIL, ...correoEquipoAlerta({ asunto: 'Cita del robot sin aviso',
        detalle: `La reserva ${reservaId} quedó confirmada pero falló el aviso: ${e?.message}. Revisa el calendario y escríbele al paciente.` }) });
    } catch (e2) {
      console.error('agenda/robot/alerta', e2);
    }
  }
  const final = r ?? { id: reservaId, inicio_utc: hora.inicio, fecha_lima: fechaLima(new Date(hora.inicio)), modalidad: v.modalidad,
    duracion_min: v.duracion, nutricionista_id: hora.nutricionista_id };
  return json(200, respuesta(deps, { ...final, id: reservaId }, { ya_agendada: false, calendario, paciente_nuevo: !previo,
    plan: v.plan, plan_etiqueta: etiquetaPlan(v.plan), cita: v.cita, intentadas }));
}
