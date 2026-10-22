-- Editar cita desde el panel (2026-10-22): quién y cuándo hizo la última edición
-- y el texto del cambio, para mostrarlo en la fila.
ALTER TABLE reservas ADD COLUMN editada_en TEXT;
ALTER TABLE reservas ADD COLUMN editada_por TEXT;
ALTER TABLE reservas ADD COLUMN edicion_cambios TEXT;
