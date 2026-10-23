// Requisitos para la consulta, según la modalidad (texto del equipo, 2026-10-23).
// Una sola fuente para los correos al paciente y las pantallas de cita confirmada.
export const REQUISITOS = {
  presencial: {
    titulo: '📌 Requisitos para tu consulta presencial',
    items: [
      'Higiene personal: por favor, ven aseado(a) 🧼✨ ¡Así hacemos tu evaluación de la mejor manera!',
      'Ropa para las mediciones: 👕 hombres, traer un short 🩳; 👩‍🦰 mujeres, traer un bra deportivo y un short 👟. Esto nos ayudará a tomar tus medidas físicas con más precisión 📏💪',
    ],
  },
  video: {
    titulo: '📌 Requisitos para tu consulta virtual',
    items: ['Tienes que pesarte y tallarte antes de la consulta, preferiblemente en ayunas 👏🏽'],
  },
};

export const requisitosDe = (modalidad) => REQUISITOS[modalidad === 'video' ? 'video' : 'presencial'];
