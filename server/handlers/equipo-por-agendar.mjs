// ─── Panel del equipo · por agendar ─────────────────────────────────────────
// GET  /api/equipo/por-agendar   todas las suscripciones con sus citas; `pendiente` dice cuáles tienen algo que hacer
// POST /api/equipo/por-agendar   { accion: 'visto' | 'ajuste' | 'quitar', clave, … }
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
    return json(200, { ok: true, admin: acceso.admin === true, filas: await citas.filasPorAgendar(deps.db, ahora, { todas: true }) });
  }
  const d = await readJson(request);
  if (!['visto', 'ajuste', 'quitar'].includes(d.accion) || typeof d.clave !== 'string') return bad(400, 'Datos inválidos');
  if (d.accion === 'quitar' && acceso.admin !== true) return bad(403, 'Solo administradores.');
  const motivo = String(d.motivo ?? '').trim().slice(0, MAX_MOTIVO);
  if (d.accion === 'ajuste' && (!entero(d.cantidad, -MAX_CITA, MAX_CITA) || d.cantidad === 0 || !motivo)) {
    return bad(400, 'Escribe cuántas citas sumar o restar y el motivo.');
  }
  const f = await citas.filaPorClave(deps.db, d.clave, ahora);
  if (!f) return bad(404, NO_EXISTE);
  if (d.accion === 'visto') {
    // El número lo manda la pantalla: si entró otro cobro mientras tanto, su aviso sigue encendido.
    if (!entero(d.cobros, 1, f.cobros)) return bad(400, 'Datos inválidos');
    await citas.marcarVisto(deps.db, { clave: f.clave, cobros: d.cobros, por: acceso.email, ahora });
  } else if (d.accion === 'ajuste') {
    if (f.sin_asignar) return bad(409, 'Primero hay que agendar su primera cita.');
    await citas.ajustar(deps.db, { clave: f.clave, cantidad: d.cantidad, motivo, por: acceso.email, ahora });
  } else if (!(await citas.quitarPaciente(deps.db, { clave: f.clave }))) {
    return bad(409, 'Solo se quita el paciente de una suscripción hecha a mano que ya lo tiene.');
  }
  return json(200, { ok: true });
}
