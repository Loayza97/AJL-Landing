-- Aviso «tienes un pago pendiente» al deudor cuando alguien usa su documento (spec 2026-10-27):
-- como máximo uno cada 24 h por suscripción, para que no sirva para llenarle el correo.
ALTER TABLE suscripciones ADD COLUMN aviso_deuda_en TEXT;
