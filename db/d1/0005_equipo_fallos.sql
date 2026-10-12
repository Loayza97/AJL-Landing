-- Panel del equipo: intentos fallidos por correo, para bloquear 24 h tras 10.
CREATE TABLE equipo_fallos (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  en    TEXT NOT NULL
);
CREATE INDEX equipo_fallos_email ON equipo_fallos (email, en);
