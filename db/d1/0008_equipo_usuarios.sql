-- Usuarios del panel agregados desde /panel/usuarios/ (2026-10-13). Los súper
-- usuarios (secreto EQUIPO_ADMINS) y los fijos (secreto EQUIPO_EMAILS) no van
-- aquí: no se cambian desde el panel.
CREATE TABLE equipo_usuarios (
  email      TEXT PRIMARY KEY CHECK (email = lower(trim(email)) AND email <> ''),
  nombre     TEXT NOT NULL CHECK (length(nombre) BETWEEN 1 AND 60),
  creado_por TEXT NOT NULL,
  creado_en  TEXT NOT NULL
);
