-- Nutricionista que la página del paciente muestra elegida al abrir el link
-- (2026-10-14). Se reparte por turnos entre el equipo al crear cada link, para
-- que nadie quede siempre de primera opción. NULL en los links viejos.
ALTER TABLE links_agenda ADD COLUMN nutri_sugerida TEXT;
