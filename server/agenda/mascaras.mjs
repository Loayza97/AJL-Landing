// Datos de contacto a medias: el paciente reconoce los suyos y quien solo tiene
// el link no los aprende.
// Correo: 3 letras al inicio y 3 al final (Romi, 2026-11-02); con usuarios
// cortos se muestran menos para que siempre queden al menos 2 ocultas.
export function enmascararCorreo(email) {
  const [usuario = '', dominio = ''] = String(email || '').split('@');
  const k = Math.min(3, Math.floor((usuario.length - 2) / 2));
  const visible = k < 1 ? `${usuario.slice(0, 1)}••••••` : `${usuario.slice(0, k)}••••••${usuario.slice(-k)}`;
  return `${visible}@${dominio}`;
}

export function enmascararTelefono(tel) {
  const s = String(tel || '');
  const codigo = s.startsWith('+51') ? '+51 ' : '';
  return `${codigo}••• ••• ${s.slice(-3)}`;
}
