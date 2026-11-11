// Validación de los datos del paso 4 de /reservar. La usan el navegador (para
// avisar antes) y el servidor (que es el que decide). Sin dependencias.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const NOMBRE = /^(?=.*\p{L})[\p{L}\p{M}' .-]{2,60}$/u;
const DOCUMENTO = { dni: /^\d{8}$/, ce: /^[A-Z0-9]{9,12}$/, pasaporte: /^[A-Z0-9]{6,12}$/ };

const limpio = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').replace(/[’ʼ‘]/g, "'");
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

// Tipo y número de documento, ya limpio (sin espacios, puntos ni guiones, en
// mayúsculas). Lo usan /reservar y los links de agenda.
export function revisarDocumento(tipo, valor) {
  if (!Object.hasOwn(DOCUMENTO, String(tipo ?? ''))) return mal('Elige tu tipo de documento.');
  const documento = String(valor ?? '').replace(/[\s.-]+/g, '').toUpperCase();
  if (!DOCUMENTO[tipo].test(documento)) {
    return mal(tipo === 'dni' ? 'Escribe tu DNI (8 dígitos).' : 'Revisa el número de tu documento.');
  }
  return { ok: true, documento };
}

// Nombres, apellidos y documento de una persona. `quien` cambia el texto del error («tus» / «del paciente»).
function persona(nombresV, paternoV, maternoV, tipoV, docV, deTi) {
  const nombres = limpio(nombresV);
  const paterno = limpio(paternoV);
  const materno = limpio(maternoV);
  if (!NOMBRE.test(nombres)) return mal(deTi ? 'Escribe tus nombres.' : 'Escribe los nombres del paciente.');
  if (!NOMBRE.test(paterno)) return mal(deTi ? 'Escribe tu apellido paterno.' : 'Escribe el apellido paterno del paciente.');
  if (materno && !NOMBRE.test(materno)) return mal(deTi ? 'Revisa tu apellido materno.' : 'Revisa el apellido materno del paciente.');
  const tipo = String(tipoV ?? '');
  const doc = revisarDocumento(tipo, docV);
  if (!doc.ok) return deTi ? doc : mal(doc.error.replace('Elige tu', 'Elige el').replace('Escribe tu DNI', 'Escribe el DNI del paciente').replace('tu documento', 'el documento del paciente'));
  return { ok: true, nombres, paterno, materno, tipo, documento: doc.documento };
}

function nacimientoValido(valor, hoyLima, deTi) {
  const nacimiento = String(valor ?? '').trim();
  const error = mal(deTi ? 'Revisa tu fecha de nacimiento.' : 'Revisa la fecha de nacimiento del paciente.');
  if (!fechaReal(nacimiento)) return error;
  const anios = edad(nacimiento, hoyLima);
  if (anios < 10 || anios > 100) return error;
  return { ok: true, nacimiento };
}

// Paso 4 «Datos de pago» (spec 2026-11-10): primero quien paga (sus datos van a Mercado Pago) y, si la
// sesión no es para él (para_mi === false), el paciente. cliente = el paciente, como siempre; su correo
// es el del paciente o, si no lo dio, el de quien paga, y su WhatsApp el de quien paga.
export function validarDatos(d, hoyLima) {
  const p = persona(d.nombres, d.apellido_paterno, d.apellido_materno, d.tipo_documento, d.documento, true);
  if (!p.ok) return p;
  const whatsapp = String(d.whatsapp ?? '').replace(/[^\d+]/g, '');
  if (!/^\+?\d{9,15}$/.test(whatsapp)) return mal('Revisa tu número de WhatsApp.');
  const email = String(d.email ?? '').trim().toLowerCase();
  if (!EMAIL.test(email)) return mal('Revisa tu correo.');
  const pagador = { nombres: p.nombres, apellido_paterno: p.paterno, apellido_materno: p.materno || null,
    tipo_documento: p.tipo, documento: p.documento, whatsapp, email };
  const paraMi = d.para_mi !== false;
  let paciente;
  if (paraMi) {
    const n = nacimientoValido(d.fecha_nacimiento, hoyLima, true);
    if (!n.ok) return n;
    paciente = { ...p, nacimiento: n.nacimiento, email };
  } else {
    const q = persona(d.paciente_nombres, d.paciente_apellido_paterno, d.paciente_apellido_materno, d.paciente_tipo_documento, d.paciente_documento, false);
    if (!q.ok) return q;
    const n = nacimientoValido(d.paciente_fecha_nacimiento, hoyLima, false);
    if (!n.ok) return n;
    const correo = String(d.paciente_email ?? '').trim().toLowerCase();
    if (correo && !EMAIL.test(correo)) return mal('Revisa el correo del paciente.');
    paciente = { ...q, nacimiento: n.nacimiento, email: correo || email };
  }
  if (d.acepto !== true) return mal('Para continuar, acepta las condiciones del servicio.');
  return {
    ok: true,
    paraMi,
    pagador,
    cliente: {
      nombre: [paciente.nombres, paciente.paterno, paciente.materno].filter(Boolean).join(' '), nombres: paciente.nombres,
      apellido_paterno: paciente.paterno, apellido_materno: paciente.materno || null, fecha_nacimiento: paciente.nacimiento,
      tipo_documento: paciente.tipo, dni: paciente.documento, whatsapp, email: paciente.email,
    },
  };
}
