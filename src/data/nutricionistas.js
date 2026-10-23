// ─── Equipo y horarios de atención (handoff v2 de Alejandro, 1-oct-2026) ────
// Fuente única de la agenda web. Horas en formato 24 h, hora de Lima; `hasta`
// es la hora en que termina la última cita. Las presenciales además se recortan
// al horario del consultorio (ver HORARIO_CLINICA en disponibilidad.mjs).
//
// `modalidad: null`: Alejandro no la indicó todavía. Se ofrece presencial y por
// video (el consultorio único sigue mandando para las presenciales).
//
// `modalidad: 'presencial'` también se ofrece por video (Alejandro, 2026-10-15).
// `modalidad: 'video'` es solo virtual.
//
// `apodos`: cómo nombra el equipo a cada una en el calendario. Un evento de día
// completo que contenga cualquiera de estas palabras la saca ese día.
//
// `cadaDosSemanas`: una fecha en la que esa ventana SÍ aplica; aplica también
// cada 14 días antes y después. Una semana viene un día y la siguiente el otro.
// Nico alterna miércoles y sábado: viene el miércoles 28-oct-2026 y el sábado
// 7-nov-2026 (Romi, 2026-10-15). Paolo alterna martes y sábado: viene el
// sábado 17-oct-2026 y el martes 20-oct-2026 (Romi, 2026-10-15).

export const nutricionistas = [
  {
    id: 'nico',
    nombre: 'Nico',
    apodos: ['nico'],
    foto: '/equipo/nico.jpg',
    ventanas: [
      { dia: 'lunes', modalidad: null, desde: 11, hasta: 20 },
      { dia: 'martes', modalidad: null, desde: 11, hasta: 20 },
      { dia: 'miercoles', modalidad: null, desde: 11, hasta: 20, cadaDosSemanas: '2026-10-28' },
      { dia: 'jueves', modalidad: null, desde: 11, hasta: 20 },
      { dia: 'viernes', modalidad: 'video', desde: 11, hasta: 20 },
      { dia: 'sabado', modalidad: null, desde: 9, hasta: 18, cadaDosSemanas: '2026-11-07' },
    ],
  },
  {
    id: 'paola',
    nombre: 'Paola',
    apodos: ['paola'],
    foto: '/equipo/paola.jpg',
    ventanas: [
      { dia: 'lunes', modalidad: 'video', desde: 14, hasta: 20 },
      { dia: 'miercoles', modalidad: null, desde: 14, hasta: 19 }, // a las 7 p. m. da la clase (Romi, 2026-10-15)
      { dia: 'viernes', modalidad: 'presencial', desde: 14, hasta: 20 },
      { dia: 'sabado', modalidad: null, desde: 10, hasta: 19 },
    ],
  },
  {
    id: 'jussara',
    nombre: 'Jussara',
    apodos: ['jussara', 'yuyu'],
    foto: '/equipo/jussara.jpg',
    ventanas: [
      { dia: 'lunes', modalidad: null, desde: 10, hasta: 17 },
      { dia: 'martes', modalidad: null, desde: 10, hasta: 17 },
      { dia: 'miercoles', modalidad: null, desde: 10, hasta: 17 },
      { dia: 'jueves', modalidad: null, desde: 10, hasta: 17 },
      { dia: 'viernes', modalidad: null, desde: 10, hasta: 17 },
      { dia: 'sabado', modalidad: null, desde: 9, hasta: 13 },
    ],
  },
  {
    id: 'paolo',
    nombre: 'Paolo',
    apodos: ['paolo'],
    foto: '/equipo/paolo.jpg',
    ventanas: [
      { dia: 'lunes', modalidad: null, desde: 14, hasta: 20 },
      { dia: 'martes', modalidad: null, desde: 14, hasta: 20, cadaDosSemanas: '2026-10-20' },
      { dia: 'jueves', modalidad: null, desde: 14, hasta: 20 }, // de 2 a 8 (Joaquín, 2026-10-23; antes 10 a 17)
      { dia: 'viernes', modalidad: null, desde: 14, hasta: 20 },
      { dia: 'sabado', modalidad: null, desde: 10, hasta: 17, cadaDosSemanas: '2026-10-17' },
    ],
  },
];
