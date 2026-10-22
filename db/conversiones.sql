-- ─── Conversiones propias · AJL Nutrición ───────────────────────────────────
-- Correr UNA sola vez en el SQL Editor del MISMO proyecto Supabase que ya tiene
-- `reclamos` y `newsletter_subscribers`. Reutiliza SUPABASE_URL /
-- SUPABASE_SERVICE_KEY de Vercel; no hace falta configurar nada nuevo.
--
-- POR QUÉ EXISTE ESTA TABLA
-- El clic a WhatsApp es la conversión real del negocio. Hoy solo lo saben
-- Google y Meta, lo que significa que la medición depende de que el visitante
-- acepte cookies, de que no use bloqueador, y de que esas plataformas sigan
-- reportando igual dentro de un año. Esta tabla es la fuente de verdad propia
-- contra la que contrastar lo que ellos reporten.
--
-- DECISIÓN DE PRIVACIDAD (importante, no cambiar sin pensarlo)
-- Aquí NO se guarda nada que identifique a una persona: ni IP, ni user-agent,
-- ni cookie, ni identificador de sesión. Solo el evento y su origen de campaña.
-- Por eso es tratamiento anónimo: no necesita consentimiento, no entra en la
-- política de privacidad como dato personal, y no genera obligaciones ARCO.
--
-- Si algún día se añade IP, user-agent o cualquier identificador, deja de ser
-- anónimo y hay que actualizar /privacidad/ ANTES de desplegarlo.

CREATE TABLE IF NOT EXISTS conversiones (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  evento       TEXT NOT NULL CHECK (evento IN ('whatsapp_click')),
  seccion      TEXT,          -- qué CTA de la página se pulsó
  paquete      TEXT,          -- nombre del plan, si el CTA era de un paquete
  utm_source   TEXT,
  utm_medium   TEXT,
  utm_campaign TEXT,
  utm_content  TEXT,          -- creatividad concreta, para A/B (ver docs/utms.md)
  path         TEXT,          -- ruta del sitio, sin query string
  creado_en    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Los reportes que se van a querer: "conversiones por campaña este mes" y
-- "conversiones por paquete".
CREATE INDEX IF NOT EXISTS idx_conv_creado   ON conversiones (creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_conv_campania ON conversiones (utm_campaign, creado_en DESC);

-- RLS activo y SIN políticas públicas: solo la service key del backend escribe.
-- El endpoint /api/conversion usa esa key, así que pasa por encima de RLS.
ALTER TABLE conversiones ENABLE ROW LEVEL SECURITY;

-- ─── Consultas útiles ───────────────────────────────────────────────────────
--
-- Conversiones por campaña, últimos 30 días:
--   SELECT COALESCE(utm_campaign, '(directo)') AS campania, COUNT(*)
--   FROM conversiones
--   WHERE creado_en > NOW() - INTERVAL '30 days'
--   GROUP BY 1 ORDER BY 2 DESC;
--
-- Qué paquete genera más consultas:
--   SELECT COALESCE(paquete, '(genérico)') AS paquete, COUNT(*)
--   FROM conversiones GROUP BY 1 ORDER BY 2 DESC;
--
-- Qué sección de la landing convierte mejor:
--   SELECT seccion, COUNT(*) FROM conversiones GROUP BY 1 ORDER BY 2 DESC;
--
-- Qué creatividad convierte mejor dentro de una campaña:
--   SELECT utm_content, COUNT(*) FROM conversiones
--   WHERE utm_campaign = 'lanzamiento-202609'
--   GROUP BY 1 ORDER BY 2 DESC;
--
-- Embudo de checkout: cuántos preguntan vs cuántos mandan comprobante
--   SELECT seccion, COUNT(*) FROM conversiones
--   WHERE seccion LIKE 'checkout-%' GROUP BY 1 ORDER BY 2 DESC;
--
-- En hora de Lima (la tabla guarda UTC):
--   SELECT creado_en AT TIME ZONE 'America/Lima' AS hora_lima, seccion, utm_source
--   FROM conversiones ORDER BY creado_en DESC LIMIT 20;
