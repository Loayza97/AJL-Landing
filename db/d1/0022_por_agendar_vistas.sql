-- «Por agendar»: próximo cobro y aviso de pago nuevo (spec 2026-11-27-por-agendar-vistas). Solo agrega.
-- clave: 's:<suscripciones.id>' (web) o 'x:<preapproval_id>' (a mano).
CREATE TABLE sus_proximo (
  clave          TEXT PRIMARY KEY,
  fecha          TEXT NOT NULL,     -- next_payment_date de Mercado Pago, en UTC
  actualizado_en TEXT NOT NULL
);
-- Hasta qué número de cobro dio por visto el equipo el aviso de pago nuevo.
CREATE TABLE cobros_vistos (
  clave     TEXT PRIMARY KEY,
  cobros    INTEGER NOT NULL,
  visto_por TEXT NOT NULL,
  visto_en  TEXT NOT NULL
);
