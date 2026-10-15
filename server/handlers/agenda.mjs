// ─── API de los links de agenda (paciente) · AJL Nutrición ──────────────────
// GET  /api/agenda/link       estado del link y tipo de cita
// GET  /api/agenda/horas      horas libres para ese tipo (cada 30 min)
// POST /api/agenda/dni        ¿ya es paciente? (datos enmascarados)
// POST /api/agenda/confirmar  agenda la cita y usa el link
// El token del link es la única llave: se busca por su hash.
import { json, readJson, siteUrl } from '../http.mjs';
import { randomToken, sha256Hex } from '../tokens.mjs';
import { TIPOS_LINK, MAX_CONSULTAS_DNI } from '../agenda/tipos.mjs';
import * as agenda from '../agenda/repo.mjs';
import { enmascararCorreo, enmascararTelefono } from '../agenda/mascaras.mjs';
import { finalizarAgenda, remitente } from '../agenda/finalizar.mjs';
import * as repo from '../reservas/repo.mjs';
import { sumarDias, fechaLima, etiquetaLima, sumarMinutos } from '../reservas/tiempo.mjs';
import { correoEquipoAlerta } from '../reservas/correos.mjs';
import { contexto, libresDelDia, eventoDe } from './reservas.mjs';
import { enlaceGoogleCalendar } from '../reservas/ics.mjs';
import { validarDatos, hoyEnLima } from '../../src/data/validar-datos.js';
import { CONDICIONES_VERSION } from '../../src/data/condiciones.js';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const INICIO = /^\d{4}-\d{2}-\d{2}T\d{2}:(00|30):00Z$/;
const bad = (status, error, extra = {}) => json(status, { ok: false, error, ...extra });
const MSJ_NO_EXISTE = 'Este link no existe. Escríbenos por WhatsApp y te mandamos uno nuevo.';
const MSJ_NO_VIGENTE = 'Este link ya se usó o venció. Escríbenos por WhatsApp y lo reactivamos.';
const MSJ_OCUPADA = 'Esa hora acaba de ocuparse. Elige otra.';
const MSJ_INTENTOS = 'Demasiados intentos con este link. Escríbenos por WhatsApp.';
const dniLimpio = (s) => String(s ?? '').replace(/[\s.-]+/g, '');

async function cargar(deps, token) {
  if (typeof token !== 'string' || !token || token.length > 100) return null;
  return agenda.linkPorHash(deps.db, await sha256Hex(token));
}

const tipoPublico = (id) => ({ id, ...TIPOS_LINK[id] });
const nutriValida = (deps, id) => !id || deps.nutricionistas.some((n) => n.id === id);
// Las horas salen del mismo motor de la web (libresDelDia): peso 0, la duración
// del tipo y paso de 30.
// La sesión de 1 hora empieza solo en hora en punto; los controles de 30 min, también a la media.
const delTipo = (tipo) => ({ peso: 0, duracionMin: tipo.duracion_min, pasoMin: tipo.duracion_min });

export async function handleAgendaLink(request, env, deps) {
  if (request.method !== 'GET') return bad(405, 'Método no permitido');
  const l = await cargar(deps, new URL(request.url).searchParams.get('l'));
  if (!l) return bad(404, MSJ_NO_EXISTE);
  const estado = agenda.estadoLink(l, deps.ahora());
  const cuerpo = { ok: true, estado, tipo: tipoPublico(l.tipo), nutricionistas: deps.nutricionistas.map(({ id, nombre, foto }) => ({ id, nombre, foto })) };
  if (estado === 'sin_usar' && l.nutri_sugerida && nutriValida(deps, l.nutri_sugerida)) cuerpo.nutricionista_sugerida = l.nutri_sugerida;
  if (estado === 'agendado') {
    // Con la modalidad va el link de Meet si ya existe: la pantalla muestra dónde es la cita.
    cuerpo.cita = { etiqueta: etiquetaLima(l.inicio_utc), modalidad: l.modalidad, meet: l.meet_url ?? null,
      nutricionista: deps.nutricionistas.find((n) => n.id === l.nutricionista_id)?.nombre ?? 'el equipo' };
  }
  return json(200, cuerpo);
}

export async function handleAgendaHoras(request, env, deps) {
  if (request.method !== 'GET') return bad(405, 'Método no permitido');
  const q = new URL(request.url).searchParams;
  const l = await cargar(deps, q.get('l'));
  if (!l) return bad(404, MSJ_NO_EXISTE);
  if (agenda.estadoLink(l, deps.ahora()) !== 'sin_usar') return bad(410, MSJ_NO_VIGENTE, { motivo: 'link' });
  const tipo = TIPOS_LINK[l.tipo];
  const desde = q.get('desde') || '';
  const modalidad = q.get('modalidad');
  const filtro = q.get('nutricionista') || '';
  const n = q.has('dias') ? Number(q.get('dias')) : 7;
  if (!FECHA.test(desde) || !tipo.modalidades.includes(modalidad) || !nutriValida(deps, filtro)
    || !Number.isInteger(n) || n < 1 || n > 28) return bad(400, 'Parámetros inválidos');
  try {
    const ctx = await contexto(deps, desde, n);
    const dias = [];
    for (let i = 0; i < n; i++) {
      const fecha = sumarDias(desde, i);
      dias.push({ fecha, horas: libresDelDia(deps, ctx, { fecha, modalidad, filtro, ...delTipo(tipo) }) });
    }
    return json(200, { ok: true, dias, nutricionistas: deps.nutricionistas.map(({ id, nombre, foto }) => ({ id, nombre, foto })) });
  } catch (e) {
    console.error('agenda/horas', e);
    return bad(503, 'No pudimos consultar la agenda. Intenta en un momento.');
  }
}

// Solo el primer nombre: es lo que la política de privacidad dice que mostramos.
const primerNombre = (p) => String(p.nombres || p.nombre || '').trim().split(/\s+/)[0];

export async function handleAgendaDni(request, env, deps) {
  if (request.method !== 'POST') return bad(405, 'Método no permitido');
  const d = await readJson(request);
  const l = await cargar(deps, d.l);
  if (!l) return bad(404, MSJ_NO_EXISTE);
  if (agenda.estadoLink(l, deps.ahora()) !== 'sin_usar') return bad(410, MSJ_NO_VIGENTE, { motivo: 'link' });
  const dni = dniLimpio(d.dni);
  if (!/^\d{8}$/.test(dni)) return bad(400, 'Escribe tu DNI (8 dígitos).');
  if (!(await agenda.contarConsultaDni(deps.db, l.id, MAX_CONSULTAS_DNI))) return bad(429, MSJ_INTENTOS);
  const p = await agenda.pacientePorDni(deps.db, dni);
  if (!p) return json(200, { ok: true, conocido: false });
  return json(200, { ok: true, conocido: true, nombre: primerNombre(p),
    email: enmascararCorreo(p.email), whatsapp: enmascararTelefono(p.whatsapp) });
}

export async function handleAgendaConfirmar(request, env, deps) {
  if (request.method !== 'POST') return bad(405, 'Método no permitido');
  const d = await readJson(request);
  const l = await cargar(deps, d.l);
  if (!l) return bad(404, MSJ_NO_EXISTE);
  const ahora = deps.ahora();
  if (agenda.estadoLink(l, ahora) !== 'sin_usar') return bad(410, MSJ_NO_VIGENTE, { motivo: 'link' });
  const tipo = TIPOS_LINK[l.tipo];
  if (!INICIO.test(d.inicio || '') || !tipo.modalidades.includes(d.modalidad) || !nutriValida(deps, d.nutricionista)) return bad(400, 'Datos inválidos');
  const dni = dniLimpio(d.dni);
  if (!/^\d{8}$/.test(dni)) return bad(400, 'Escribe tu DNI (8 dígitos).');

  const conDatos = Boolean(d.datos && typeof d.datos === 'object');
  // Sin datos, la respuesta revela si el DNI es paciente (200 o 400 'datos'):
  // gasta una consulta del mismo cupo que /dni.
  if (!conDatos && !(await agenda.contarConsultaDni(deps.db, l.id, MAX_CONSULTAS_DNI))) return bad(429, MSJ_INTENTOS);

  const previo = await agenda.pacientePorDni(deps.db, dni);
  let cliente = null;
  let clienteId = previo?.id ?? null;
  if (conDatos) {
    const v = validarDatos({ ...d.datos, tipo_documento: 'dni', documento: dni }, hoyEnLima(ahora));
    if (!v.ok) return bad(400, v.error);
    cliente = v.cliente;
    clienteId = crypto.randomUUID();
  } else if (!previo) {
    return bad(400, 'Completa tus datos.', { motivo: 'datos' });
  }

  const fecha = fechaLima(new Date(d.inicio));
  const reservaId = crypto.randomUUID();
  const token = randomToken();
  let hora;
  try {
    const ctx = await contexto(deps, fecha, 1);
    hora = libresDelDia(deps, ctx, { fecha, modalidad: d.modalidad, filtro: d.nutricionista, ...delTipo(tipo) }).find((h) => h.inicio === d.inicio);
    if (!hora) return bad(409, MSJ_OCUPADA, { motivo: 'ocupada' });
    const res = await agenda.agendarConLink(deps.db, {
      link: l.id, reservaId, token, tipoId: l.tipo, cliente, clienteId,
      hora: { inicio: hora.inicio, fin: sumarMinutos(hora.inicio, tipo.duracion_min), nutricionista_id: hora.nutricionista_id,
        modalidad: d.modalidad, fecha_lima: fecha, duracion_min: tipo.duracion_min },
      pacienteNuevo: !previo, condicionesVersion: cliente ? CONDICIONES_VERSION : null, ahora,
    });
    if (!res.ok) return res.motivo === 'link' ? bad(410, MSJ_NO_VIGENTE, { motivo: 'link' }) : bad(409, MSJ_OCUPADA, { motivo: 'ocupada' });
  } catch (e) {
    console.error('agenda/confirmar', e);
    return bad(503, 'No pudimos agendar tu cita. Intenta en un momento.');
  }

  // La cita ya quedó guardada: desde aquí ningún error puede volverse un 503
  // (el paciente reintentaría y recibiría «ya se usó»). La respuesta se arma con
  // lo que ya tenemos, sin volver a leer D1, y cualquier falla avisa al equipo.
  let meet = null;
  try {
    const r = await repo.reservaPorId(deps.db, reservaId);
    if (!r) throw new Error('la reserva no se pudo leer');
    ({ meet } = await finalizarAgenda(deps, env, r));
  } catch (e) {
    console.error('agenda/finalizar', e);
    try {
      await deps.sendEmail({ from: remitente(env), to: env.NOTIFICATION_EMAIL, ...correoEquipoAlerta({ asunto: 'Cita de link sin aviso',
        detalle: `La reserva ${reservaId} quedó confirmada pero falló el aviso: ${e?.message}. Revisa el calendario y escríbele al paciente.` }) });
    } catch (e2) {
      console.error('agenda/alerta', e2);
    }
  }
  const n = deps.nutricionistas.find((x) => x.id === hora.nutricionista_id);
  const cita = { producto: `link_${l.tipo}`, inicio_utc: hora.inicio, duracion_min: tipo.duracion_min, modalidad: d.modalidad, meet_url: meet };
  return json(200, {
    ok: true, etiqueta: etiquetaLima(hora.inicio), modalidad: d.modalidad, nutricionista: n?.nombre ?? 'el equipo', duracion_min: tipo.duracion_min,
    titulo: tipo.nombre, meet, google_calendar: enlaceGoogleCalendar(eventoDe(cita)), ics: `${siteUrl(env)}/api/reservas/ics?r=${token}`,
  });
}
