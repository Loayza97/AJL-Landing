// ─── Configuración global ────────────────────────────────────────────────────
// Actualizar estos valores antes del despliegue a producción

export const WA_NUMBER = '51919151237';

const FALLBACK_TEXT = 'Hola, me interesa la Evaluación Nutricional de S/80.';
export const WA_FALLBACK_URL = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(FALLBACK_TEXT)}`;

export const SITE_TITLE = 'AJL Nutrición — Estructura para tu vida real';
export const SITE_DESCRIPTION =
  'Método de nutrición sin restricciones rígidas para profesionales en Lima. Evaluación Nutricional Personal por S/80. Estructura real, no dietas ideales.';
export const OG_IMAGE = '/og-image.jpg'; // TODO: agregar imagen real en /public/og-image.jpg

// IDs de pixels — descomentar y rellenar cuando estén disponibles
// export const META_PIXEL_ID = 'XXXXXXXXXXXXXXXXXX';
// export const GA4_ID = 'G-XXXXXXXXXX';
