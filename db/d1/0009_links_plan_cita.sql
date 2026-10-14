-- Plan del paciente y qué cita es (2026-10-13): los elige el equipo al crear el
-- link y salen en Agendados, en el CSV y en el evento del calendario. Las
-- claves válidas están en server/agenda/opciones.mjs. NULL en los links viejos.
ALTER TABLE links_agenda ADD COLUMN plan TEXT;
ALTER TABLE links_agenda ADD COLUMN cita TEXT;
