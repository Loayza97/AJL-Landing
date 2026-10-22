-- ─── Libro de Reclamaciones · AJL Nutrición ─────────────────────────────────
-- Schema completo para Supabase Postgres. Correr una sola vez en SQL Editor.
-- Cumple los campos requeridos por INDECOPI (DS N° 011-2011-PCM).

-- Tabla principal de reclamos
CREATE TABLE IF NOT EXISTS reclamos (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  correlativo TEXT UNIQUE NOT NULL,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Datos del consumidor
  consumidor_nombre TEXT NOT NULL,
  consumidor_dni TEXT NOT NULL,
  consumidor_domicilio TEXT,
  consumidor_telefono TEXT,
  consumidor_email TEXT NOT NULL,
  consumidor_edad INTEGER,
  apoderado_nombre TEXT,   -- requerido solo si edad < 18

  -- Identificación del bien o servicio
  bien_tipo TEXT CHECK (bien_tipo IN ('producto', 'servicio')),
  bien_monto NUMERIC(10, 2),
  bien_descripcion TEXT,

  -- Detalle del reclamo
  reclamo_tipo TEXT NOT NULL CHECK (reclamo_tipo IN ('reclamo', 'queja')),
  reclamo_detalle TEXT NOT NULL,
  reclamo_pedido TEXT NOT NULL,

  -- Gestión interna
  estado TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'en_proceso', 'respondido')),
  respuesta TEXT,
  respuesta_fecha TIMESTAMPTZ,

  -- Auditoría
  ip_origen INET,
  user_agent TEXT
);

-- Índices para queries comunes
CREATE INDEX IF NOT EXISTS idx_reclamos_fecha
  ON reclamos(fecha_creacion DESC);

CREATE INDEX IF NOT EXISTS idx_reclamos_estado
  ON reclamos(estado)
  WHERE estado <> 'respondido';

CREATE INDEX IF NOT EXISTS idx_reclamos_dni
  ON reclamos(consumidor_dni);

-- Row Level Security: bloquear acceso desde el cliente.
-- Solo el service_role key (usado por la Vercel function) puede leer/escribir.
ALTER TABLE reclamos ENABLE ROW LEVEL SECURITY;

-- Sin políticas = acceso denegado por default desde anon/auth keys.
-- (Si en el futuro agregamos panel admin con Supabase Auth, agregar políticas acá.)

-- Vista de KPIs para el dashboard (lista para usar en Fase 2)
CREATE OR REPLACE VIEW reclamos_kpis AS
SELECT
  COUNT(*) FILTER (WHERE estado = 'pendiente') AS pendientes,
  COUNT(*) FILTER (WHERE estado = 'en_proceso') AS en_proceso,
  COUNT(*) FILTER (WHERE estado = 'respondido') AS respondidos,
  COUNT(*) FILTER (
    WHERE estado <> 'respondido'
    AND fecha_creacion < NOW() - INTERVAL '30 days'
  ) AS vencidos,
  COUNT(*) FILTER (WHERE reclamo_tipo = 'reclamo') AS total_reclamos,
  COUNT(*) FILTER (WHERE reclamo_tipo = 'queja') AS total_quejas,
  ROUND(
    AVG(
      EXTRACT(EPOCH FROM (respuesta_fecha - fecha_creacion)) / 86400.0
    )::numeric,
    1
  ) AS dias_promedio_resolucion
FROM reclamos;

-- Función para generar el siguiente correlativo del año
-- Formato: AJL-YYYY-NNNN (ej. AJL-2026-0001)
CREATE OR REPLACE FUNCTION generar_correlativo()
RETURNS TEXT AS $$
DECLARE
  anio TEXT;
  ultimo INTEGER;
  siguiente TEXT;
BEGIN
  anio := TO_CHAR(NOW(), 'YYYY');

  SELECT COALESCE(
    MAX(CAST(SUBSTRING(correlativo FROM 10 FOR 4) AS INTEGER)),
    0
  )
  INTO ultimo
  FROM reclamos
  WHERE correlativo LIKE 'AJL-' || anio || '-%';

  siguiente := 'AJL-' || anio || '-' || LPAD((ultimo + 1)::TEXT, 4, '0');
  RETURN siguiente;
END;
$$ LANGUAGE plpgsql;
