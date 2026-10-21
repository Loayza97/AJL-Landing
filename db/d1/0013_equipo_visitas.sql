-- Última visita de cada persona del equipo al panel (Joaquín y Alejandro, 2026-10-21).
-- El panel resalta como «Nueva» cada cita agendada después de la visita anterior.
CREATE TABLE equipo_visitas (email TEXT PRIMARY KEY, visto_en TEXT NOT NULL);
