// Versiones de los textos que el paciente acepta en el paso 4. Se guardan con
// cada reserva: si el texto cambia, sube la versión.
export const CONDICIONES_VERSION = '2026-10-09';
export const NOVEDADES_TEXTO =
  'Quiero recibir novedades y promociones de AJL Nutrición por correo. (v2026-10-01)';

// Resumen en 5 puntos que se abre en una ventana desde el paso 4. Tiene que
// decir lo mismo que /condiciones/ y /privacidad/.
export const RESUMEN_CONDICIONES = [
  { t: 'Precio y pago', d: 'Los precios están en soles y no tienen recargo por tarjeta. Pagas en Mercado Pago con tarjeta, Yape o dinero en tu cuenta. Con tarjeta de crédito puedes pagar en cuotas; si hay intereses, los cobra tu banco.' },
  { t: 'Tus citas', d: 'Al comprar eliges tu primera sesión. Las siguientes las coordinas con tu nutricionista dentro del plazo de tu plan.' },
  { t: 'Plazo', d: 'El paquete de 3 meses se usa en 3 meses y el de 6 meses en 6, desde que recibes tu plan. Puedes congelarlo 1 semana en el de 3 meses y 2 semanas en el de 6.' },
  { t: 'Mover o cancelar', d: 'Mover una cita es gratis hasta 48 horas antes. Con menos de 48 horas cuesta S/80. Si no vienes, la sesión se pierde.' },
  { t: 'Si no podemos atenderte', d: 'Si AJL no puede darte el servicio, te devolvemos lo que no usaste.' },
];

export const RESUMEN_PRIVACIDAD = [
  { t: 'Qué datos pedimos', d: 'Nombres, apellidos, WhatsApp, correo, fecha de nacimiento y documento de identidad.' },
  { t: 'Para qué', d: 'Para gestionar tu reserva y tu pago, enviarte la confirmación, emitir tu comprobante y preparar tu primera sesión.' },
  { t: 'Si no completas tu pago', d: 'Podemos escribirte por WhatsApp para ayudarte con tu reserva. Si no pagas, borramos tus datos de contacto a los 30 días.' },
  { t: 'Con quién se comparten', d: 'Mercado Pago procesa el pago y Google Calendar guarda tu cita. Tus datos de tarjeta no pasan por nosotros.' },
  { t: 'Tus derechos', d: 'Puedes pedir acceder, corregir o eliminar tus datos escribiendo a reclamos@ajlnutricion.com.' },
];
