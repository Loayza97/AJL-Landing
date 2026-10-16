// Login del panel del equipo (Figma «4. Propuesta: entrar con contraseña»):
// A entrar con correo y contraseña; B código por correo (dispositivo nuevo, o
// primera vez u olvidó); C crear contraseña; D primera vez u olvidó.
// Lo usan /panel/ y /panel/usuarios/: las dos tienen un <form id="login"> vacío
// y un botón #salir. El formulario tiene correo y contraseña de verdad, con su
// autocomplete, para que el navegador ofrezca guardarlos y llenarlos.
const enviar = (ruta, cuerpo) => fetch(ruta, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) })
  .catch(() => null);
const jsonDe = async (r) => (r ? r.json().catch(() => ({})) : {});
const MIN_CLAVE = 10;

const ESTILO = `
.pl { max-width: 400px; display: flex; flex-direction: column; gap: 14px; background: #fff; border: 1px solid #E4E4E4; border-radius: 16px; padding: 24px; }
.pl h2 { margin: 0; font-size: 1.3rem; font-weight: 800; }
.pl p { margin: 0; color: #5C5C5C; font-size: .9rem; line-height: 1.5; }
.pl label { display: flex; flex-direction: column; gap: 6px; font-size: .8rem; font-weight: 700; }
.pl input { min-height: 48px; border: 1px solid #CFCFCF; border-radius: 10px; padding: 0 14px; font: inherit; font-size: 1rem; font-weight: 400; }
.pl .pl-btn { min-height: 48px; border: 0; border-radius: 10px; background: #C9A24B; color: #111; font: inherit; font-weight: 700; cursor: pointer; }
.pl .pl-btn:disabled { opacity: .6; cursor: wait; }
.pl .pl-link { min-height: 44px; background: none; border: 0; color: #7A5E1E; font: inherit; font-weight: 600; cursor: pointer; text-decoration: underline; }
.pl .pl-error { color: #9B2C2C; font-weight: 600; }
.pl .pl-oculto { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
`;

const ocultarCorreo = (e) => e.replace(/^(.)[^@]*/, '$1•••');

export function montarLogin({ onEntrar }) {
  const form = document.querySelector('#login');
  if (!document.querySelector('#pl-estilo')) document.head.append(Object.assign(document.createElement('style'), { id: 'pl-estilo', textContent: ESTILO }));
  form.classList.add('pl');
  form.noValidate = false;
  // email y clave: el correo y la contraseña que se escribieron en A (la clave solo
  // en memoria, para «Mandar otro código»); codigo: el de B, para C.
  const s = { paso: 'entrar', modo: 'disp', email: '', clave: '', codigo: '', error: '', aviso: '' };

  const el = (tag, props = {}, ...hijos) => { const e = Object.assign(document.createElement(tag), props); e.append(...hijos); return e; };
  const campo = (etq, props) => { const i = el('input', { required: true, ...props }); return [el('label', {}, etq, i), i]; };
  const boton = (texto) => el('button', { type: 'submit', className: 'pl-btn', textContent: texto });
  const enlace = (texto, ir) => { const b = el('button', { type: 'button', className: 'pl-link', textContent: texto }); b.addEventListener('click', ir); return b; };
  const ir = (paso, extra = {}) => { Object.assign(s, { error: '', aviso: '' }, extra, { paso }); pintar(); };
  // Al entrar, el login vuelve a A sin la contraseña en memoria (si la sesión vence, se ve A).
  const entro = () => { Object.assign(s, { paso: 'entrar', clave: '', codigo: '', modo: 'disp' }); return onEntrar(); };

  // Aviso de un error de lo escrito (código corto, contraseñas distintas) sin
  // redibujar: lo que ya se escribió no se borra.
  function avisar(texto) {
    s.error = texto;
    let p = form.querySelector('.pl-error');
    if (!p) { p = el('p', { className: 'pl-error', role: 'alert' }); form.append(p); }
    p.textContent = texto;
  }

  function pintar() {
    const partes = [];
    let foco;
    const titulo = (h, p) => partes.push(el('h2', { textContent: h }), el('p', { textContent: p }));
    if (s.paso === 'entrar') {
      titulo('Entrar', 'Con tu correo del equipo y tu contraseña.');
      const [lc, c] = campo('Correo', { type: 'email', name: 'email', autocomplete: 'username', placeholder: 'tucorreo@gmail.com', value: s.email });
      const [lk, k] = campo('Contraseña', { type: 'password', name: 'password', autocomplete: 'current-password', placeholder: 'Tu contraseña' });
      partes.push(lc, lk, boton('Entrar'), enlace('Primera vez u olvidaste tu contraseña', () => ir('correo', { email: c.value })));
      form.onsubmit = async (e) => {
        e.preventDefault();
        s.email = c.value.trim(); s.clave = k.value;
        await paso(() => enviar('/api/equipo/entrar', { email: s.email, clave: s.clave }), async (r, d) => {
          if (r.ok && d.paso === 'codigo') return ir('codigo', { modo: 'disp' });
          if (r.ok) return entro();
          s.error = d.error || 'No pudimos entrar. Intenta de nuevo.';
        });
      };
      foco = s.email ? k : c;
    } else if (s.paso === 'correo') {
      titulo('Primera vez u olvidaste tu contraseña', 'Escribe tu correo del equipo y te mandamos un código para crear tu contraseña.');
      const [lc, c] = campo('Correo', { type: 'email', name: 'email', autocomplete: 'username', placeholder: 'tucorreo@gmail.com', value: s.email });
      partes.push(lc, boton('Mandar código'), enlace('Volver a entrar', () => ir('entrar')));
      form.onsubmit = async (e) => {
        e.preventDefault();
        s.email = c.value.trim(); s.clave = '';
        await paso(() => enviar('/api/equipo/codigo', { email: s.email }), async (r) => {
          if (r.ok) return ir('codigo', { modo: 'crear' });
          s.error = 'No pudimos mandar el código. Intenta de nuevo.';
        });
      };
      foco = c;
    } else if (s.paso === 'codigo') {
      titulo('Revisa tu correo', `Si tu correo está autorizado, te mandamos un código de 6 dígitos a ${ocultarCorreo(s.email)}. Vence en 10 minutos.`);
      const [lc, c] = campo('Código', { type: 'text', name: 'codigo', inputMode: 'numeric', autocomplete: 'one-time-code', maxLength: 6, placeholder: '6 dígitos' });
      partes.push(lc, boton('Continuar'), enlace('Mandar otro código', otroCodigo));
      if (s.modo === 'disp') partes.push(el('p', { textContent: 'Te lo pedimos porque es la primera vez que entras desde este celular o computadora, o pasaron más de 30 días.' }));
      form.onsubmit = async (e) => {
        e.preventDefault();
        const codigo = c.value.replace(/\D/g, '');
        if (codigo.length !== 6) return avisar('El código tiene 6 dígitos.');
        if (s.modo === 'crear') return ir('crear', { codigo });
        await paso(() => enviar('/api/equipo/entrar', { email: s.email, codigo }), async (r, d) => {
          if (r.ok) return entro();
          s.error = d.error || 'El código no es válido o ya venció. Pide uno nuevo.';
        });
      };
      foco = c;
    } else {
      titulo('Crea tu contraseña', 'Es solo tuya. No la compartas con nadie del equipo.');
      // El correo va en un campo oculto para que el navegador guarde la contraseña con él.
      const usuario = el('input', { type: 'email', name: 'email', autocomplete: 'username', value: s.email, readOnly: true, tabIndex: -1, className: 'pl-oculto' });
      usuario.setAttribute('aria-hidden', 'true');
      const [l1, k1] = campo('Contraseña nueva', { type: 'password', name: 'new-password', autocomplete: 'new-password', placeholder: `Mínimo ${MIN_CLAVE} caracteres`, minLength: MIN_CLAVE });
      const [l2, k2] = campo('Repítela', { type: 'password', name: 'new-password-2', autocomplete: 'new-password', placeholder: 'La misma de arriba', minLength: MIN_CLAVE });
      partes.push(usuario, l1, l2, boton('Guardar y entrar'),
        el('p', { textContent: 'Si ya tenías una, la anterior deja de servir y se cierra tu sesión en los otros dispositivos.' }));
      form.onsubmit = async (e) => {
        e.preventDefault();
        if (k1.value.length < MIN_CLAVE) return avisar(`La contraseña tiene que tener al menos ${MIN_CLAVE} caracteres.`);
        if (k1.value !== k2.value) return avisar('Las dos contraseñas no son iguales.');
        await paso(() => enviar('/api/equipo/entrar', { email: s.email, codigo: s.codigo, clave_nueva: k1.value }), async (r, d) => {
          if (r.ok) return entro();
          if (r.status === 401) return ir('codigo', { error: d.error || 'El código no es válido o ya venció. Pide uno nuevo.' });
          s.error = d.error || 'No pudimos guardar la contraseña. Intenta de nuevo.';
        });
      };
      foco = k1;
    }
    if (s.error) partes.push(el('p', { className: 'pl-error', role: 'alert', textContent: s.error }));
    if (s.aviso) partes.push(el('p', { role: 'status', textContent: s.aviso }));
    form.replaceChildren(...partes);
    if (!form.hidden) foco?.focus();
  }

  // Corre una petición con el botón deshabilitado; sin red, avisa.
  async function paso(pedir, alResponder) {
    const b = form.querySelector('.pl-btn');
    b.disabled = true;
    const r = await pedir();
    b.disabled = false;
    if (!r) { s.error = 'Sin conexión. Revisa tu internet e intenta de nuevo.'; return pintar(); }
    s.error = '';
    await alResponder(r, await jsonDe(r));
    if (form.isConnected) pintar();
  }

  async function otroCodigo() {
    const r = s.modo === 'disp' ? await enviar('/api/equipo/entrar', { email: s.email, clave: s.clave }) : await enviar('/api/equipo/codigo', { email: s.email });
    s.error = r ? '' : 'Sin conexión. Revisa tu internet e intenta de nuevo.';
    s.aviso = r ? 'Si pasó más de un minuto, te mandamos otro código.' : '';
    pintar();
  }

  pintar();
  document.querySelector('#salir').addEventListener('click', async () => { await fetch('/api/equipo/salir', { method: 'POST' }).catch(() => null); location.reload(); });
}
