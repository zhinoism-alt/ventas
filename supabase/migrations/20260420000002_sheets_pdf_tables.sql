-- ============================================================
-- Migración: tablas para sync Google Sheets + PDFs mensuales
-- ============================================================

-- 1. Configuración de hojas conectadas
CREATE TABLE IF NOT EXISTS sheets_sync_config (
  id            BIGSERIAL PRIMARY KEY,
  nombre        TEXT NOT NULL,
  sheet_id      TEXT NOT NULL,
  tab_name      TEXT NOT NULL DEFAULT 'Sheet1',
  tipo          TEXT NOT NULL CHECK (tipo IN ('presupuesto','ingresos','gastos','iptv','custom')),
  column_map    JSONB DEFAULT '{}',      -- mapeo columna→campo: {"A":"concepto","B":"monto"}
  sync_interval INT  DEFAULT 300,        -- segundos entre syncs automáticos
  last_synced   TIMESTAMPTZ,
  activo        BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Caché de filas de cada hoja
CREATE TABLE IF NOT EXISTS sheets_cache (
  id            BIGSERIAL PRIMARY KEY,
  config_id     BIGINT NOT NULL REFERENCES sheets_sync_config(id) ON DELETE CASCADE,
  row_index     INT    NOT NULL,          -- fila de origen en Sheets (1-based, sin header)
  data          JSONB  NOT NULL,          -- fila completa: {"concepto":"Gas","monto":450}
  checksum      TEXT,                     -- MD5 del JSONB para detectar cambios
  synced_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(config_id, row_index)
);

CREATE INDEX IF NOT EXISTS idx_sheets_cache_config ON sheets_cache(config_id);
CREATE INDEX IF NOT EXISTS idx_sheets_cache_synced ON sheets_cache(synced_at DESC);

-- 3. Cola de escrituras Web → Sheets
CREATE TABLE IF NOT EXISTS sheets_write_queue (
  id            BIGSERIAL PRIMARY KEY,
  config_id     BIGINT NOT NULL REFERENCES sheets_sync_config(id),
  action        TEXT NOT NULL CHECK (action IN ('append','update','delete')),
  payload       JSONB NOT NULL,           -- datos a escribir
  row_index     INT,                      -- fila a actualizar (solo para 'update'/'delete')
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','failed')),
  attempts      INT  DEFAULT 0,
  error_msg     TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  processed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_write_queue_status ON sheets_write_queue(status, created_at);

-- 4. Reportes PDF mensuales
CREATE TABLE IF NOT EXISTS pdf_reportes (
  id            BIGSERIAL PRIMARY KEY,
  user_id       TEXT NOT NULL,            -- Clerk user ID
  storage_path  TEXT NOT NULL,            -- ruta en Supabase Storage
  nombre        TEXT NOT NULL,
  tipo          TEXT NOT NULL CHECK (tipo IN ('gastos','ingresos','mixto')),
  mes           INT  NOT NULL CHECK (mes BETWEEN 1 AND 12),
  anio          INT  NOT NULL CHECK (anio >= 2020),
  monto_total   NUMERIC(12,2),
  notas         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pdf_reportes_periodo ON pdf_reportes(anio DESC, mes DESC);
CREATE INDEX IF NOT EXISTS idx_pdf_reportes_user    ON pdf_reportes(user_id);

-- 5. Función helper: obtener caché de una config como tabla
CREATE OR REPLACE FUNCTION get_sheets_data(p_config_id BIGINT)
RETURNS TABLE(row_index INT, data JSONB, synced_at TIMESTAMPTZ) AS $$
  SELECT row_index, data, synced_at
  FROM   sheets_cache
  WHERE  config_id = p_config_id
  ORDER  BY row_index ASC;
$$ LANGUAGE SQL STABLE;
