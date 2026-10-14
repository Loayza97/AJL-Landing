// Panel /panel/usuarios/: quién entra al panel; dar y quitar acceso. Solo súper
// usuarios (la API da 403 a los demás). Todo el texto de la base va por textContent.
import { montarLogin } from './panel-login.js';

const $ = (s) => document.querySelector(s);
const ORIGEN = { admin: 'Súper usuario', fijo: 'Fijo', app: 'Agregado' };
const enviar = (ruta, cuerpo) => fetch(ruta, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
const celda = (texto) => { const c = document.createElement('td'); c.textContent = texto ?? ''; return c; };
const errorDe = async (r, porDefecto) => (await r.json().catch(() => ({}))).error ?? porDefecto;

function mostrar(vista) {
  $('#login').hidden = vista !== 'login';
  $('#app').hidden = vista !== 'app';
  $('#sin-permiso').hidden = vista !== 'sin-permiso';
  $('#salir').hidden = vista === 'login';
  if (vista !== 'app') $('#quien').textContent = '';
}

async function cargar() {
  const r = await fetch('/api/equipo/usuarios', { cache: 'no-store' });
  if (r.status === 401) return mostrar('login');
  if (r.status === 403) return mostrar('sin-permiso');
  mostrar('app');
  if (!r.ok) { $('#n-msg').textContent = 'No pudimos cargar la lista. Recarga la página.'; return; }
  const d = await r.json();
  $('#quien').textContent = `Entraste como ${d.email}`;
  $('#filas').replaceChildren(...d.usuarios.map((u) => {
    const tr = document.createElement('tr');
    const accion = document.createElement('td');
    if (u.origen === 'app') {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'us-btn us-btn--borde'; b.textContent = 'Quitar acceso';
      b.addEventListener('click', () => quitar(u, b));
      accion.append(b);
    }
    tr.append(celda(u.nombre), celda(u.email), celda(ORIGEN[u.origen]), accion);
    return tr;
  }));
}

async function quitar(u, b) {
  if (!confirm(`¿Quitarle el acceso a ${u.nombre ?? u.email}? Su sesión se cierra ahora.`)) return;
  b.disabled = true;
  const r = await enviar('/api/equipo/usuarios-quitar', { email: u.email });
  if (r.status === 401) return mostrar('login');
  if (!r.ok) { b.disabled = false; $('#n-msg').textContent = await errorDe(r, 'No se pudo quitar. Recarga la página.'); return; }
  $('#n-msg').textContent = `${u.email} ya no puede entrar al panel.`;
  cargar();
}

$('#nuevo').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#n-btn').disabled = true;
  const r = await enviar('/api/equipo/usuarios', { email: $('#n-email').value, nombre: $('#n-nombre').value });
  $('#n-btn').disabled = false;
  if (r.status === 401) return mostrar('login');
  if (r.status === 403) return mostrar('sin-permiso');
  if (!r.ok) { $('#n-msg').textContent = await errorDe(r, 'No se pudo dar acceso. Intenta de nuevo.'); return; }
  const d = await r.json();
  $('#nuevo').reset();
  $('#n-msg').textContent = `Listo: ${d.usuario.email} ya puede pedir su código en el panel.`;
  cargar();
});

// Login: el mismo módulo que /panel/ y /panel/links/.
montarLogin({ onEntrar: cargar });
cargar();
