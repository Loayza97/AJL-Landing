// Validación de los datos del paso 4 de /reservar. La usan el navegador (para
// avisar antes) y el servidor (que es el que decide). Sin dependencias.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const NOMBRE = /^(?=.*\p{L})[\p{L}\p{M}' .-]{2,60}$/u;
const DOCUMENTO = { dni: /^\d{8}$/, ce: /^[A-Z0-9]{9,12}$/, pasaporte: /^[A-Z0-9]{6,12}$/ };

const limpio = (s) => String(s ?? '').trim().replace(/\s+/g, ' ');
const mal = (error) => ({ ok: false, error });

export const hoyEnLima = (fecha) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(fecha);

function fechaReal(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [a, m, d] = s.split('-').map(Number);
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
}

function edad(nacimiento, hoy) {
  const [a, m, d] = nacimiento.split('-').map(Number);
  const [ha, hm, hd] = hoy.split('-').map(Number);
  return ha - a - (hm < m || (hm === m && hd < d) ? 1 : 0);
}

export function validarDatos(d, hoyLima) {
  const nombres = limpio(d.nombres);
  const paterno = limpio(d.apellido_paterno);
  const materno = limpio(d.apellido_materno);
  if (!NOMBRE.test(nombres)) return mal('Escribe tus nombres.');
  if (!NOMBRE.test(paterno)) return mal('Escribe tu apellido paterno.');
  if (materno && !NOMBRE.test(materno)) return mal('Revisa tu apellido materno.');
  const whatsapp = String(d.whatsapp ?? '').replace(/[^\d+]/g, '');
  if (!/^\+?\d{9,15}$/.test(whatsapp)) return mal('Revisa tu número de WhatsApp.');
  const email = String(d.email ?? '').trim().toLowerCase();
  if (!EMAIL.test(email)) return mal('Revisa tu correo.');
  const nacimiento = String(d.fecha_nacimiento ?? '').trim();
  if (!fechaReal(nacimiento)) return mal('Revisa tu fecha de nacimiento.');
  const anios = edad(nacimiento, hoyLima);
  if (anios < 10 || anios > 100) return mal('Revisa tu fecha de nacimiento.');
  const tipo = String(d.tipo_documento ?? '');
  if (!Object.hasOwn(DOCUMENTO, tipo)) return mal('Elige tu tipo de documento.');
  const documento = String(d.documento ?? '').replace(/\s+/g, '').toUpperCase();
  if (!DOCUMENTO[tipo].test(documento)) {
    return mal(tipo === 'dni' ? 'Escribe tu DNI (8 dígitos).' : 'Revisa el número de tu documento.');
  }
  if (d.acepto !== true) return mal('Para continuar, acepta las condiciones del servicio.');
  return {
    ok: true,
    cliente: {
      nombre: [nombres, paterno, materno].filter(Boolean).join(' '), nombres, apellido_paterno: paterno,
      apellido_materno: materno || null, fecha_nacimiento: nacimiento, tipo_documento: tipo, dni: documento, whatsapp, email,
    },
  };
}
