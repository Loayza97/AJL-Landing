// ─── Panel del equipo · por agendar ─────────────────────────────────────────
// GET  /api/equipo/por-agendar?todas=1   citas que faltan por suscripción (con todas=1, también las al día)
// POST /api/equipo/por-agendar           { accion: 'revisar' | 'ajuste' | 'quitar', clave, … }
// «Agendar» desde una fila crea el link de siempre (/api/equipo/links) con la clave de la suscripción.
import { json, readJson } from '../http.mjs';
import * as citas from '../suscripciones/citas.mjs';
import { MAX_CITA } from '../agenda/opciones.mjs';

const MAX_MOTIVO = 200;
const sinAcceso = () => json(401, { ok: false, error: 'Necesitas entrar con un correo autorizado del equipo.' });
const bad = (status, error) => json(status, { ok: false, error });
const entero = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
const NO_EXISTE = 'No encontramos esa suscripción. Recarga la página.';

export async function handleEquipoPorAgendar(request, env, deps) {
  if (!['GET', 'POST'].includes(request.method)) return bad(405, 'Método no permitido');
  const acceso = await deps.acceso(request, env);
  if (!acceso.ok) return sinAcceso();
  const ahora = deps.ahora();
  if (request.method === 'GET') {
    const todas = new URL(request.url).searchParams.get('todas') === '1';
    return json(200, { ok: true, admin: acceso.admin === true, filas: await citas.filasPorAgendar(deps.db, ahora, { todas }) });
  }
  const d = await readJson(request);
  if (!['revisar', 'ajuste', 'quitar'].includes(d.accion) || typeof d.clave !== 'string') return bad(400, 'Datos inválidos');
  if (d.accion === 'quitar' && acceso.admin !== true) return bad(403, 'Solo administradores.');
  const motivo = String(d.motivo ?? '').trim().slice(0, MAX_MOTIVO);
  if (d.accion === 'revisar' && !entero(d.usadas, 0, MAX_CITA)) return bad(400, `Escribe cuántas citas lleva, de 0 a ${MAX_CITA}.`);
  if (d.accion === 'ajuste' && (!entero(d.cantidad, -MAX_CITA, MAX_CITA) || d.cantidad === 0 || !motivo)) {
    return bad(400, 'Escribe cuántas citas sumar o restar y el motivo.');
  }
  const f = await citas.filaPorClave(deps.db, d.clave, ahora);
  if (!f) return bad(404, NO_EXISTE);
  if (d.accion === 'revisar') {
    if (!f.por_revisar || !(await citas.revisar(deps.db, { clave: f.clave, usadas: d.usadas, por: acceso.email, ahora }))) {
      return bad(409, 'Esa suscripción ya está revisada. Si el número está mal, usa «Ajustar».');
    }
  } else if (d.accion === 'ajuste') {
    if (f.por_revisar || f.sin_asignar) return bad(409, 'Primero hay que revisarla o agendar su primera cita.');
    await citas.ajustar(deps.db, { clave: f.clave, cantidad: d.cantidad, motivo, por: acceso.email, ahora });
  } else if (!(await citas.quitarPaciente(deps.db, { clave: f.clave }))) {
    return bad(409, 'Solo se quita el paciente de una suscripción hecha a mano que ya lo tiene.');
  }
  return json(200, { ok: true });
}
