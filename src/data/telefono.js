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

// País según el código del número (+51… es Perú), para la columna PAÍS de la base
// maestra. Gana el código más largo (+593 es Ecuador, no +59…); +1 queda como
// EE.UU. (Canadá comparte el código). Sin + o con un código que no está: vacío.
const POR_CODIGO = PAISES.filter(([, , c]) => c).sort((a, b) => b[2].length - a[2].length);
export function paisDeTelefono(numero) {
  const n = String(numero || '').replace(/[^\d+]/g, '');
  if (!n.startsWith('+')) return '';
  return POR_CODIGO.find(([, , c]) => n.startsWith(`+${c}`))?.[1] ?? '';
}

// Número para pegar en la base maestra: los de Perú van sin el +51 (962730636),
// como el resto de la base (Romi, 2026-10-16). Los de otros países, con el código y
// un espacio («+593 991234567»): sin el espacio Sheets lo toma como número y borra el +.
// Con un código que no está en la lista se deja como vino.
export function numeroParaPegar(numero) {
  const n = String(numero || '').replace(/[^\d+]/g, '');
  const codigo = n.startsWith('+') ? POR_CODIGO.find(([, , c]) => n.startsWith(`+${c}`))?.[2] : null;
  if (codigo === '51') return n.slice(3);
  return codigo ? `+${codigo} ${n.slice(codigo.length + 1)}` : String(numero || '');
}
