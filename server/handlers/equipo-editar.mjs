// ─── Panel del equipo · editar cita ─────────────────────────────────────────
// GET  /api/equipo/editar-horas   horas libres para mover una cita (sin tope)
// POST /api/equipo/editar         mueve la cita y actualiza el evento de Google
// POST /api/equipo/cancelar       cancela la cita y borra el evento de Google
import { json, readJson } from '../http.mjs';
import * as repo from '../reservas/repo.mjs';
import { horasLibres } from '../reservas/disponibilidad.mjs';
import { fechaLima, etiquetaLima } from '../reservas/tiempo.mjs';
import { correoCambioModalidad } from '../reservas/correos.mjs';
import { contacto } from '../../src/data/contacto.js';
import { contexto } from './reservas.mjs';
import { textoCambios, sincronizarEventoEditado, borrarEventoCancelado } from '../reservas/editar.mjs';
import { avisarEquipo } from '../reservas/aviso-equipo.mjs';

const MODALIDADES = new Set(['presencial', 'video']);
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const INICIO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00Z$/;
const HASTA_DIAS = 60;
const MSJ_OCUPADA = 'Esa hora acaba de ocuparse. Elige otra.';
const MSJ_ESTADO = 'Esta cita ya no se puede editar.';
const bad = (status, error) => json(status, { ok: false, error });
const sinAcceso = () => json(401, { ok: false, error: 'Necesitas entrar con un correo autorizado del equipo.' });
// Una cita pasada también se edita (reagendar al que no vino, 2026-10-26): la hora
// nueva sale de horasLibres, que nunca ofrece horas pasadas.
const editable = (r) => r && r.estado === 'confirmada';

async function horasPara(deps, r, { fecha, modalidad, nutricionista }) {
  const ctx = await contexto(deps, fecha, 1);
  const dur = r.duracion_min ?? 60;
  return horasLibres({ fecha, modalidad, nutricionistas: deps.nutricionistas, eventos: ctx.eventos,
    reservas: ctx.reservas.filter((x) => x.id !== r.id), ahora: deps.ahora(), filtroNutricionista: nutricionista,
    desdeDias: 0, hastaDias: HASTA_DIAS, duracionMin: dur, pasoMin: dur, sinTope: true });
}

export async function handleEditarHoras(request, env, deps) {
  if (request.method !== 'GET') return bad(405, 'Método no permitido');
  const acceso = await deps.acceso(request, env);
  if (!acceso.ok) return sinAcceso();
  const q = new URL(request.url).searchParams;
  const fecha = q.get('fecha') || '';
  const modalidad = q.get('modalidad');
  const nutricionista = q.get('nutricionista');
  if (!FECHA.test(fecha) || !MODALIDADES.has(modalidad) || !deps.nutricionistas.some((n) => n.id === nutricionista)) return bad(400, 'Datos inválidos');
  const r = await repo.reservaPorId(deps.db, String(q.get('id') || ''));
  if (!editable(r)) return bad(409, MSJ_ESTADO);
  try {
    const horas = await horasPara(deps, r, { fecha, modalidad, nutricionista });
    return json(200, { ok: true, horas: horas.map(({ inicio, hora }) => ({ inicio, hora })) });
  } catch (e) {
    console.error('editar-horas', e);
    return bad(503, 'No pudimos consultar la agenda. Intenta en un momento.');
  }
}

export async function handleEditar(request, env, deps) {
  if (request.method !== 'POST') return bad(405, 'Método no permitido');
  const acceso = await deps.acceso(request, env);
  if (!acceso.ok) return sinAcceso();
  const d = await readJson(request);
  if (typeof d.id !== 'string' || !INICIO.test(d.inicio || '') || !MODALIDADES.has(d.modalidad)
    || !deps.nutricionistas.some((n) => n.id === d.nutricionista)) return bad(400, 'Datos inválidos');
  const antes = await repo.reservaPorId(deps.db, d.id);
  if (!editable(antes)) return bad(409, MSJ_ESTADO);
  const despues = { inicio_utc: d.inicio, modalidad: d.modalidad, nutricionista_id: d.nutricionista };
  const cambios = textoCambios(antes, despues, deps.nutricionistas);
  if (cambios === 'sin cambios') return bad(400, 'No cambiaste nada de la cita.');
  const fecha = fechaLima(new Date(d.inicio));
  try {
    const libres = await horasPara(deps, antes, { fecha, modalidad: d.modalidad, nutricionista: d.nutricionista });
    if (!libres.some((h) => h.inicio === d.inicio)) return bad(409, MSJ_OCUPADA);
    const res = await repo.editarReserva(deps.db, { id: d.id, ...despues, fecha_lima: fecha, editadaPor: acceso.email,
      cambios, ahora: deps.ahora() });
    if (!res.ok) return bad(409, res.motivo === 'estado' ? MSJ_ESTADO : MSJ_OCUPADA);
  } catch (e) {
    console.error('editar', e);
    return bad(503, 'No pudimos guardar el cambio. Intenta en un momento.');
  }
  const editada = await repo.reservaPorId(deps.db, d.id);
  const calendario = await sincronizarEventoEditado(deps, env, editada, { modalidadAnterior: antes.modalidad });
  await avisarEquipo(deps, env, { tipo: 'cambiada', r: editada, antes });
  if (antes.modalidad !== editada.modalidad) await avisarCambioModalidad(deps, env, d.id);
  return json(200, { ok: true, calendario });
}

// El paciente recibe dónde es ahora la cita y los requisitos de la modalidad nueva
// (con el Meet ya guardado si pasó a virtual). Si el correo falla, la edición sigue.
async function avisarCambioModalidad(deps, env, id) {
  try {
    const r = await repo.reservaPorId(deps.db, id);
    const n = deps.nutricionistas.find((x) => x.id === r.nutricionista_id);
    await deps.sendEmail({ from: env.NEWSLETTER_FROM || 'AJL Nutrición <hola@ajlnutricion.com>', to: r.email,
      ...correoCambioModalidad({ nombre: r.nombres || r.nombre, etiqueta: etiquetaLima(r.inicio_utc), modalidad: r.modalidad,
        direccion: contacto.direccion, meet: r.meet_url, nutricionista: n?.nombre ?? r.nutricionista_id }) });
  } catch (e) {
    console.error('editar/correo-paciente', e);
  }
}

export async function handleCancelar(request, env, deps) {
  if (request.method !== 'POST') return bad(405, 'Método no permitido');
  const acceso = await deps.acceso(request, env);
  if (!acceso.ok) return sinAcceso();
  const d = await readJson(request);
  if (typeof d.id !== 'string' || !d.id) return bad(400, 'Datos inválidos');
  const hecho = await repo.cancelarCita(deps.db, { id: d.id, por: acceso.email, ahora: deps.ahora() });
  if (!hecho) return bad(409, 'Esta cita ya no se puede cancelar.');
  const cancelada = await repo.reservaPorId(deps.db, d.id);
  const calendario = await borrarEventoCancelado(deps, env, cancelada);
  await avisarEquipo(deps, env, { tipo: 'cancelada', r: cancelada });
  return json(200, { ok: true, calendario });
}
