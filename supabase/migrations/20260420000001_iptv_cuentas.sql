-- Migración: soporte para cuentas con múltiples clientes en IPTV
-- Ejemplo: Mario (paga $150) + Brandon (uso propio $0) en la misma cuenta doble "BSCB"

-- 1. Agregar campos a iptv_subscriptions
ALTER TABLE iptv_subscriptions
  ADD COLUMN IF NOT EXISTS cuenta_codigo     TEXT,          -- código de cuenta ej: "BSCB"
  ADD COLUMN IF NOT EXISTS segundo_cliente_id BIGINT REFERENCES iptv_clients(id),
  ADD COLUMN IF NOT EXISTS segundo_precio    NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS segundo_es_propio BOOLEAN DEFAULT FALSE; -- TRUE = uso propio del negocio

-- 2. Índice para buscar por cuenta
CREATE INDEX IF NOT EXISTS idx_iptv_subs_cuenta ON iptv_subscriptions(cuenta_codigo);

-- 3. Vista útil: suscripciones con datos del segundo cliente
CREATE OR REPLACE VIEW iptv_subscriptions_full AS
SELECT
  s.*,
  c1.name  AS client_name,
  c1.phone AS client_phone,
  c2.name  AS segundo_cliente_nombre,
  c2.phone AS segundo_cliente_phone,
  -- Ingreso total de la cuenta (cliente principal + segundo cliente)
  COALESCE(s.price_charged, 0) + COALESCE(s.segundo_precio, 0) AS ingreso_total_cuenta,
  -- Costo del token (cost_per_credit × credits_used)
  COALESCE(s.cost_per_credit, 0) * COALESCE(s.credits_used, 1) AS costo_token,
  -- Ganancia real
  (COALESCE(s.price_charged, 0) + COALESCE(s.segundo_precio, 0))
    - (COALESCE(s.cost_per_credit, 0) * COALESCE(s.credits_used, 1)) AS ganancia_real
FROM iptv_subscriptions s
LEFT JOIN iptv_clients c1 ON s.client_id = c1.id
LEFT JOIN iptv_clients c2 ON s.segundo_cliente_id = c2.id;
