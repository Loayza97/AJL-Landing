// ─── Panel del equipo · usuarios ────────────────────────────────────────────
// GET  /api/equipo/usuarios          súper usuarios, fijos y agregados
// POST /api/equipo/usuarios          { email, nombre } da acceso (409 si ya lo tiene)
// POST /api/equipo/usuarios-quitar   { email } quita a un agregado y cierra sus sesiones
// Solo súper usuarios (EQUIPO_ADMINS): primero la sesión (401), luego el permiso
// (403) y recién entonces se lee la base.
import { json, readJson } from '../http.mjs';
import { agregarUsuario, listarUsuarios, normalizarEmail, origenSecreto, quitarUsuario } from '../equipo/usuarios.mjs';

const EMAIL = /^[^\s@,;<>"']+@[^\s@,;<>"']+\.[a-z]{2,}$/;
const MAX_NOMBRE = 60;
const bad = (status, error) => json(status, { ok: false, error });

async function soloAdmin(request, env, deps) {
  const acceso = await deps.acceso(request, env);
  if (!acceso.ok) return { error: bad(401, 'Necesitas entrar con un correo autorizado del equipo.') };
  if (!acceso.admin) return { error: bad(403, 'Esta sección es solo para súper usuarios.') };
  return { acceso };
}

export async function handleUsuarios(request, env, deps) {
  if (!['GET', 'POST'].includes(request.method)) return bad(405, 'Método no permitido');
  const { acceso, error } = await soloAdmin(request, env, deps);
  if (error) return error;
  if (request.method === 'GET') return json(200, { ok: true, email: acceso.email, usuarios: await listarUsuarios(env, deps.db) });
  const d = await readJson(request);
  const email = typeof d.email === 'string' ? normalizarEmail(d.email) : '';
  const nombre = typeof d.nombre === 'string' ? d.nombre.trim().replace(/\s+/g, ' ') : '';
  if (email.length > 254 || !EMAIL.test(email)) return bad(400, 'Escribe un correo válido.');
  if (!nombre || nombre.length > MAX_NOMBRE) return bad(400, `Escribe el nombre (hasta ${MAX_NOMBRE} caracteres).`);
  const ahora = deps.ahora();
  if (origenSecreto(env, email) || !(await agregarUsuario(deps.db, { email, nombre, creadoPor: acceso.email, ahora }))) {
    return bad(409, 'Ese correo ya tiene acceso al panel.');
  }
  return json(200, { ok: true, usuario: { email, nombre, origen: 'app', creado_por: acceso.email, creado_en: ahora.toISOString() } });
}

export async function handleUsuariosQuitar(request, env, deps) {
  if (request.method !== 'POST') return bad(405, 'Método no permitido');
  const { error } = await soloAdmin(request, env, deps);
  if (error) return error;
  const email = normalizarEmail((await readJson(request)).email);
  const origen = origenSecreto(env, email);
  if (origen === 'admin') return bad(409, 'Los súper usuarios no se quitan desde el panel.');
  if (origen === 'fijo') return bad(409, 'Este correo es fijo: se quita solo desde la configuración del sitio.');
  if (!email || !(await quitarUsuario(deps.db, email))) return bad(404, 'Ese correo no está en la lista.');
  return json(200, { ok: true });
}
