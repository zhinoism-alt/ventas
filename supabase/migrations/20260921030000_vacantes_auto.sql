-- Recibir vacantes de la busqueda diaria automatica.
--
-- La tarea diaria de Brandon encuentra vacantes y hasta ahora no tenian donde
-- caer: las capturaba a mano o se perdian. Puede escribir aqui directo, pero
-- una tabla pensada para captura manual no aguanta un proceso automatico:
--
--   1. Repite. La misma vacante aparece hoy, manana y pasado. Sin una llave
--      natural, el tablero se llena de copias y deja de servir.
--   2. Revuelve. Una vacante que Brandon eligio y uuna que un robot encontro
--      no valen lo mismo, y mezclarlas hace que el tablero deje de ser suyo.
--
-- De ahi las dos columnas y el indice unico.

ALTER TABLE empleo_vacantes
  -- 'manual' = la puso Brandon. 'auto' = la trajo la busqueda diaria.
  ADD COLUMN IF NOT EXISTS origen   TEXT    NOT NULL DEFAULT 'manual',
  -- Lo automatico entra sin revisar y espera su visto bueno. Lo que el captura
  -- ya viene revisado por definicion.
  ADD COLUMN IF NOT EXISTS revisada BOOLEAN NOT NULL DEFAULT TRUE,
  -- Texto del anuncio, para no tener que volver a abrir el enlace.
  ADD COLUMN IF NOT EXISTS resumen  TEXT;

ALTER TABLE empleo_vacantes
  DROP CONSTRAINT IF EXISTS empleo_vacantes_origen_check;
ALTER TABLE empleo_vacantes
  ADD CONSTRAINT empleo_vacantes_origen_check CHECK (origen IN ('manual', 'auto'));

-- La llave natural de una vacante es su enlace. Normalizado, porque el mismo
-- anuncio llega con mayusculas distintas o con una diagonal de mas.
-- Parcial: las capturadas a mano muchas veces no traen enlace, y dos NULL no
-- deben estorbarse.
CREATE UNIQUE INDEX IF NOT EXISTS idx_empleo_vacantes_link
  ON empleo_vacantes (lower(rtrim(link, '/')))
  WHERE link IS NOT NULL AND link <> '';

-- Para pintar rapido el contador de "nuevas por revisar".
CREATE INDEX IF NOT EXISTS idx_empleo_vacantes_sin_revisar
  ON empleo_vacantes (created_at DESC) WHERE activo AND NOT revisada;
