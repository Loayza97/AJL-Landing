-- ─── Migración 001 · añade utm_content a `conversiones` ─────────────────────
-- Para bases donde `conversiones` YA se creó con la versión anterior del
-- esquema (es el caso de producción: la tabla se creó el 2026-08-25 sin esta
-- columna). En instalaciones nuevas no hace falta: db/conversiones.sql ya la
-- incluye.
--
-- Correr en el SQL Editor de Supabase. Es seguro reejecutarlo.

ALTER TABLE conversiones ADD COLUMN IF NOT EXISTS utm_content TEXT;
