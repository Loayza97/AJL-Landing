-- Links de agenda de un solo uso (2026-10-12): para pacientes que pagaron por
-- fuera de la web. El token se guarda como hash: la URL solo se ve al crearlo.
CREATE TABLE links_agenda (
  id             TEXT PRIMARY KEY,
  token_hash     TEXT NOT NULL UNIQUE,
  tipo           TEXT NOT NULL CHECK (tipo IN ('c30v', 'c30p', 's60')),
  creado_en      TEXT NOT NULL,
  creado_por     TEXT NOT NULL,
  vence_en       TEXT NOT NULL,
  reactivado_en  TEXT,
  usado_en       TEXT,
  reserva_id     TEXT REFERENCES reservas(id),
  paciente_nuevo INTEGER,
  consultas_dni  INTEGER NOT NULL DEFAULT 0
);

-- Para el JOIN de «Agendados» (reserva → link).
CREATE INDEX links_agenda_reserva ON links_agenda (reserva_id);

-- La cita que se agendó con un link (NULL en las reservas de la web).
ALTER TABLE reservas ADD COLUMN link_id TEXT;
