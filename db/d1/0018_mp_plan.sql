-- Suscripciones con plan (plan 2026-10-28): cada suscripción tiene su propio plan de Mercado Pago
-- (preapproval_plan). El paciente autoriza en el link del plan y Mercado Pago crea el preapproval,
-- que trae preapproval_plan_id: por ese id se reconoce la suscripción.
ALTER TABLE suscripciones ADD COLUMN mp_plan_id TEXT;
CREATE UNIQUE INDEX suscripciones_plan ON suscripciones (mp_plan_id) WHERE mp_plan_id IS NOT NULL;

-- Todos los planes que tuvo cada suscripción (un reintento de pago crea uno nuevo): un cobro de un
-- plan reemplazado se reconoce y se trata como anómalo (se avisa al equipo para devolverlo).
CREATE TABLE suscripcion_planes (
  plan_id        TEXT PRIMARY KEY,
  suscripcion_id TEXT NOT NULL REFERENCES suscripciones(id),
  creado_en      TEXT NOT NULL
);
