-- Prueba A/B del botón de la portada (2026-10-12). Anónima: ni IP, ni
-- identificador del visitante; solo qué versión se vio o se tocó y cuándo.
CREATE TABLE ab_eventos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  experimento TEXT NOT NULL,
  variante    TEXT NOT NULL,
  evento      TEXT NOT NULL CHECK (evento IN ('vista', 'click')),
  creado_en   TEXT NOT NULL
);
CREATE INDEX ab_eventos_exp ON ab_eventos (experimento, variante, evento);

-- Versión del botón que vio quien reservó, para medir reservas pagadas por versión.
ALTER TABLE reservas ADD COLUMN variante TEXT;
