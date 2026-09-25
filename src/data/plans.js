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
      'Consulta personalizada de 30 minutos con el equipo de nutricionistas',
      'Diagnóstico completo de hábitos y composición corporal',
      'Dirección clara: qué, cómo y cuánto cambiar',
      'Los S/80 se descuentan de cualquier plan que adquieras el mismo día de tu evaluación',
    ],
  },
  // ─── Modelo C (18-sep-2026) ─────────────────────────────────────────────────
  // Los planes NO llevan nombre de cara al paciente: se identifican por cada
  // cuánto nos vemos. Los ids se conservan (URLs de checkout, anuncios,
  // analítica); lo que cambia es `name`. Columnas: 1 mes y 3 meses; bajo el
  // total del paquete va solo el equivalente mensual, sin tachados ni ahorro.
  // Fuente: 02-comercial/motor-comercial/.../ROADMAP-CHOKEPOINTS-AJL.md, Decisión 1.B.
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
    checkoutSummary: [
      'Una sesión de 1 hora, en Lince o por videollamada',
      'Tu plan en la app, con todo lo que conversamos en tu sesión',
      'Compra única, sin acompañamiento continuo',
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
      { label: '3 meses', total: 'S/810', perMes: 'S/270 al mes' },
    ],
    checkoutSummary: [
      'Una sesión de 1 hora al mes, en Lince o por videollamada',
      'Tu plan en la app, con todo lo que conversamos en tu sesión',
      'Un equipo de nutricionistas respondiéndote por WhatsApp',
      '2 clases grupales en vivo por semana',
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
      { label: '3 meses', total: 'S/1.080', perMes: 'S/360 al mes' },
    ],
    firstMonthEval: true,
    checkoutSummary: [
      'Dos sesiones al mes, en Lince o por videollamada',
      'Tu plan en la app, con todo lo que conversamos en tu sesión',
      'Un equipo de nutricionistas respondiéndote por WhatsApp',
      '2 clases grupales en vivo por semana',
      '**+ 1 evaluación el primer mes**: al cierre del primer mes medimos tu avance y decides cómo sigues',
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
      { label: '3 meses', total: 'S/1.530', perMes: 'S/510 al mes' },
    ],
    firstMonthEval: true,
    checkoutSummary: [
      'Cuatro sesiones al mes, en Lince o por videollamada',
      'Tu plan en la app, con todo lo que conversamos en tu sesión',
      'Un equipo de nutricionistas respondiéndote por WhatsApp',
      '2 clases grupales en vivo por semana',
      '**+ 1 evaluación el primer mes**: al cierre del primer mes medimos tu avance y decides cómo sigues',
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

// Formas de pago. La tarjeta lleva recargo porque la pasarela cobra comisión.
export const paymentMethods = [
  { id: 'yape',          label: 'Yape',          icon: '📱', note: null },
  { id: 'transferencia', label: 'Transferencia', icon: '🏦', note: null },
  { id: 'tarjeta',       label: 'Tarjeta',       icon: '💳', note: '5% de recargo' },
];
