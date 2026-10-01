// Lima está en UTC−5 todo el año (sin horario de verano), así que basta un
// desplazamiento fijo. Se guarda en UTC y solo se convierte para mostrar.
const OFFSET_MS = 5 * 3600 * 1000;
const DIA_MS = 86400 * 1000;

const partes = (fecha) => fecha.split('-').map(Number);

export function fechaLima(fecha) {
  return new Date(fecha.getTime() - OFFSET_MS).toISOString().slice(0, 10);
}

export function inicioUtc(fecha, hora) {
  const [y, m, d] = partes(fecha);
  return new Date(Date.UTC(y, m - 1, d, hora + 5)).toISOString().replace('.000Z', 'Z');
}

export function sumarDias(fecha, n) {
  const [y, m, d] = partes(fecha);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function diaSemana(fecha) {
  return new Date(`${fecha}T12:00:00Z`).getUTCDay();
}

export function diasEntre(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DIA_MS);
}

const FORMATO = new Intl.DateTimeFormat('es-PE', {
  timeZone: 'America/Lima', weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit',
});

export function etiquetaLima(iso) {
  return FORMATO.format(new Date(iso));
}
