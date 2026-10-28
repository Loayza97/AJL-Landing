-- Pagos con suscripción (spec 2026-10-27). Una fila por suscripción de Mercado Pago
-- (preapproval). Sin renovación: el paquete termina con su cobro número duracion_meses.
-- Los datos del paciente se copian aquí (web: de su ficha; link: del formulario) para
-- el panel y para el freno por DNI.
ALTER TABLE reservas ADD COLUMN forma_pago TEXT NOT NULL DEFAULT 'completo';

CREATE TABLE suscripciones (
  id                         TEXT PRIMARY KEY,
  token                      TEXT NOT NULL UNIQUE,   -- va en cada recibo («Cancelar mi plan»)
  link_token_hash            TEXT UNIQUE,            -- solo las creadas con link del panel
  link_usado_en              TEXT,
  vence_en                   TEXT,                   -- link sin usar
  reserva_id                 TEXT REFERENCES reservas(id),
  nombre                     TEXT,
  email                      TEXT,
  dni                        TEXT,
  whatsapp                   TEXT,
  producto                   TEXT NOT NULL,
  duracion_meses             INTEGER NOT NULL CHECK (duracion_meses IN (1, 3, 6)),
  cuota_centimos             INTEGER NOT NULL,
  precio_mes_centimos        INTEGER NOT NULL,       -- precio mes a mes al suscribirse (referencia de la penalidad)
  precio_3m_centimos         INTEGER,                -- porMes del paquete de 3 al suscribirse; solo en paquetes de 6
  penalidad_centimos         INTEGER NOT NULL DEFAULT 0, -- monto calculado al cancelar o al cotizar su pago
  mp_preapproval_id          TEXT UNIQUE,
  estado                     TEXT NOT NULL CHECK (estado IN ('pendiente', 'activa', 'terminada', 'cobro_fallido', 'cancelada')),
  cobros_aprobados           INTEGER NOT NULL DEFAULT 0,
  ultimo_cobro_en            TEXT,
  cancelada_en               TEXT,
  motivo_cancelacion         TEXT CHECK (motivo_cancelacion IN ('paciente_boton', 'paciente_mp', 'cobro_fallido', 'equipo')),
  penalidad_estado           TEXT NOT NULL DEFAULT 'no_aplica' CHECK (penalidad_estado IN ('no_aplica', 'pendiente', 'pagada')),
  penalidad_mp_payment_id    TEXT,
  penalidad_marcada_por      TEXT,
  creado_por                 TEXT,
  acepto_condiciones_version TEXT,
  creado_en                  TEXT NOT NULL,
  actualizado_en             TEXT NOT NULL
);
CREATE INDEX suscripciones_reserva ON suscripciones (reserva_id);
CREATE INDEX suscripciones_deuda ON suscripciones (dni) WHERE penalidad_estado = 'pendiente';

CREATE TABLE suscripcion_cobros (
  id             TEXT PRIMARY KEY,
  suscripcion_id TEXT NOT NULL REFERENCES suscripciones(id),
  mp_payment_id  TEXT NOT NULL UNIQUE,  -- id del pago; si Mercado Pago aún no lo creó, el del authorized payment
  numero         INTEGER NOT NULL,
  estado         TEXT NOT NULL,
  monto_centimos INTEGER NOT NULL,
  neto_centimos  INTEGER,
  metodo         TEXT,
  creado_en      TEXT NOT NULL
);
CREATE INDEX suscripcion_cobros_suscripcion ON suscripcion_cobros (suscripcion_id);
