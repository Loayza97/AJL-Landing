-- Panel del equipo (2026-10-12): quién contactó a una persona que no pagó y cuándo.
ALTER TABLE reservas ADD COLUMN contactado_en TEXT;
ALTER TABLE reservas ADD COLUMN contactado_por TEXT;

-- Acceso al panel con código por correo (2026-10-12). Códigos y sesiones se
-- guardan como hash: un volcado de la base no sirve para entrar.
CREATE TABLE equipo_codigos (
  email       TEXT PRIMARY KEY,
  codigo_hash TEXT NOT NULL,
  creado_en   TEXT NOT NULL,
  expira      TEXT NOT NULL,
  intentos    INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE equipo_sesiones (
  token_hash TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  expira     TEXT NOT NULL
);
