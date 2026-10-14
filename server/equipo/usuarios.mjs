// Quién puede usar el panel del equipo.
// · Súper usuarios: secreto EQUIPO_ADMINS. Ven /panel/usuarios/; no se cambian desde el panel.
// · Fijos: secreto EQUIPO_EMAILS. Tampoco se quitan desde el panel.
// · Agregados: tabla equipo_usuarios, desde /panel/usuarios/. Quitar uno borra sus
//   sesiones y su código pendiente en el mismo batch: pierde el acceso al instante.
export const normalizarEmail = (e) => String(e ?? '').trim().toLowerCase();
const lista = (v) => String(v || '').split(',').map(normalizarEmail).filter(Boolean);
export const admins = (env) => lista(env.EQUIPO_ADMINS);
export const fijos = (env) => lista(env.EQUIPO_EMAILS);
export const esAdmin = (env, email) => admins(env).includes(normalizarEmail(email));

export function origenSecreto(env, email) {
  const e = normalizarEmail(email);
  if (admins(env).includes(e)) return 'admin';
  if (fijos(env).includes(e)) return 'fijo';
  return null;
}

export async function puedeEntrar(env, db, email) {
  const e = normalizarEmail(email);
  if (!e) return false;
  if (origenSecreto(env, e)) return true;
  return Boolean(await db.prepare('SELECT 1 AS si FROM equipo_usuarios WHERE email = ?1').bind(e).first());
}

export async function listarUsuarios(env, db) {
  const { results } = await db.prepare('SELECT email, nombre, creado_por, creado_en FROM equipo_usuarios ORDER BY creado_en, email').all();
  const deTabla = new Map(results.map((r) => [r.email, r]));
  const filas = [];
  const vistos = new Set();
  const sumar = (email, origen) => {
    if (vistos.has(email)) return;
    vistos.add(email);
    const r = deTabla.get(email);
    filas.push({ email, nombre: r?.nombre ?? null, origen, creado_por: r?.creado_por ?? null, creado_en: r?.creado_en ?? null });
  };
  admins(env).forEach((e) => sumar(e, 'admin'));
  fijos(env).forEach((e) => sumar(e, 'fijo'));
  results.forEach((r) => sumar(r.email, 'app'));
  return filas;
}

// false si el correo ya estaba en la tabla (no pisa nombre ni creado_por).
export async function agregarUsuario(db, { email, nombre, creadoPor, ahora }) {
  const r = await db.prepare(
    'INSERT INTO equipo_usuarios (email, nombre, creado_por, creado_en) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (email) DO NOTHING',
  ).bind(email, nombre, creadoPor, ahora.toISOString()).run();
  return r.meta.changes === 1;
}

// Un solo batch: o se quita todo (usuario, sesiones y código pendiente) o nada.
export async function quitarUsuario(db, email) {
  const [usuario] = await db.batch([
    db.prepare('DELETE FROM equipo_usuarios WHERE email = ?1').bind(email),
    db.prepare('DELETE FROM equipo_sesiones WHERE email = ?1').bind(email),
    db.prepare('DELETE FROM equipo_codigos WHERE email = ?1').bind(email),
  ]);
  return usuario.meta.changes === 1;
}
