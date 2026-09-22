-- sheets_datos arrastra columnas de cuando solo servia para el presupuesto:
-- mes, datos_raw, ingresos, gastos, ahorro. La tabla ahora guarda filas de
-- cualquier hoja, y `mes` seguia siendo NOT NULL, asi que toda insercion
-- generica fallaba con 23502.
--
-- No se borran: puede haber datos viejos ahi. Solo dejan de ser obligatorias.

ALTER TABLE sheets_datos ALTER COLUMN mes DROP NOT NULL;

DO $$
DECLARE c TEXT;
BEGIN
  FOREACH c IN ARRAY ARRAY['datos_raw', 'ingresos', 'gastos', 'ahorro'] LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'sheets_datos' AND column_name = c AND is_nullable = 'NO'
    ) THEN
      EXECUTE format('ALTER TABLE sheets_datos ALTER COLUMN %I DROP NOT NULL', c);
    END IF;
  END LOOP;
END $$;
