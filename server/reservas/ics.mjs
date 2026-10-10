// Archivo .ics para «Agregar a mi calendario» (Apple, Outlook y otros).
const sello = (iso) => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (m) => `\\${m}`);

export function icsDeReserva({ uid, titulo, inicioUtc, finUtc, ubicacion, descripcion, ahora }) {
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//AJL Nutricion//Reservas//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}@ajlnutricion.com`,
    `DTSTAMP:${sello(ahora.toISOString())}`,
    `DTSTART:${sello(inicioUtc)}`,
    `DTEND:${sello(finUtc)}`,
    `SUMMARY:${esc(titulo)}`,
    `LOCATION:${esc(ubicacion)}`,
    `DESCRIPTION:${esc(descripcion)}`,
    'END:VEVENT', 'END:VCALENDAR', '',
  ].join('\r\n');
}
