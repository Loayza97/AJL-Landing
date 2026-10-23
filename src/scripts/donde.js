// Dónde es la cita, para el selector de horas y las pantallas finales: la
// dirección del consultorio con su link a Maps, o el aviso / link de Google Meet.
import { contacto } from '../data/contacto.js';
import { requisitosDe } from '../data/requisitos.js';

export const NOMBRE_MODALIDAD = { presencial: 'Presencial', video: 'Virtual' };

// Requisitos para la consulta según la modalidad, para las pantallas finales.
export function nodoRequisitos(modalidad) {
  const r = requisitosDe(modalidad);
  const caja = document.createElement('div');
  caja.className = 'rs-requisitos';
  const t = document.createElement('p');
  const b = document.createElement('strong');
  b.textContent = r.titulo;
  t.append(b);
  const ul = document.createElement('ul');
  for (const i of r.items) { const li = document.createElement('li'); li.textContent = i; ul.append(li); }
  caja.append(t, ul);
  return caja;
}

// meet: link de la videollamada si ya existe; null mientras no se crea.
export function nodoDonde(modalidad, meet = null) {
  const caja = document.createElement('div');
  caja.className = 'rs-donde';
  const texto = document.createElement('span');
  const link = document.createElement('a');
  link.target = '_blank';
  link.rel = 'noopener';
  if (modalidad === 'video') {
    texto.textContent = meet ? 'Por Google Meet.' : 'Por Google Meet. El link te llega en la invitación a tu correo.';
    if (meet) { link.href = meet; link.textContent = 'Entrar a la videollamada'; }
  } else {
    texto.textContent = `En nuestro consultorio: ${contacto.direccion}.`;
    link.href = contacto.maps.ficha;
    link.textContent = 'Ver en Google Maps';
  }
  caja.append(texto);
  if (link.href) caja.append(' ', link);
  return caja;
}
