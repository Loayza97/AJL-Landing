-- Datos de pago (spec 2026-11-10-datos-de-pago-y-rechazos): quien paga puede no ser el paciente
-- (un familiar). La ficha guarda a los dos: los campos de siempre son del paciente y pagador_* los de
-- quien paga, que son los que van a Mercado Pago. paciente_es_pagador = 1 cuando son la misma persona.
ALTER TABLE clientes ADD COLUMN paciente_es_pagador INTEGER;
ALTER TABLE clientes ADD COLUMN pagador_nombres TEXT;
ALTER TABLE clientes ADD COLUMN pagador_apellido_paterno TEXT;
ALTER TABLE clientes ADD COLUMN pagador_apellido_materno TEXT;
ALTER TABLE clientes ADD COLUMN pagador_tipo_documento TEXT;
ALTER TABLE clientes ADD COLUMN pagador_documento TEXT;
ALTER TABLE clientes ADD COLUMN pagador_email TEXT;
ALTER TABLE clientes ADD COLUMN pagador_whatsapp TEXT;

-- El motivo real de cada pago según Mercado Pago (status_detail, p. ej. cc_rejected_high_risk): su
-- panel dice «el banco rechazó» aunque haya sido su antifraude.
ALTER TABLE pagos ADD COLUMN detalle TEXT;
ALTER TABLE suscripcion_cobros ADD COLUMN detalle TEXT;
