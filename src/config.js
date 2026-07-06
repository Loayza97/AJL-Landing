// ─── Configuración global ────────────────────────────────────────────────────
// Actualizar estos valores antes del despliegue a producción

export const WA_NUMBER = '51919151237';

const FALLBACK_TEXT = 'Hola, me interesa la Evaluación Nutricional de S/80.';
export const WA_FALLBACK_URL = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(FALLBACK_TEXT)}`;

export const SITE_TITLE = 'AJL Nutrición · Nutricionista en Lince, Lima — Sin dietas rígidas';
export const SITE_DESCRIPTION =
  'Nutricionista en Lince, Lima. Planes personalizados para tu vida real —restaurantes, delivery, cenas de trabajo— sin restricciones absurdas ni culpa. Evaluación nutricional desde S/80.';
export const OG_IMAGE = '/og-image.jpg';

// IDs de pixels — descomentar y rellenar cuando estén disponibles
// export const META_PIXEL_ID = 'XXXXXXXXXXXXXXXXXX';
// export const GA4_ID = 'G-XXXXXXXXXX';
