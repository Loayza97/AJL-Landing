-- Duración real de cada cita (2026-10-12). Hasta hoy todas duraban 60 min; los
-- links de agenda traen citas de 30. fin_utc se guarda para que la propia base
-- compare cruces de horario. Solo agrega: nada existente cambia.
ALTER TABLE reservas ADD COLUMN duracion_min INTEGER NOT NULL DEFAULT 60;
ALTER TABLE reservas ADD COLUMN fin_utc TEXT;
UPDATE reservas SET fin_utc = strftime('%Y-%m-%dT%H:%M:%SZ', inicio_utc, '+60 minutes');
CREATE INDEX reservas_cruce ON reservas (fecha_lima, inicio_utc);
