// Datos de contacto a medias: el paciente reconoce los suyos y quien solo tiene
// el link no los aprende.
export function enmascararCorreo(email) {
  const [usuario, dominio] = String(email || '').split('@');
  return `${(usuario || '').slice(0, 1)}••••••@${dominio || ''}`;
}

export function enmascararTelefono(tel) {
  const s = String(tel || '');
  const codigo = s.startsWith('+51') ? '+51 ' : '';
  return `${codigo}••• ••• ${s.slice(-3)}`;
}
