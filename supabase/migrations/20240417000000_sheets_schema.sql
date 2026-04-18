-- ============================================================
--  Google Sheets Sync — schema (idempotent ALTER TABLEs)
-- ============================================================

-- sheets_config: one row per Google Sheet the user wants to sync
CREATE TABLE IF NOT EXISTS sheets_config (
  id            BIGSERIAL PRIMARY KEY,
  nombre        TEXT        NOT NULL DEFAULT '',
  sheet_csv_url TEXT        NOT NULL DEFAULT '',
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  last_synced_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Make sure all columns exist in case table was pre-created without them
ALTER TABLE sheets_config ADD COLUMN IF NOT EXISTS nombre         TEXT        NOT NULL DEFAULT '';
ALTER TABLE sheets_config ADD COLUMN IF NOT EXISTS sheet_csv_url  TEXT        NOT NULL DEFAULT '';
ALTER TABLE sheets_config ADD COLUMN IF NOT EXISTS is_active      BOOLEAN     NOT NULL DEFAULT TRUE;
ALTER TABLE sheets_config ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;
ALTER TABLE sheets_config ADD COLUMN IF NOT EXISTS created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- sheets_datos: one row per spreadsheet row (JSONB column holds the parsed cell values)
CREATE TABLE IF NOT EXISTS sheets_datos (
  id         BIGSERIAL PRIMARY KEY,
  config_id  BIGINT      NOT NULL REFERENCES sheets_config(id) ON DELETE CASCADE,
  fila       INTEGER     NOT NULL DEFAULT 0,
  datos      JSONB       NOT NULL DEFAULT '{}',
  synced_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE sheets_datos ADD COLUMN IF NOT EXISTS config_id  BIGINT      REFERENCES sheets_config(id) ON DELETE CASCADE;
ALTER TABLE sheets_datos ADD COLUMN IF NOT EXISTS fila       INTEGER     NOT NULL DEFAULT 0;
ALTER TABLE sheets_datos ADD COLUMN IF NOT EXISTS datos      JSONB       NOT NULL DEFAULT '{}';
ALTER TABLE sheets_datos ADD COLUMN IF NOT EXISTS synced_at  TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Index for fast lookup by config
CREATE INDEX IF NOT EXISTS idx_sheets_datos_config_id ON sheets_datos(config_id);

-- ── RLS (anon can read; service role handles writes via serverless functions) ─
ALTER TABLE sheets_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE sheets_datos  ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'sheets_config' AND policyname = 'anon_all_sheets_config'
  ) THEN
    CREATE POLICY anon_all_sheets_config ON sheets_config FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'sheets_datos' AND policyname = 'anon_all_sheets_datos'
  ) THEN
    CREATE POLICY anon_all_sheets_datos ON sheets_datos FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
END $$;
