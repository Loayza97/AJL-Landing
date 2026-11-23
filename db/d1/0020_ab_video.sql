-- Video «cómo trabajamos» de la portada (2026-11-22): ab_eventos también cuenta
-- play, 50 % y 100 % del video (experimento 'video_como_trabajamos'). Sigue
-- anónima: ni IP, ni identificador del visitante.
-- SQLite no deja cambiar un CHECK: se rehace la tabla con los mismos datos e ids.
CREATE TABLE ab_eventos_nueva (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  experimento TEXT NOT NULL,
  variante    TEXT NOT NULL,
  evento      TEXT NOT NULL CHECK (evento IN ('vista', 'click', 'play', 'p50', 'p100')),
  creado_en   TEXT NOT NULL
);
INSERT INTO ab_eventos_nueva (id, experimento, variante, evento, creado_en)
  SELECT id, experimento, variante, evento, creado_en FROM ab_eventos;
DROP TABLE ab_eventos;
ALTER TABLE ab_eventos_nueva RENAME TO ab_eventos;
CREATE INDEX ab_eventos_exp ON ab_eventos (experimento, variante, evento);
