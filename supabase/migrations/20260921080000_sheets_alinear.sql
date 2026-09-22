-- Alinear el esquema de Sheets Sync con lo que la pantalla siempre espero.
--
-- Aparecio la causa raiz: existe 20240417000000_sheets_schema.sql, que crea
-- justo las columnas que SheetsSync.tsx usa — sheet_csv_url, is_active,
-- last_synced_at, y sheets_datos con fila y datos. Nunca corrio. Fue una de las
-- migraciones viejas que se marcaron como aplicadas sin ejecutarse, asi que la
-- tabla quedo con el esquema de otra epoca (sheet_id, sheet_range,
-- tabla_destino) y la pantalla pedia columnas inexistentes.
--
-- En la migracion anterior invente csv_url y filas sin conocer este archivo.
-- Sobran: dos columnas para la misma verdad es peor que ninguna, asi que se
-- van y se usan los nombres originales.

-- ── Lo que la pantalla espera ──────────────────────────────────────────────
ALTER TABLE sheets_config
  ADD COLUMN IF NOT EXISTS sheet_csv_url  TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ,
  -- La pantalla muestra cuantas filas trajo la ultima lectura.
  ADD COLUMN IF NOT EXISTS row_count      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ultimo_error   TEXT;

-- sheet_id venia NOT NULL de la epoca de la API de Google, donde era el
-- identificador del documento. Con el CSV publicado no hace falta: el enlace
-- ya lo contiene.
ALTER TABLE sheets_config ALTER COLUMN sheet_id DROP NOT NULL;
ALTER TABLE sheets_config ALTER COLUMN sheet_id SET DEFAULT '';

-- Lo que invente de mas en la migracion anterior.
ALTER TABLE sheets_config DROP COLUMN IF EXISTS csv_url;
ALTER TABLE sheets_config DROP COLUMN IF EXISTS filas;

-- ── Las filas ──────────────────────────────────────────────────────────────
ALTER TABLE sheets_datos
  ADD COLUMN IF NOT EXISTS fila  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS datos JSONB   NOT NULL DEFAULT '{}';

-- config_id existia sin llave foranea: borrar una hoja dejaba sus filas
-- huerfanas para siempre.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sheets_datos_config_id_fkey'
  ) THEN
    ALTER TABLE sheets_datos
      ADD CONSTRAINT sheets_datos_config_id_fkey
      FOREIGN KEY (config_id) REFERENCES sheets_config(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sheets_datos_config ON sheets_datos (config_id, fila);

-- sheets_cache, tambien de la migracion anterior: sheets_datos ya hacia esto.
DROP TABLE IF EXISTS sheets_cache;

ALTER TABLE sheets_config DISABLE ROW LEVEL SECURITY;
ALTER TABLE sheets_datos  DISABLE ROW LEVEL SECURITY;
