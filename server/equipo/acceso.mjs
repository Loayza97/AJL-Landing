// Acceso al panel del equipo con código por correo.
// POST /api/equipo/codigo  { email }          manda un código de 6 dígitos (10 min)
// POST /api/equipo/entrar  { email, codigo }  abre una sesión de 12 h (cookie)
// POST /api/equipo/salir                      cierra la sesión
// Solo reciben código los correos de EQUIPO_EMAILS o EQUIPO_ADMINS (secretos) y los
// agregados en /panel/usuarios/ (server/equipo/usuarios.mjs). La respuesta es la
// misma para cualquier correo, así no se puede averiguar quién está autorizado.
// Códigos y sesiones se guardan como hash; 5 intentos por código y, tras 10
// fallidos en 24 h, el correo queda bloqueado un día.
import { json, readJson } from '../http.mjs';
import { randomToken, sha256Hex as sha256 } from '../tokens.mjs';
import { esAdmin, normalizarEmail as normalizar, puedeEntrar } from './usuarios.mjs';

const COOKIE = 'ajl_equipo';
const CODIGO_MIN = 10;
const SESION_H = 12;
const MAX_INTENTOS = 5;
const REENVIO_SEG = 60;
const MAX_FALLOS_DIA = 10; // intentos fallidos por correo en 24 h antes de bloquearlo

const codigoAlAzar = () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0');
const remitente = (env) => env.NEWSLETTER_FROM || 'AJL Nutrición <hola@ajlnutricion.com>';

async function bloqueado(db, email, ahora) {
  const desde = new Date(ahora.getTime() - 24 * 3600000).toISOString();
  const { n } = await db.prepare('SELECT COUNT(*) AS n FROM equipo_fallos WHERE email = ?1 AND en >= ?2').bind(email, desde).first();
  return n >= MAX_FALLOS_DIA;
}

function leerCookie(request) {
  const m = (request.headers.get('Cookie') || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  return m ? m[1] : null;
}

export async function handlePedirCodigo(request, env, deps) {
  if (request.method !== 'POST') return json(405, { ok: false, error: 'Método no permitido' });
  const email = normalizar((await readJson(request)).email);
  const ok = json(200, { ok: true, mensaje: 'Si tu correo está autorizado, te llegó un código.' });
  if (!(await puedeEntrar(env, deps.db, email))) return ok;
  const ahora = deps.ahora();
  if (await bloqueado(deps.db, email, ahora)) return ok;
  const previo = await deps.db.prepare('SELECT creado_en FROM equipo_codigos WHERE email = ?1').bind(email).first();
  if (previo && ahora.getTime() - Date.parse(previo.creado_en) < REENVIO_SEG * 1000) return ok;
  const codigo = codigoAlAzar();
  await deps.db.prepare(
    `INSERT INTO equipo_codigos (email, codigo_hash, creado_en, expira, intentos) VALUES (?1, ?2, ?3, ?4, 0)
     ON CONFLICT (email) DO UPDATE SET codigo_hash = excluded.codigo_hash, creado_en = excluded.creado_en, expira = excluded.expira, intentos = 0`,
  ).bind(email, await sha256(`${email}:${codigo}`), ahora.toISOString(), new Date(ahora.getTime() + CODIGO_MIN * 60000).toISOString()).run();
  await deps.sendEmail({
    from: remitente(env), to: email, subject: `Tu código para el panel de AJL: ${codigo}`,
    html: `<div style="font-family:system-ui,Arial,sans-serif;max-width:480px;margin:auto"><p>Tu código para entrar al panel del equipo es:</p>
      <p style="font-size:28px;font-weight:800;letter-spacing:4px">${codigo}</p><p>Vence en ${CODIGO_MIN} minutos. Si no lo pediste, ignora este correo.</p></div>`,
  });
  return ok;
}

export async function handleEntrar(request, env, deps) {
  if (request.method !== 'POST') return json(405, { ok: false, error: 'Método no permitido' });
  const d = await readJson(request);
  const email = normalizar(d.email);
  const codigo = String(d.codigo || '').replace(/\D/g, '');
  const mal = json(401, { ok: false, error: 'El código no es válido o ya venció. Pide uno nuevo.' });
  if (codigo.length !== 6 || !(await puedeEntrar(env, deps.db, email))) return mal;
  const ahora = deps.ahora();
  if (await bloqueado(deps.db, email, ahora)) return mal;
  const fila = await deps.db.prepare('SELECT codigo_hash, expira, intentos FROM equipo_codigos WHERE email = ?1').bind(email).first();
  if (!fila || Date.parse(fila.expira) <= ahora.getTime() || fila.intentos >= MAX_INTENTOS) return mal;
  if ((await sha256(`${email}:${codigo}`)) !== fila.codigo_hash) {
    await deps.db.batch([
      deps.db.prepare('UPDATE equipo_codigos SET intentos = intentos + 1 WHERE email = ?1').bind(email),
      deps.db.prepare('INSERT INTO equipo_fallos (email, en) VALUES (?1, ?2)').bind(email, ahora.toISOString()),
    ]);
    return mal;
  }
  const token = randomToken(32);
  await deps.db.batch([
    deps.db.prepare('DELETE FROM equipo_codigos WHERE email = ?1').bind(email),
    deps.db.prepare('DELETE FROM equipo_sesiones WHERE expira <= ?1').bind(ahora.toISOString()),
    deps.db.prepare('INSERT INTO equipo_sesiones (token_hash, email, expira) VALUES (?1, ?2, ?3)')
      .bind(await sha256(token), email, new Date(ahora.getTime() + SESION_H * 3600000).toISOString()),
  ]);
  return new Response(JSON.stringify({ ok: true, email }), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
      'Set-Cookie': `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESION_H * 3600}` },
  });
}

export async function handleSalir(request, env, deps) {
  if (request.method !== 'POST') return json(405, { ok: false, error: 'Método no permitido' });
  const token = leerCookie(request);
  if (token) await deps.db.prepare('DELETE FROM equipo_sesiones WHERE token_hash = ?1').bind(await sha256(token)).run();
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Set-Cookie': `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0` },
  });
}

// Lo usan las rutas /api/equipo/*: sesión vigente y correo todavía autorizado
// (secretos o tabla). admin = está en EQUIPO_ADMINS.
export async function verificarAcceso(request, env, deps) {
  const token = leerCookie(request);
  if (!token) return { ok: false };
  const fila = await deps.db.prepare('SELECT email, expira FROM equipo_sesiones WHERE token_hash = ?1').bind(await sha256(token)).first();
  if (!fila || Date.parse(fila.expira) <= deps.ahora().getTime() || !(await puedeEntrar(env, deps.db, fila.email))) return { ok: false };
  return { ok: true, email: fila.email, admin: esAdmin(env, fila.email) };
}
