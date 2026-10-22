-- Panel del equipo (2026-10-16): contraseña por persona y dispositivos de
-- confianza. El código por correo se pide solo la primera vez, para crear o
-- cambiar la contraseña, y al entrar desde un dispositivo nuevo.
-- La contraseña se guarda como PBKDF2-SHA256 con sal propia; los dispositivos,
-- como hash del token de su cookie.
CREATE TABLE equipo_claves (
  email       TEXT PRIMARY KEY,
  hash        TEXT NOT NULL,
  sal         TEXT NOT NULL,
  iteraciones INTEGER NOT NULL,
  creado_en   TEXT NOT NULL
);
CREATE TABLE equipo_dispositivos (
  token_hash TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  expira     TEXT NOT NULL
);
CREATE INDEX equipo_dispositivos_email ON equipo_dispositivos (email);
-- 1 si el código se mandó tras una contraseña correcta (dispositivo nuevo): ese
-- código basta para entrar. Con 0 (primera vez u olvidó) hay que crear contraseña.
ALTER TABLE equipo_codigos ADD COLUMN clave_ok INTEGER NOT NULL DEFAULT 0;
