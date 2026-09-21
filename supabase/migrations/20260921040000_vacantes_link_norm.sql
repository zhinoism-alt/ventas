-- Corrige el indice anti-duplicados de la migracion anterior.
--
-- Estaba sobre una expresion, lower(rtrim(link,'/')), y PostgREST no puede
-- apuntarle: `on_conflict=link` responde 42P10, "there is no unique or
-- exclusion constraint matching the ON CONFLICT specification". Su clausula
-- ON CONFLICT nombra columnas, no expresiones, asi que la normalizacion tiene
-- que vivir en una columna de verdad.
--
-- Generada y STORED: la calcula Postgres, no quien inserta. Asi la tarea
-- diaria manda el enlace tal como lo encontro y el deduplicado sigue siendo
-- correcto aunque llegue con mayusculas distintas o una diagonal de mas.

DROP INDEX IF EXISTS idx_empleo_vacantes_link;

ALTER TABLE empleo_vacantes
  ADD COLUMN IF NOT EXISTS link_norm TEXT
  GENERATED ALWAYS AS (
    NULLIF(lower(rtrim(btrim(link), '/')), '')
  ) STORED;

-- Parcial: las vacantes capturadas a mano a menudo no traen enlace, y en
-- Postgres dos NULL no chocan entre si, pero el indice parcial lo deja
-- explicito y mas barato.
CREATE UNIQUE INDEX IF NOT EXISTS idx_empleo_vacantes_link_norm
  ON empleo_vacantes (link_norm)
  WHERE link_norm IS NOT NULL;
