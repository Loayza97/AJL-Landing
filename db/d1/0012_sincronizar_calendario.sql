-- Cambios hechos a mano en Google Calendar (spec 2026-10-19-sincronizar-calendario). Solo agrega.
-- calendario_editado_en / calendario_cambios: cuándo y qué se cambió en el calendario («10:00 → 9:00 · presencial → virtual»).
-- calendario_revisar: el equipo debe decidir (evento borrado o movido a una hora ocupada).
-- cancelada_en_panel: cancelada con el botón del panel; sigue visible en rojo y su ficha no se purga.
ALTER TABLE reservas ADD COLUMN calendario_editado_en TEXT;
ALTER TABLE reservas ADD COLUMN calendario_cambios TEXT;
ALTER TABLE reservas ADD COLUMN calendario_revisar TEXT CHECK (calendario_revisar IN ('borrado', 'cruce'));
ALTER TABLE reservas ADD COLUMN cancelada_en_panel TEXT;
CREATE INDEX reservas_google_evento ON reservas (google_event_id);
-- Cursor de la sincronización: clave 'calendario_cursor', valor ISO de la última revisión que terminó bien.
CREATE TABLE sync_estado (clave TEXT PRIMARY KEY, valor TEXT NOT NULL);
