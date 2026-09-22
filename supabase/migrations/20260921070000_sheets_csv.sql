-- Terminar Sheets Sync, por el camino que su propia interfaz promete.
--
-- La funcion estaba partida en dos disenos incompatibles:
--
--   · La pantalla pide una URL de "Publicar en la web ... como CSV" y explica
--     paso a paso como sacarla.
--   · Las edge functions detras hablaban con la API de Google Sheets usando
--     una cuenta de servicio, que es otra cosa por completo.
--
-- Ninguna de las dos mitades funcionaba: faltaban tres tablas, las edge
-- functions nunca se desplegaron (404) y jamas se dio de alta la cuenta de
-- servicio. Ademas, la mitad de escritura (write-to-sheet, sheets_write_queue)
-- no la llamaba ninguna pantalla: se escribio y nunca se conecto.
--
-- Se termina por el camino del CSV publicado, que es el que la interfaz ya
-- explica y el que Presupuesto usa desde hace semanas sin una sola credencial:
-- Google sirve esos CSV con Access-Control-Allow-Origin: *, asi que el
-- navegador los lee directo. Sin cuenta de servicio en Google Cloud, sin edge
-- functions, sin cola de escritura.
--
-- Lo que se pierde: escribir de vuelta a la hoja. No se pierde nada en la
-- practica, porque eso nunca estuvo conectado a un boton.

ALTER TABLE sheets_config
  -- El enlace de "Publicar en la web" en formato CSV.
  ADD COLUMN IF NOT EXISTS csv_url     TEXT,
  -- Cuantas filas trajo la ultima lectura, para poder decirlo sin contar.
  ADD COLUMN IF NOT EXISTS filas       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ultimo_error TEXT;

-- Almacen generico de filas. sheets_datos no sirve: tiene columnas de
-- presupuesto (mes, ingresos, gastos, ahorro) y la idea aqui es guardar
-- cualquier hoja, sea de lo que sea.
CREATE TABLE IF NOT EXISTS sheets_cache (
  id         BIGSERIAL PRIMARY KEY,
  config_id  BIGINT NOT NULL REFERENCES sheets_config(id) ON DELETE CASCADE,
  row_index  INTEGER NOT NULL,
  -- Un objeto por fila: encabezado -> valor.
  datos      JSONB NOT NULL,
  synced_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (config_id, row_index)
);

CREATE INDEX IF NOT EXISTS idx_sheets_cache_config
  ON sheets_cache (config_id, row_index);

ALTER TABLE sheets_cache DISABLE ROW LEVEL SECURITY;

-- Primera llave foranea del proyecto, y va aqui a proposito: sin ella, borrar
-- una hoja dejaria sus filas huerfanas para siempre.
