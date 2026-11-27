-- Citas por agendar con cada cobro mensual (spec 2026-11-26-citas-por-cobro).

-- Suscripciones hechas a mano en Mercado Pago. Van aparte de `suscripciones` a propósito: así
-- ningún camino que manda recibos, cancela o cobra penalidades puede tocarlas.
CREATE TABLE sus_externas (
  preapproval_id TEXT PRIMARY KEY,
  pagador        TEXT,              -- como lo dice Mercado Pago: es quien paga, no siempre el paciente
  reason         TEXT,
  monto_centimos INTEGER,
  estado_mp      TEXT,
  creado_mp      TEXT,
  creado_en      TEXT NOT NULL,
  actualizado_en TEXT NOT NULL
);
-- Solo cobros aprobados.
CREATE TABLE sus_externa_cobros (
  mp_payment_id  TEXT PRIMARY KEY,
  preapproval_id TEXT NOT NULL REFERENCES sus_externas(preapproval_id),
  numero         INTEGER NOT NULL,
  monto_centimos INTEGER NOT NULL,
  cobrado_en     TEXT NOT NULL,
  creado_en      TEXT NOT NULL
);
CREATE INDEX sus_externa_cobros_pre ON sus_externa_cobros (preapproval_id);

-- Lo que hace falta para contar citas. clave: 's:<suscripciones.id>' (web) o 'x:<preapproval_id>' (a mano).
CREATE TABLE citas_suscripcion (
  clave           TEXT PRIMARY KEY,
  cliente_id      TEXT REFERENCES clientes(id),
  plan            TEXT,             -- 'constancia:3' u 'otro'
  citas_por_cobro INTEGER,          -- solo con 'otro'
  citas_previas   INTEGER NOT NULL DEFAULT 0,
  por_revisar     INTEGER NOT NULL DEFAULT 0,
  revisado_en     TEXT,
  revisado_por    TEXT,
  actualizado_en  TEXT NOT NULL
);
CREATE TABLE citas_ajustes (
  id         TEXT PRIMARY KEY,
  clave      TEXT NOT NULL,
  cantidad   INTEGER NOT NULL,      -- se suma a «Faltan»
  motivo     TEXT NOT NULL,
  creado_por TEXT NOT NULL,
  creado_en  TEXT NOT NULL
);
CREATE INDEX citas_ajustes_clave ON citas_ajustes (clave);

-- Un link creado desde una fila de «Por agendar» lleva su suscripción.
ALTER TABLE links_agenda ADD COLUMN sus_clave TEXT;
ALTER TABLE links_agenda ADD COLUMN sus_cpc INTEGER;
CREATE INDEX links_agenda_sus ON links_agenda (sus_clave) WHERE sus_clave IS NOT NULL;

-- Arranque: las suscripciones de la web que ya cobraron pueden tener citas agendadas por fuera;
-- el equipo las revisa una vez (decisión 10).
INSERT INTO citas_suscripcion (clave, por_revisar, actualizado_en)
  SELECT 's:' || id, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now') FROM suscripciones WHERE cobros_aprobados > 0;
-- De las hechas a mano solo se avisan por correo los cobros posteriores a este momento.
INSERT INTO sync_estado (clave, valor) VALUES ('citas_por_cobro_desde', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
