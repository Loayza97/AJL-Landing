// Login del panel del equipo: código por correo y sesión en cookie (HttpOnly,
// SameSite=Strict). Lo usan /panel/ y /panel/links/; las dos páginas tienen
// #login, #login-msg, #login-email, #login-codigo, #login-btn y #salir.
export function montarLogin({ onEntrar }) {
  const $ = (s) => document.querySelector(s);
  const enviar = (ruta, cuerpo) => fetch(ruta, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
  let pasoCodigo = false;
  $('#login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('#login-email').value;
    const btn = $('#login-btn');
    btn.disabled = true;
    if (!pasoCodigo) {
      await enviar('/api/equipo/codigo', { email });
      pasoCodigo = true;
      $('#login-msg').textContent = 'Si tu correo está autorizado, te llegó un código. Escríbelo aquí (vence en 10 minutos).';
      $('#login-codigo').hidden = false;
      $('#login-codigo').focus();
      btn.textContent = 'Entrar';
    } else {
      const r = await enviar('/api/equipo/entrar', { email, codigo: $('#login-codigo').value });
      if (r.ok) await onEntrar();
      else $('#login-msg').textContent = 'El código no es válido o ya venció. Recarga la página para pedir otro.';
    }
    btn.disabled = false;
  });
  $('#salir').addEventListener('click', async () => { await fetch('/api/equipo/salir', { method: 'POST' }); location.reload(); });
}
