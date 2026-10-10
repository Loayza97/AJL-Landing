-- Reservas y pagos de la web (Cloudflare D1, SQLite).
-- Los índices únicos parciales hacen imposible vender dos veces la misma hora:
-- un solo consultorio (una presencial por hora) y una nutricionista por hora.

CREATE TABLE clientes (
  id        TEXT PRIMARY KEY,
  nombre    TEXT,
  whatsapp  TEXT,
  email     TEXT,
  dni       TEXT,
  creado_en TEXT NOT NULL
);

CREATE TABLE reservas (
  id                         TEXT PRIMARY KEY,
  token                      TEXT NOT NULL UNIQUE,
  cliente_id                 TEXT REFERENCES clientes(id),
  producto                   TEXT NOT NULL,
  duracion_meses             INTEGER NOT NULL,
  monto_centimos             INTEGER NOT NULL,
  peso_tope                  REAL NOT NULL,
  nutricionista_id           TEXT NOT NULL,
  inicio_utc                 TEXT NOT NULL,
  fecha_lima                 TEXT NOT NULL,
  modalidad                  TEXT NOT NULL CHECK (modalidad IN ('presencial', 'video')),
  estado                     TEXT NOT NULL CHECK (estado IN ('apartada', 'pagando', 'confirmada', 'pagada_sin_hora', 'expirada', 'cancelada')),
  retencion_hasta            TEXT,
  mp_preference_id           TEXT,
  google_event_id            TEXT,
  meet_url                   TEXT,
  calendario_pendiente       INTEGER NOT NULL DEFAULT 0,
  acepto_condiciones_version TEXT,
  novedades_optin            INTEGER NOT NULL DEFAULT 0,
  huella                     TEXT,
  creado_en                  TEXT NOT NULL,
  actualizado_en             TEXT NOT NULL
);

CREATE UNIQUE INDEX reservas_consultorio ON reservas (inicio_utc)
  WHERE modalidad = 'presencial' AND estado IN ('apartada', 'pagando', 'confirmada');

CREATE UNIQUE INDEX reservas_nutricionista_hora ON reservas (nutricionista_id, inicio_utc)
  WHERE estado IN ('apartada', 'pagando', 'confirmada');

CREATE INDEX reservas_fecha_estado ON reservas (fecha_lima, estado);
CREATE INDEX reservas_huella ON reservas (huella, estado);

CREATE TABLE pagos (
  id             TEXT PRIMARY KEY,
  reserva_id     TEXT NOT NULL REFERENCES reservas(id),
  mp_payment_id  TEXT NOT NULL UNIQUE,
  estado         TEXT NOT NULL,
  monto_centimos INTEGER NOT NULL,
  metodo         TEXT,
  creado_en      TEXT NOT NULL
);
