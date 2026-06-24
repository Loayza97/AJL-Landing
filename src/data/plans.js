// ─── Fuente única de verdad de los 5 productos ──────────────────────────────
// Cualquier cambio de precio, features o link de pago se hace acá y se
// propaga al landing (matriz comparativa) y a las páginas de checkout.

export const plans = {
  evaluacion: {
    id: 'evaluacion',
    name: 'Evaluación Nutricional Personal',
    tagline: 'Primer paso',
    price: 80,
    period: 'pago único',
    culqiLink: 'https://express.culqi.com/pago/CE455B801E',
    checkoutSummary: [
      'Consulta personalizada de 20 a 30 minutos',
      'Diagnóstico completo de hábitos y composición corporal',
      'Dirección clara: qué, cómo y cuánto cambiar',
      'Los S/80 se descuentan del primer mes si decides continuar',
    ],
  },
  basico: {
    id: 'basico',
    name: 'Básico',
    tagline: 'Claridad en una sesión',
    price: 250,
    period: 'mes',
    culqiLink: 'https://express.culqi.com/pago/D1100F369A',
    freq: 'Única',
    badge: null,
    highlight: false,
    programs: null,
    programsNote: 'Pago único, sin permanencia',
    checkoutSummary: [
      '1 sesión de estrategia (60 min)',
      'Plan nutricional adaptado a tu rutina',
      'Pago único, sin permanencia',
    ],
  },
  acompanamiento: {
    id: 'acompanamiento',
    name: 'Acompañamiento',
    tagline: 'Tu primer paso con soporte',
    price: 320,
    period: 'mes',
    culqiLink: 'https://express.culqi.com/pago/DD1BE52C10',
    freq: 'Mensual',
    badge: null,
    highlight: false,
    programs: [
      { label: '3 meses', total: 'S/900', perMes: 'S/300/mes' },
    ],
    programsNote: null,
    checkoutSummary: [
      '1 sesión de estrategia + plan personalizado',
      'Seguimiento por WhatsApp y soporte nutricional',
      'Sesiones grupales semanales y comunidad privada',
    ],
  },
  constancia: {
    id: 'constancia',
    name: 'Constancia',
    tagline: 'Acompañamiento continuo',
    price: 440,
    period: 'mes',
    culqiLink: 'https://express.culqi.com/pago/D4E12ED399',
    freq: 'Quincenal',
    badge: 'Recomendado',
    highlight: true,
    programs: [
      { label: '3 meses', total: 'S/1,250', perMes: 'S/417/mes' },
      { label: '6 meses', total: 'S/2,400', perMes: 'S/400/mes' },
    ],
    programsNote: null,
    checkoutSummary: [
      'Estrategia + plan + sesión de seguimiento quincenal',
      'Soporte WhatsApp continuo y sesiones grupales',
      'Comunidad privada y revisión de progreso',
    ],
  },
  transformacion: {
    id: 'transformacion',
    name: 'Transformación',
    tagline: 'Acompañamiento total, semanal',
    price: 600,
    period: 'mes',
    culqiLink: 'https://express.culqi.com/pago/8F6B63FDF7',
    freq: 'Semanal',
    badge: 'Más completo',
    highlight: false,
    programs: [
      { label: '3 meses', total: 'S/1,700', perMes: 'S/567/mes' },
      { label: '6 meses', total: 'S/3,200', perMes: 'S/533/mes' },
    ],
    programsNote: null,
    checkoutSummary: [
      '2 sesiones de estrategia + planes nutricionales',
      'Sesiones de seguimiento semanales',
      'Atención prioritaria y comunidad privada',
    ],
  },
};

// Planes mensuales en orden de columna (de menor a mayor acompañamiento).
export const monthlyPlans = [
  plans.basico,
  plans.acompanamiento,
  plans.constancia,
  plans.transformacion,
];

// ─── Matriz de features (fuente única para la tabla comparativa) ────────────
// value: número (string) → se muestra tal cual · true → ✓ · false → —
//        'star' → ★ (incluido + destacado)
export const featureGroups = [
  {
    group: 'Sesiones individuales',
    rows: [
      {
        label: 'Sesión de estrategia',
        desc: 'Evaluación física y revisión de tus patrones de alimentación, costumbres y tipos de día. Estructuramos tu plan a partir de cómo comes y cómo vives · 60 min.',
        values: { basico: '1', acompanamiento: '1', constancia: '1', transformacion: '2' },
      },
      {
        label: 'Plan nutricional personalizado',
        desc: 'Distribución de tu alimentación a lo largo del día, con porciones y opciones adaptadas a tu rutina, tus horarios y lo que tienes disponible.',
        values: { basico: '1', acompanamiento: '1', constancia: '1', transformacion: '2' },
      },
      {
        label: 'Sesión de seguimiento',
        desc: 'Revisamos avances, cómo te sientes y qué hábitos estás sosteniendo. Buscamos estrategias para que el plan se cumpla, no cambiarlo a la primera · Virtual, 30 min.',
        values: { basico: false, acompanamiento: false, constancia: '1', transformacion: '2' },
      },
      {
        label: 'Sesión de logros',
        desc: 'Medición de composición corporal (bioimpedancia, cinta métrica, plicómetro) + revisión de hábitos. Exclusiva para pacientes nuevos, incluida en tu primer mes.',
        values: { basico: false, acompanamiento: false, constancia: true, transformacion: true },
      },
    ],
  },
  {
    group: 'Acompañamiento continuo',
    rows: [
      {
        label: 'Seguimiento por WhatsApp',
        desc: 'Para las decisiones del día a día: qué comer fuera de casa, cómo resolver una comida improvisada, qué hacer cuando el plan no calza con tu día · L-V 9am-6pm, S 9am-1pm.',
        values: { basico: false, acompanamiento: true, constancia: true, transformacion: true },
      },
      {
        label: 'Sesiones grupales',
        desc: '4 sesiones al mes en vivo. Espacio educativo donde trabajamos los fundamentos para sostener tus resultados por tu cuenta. Grabadas si no puedes asistir.',
        values: { basico: false, acompanamiento: true, constancia: true, transformacion: true },
      },
      {
        label: 'Comunidad exclusiva',
        desc: 'Grupo privado donde compartes el proceso con otras personas en tu misma situación: recetas, experiencias y motivación entre quienes te entienden.',
        values: { basico: false, acompanamiento: true, constancia: true, transformacion: true },
      },
      {
        label: 'Atención prioritaria',
        desc: 'Prioridad en todo: agendamiento de sesiones, entrega de planes y respuesta por WhatsApp. El mismo método, con atención preferente en cada contacto.',
        values: { basico: false, acompanamiento: false, constancia: false, transformacion: 'star' },
      },
    ],
  },
];
