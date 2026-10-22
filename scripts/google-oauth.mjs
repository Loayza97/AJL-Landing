// Autorización única de Google Calendar para la agenda web.
// Uso: GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... node scripts/google-oauth.mjs
// Abre el enlace que imprime, inicia sesión con la cuenta DUEÑA del calendario
// y acepta. El refresh token se guarda directo como secreto en Cloudflare
// (producción y preview) junto con el client id y secret: nunca se imprime
// ni se pega en un chat.
import http from 'node:http';
import { execFileSync } from 'node:child_process';

const PUERTO = 53682;
const REDIRECT = `http://localhost:${PUERTO}/callback`;
const { GOOGLE_CLIENT_ID: id, GOOGLE_CLIENT_SECRET: secreto } = process.env;
if (!id || !secreto) { console.error('Faltan GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET'); process.exit(2); }

const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
url.search = new URLSearchParams({
  client_id: id, redirect_uri: REDIRECT, response_type: 'code', access_type: 'offline', prompt: 'consent',
  scope: 'https://www.googleapis.com/auth/calendar.events',
});
console.log(`Abre este enlace con la cuenta dueña del calendario:\n\n${url}\n`);

http.createServer(async (req, res) => {
  const u = new URL(req.url, REDIRECT);
  if (u.pathname !== '/callback') { res.end(); return; }
  const code = u.searchParams.get('code');
  if (!code) { res.end(`Google no devolvió código: ${u.search}`); return; }
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: id, client_secret: secreto, redirect_uri: REDIRECT, grant_type: 'authorization_code' }),
  });
  const d = await r.json();
  if (!d.refresh_token) { res.end('Error: mira la terminal.'); console.error(d); process.exit(1); }
  // Se guardan juntos el cliente y el token: un refresh token solo sirve con
  // el mismo client id y secret que lo generaron (si no, Google da invalid_grant).
  const secretos = { GOOGLE_CLIENT_ID: id, GOOGLE_CLIENT_SECRET: secreto, GOOGLE_REFRESH_TOKEN: d.refresh_token };
  for (const extra of [[], ['--env', 'preview']]) {
    for (const [nombre, valor] of Object.entries(secretos)) {
      execFileSync('npx', ['wrangler', 'pages', 'secret', 'put', nombre, '--project-name', 'ajl-landing', ...extra],
        { input: valor.trim(), stdio: ['pipe', 'inherit', 'inherit'] });
    }
  }
  res.end('Listo. Puedes cerrar esta pestaña.');
  console.log('Cliente y refresh token guardados en producción y preview.');
  process.exit(0);
}).listen(PUERTO);
