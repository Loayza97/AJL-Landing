// ─── Equipo y horarios de atención (handoff v2 de Alejandro, 1-oct-2026) ────
// Fuente única de la agenda web. Horas en formato 24 h, hora de Lima; `hasta`
// es la hora en que termina la última cita. Las presenciales además se recortan
// al horario del consultorio (ver HORARIO_CLINICA en disponibilidad.mjs).
//
// `modalidad: null`: Alejandro no la indicó todavía. Se ofrece presencial y por
// video (el consultorio único sigue mandando para las presenciales).
//
// `apodos`: cómo nombra el equipo a cada una en el calendario. Un evento de día
// completo que contenga cualquiera de estas palabras la saca ese día.
//
// `cadaDosSemanas`: una fecha en la que esa ventana SÍ aplica; aplica también
// cada 14 días antes y después. Nico alterna miércoles y sábado: viene el
// miércoles 7-oct-2026 y el sábado 3-oct-2026 (el miércoles 30-sep no vino).
//
// Paolo alterna viernes y sábado, pero falta definir qué semanas: hasta
// entonces no se ofrece ninguno de los dos. Mejor perder horas que vender una
// que no atiende.

export const nutricionistas = [
  {
    id: 'nico',
    nombre: 'Nico',
    apodos: ['nico'],
    foto: null,
    ventanas: [
      { dia: 'lunes', modalidad: 'presencial', desde: 11, hasta: 20 },
      { dia: 'martes', modalidad: 'presencial', desde: 11, hasta: 20 },
      { dia: 'miercoles', modalidad: null, desde: 11, hasta: 20, cadaDosSemanas: '2026-10-07' },
      { dia: 'jueves', modalidad: 'presencial', desde: 11, hasta: 20 },
      { dia: 'viernes', modalidad: 'video', desde: 11, hasta: 20 },
      { dia: 'sabado', modalidad: null, desde: 9, hasta: 18, cadaDosSemanas: '2026-10-03' },
    ],
  },
  {
    id: 'paola',
    nombre: 'Paola',
    apodos: ['paola'],
    foto: null,
    ventanas: [
      { dia: 'lunes', modalidad: 'video', desde: 14, hasta: 20 },
      { dia: 'miercoles', modalidad: 'presencial', desde: 14, hasta: 20 },
      { dia: 'viernes', modalidad: 'presencial', desde: 14, hasta: 20 },
      { dia: 'sabado', modalidad: null, desde: 10, hasta: 19 },
    ],
  },
  {
    id: 'jussara',
    nombre: 'Jussara',
    apodos: ['jussara', 'yuyu'],
    foto: null,
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
    foto: null,
    ventanas: [
      { dia: 'lunes', modalidad: 'presencial', desde: 14, hasta: 20 },
      { dia: 'martes', modalidad: 'presencial', desde: 14, hasta: 20 },
      { dia: 'jueves', modalidad: null, desde: 10, hasta: 17 },
    ],
  },
];
