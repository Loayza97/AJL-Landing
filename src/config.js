// ─── Configuración global ────────────────────────────────────────────────────
// Actualizar estos valores antes del despliegue a producción

import { plans } from './data/plans.js';

export const WA_NUMBER = '51919151237';

// El precio de la Evaluación se deriva de data/plans.js, que es la fuente que
// pinta la web. Estaba escrito a mano en TRES sitios (aquí, en el mensaje de
// Layout.astro y en la meta description): el día que subiera el precio, la web
// habría dicho uno y el mensaje de WhatsApp otro, que es peor que no decirlo.
const EVALUACION = plans.evaluacion;

export const WA_DEFAULT_MESSAGE =
  `Hola, me interesa la Evaluación Nutricional de S/${EVALUACION.price}.`;
export const WA_FALLBACK_URL = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(WA_DEFAULT_MESSAGE)}`;

export const SITE_TITLE = 'AJL Nutrición · Nutricionista en Lince, Lima · Sin dietas rígidas';
export const SITE_DESCRIPTION =
  `Nutricionista en Lince, Lima. Planes personalizados para tu vida real: tus restaurantes, delivery y cenas de trabajo, sin restricciones absurdas ni culpa. Evaluación nutricional desde S/${EVALUACION.price}.`;
export const OG_IMAGE = '/og-image.jpg';

// IDs de pixels. Se cargan SOLO tras el consentimiento del visitante
// (ver el gate en layouts/Layout.astro); nunca en el <head> a secas.
export const META_PIXEL_ID = '982472270539383';
export const GA4_ID = 'G-SQ5K6KFXT3';
