// ─── Configuración global ────────────────────────────────────────────────────
// Actualizar estos valores antes del despliegue a producción

import { plans } from './data/plans.js';

export const WA_NUMBER = '51919151237';

// El precio de la Evaluación se deriva de data/plans.js, que es la fuente que
// pinta la web. Estaba escrito a mano en TRES sitios (aquí, en el mensaje de
// Layout.astro y en la meta description): el día que subiera el precio, la web
// habría dicho uno y el mensaje de WhatsApp otro, que es peor que no decirlo.
const EVALUACION = plans.evaluacion;

// Nombre canónico de la primera consulta. La base operativa la ha registrado
// como "diagnóstico", "Diagnostico" y "evaluación" indistintamente; se unificó
// en "Evaluación" porque es como la llama la web y como la nombra el cliente.
// Exportarlo evita que las etiquetas de analítica vuelvan a divergir.
export const EVALUACION_NAME = EVALUACION.name;

// Mensaje que el visitante envía al pulsar un CTA genérico de WhatsApp.
//
// UNA SOLA FRASE, fija, y por trazabilidad. "Vengo de la web" es la marca que
// le dice al asesor de dónde salió ese contacto, y solo funciona si llega
// siempre idéntica: se probó rotar entre varias redacciones para que las
// conversaciones no parecieran un formulario, y se descartó justo por esto —
// una señal que cambia de forma deja de ser una señal.
//
// Reglas que cumple, y que hay que respetar si algún día se reescribe:
//
// 1. NINGÚN PRODUCTO. Ni paquetes ni la Evaluación. Este CTA lo pulsa quien aún
//    no eligió nada; si el mensaje nombra un producto, el cliente llega pidiendo
//    ese y el asesor pierde la conversación de entrada. Con la Evaluación era
//    peor: sus S/80 se acreditan contra el primer mes, así que no es un producto
//    que compita con los planes sino la puerta a ellos, y ponerla en boca del
//    cliente la convertía en la compra.
//    Los CTA que SÍ van atados a un paquete (data-wa-pkg, data-wa-msg) llevan su
//    propio texto y deben nombrarlo: ahí el cliente ya eligió.
// 2. SIN PRECIO. El cliente ya vio la cifra en la página. Repetirla en su propio
//    mensaje la convierte en la lectura "esto cuesta X", y además se
//    desincroniza el día que suba.
// 3. PIDE AGENDAR. "Agendar" le da al asesor un trabajo concreto; "me interesa"
//    solo abre una conversación que alguien tiene que empujar.
export const WA_DEFAULT_MESSAGE = 'Hola, vengo de la web y quiero agendar una cita.';
export const WA_FALLBACK_URL = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(WA_DEFAULT_MESSAGE)}`;

export const SITE_TITLE = 'AJL Nutrición · Nutricionista en Lince, Lima · Sin dietas rígidas';
export const SITE_DESCRIPTION =
  `Nutricionista en Lince, Lima. Planes personalizados para tu vida real: tus restaurantes, delivery y cenas de trabajo, sin restricciones absurdas ni culpa. Evaluación nutricional desde S/${EVALUACION.price}.`;
export const OG_IMAGE = '/og-image.jpg';

// IDs de pixels. Se cargan SOLO tras el consentimiento del visitante
// (ver el gate en layouts/Layout.astro); nunca en el <head> a secas.
export const META_PIXEL_ID = '982472270539383';
export const GA4_ID = 'G-SQ5K6KFXT3';
