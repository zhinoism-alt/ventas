-- ──────────────────────────────────────────────────────────────────────────────
-- VentasPro — Initial PostgreSQL migration
-- ──────────────────────────────────────────────────────────────────────────────

-- ── Tables ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS products (
  id                BIGSERIAL PRIMARY KEY,
  name              TEXT NOT NULL,
  brand             TEXT DEFAULT '',
  category          TEXT DEFAULT '',
  color             TEXT DEFAULT '',
  condition         TEXT DEFAULT 'buen_estado',
  notes             TEXT DEFAULT '',
  purchase_price    DOUBLE PRECISION DEFAULT 0,
  purchase_currency TEXT DEFAULT 'MXN',
  sale_price        DOUBLE PRECISION DEFAULT 0,
  sale_currency     TEXT DEFAULT 'MXN',
  quantity          INTEGER DEFAULT 1,
  quantity_sold     INTEGER DEFAULT 0,
  status            TEXT DEFAULT 'disponible',
  fb_post           TEXT DEFAULT '',
  image_url         TEXT DEFAULT '',
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales (
  id             BIGSERIAL PRIMARY KEY,
  product_id     BIGINT REFERENCES products(id) ON DELETE SET NULL,
  product_name   TEXT DEFAULT '',
  sale_date      DATE DEFAULT CURRENT_DATE,
  quantity_sold  INTEGER DEFAULT 1,
  sale_price     DOUBLE PRECISION DEFAULT 0,
  sale_currency  TEXT DEFAULT 'MXN',
  buyer_name     TEXT DEFAULT '',
  payment_method TEXT DEFAULT 'efectivo',
  notes          TEXT DEFAULT '',
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS iptv_packages (
  id                BIGSERIAL PRIMARY KEY,
  connections       INTEGER DEFAULT 1,
  credits           INTEGER NOT NULL,
  price_paid        DOUBLE PRECISION NOT NULL,
  price_currency    TEXT DEFAULT 'MXN',
  credits_remaining INTEGER NOT NULL,
  purchase_date     DATE DEFAULT CURRENT_DATE,
  notes             TEXT DEFAULT '',
  is_active         BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS iptv_clients (
  id         BIGSERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  phone      TEXT DEFAULT '',
  country    TEXT DEFAULT 'MX',
  email      TEXT DEFAULT '',
  notes      TEXT DEFAULT '',
  is_active  BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS iptv_subscriptions (
  id              BIGSERIAL PRIMARY KEY,
  client_id       BIGINT NOT NULL REFERENCES iptv_clients(id) ON DELETE CASCADE,
  client_name     TEXT DEFAULT '',
  package_id      BIGINT REFERENCES iptv_packages(id) ON DELETE SET NULL,
  connections     INTEGER DEFAULT 1,
  months          INTEGER DEFAULT 1,
  price_charged   DOUBLE PRECISION NOT NULL,
  price_currency  TEXT DEFAULT 'MXN',
  credits_used    INTEGER NOT NULL,
  cost_per_credit DOUBLE PRECISION DEFAULT 0,
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  status          TEXT DEFAULT 'activo',
  renewal_sent    BOOLEAN DEFAULT FALSE,
  notes           TEXT DEFAULT '',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS exchange_rates (
  id          INTEGER PRIMARY KEY DEFAULT 1,
  usd_to_mxn  DOUBLE PRECISION DEFAULT 17.5,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO exchange_rates (id, usd_to_mxn) VALUES (1, 17.5)
ON CONFLICT (id) DO NOTHING;

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_products_status       ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_category     ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_created_at   ON products(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sales_product_id      ON sales(product_id);
CREATE INDEX IF NOT EXISTS idx_sales_sale_date        ON sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_sales_created_at       ON sales(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_iptv_subs_client_id   ON iptv_subscriptions(client_id);
CREATE INDEX IF NOT EXISTS idx_iptv_subs_package_id  ON iptv_subscriptions(package_id);
CREATE INDEX IF NOT EXISTS idx_iptv_subs_status      ON iptv_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_iptv_subs_end_date    ON iptv_subscriptions(end_date);

-- ── Row-Level Security ────────────────────────────────────────────────────────

ALTER TABLE products             ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales                ENABLE ROW LEVEL SECURITY;
ALTER TABLE iptv_packages        ENABLE ROW LEVEL SECURITY;
ALTER TABLE iptv_clients         ENABLE ROW LEVEL SECURITY;
ALTER TABLE iptv_subscriptions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE exchange_rates       ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='products'           AND policyname='auth_all') THEN
    CREATE POLICY "auth_all" ON products           FOR ALL TO authenticated USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='sales'              AND policyname='auth_all') THEN
    CREATE POLICY "auth_all" ON sales              FOR ALL TO authenticated USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='iptv_packages'      AND policyname='auth_all') THEN
    CREATE POLICY "auth_all" ON iptv_packages      FOR ALL TO authenticated USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='iptv_clients'       AND policyname='auth_all') THEN
    CREATE POLICY "auth_all" ON iptv_clients       FOR ALL TO authenticated USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='iptv_subscriptions' AND policyname='auth_all') THEN
    CREATE POLICY "auth_all" ON iptv_subscriptions FOR ALL TO authenticated USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='exchange_rates'     AND policyname='auth_all') THEN
    CREATE POLICY "auth_all" ON exchange_rates     FOR ALL TO authenticated USING (true) WITH CHECK (true); END IF;
END $$;

-- ── RPC Functions ─────────────────────────────────────────────────────────────

-- 1. sell_product
CREATE OR REPLACE FUNCTION sell_product(
  p_product_id      BIGINT,
  p_quantity_sold   INTEGER,
  p_sale_price      DOUBLE PRECISION,
  p_sale_currency   TEXT,
  p_buyer_name      TEXT,
  p_payment_method  TEXT,
  p_notes           TEXT,
  p_sale_date       DATE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_product    products%ROWTYPE;
  v_new_qty    INTEGER;
  v_new_status TEXT;
  v_sale_id    BIGINT;
BEGIN
  SELECT * INTO v_product FROM products WHERE id = p_product_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Producto no encontrado';
  END IF;

  INSERT INTO sales (
    product_id, product_name, sale_date, quantity_sold,
    sale_price, sale_currency, buyer_name, payment_method, notes
  ) VALUES (
    v_product.id, v_product.name,
    COALESCE(p_sale_date, CURRENT_DATE),
    p_quantity_sold, p_sale_price, p_sale_currency,
    p_buyer_name, p_payment_method, p_notes
  )
  RETURNING id INTO v_sale_id;

  v_new_qty    := GREATEST(0, v_product.quantity - p_quantity_sold);
  v_new_status := CASE WHEN v_new_qty <= 0 THEN 'vendido' ELSE v_product.status END;

  UPDATE products
  SET
    quantity      = v_new_qty,
    quantity_sold = quantity_sold + p_quantity_sold,
    status        = v_new_status,
    updated_at    = NOW()
  WHERE id = p_product_id;

  RETURN json_build_object('success', true, 'sale_id', v_sale_id);
END;
$$;

-- 2. delete_sale
CREATE OR REPLACE FUNCTION delete_sale(p_id BIGINT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sale sales%ROWTYPE;
BEGIN
  SELECT * INTO v_sale FROM sales WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venta no encontrada';
  END IF;

  IF v_sale.product_id IS NOT NULL THEN
    UPDATE products
    SET
      quantity      = quantity + v_sale.quantity_sold,
      quantity_sold = GREATEST(0, quantity_sold - v_sale.quantity_sold),
      status        = CASE
                        WHEN quantity + v_sale.quantity_sold > 0 AND status = 'vendido'
                        THEN 'disponible'
                        ELSE status
                      END,
      updated_at    = NOW()
    WHERE id = v_sale.product_id;
  END IF;

  DELETE FROM sales WHERE id = p_id;

  RETURN json_build_object('success', true);
END;
$$;

-- 3. create_iptv_subscription
CREATE OR REPLACE FUNCTION create_iptv_subscription(
  p_client_id      BIGINT,
  p_package_id     BIGINT,
  p_connections    INTEGER,
  p_months         INTEGER,
  p_price_charged  DOUBLE PRECISION,
  p_price_currency TEXT,
  p_start_date     DATE,
  p_notes          TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_client         iptv_clients%ROWTYPE;
  v_package        iptv_packages%ROWTYPE;
  v_credits_to_use INTEGER;
  v_cost_per_cred  DOUBLE PRECISION;
  v_end_date       DATE;
  v_sub_id         BIGINT;
  v_client_name    TEXT;
BEGIN
  SELECT * INTO v_client FROM iptv_clients WHERE id = p_client_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente no encontrado';
  END IF;
  v_client_name := v_client.name;

  v_credits_to_use := p_months;
  v_cost_per_cred  := 0;

  IF p_package_id IS NOT NULL THEN
    SELECT * INTO v_package FROM iptv_packages WHERE id = p_package_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Paquete no encontrado';
    END IF;
    IF v_package.credits_remaining < v_credits_to_use THEN
      RAISE EXCEPTION 'No hay suficientes créditos. Disponibles: %', v_package.credits_remaining;
    END IF;

    v_cost_per_cred := v_package.price_paid / v_package.credits;

    UPDATE iptv_packages
    SET credits_remaining = credits_remaining - v_credits_to_use
    WHERE id = p_package_id;
  END IF;

  v_end_date := p_start_date + (p_months || ' months')::INTERVAL;

  INSERT INTO iptv_subscriptions (
    client_id, client_name, package_id, connections, months,
    price_charged, price_currency, credits_used, cost_per_credit,
    start_date, end_date, notes
  ) VALUES (
    p_client_id, v_client_name, p_package_id, p_connections, p_months,
    p_price_charged, p_price_currency, v_credits_to_use, v_cost_per_cred,
    p_start_date, v_end_date, p_notes
  )
  RETURNING id INTO v_sub_id;

  UPDATE iptv_clients SET is_active = TRUE WHERE id = p_client_id;

  RETURN json_build_object('success', true, 'id', v_sub_id);
END;
$$;

-- 4. delete_iptv_subscription
CREATE OR REPLACE FUNCTION delete_iptv_subscription(p_id BIGINT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sub iptv_subscriptions%ROWTYPE;
BEGIN
  SELECT * INTO v_sub FROM iptv_subscriptions WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Suscripción no encontrada';
  END IF;

  IF v_sub.package_id IS NOT NULL THEN
    UPDATE iptv_packages
    SET credits_remaining = LEAST(
          credits,
          credits_remaining + v_sub.credits_used
        )
    WHERE id = v_sub.package_id;
  END IF;

  DELETE FROM iptv_subscriptions WHERE id = p_id;

  RETURN json_build_object('success', true);
END;
$$;

-- 5. expire_old_subscriptions
CREATE OR REPLACE FUNCTION expire_old_subscriptions()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE iptv_subscriptions
  SET status = 'vencido'
  WHERE status = 'activo' AND end_date < CURRENT_DATE;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN json_build_object('success', true, 'expired_count', v_count);
END;
$$;
