// ─── Datos de pago y contacto compartidos por todos los planes ──────────────
//
// FUENTE ÚNICA DE VERDAD (NAP: Name, Address, Phone).
// Estos datos alimentan a la vez el texto visible de la web y el schema
// LocalBusiness de <Layout>. Deben coincidir EXACTAMENTE con la ficha de
// Google Business Profile: Google cruza ambos y las discrepancias le restan
// confianza al negocio en el paquete local.

export const pago = {
  yape: '919 151 237',
  bcpCuentaCorriente: '193-91104808-0-57',
  bcpCCI: '19391104808057',
};

// ─── Dirección ───────────────────────────────────────────────────────────────
const direccionPartes = {
  calle: 'Jr. Almirante Manuel Villavicencio 1461',
  distrito: 'Lince',
  ciudad: 'Lima',
  region: 'Lima',
  codigoPostal: '15073',
  pais: 'PE',
};

// Coordenadas del consultorio. Verificadas contra la ficha de Google Business
// Profile (place ID /g/11zgct9hmq); no editar sin cambiar también el pin de la
// ficha, o volverán a divergir.
const geo = { lat: -12.08999, lng: -77.04614 };

// ─── Horario ─────────────────────────────────────────────────────────────────
// Formato 24h. `dias` usa los nombres de schema.org (Monday…Saturday).
// Cambiar SOLO aquí: el texto visible y el schema se derivan de esta tabla.
const horarioSpec = [
  { dias: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], abre: '10:00', cierra: '20:00' },
  { dias: ['Saturday'], abre: '09:00', cierra: '19:00' },
];

const DIAS_ES = {
  Monday: 'lunes',
  Tuesday: 'martes',
  Wednesday: 'miércoles',
  Thursday: 'jueves',
  Friday: 'viernes',
  Saturday: 'sábados',
  Sunday: 'domingos',
};

// '10:00' → '10:00 a.m.' · '20:00' → '8:00 p.m.'
function a12h(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const sufijo = h < 12 ? 'a.m.' : 'p.m.';
  const hora12 = h % 12 === 0 ? 12 : h % 12;
  return `${hora12}:${String(m).padStart(2, '0')} ${sufijo}`;
}

function tramoLegible({ dias, abre, cierra }) {
  const rango =
    dias.length > 1
      ? `${DIAS_ES[dias[0]]} a ${DIAS_ES[dias[dias.length - 1]]}`
      : DIAS_ES[dias[0]];
  return `${rango}, de ${a12h(abre)} a ${a12h(cierra)}`;
}

const horarioTexto = horarioSpec.map(tramoLegible).join(' · ');

// ─── Enlaces a la ficha de Google ────────────────────────────────────────────
const consultaMaps = encodeURIComponent(
  `AJL Nutrición, ${direccionPartes.calle}, ${direccionPartes.distrito}, ${direccionPartes.ciudad}`
);

export const contacto = {
  whatsappNumber: '51919151237',
  telefono: '+51919151237',

  direccion: `${direccionPartes.calle}, ${direccionPartes.distrito}, ${direccionPartes.ciudad}`,
  direccionPartes,
  geo,

  horario: horarioTexto,
  horarioSpec,

  maps: {
    // Ficha real del negocio (place ID /g/11zgct9hmq)
    ficha:
      'https://www.google.com/maps/place/AJL+Nutrici%C3%B3n/@-12.0899888,-77.0487171,17z/data=!3m1!4b1!4m6!3m5!1s0x9105c9257f924c1f:0x59dd76e5cf58065f!8m2!3d-12.0899941!4d-77.0461422!16s%2Fg%2F11zgct9hmq',
    // Embed por nombre + dirección completa (antes buscaba solo "AJL Nutrición, Lima",
    // que podía resolver a otro pin).
    embed: `https://maps.google.com/maps?q=${consultaMaps}&z=16&output=embed`,
  },
};
