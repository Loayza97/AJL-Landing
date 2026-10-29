-- Suscripciones con plan (plan 2026-10-28): cada suscripción tiene su propio plan de Mercado Pago
-- (preapproval_plan). El paciente autoriza en el link del plan y Mercado Pago crea el preapproval,
-- que trae preapproval_plan_id: por ese id se reconoce la suscripción.
ALTER TABLE suscripciones ADD COLUMN mp_plan_id TEXT;
CREATE UNIQUE INDEX suscripciones_plan ON suscripciones (mp_plan_id) WHERE mp_plan_id IS NOT NULL;
