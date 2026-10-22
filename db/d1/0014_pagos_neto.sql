-- Neto que le queda al negocio después de la comisión de Mercado Pago
-- (transaction_details.net_received_amount), para el panel de Romi (2026-10-21).
-- Los pagos anteriores quedan en NULL.
ALTER TABLE pagos ADD COLUMN neto_centimos INTEGER;
