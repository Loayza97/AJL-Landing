// Código de país del WhatsApp. Perú primero (queda elegido por defecto); luego
// los países desde donde más escriben pacientes y vecinos. Quien no esté aquí
// elige «Otro» y escribe +código. Lo usan /reservar/ y /agenda/.
export const PAISES = [
  ['🇵🇪', 'Perú', '51'], ['🇺🇸', 'EE.UU.', '1'], ['🇪🇸', 'España', '34'], ['🇨🇱', 'Chile', '56'],
  ['🇦🇷', 'Argentina', '54'], ['🇨🇴', 'Colombia', '57'], ['🇪🇨', 'Ecuador', '593'], ['🇧🇴', 'Bolivia', '591'],
  ['🇲🇽', 'México', '52'], ['🇻🇪', 'Venezuela', '58'], ['🇧🇷', 'Brasil', '55'], ['🇮🇹', 'Italia', '39'],
  ['🇨🇦', 'Canadá', '1'], ['🌐', 'Otro', ''],
];

// Número completo con +código: «Otro» (código vacío) o un número que ya trae +
// se dejan como los escribió la persona.
export function telefonoCompleto(codigo, escrito) {
  const numero = String(escrito || '').replace(/[^\d+]/g, '');
  if (!codigo || numero.startsWith('+')) return numero;
  return `+${codigo}${numero.replace(/^0+/, '')}`;
}

export const placeholderTelefono = (codigo) => (codigo === '51' ? '9__ ___ ___' : (codigo ? 'Tu número' : '+código y número'));
