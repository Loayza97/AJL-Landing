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
      'Evaluación personalizada de 30 minutos con el equipo de nutricionistas',
      'Diagnóstico completo de hábitos y composición corporal',
      'Los S/80 se descuentan de cualquier plan que adquieras el mismo día de tu evaluación',
    ],
  },
  // ─── Modelo C (18-sep-2026) ─────────────────────────────────────────────────
  // Los planes NO llevan nombre de cara al paciente: se identifican por cada
  // cuánto nos vemos. Los ids se conservan (URLs de checkout, anuncios,
  // analítica); lo que cambia es `name`. Columnas: 1, 3 y 6 meses (hoja
  // «Paquetes por permanencia», 2026-10-09). En la landing, bajo cada total va
  // su equivalente mensual, sin tachados; el ahorro se muestra solo en /reservar.
  basico: {
    id: 'basico',
    name: 'Una sola sesión',
    tagline: 'Sin acompañamiento continuo',
    price: 250,
    period: 'compra única',
    culqiLink: 'https://express.culqi.com/pago/D1100F369A',
    sessionsPerMonth: 1,
    single: true,
    badge: null,
    highlight: false,
    programs: null,
    // Lo que incluye: globo «i» de la tabla y resumen del checkout.
    // Fuente: PACK-KOC, handoff §14 (07-sep).
    checkoutSummary: [
      '1 sesión de 60 min, en Lince o por videollamada',
      'Tu plan nutricional en la app',
      'Sin seguimiento después de la sesión',
    ],
  },
  acompanamiento: {
    id: 'acompanamiento',
    name: '1 sesión al mes',
    tagline: 'Con acompañamiento continuo',
    price: 320,
    period: 'mes',
    culqiLink: 'https://express.culqi.com/pago/DD1BE52C10',
    sessionsPerMonth: 1,
    single: false,
    badge: null,
    highlight: false,
    programs: [
      { label: '3 meses', months: 3, total: 'S/810', perMes: 'S/270 al mes', totalSoles: 810 },
      { label: '6 meses', months: 6, total: 'S/1.500', perMes: 'S/250 al mes', totalSoles: 1500 },
    ],
    consultasMes: ['1 sesión de 60 min · recibes o actualizas tu plan'],
    // Lo que incluye: globo «i» de la tabla y resumen del checkout.
    // Fuente: PACK-KOC, handoff §14 (07-sep).
    checkoutSummary: [
      '1 sesión de 60 min al mes, en Lince o por videollamada',
      'Tu plan nutricional en la app',
      'Equipo de nutricionistas por WhatsApp (L–V 9–18 h, S 9–13 h)',
      '2 clases grupales en vivo por semana y comunidad',
    ],
  },
  constancia: {
    id: 'constancia',
    name: '2 sesiones al mes',
    tagline: 'Con acompañamiento continuo',
    price: 440,
    period: 'mes',
    culqiLink: 'https://express.culqi.com/pago/D4E12ED399',
    sessionsPerMonth: 2,
    single: false,
    badge: 'El que recomendamos',
    highlight: true,
    programs: [
      { label: '3 meses', months: 3, total: 'S/1.080', perMes: 'S/360 al mes', totalSoles: 1080 },
      { label: '6 meses', months: 6, total: 'S/1.950', perMes: 'S/325 al mes', totalSoles: 1950 },
    ],
    consultasMes: ['1ª sesión de 60 min · recibes o actualizas tu plan', '2ª control de 30 min'],
    firstMonthEval: true,
    // Lo que incluye: globo «i» de la tabla y resumen del checkout.
    // Fuente: PACK-KOC, handoff §14 (07-sep).
    checkoutSummary: [
      '1 sesión de 60 min al mes, en Lince o por videollamada',
      '1 control virtual de 30 min a mitad de mes',
      '**+ 1 evaluación el primer mes, sin costo adicional**: un control más para medir tu avance y decidir cómo sigues',
      'Tu plan nutricional en la app',
      'Equipo de nutricionistas por WhatsApp (L–V 9–18 h, S 9–13 h)',
      '2 clases grupales en vivo por semana y comunidad',
    ],
  },
  transformacion: {
    id: 'transformacion',
    name: '4 sesiones al mes',
    tagline: 'Con acompañamiento continuo',
    price: 600,
    period: 'mes',
    culqiLink: 'https://express.culqi.com/pago/8F6B63FDF7',
    sessionsPerMonth: 4,
    single: false,
    badge: null,
    highlight: false,
    programs: [
      { label: '3 meses', months: 3, total: 'S/1.530', perMes: 'S/510 al mes', totalSoles: 1530 },
      { label: '6 meses', months: 6, total: 'S/2.808', perMes: 'S/468 al mes', totalSoles: 2808 },
    ],
    consultasMes: ['1ª y 3ª sesión de 60 min · recibes o actualizas tu plan', '2ª y 4ª control de 30 min'],
    firstMonthEval: true,
    // Lo que incluye: globo «i» de la tabla y resumen del checkout.
    // Fuente: PACK-KOC, handoff §14 (07-sep).
    checkoutSummary: [
      '2 sesiones de 60 min al mes, en Lince o por videollamada',
      '2 controles virtuales de 30 min al mes',
      '**+ 1 evaluación el primer mes, sin costo adicional**: un control más para medir tu avance y decidir cómo sigues',
      '2 planes nutricionales en la app',
      'Equipo de nutricionistas por WhatsApp (L–V 9–18 h, S 9–13 h)',
      '2 clases grupales en vivo por semana y comunidad',
      'Atención prioritaria',
    ],
  },
};

// Planes con acompañamiento continuo, de menor a mayor frecuencia.
export const monthlyPlans = [
  plans.acompanamiento,
  plans.constancia,
  plans.transformacion,
];

// La sesión suelta, fuera del bloque de acompañamiento.
export const singlePlan = plans.basico;

// Lo que incluye el acompañamiento continuo (banner v2, 25-sep-2026).
export const includedInAll = [
  { icon: 'chat',  text: 'Un equipo de nutricionistas respondiéndote' },
  { icon: 'group', text: '2 clases grupales en vivo por semana' },
  { icon: 'cal',   text: 'Sesiones presenciales en Lince o virtuales' },
  { icon: 'phone', text: 'Tu plan en la app, con todo lo que conversamos en tu sesión' },
];

// Formas de pago. Sin recargo por tarjeta en ningún canal (D7.1, 30-sep-2026).
export const paymentMethods = [
  { id: 'yape',          label: 'Yape',          icon: '📱', note: null },
  { id: 'transferencia', label: 'Transferencia', icon: '🏦', note: null },
  { id: 'tarjeta',       label: 'Tarjeta',       icon: '💳', note: null },
];
