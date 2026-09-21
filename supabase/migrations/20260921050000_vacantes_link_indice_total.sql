-- Tercer intento del indice anti-duplicados, y el bueno.
--
-- El parcial de la migracion anterior tampoco servia: Postgres solo usa un
-- indice unico parcial en ON CONFLICT si la sentencia repite su condicion
-- (index predicate inference), y PostgREST no la emite. Seguia el 42P10.
--
-- Un indice total resuelve las dos cosas a la vez, porque en Postgres dos NULL
-- nunca chocan entre si: las vacantes capturadas a mano sin enlace conviven sin
-- estorbarse, y el deduplicado de las automaticas funciona.

DROP INDEX IF EXISTS idx_empleo_vacantes_link_norm;

CREATE UNIQUE INDEX IF NOT EXISTS idx_empleo_vacantes_link_norm
  ON empleo_vacantes (link_norm);
