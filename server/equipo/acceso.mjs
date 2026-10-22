// Acceso al panel del equipo: contraseña por persona y código por correo
// (2026-10-16, Figma «4. Propuesta: entrar con contraseña»).
// POST /api/equipo/codigo  { email }                       código para crear o cambiar la contraseña
// POST /api/equipo/entrar  { email, clave }                con contraseña; en un dispositivo nuevo
//                                                          responde paso «codigo» y manda uno
// POST /api/equipo/entrar  { email, codigo, clave_nueva? } con el código: crea la contraseña (primera
//                                                          vez u olvidó) o termina el dispositivo nuevo
// POST /api/equipo/salir                                   cierra la sesión (el dispositivo sigue siendo de confianza)
// Solo entran los correos de EQUIPO_EMAILS o EQUIPO_ADMINS (secretos) y los
// agregados en /panel/usuarios/ (server/equipo/usuarios.mjs). La respuesta es la
// misma para cualquier correo, así no se puede averiguar quién está autorizado.
// Códigos, sesiones y dispositivos se guardan como hash y la contraseña como
// PBKDF2 (clave.mjs); 5 intentos por código y, tras 10 fallidos en 24 h (código
// o contraseña), el correo queda bloqueado un día.
import { json, readJson } from '../http.mjs';
import { randomToken, sha256Hex as sha256 } from '../tokens.mjs';
import { esAdmin, normalizarEmail as normalizar, puedeEntrar } from './usuarios.mjs';
import { hashClave, claveCorrecta, claveValida, MIN_CLAVE } from './clave.mjs';

const COOKIE = 'ajl_equipo';
const COOKIE_DISP = 'ajl_equipo_disp';
const DISPOSITIVO_DIAS = 30;
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

function leerCookie(request, nombre = COOKIE) {
  const m = (request.headers.get('Cookie') || '').match(new RegExp(`(?:^|;\\s*)${nombre}=([^;]+)`));
  return m ? m[1] : null;
}

const fallo = (db, email, ahora) => db.prepare('INSERT INTO equipo_fallos (email, en) VALUES (?1, ?2)').bind(email, ahora.toISOString());

// Manda un código (10 min). clave_ok = 1 si viene de una contraseña correcta.
// Si ya se mandó uno hace menos de un minuto, no se manda otro.
async function enviarCodigo(env, deps, email, ahora, claveOk) {
  const previo = await deps.db.prepare('SELECT creado_en FROM equipo_codigos WHERE email = ?1').bind(email).first();
  if (previo && ahora.getTime() - Date.parse(previo.creado_en) < REENVIO_SEG * 1000) {
    if (claveOk) await deps.db.prepare('UPDATE equipo_codigos SET clave_ok = 1 WHERE email = ?1').bind(email).run();
    return;
  }
  const codigo = codigoAlAzar();
  await deps.db.prepare(
    `INSERT INTO equipo_codigos (email, codigo_hash, creado_en, expira, intentos, clave_ok) VALUES (?1, ?2, ?3, ?4, 0, ?5)
     ON CONFLICT (email) DO UPDATE SET codigo_hash = excluded.codigo_hash, creado_en = excluded.creado_en, expira = excluded.expira,
       intentos = 0, clave_ok = excluded.clave_ok`,
  ).bind(email, await sha256(`${email}:${codigo}`), ahora.toISOString(), new Date(ahora.getTime() + CODIGO_MIN * 60000).toISOString(), claveOk ? 1 : 0).run();
  await deps.sendEmail({
    from: remitente(env), to: email, subject: `Tu código para el panel de AJL: ${codigo}`,
    html: `<div style="font-family:system-ui,Arial,sans-serif;max-width:480px;margin:auto"><p>Tu código para entrar al panel del equipo es:</p>
      <p style="font-size:28px;font-weight:800;letter-spacing:4px">${codigo}</p><p>Vence en ${CODIGO_MIN} minutos. Si no lo pediste, ignora este correo.</p></div>`,
  });
}

// Abre la sesión (12 h) y deja este dispositivo como de confianza por 30 días.
async function abrirSesion(deps, email, ahora, sentencias = []) {
  const token = randomToken(32);
  const disp = randomToken(32);
  await deps.db.batch([
    ...sentencias,
    deps.db.prepare('DELETE FROM equipo_sesiones WHERE expira <= ?1').bind(ahora.toISOString()),
    deps.db.prepare('DELETE FROM equipo_dispositivos WHERE expira <= ?1').bind(ahora.toISOString()),
    deps.db.prepare('INSERT INTO equipo_sesiones (token_hash, email, expira) VALUES (?1, ?2, ?3)')
      .bind(await sha256(token), email, new Date(ahora.getTime() + SESION_H * 3600000).toISOString()),
    deps.db.prepare('INSERT INTO equipo_dispositivos (token_hash, email, expira) VALUES (?1, ?2, ?3)')
      .bind(await sha256(disp), email, new Date(ahora.getTime() + DISPOSITIVO_DIAS * 86400000).toISOString()),
  ]);
  const h = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  h.append('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESION_H * 3600}`);
  h.append('Set-Cookie', `${COOKIE_DISP}=${disp}; Path=/api/equipo/; HttpOnly; Secure; SameSite=Strict; Max-Age=${DISPOSITIVO_DIAS * 86400}`);
  return new Response(JSON.stringify({ ok: true, email }), { status: 200, headers: h });
}

// Dispositivo de confianza de este correo: se usa una vez y abrirSesion da uno nuevo.
async function dispositivoConocido(request, deps, email, ahora) {
  const token = leerCookie(request, COOKIE_DISP);
  if (!token) return null;
  const hash = await sha256(token);
  const fila = await deps.db.prepare('SELECT email, expira FROM equipo_dispositivos WHERE token_hash = ?1').bind(hash).first();
  if (!fila || fila.email !== email || Date.parse(fila.expira) <= ahora.getTime()) return null;
  return deps.db.prepare('DELETE FROM equipo_dispositivos WHERE token_hash = ?1').bind(hash);
}

export async function handlePedirCodigo(request, env, deps) {
  if (request.method !== 'POST') return json(405, { ok: false, error: 'Método no permitido' });
  const email = normalizar((await readJson(request)).email);
  const ok = json(200, { ok: true, mensaje: 'Si tu correo está autorizado, te llegó un código.' });
  if (!(await puedeEntrar(env, deps.db, email))) return ok;
  const ahora = deps.ahora();
  if (await bloqueado(deps.db, email, ahora)) return ok;
  await enviarCodigo(env, deps, email, ahora, false);
  return ok;
}

export async function handleEntrar(request, env, deps) {
  if (request.method !== 'POST') return json(405, { ok: false, error: 'Método no permitido' });
  const d = await readJson(request);
  return typeof d.clave === 'string' ? entrarConClave(request, env, deps, d) : entrarConCodigo(env, deps, d);
}

async function entrarConClave(request, env, deps, d) {
  const email = normalizar(d.email);
  const mal = json(401, { ok: false, error: 'El correo o la contraseña no son correctos.' });
  const ahora = deps.ahora();
  const autorizado = d.clave.length <= 200 && (await puedeEntrar(env, deps.db, email)) && !(await bloqueado(deps.db, email, ahora));
  const fila = autorizado ? await deps.db.prepare('SELECT hash, sal, iteraciones FROM equipo_claves WHERE email = ?1').bind(email).first() : null;
  if (!(await claveCorrecta(d.clave, fila))) {
    if (autorizado) await fallo(deps.db, email, ahora).run();
    return mal;
  }
  const disp = await dispositivoConocido(request, deps, email, ahora);
  if (disp) return abrirSesion(deps, email, ahora, [disp]);
  await enviarCodigo(env, deps, email, ahora, true);
  return json(200, { ok: true, paso: 'codigo', mensaje: 'Te mandamos un código a tu correo.' });
}

async function entrarConCodigo(env, deps, d) {
  const email = normalizar(d.email);
  const codigo = String(d.codigo || '').replace(/\D/g, '');
  const nueva = d.clave_nueva;
  const mal = json(401, { ok: false, error: 'El código no es válido o ya venció. Pide uno nuevo.' });
  if (nueva != null && !claveValida(nueva)) return json(400, { ok: false, error: `La contraseña tiene que tener al menos ${MIN_CLAVE} caracteres.` });
  if (codigo.length !== 6 || !(await puedeEntrar(env, deps.db, email))) return mal;
  const ahora = deps.ahora();
  if (await bloqueado(deps.db, email, ahora)) return mal;
  const fila = await deps.db.prepare('SELECT codigo_hash, expira, intentos, clave_ok FROM equipo_codigos WHERE email = ?1').bind(email).first();
  if (!fila || Date.parse(fila.expira) <= ahora.getTime() || fila.intentos >= MAX_INTENTOS) return mal;
  if ((await sha256(`${email}:${codigo}`)) !== fila.codigo_hash) {
    await deps.db.batch([
      deps.db.prepare('UPDATE equipo_codigos SET intentos = intentos + 1 WHERE email = ?1').bind(email),
      fallo(deps.db, email, ahora),
    ]);
    return mal;
  }
  // Sin contraseña nueva el código solo sirve si llegó tras una contraseña correcta.
  if (nueva == null && fila.clave_ok !== 1) return json(400, { ok: false, paso: 'crear', error: 'Crea tu contraseña para entrar.' });
  const sentencias = [deps.db.prepare('DELETE FROM equipo_codigos WHERE email = ?1').bind(email)];
  if (nueva != null) {
    // Contraseña nueva: se cierran las sesiones y los dispositivos que tenía.
    const h = await hashClave(nueva);
    sentencias.push(
      deps.db.prepare(`INSERT INTO equipo_claves (email, hash, sal, iteraciones, creado_en) VALUES (?1, ?2, ?3, ?4, ?5)
        ON CONFLICT (email) DO UPDATE SET hash = excluded.hash, sal = excluded.sal, iteraciones = excluded.iteraciones, creado_en = excluded.creado_en`)
        .bind(email, h.hash, h.sal, h.iteraciones, ahora.toISOString()),
      deps.db.prepare('DELETE FROM equipo_sesiones WHERE email = ?1').bind(email),
      deps.db.prepare('DELETE FROM equipo_dispositivos WHERE email = ?1').bind(email),
    );
  }
  return abrirSesion(deps, email, ahora, sentencias);
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
