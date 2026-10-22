-- Datos completos del paciente (rediseño 2026-10-09) y control del resumen
-- diario de quienes no pagaron. Solo agrega: nada existente cambia.
ALTER TABLE clientes ADD COLUMN nombres TEXT;
ALTER TABLE clientes ADD COLUMN apellido_paterno TEXT;
ALTER TABLE clientes ADD COLUMN apellido_materno TEXT;
ALTER TABLE clientes ADD COLUMN fecha_nacimiento TEXT;
ALTER TABLE clientes ADD COLUMN tipo_documento TEXT;

CREATE TABLE resumenes_enviados (
  fecha      TEXT PRIMARY KEY,
  enviado_en TEXT NOT NULL
);
