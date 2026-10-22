-- ─── Newsletter + cupones de descuento · AJL Nutrición ──────────────────────
-- Correr UNA sola vez en el SQL Editor del MISMO proyecto Supabase que ya tiene
-- la tabla `reclamos` (cuenta alejandro.loayza.jordan@gmail.com).
-- No crea proyecto nuevo: reutiliza SUPABASE_URL / SUPABASE_SERVICE_KEY de Vercel.

-- 1. Suscriptores del newsletter (con doble opt-in y registro de consentimiento)
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email             TEXT UNIQUE NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'confirmed', 'unsubscribed')),
  consent_text      TEXT,            -- versión exacta del aviso que aceptó (prueba)
  consent_at        TIMESTAMPTZ,     -- cuándo dio el consentimiento
  confirmed_at      TIMESTAMPTZ,     -- cuándo confirmó (doble opt-in)
  unsubscribed_at   TIMESTAMPTZ,
  confirm_token     TEXT UNIQUE,     -- token del link de confirmación
  unsubscribe_token TEXT UNIQUE,     -- token del link de baja
  source            TEXT,            -- origen / UTM
  ip_origen         TEXT,
  user_agent        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subs_confirm_token ON newsletter_subscribers (confirm_token);
CREATE INDEX IF NOT EXISTS idx_subs_unsub_token   ON newsletter_subscribers (unsubscribe_token);

-- 2. Cupones: uno por suscriptor confirmado, único y de UN SOLO USO
CREATE TABLE IF NOT EXISTS discount_codes (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code          TEXT UNIQUE NOT NULL,
  email         TEXT NOT NULL REFERENCES newsletter_subscribers (email) ON DELETE CASCADE,
  percent       INTEGER NOT NULL DEFAULT 10,
  status        TEXT NOT NULL DEFAULT 'issued'
                  CHECK (status IN ('issued', 'redeemed', 'expired', 'void')),
  issued_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  redeemed_at   TIMESTAMPTZ,
  redeemed_note TEXT,                -- p. ej. "aplicado por asesor · plan Constancia"
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_codes_email ON discount_codes (email);

-- 3. RLS cerrado: solo el service_role (el endpoint serverless) puede leer/escribir.
--    Sin políticas para anon/authenticated => nadie más accede desde el cliente.
ALTER TABLE newsletter_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE discount_codes        ENABLE ROW LEVEL SECURITY;

-- ── Cómo canjea el asesor (Opción 1, manual, a prueba de rotación) ───────────
-- 1) El cliente manda su código por WhatsApp al pagar.
-- 2) En Supabase → Table Editor → discount_codes, buscas el `code`.
-- 3) Verificas: status = 'issued' Y expires_at > ahora.
-- 4) Aplicas el 10% y marcas: status = 'redeemed', redeemed_at = now(), redeemed_note = '...'.
--    Como es UNIQUE y de un solo uso, aunque el código circule por internet solo sirve 1 vez.
