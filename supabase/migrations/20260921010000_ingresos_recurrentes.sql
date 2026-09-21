-- Ingresos que se repiten, y con su propia periodicidad.
--
-- Brandon aclaro tres cosas:
--
--   1. Recibe 740 a la semana de vales de despensa, y la hoja NO los incluye.
--      Son 3,206.67 al mes (740 * 52 / 12), cerca del 13% de su ingreso. Sin
--      esto, todos los porcentajes de la pagina estaban mal.
--   2. En abril de 2026 tuvo un aumento del 4%.
--   3. Ultimamente hace tiempo extra, asi que el ingreso varia hacia arriba.
--
-- Lo semanal no se convierte multiplicando por 4: un mes no tiene cuatro
-- semanas, tiene 4.333 (52 / 12). Con 4 fijas se pierden 2,960 al ano sobre un
-- bono de 740: 740*48 = 35,520 en vez de 740*52 = 38,480.
--
-- `recurrente` evita tener que capturar los vales doce veces al ano: se guarda
-- una vez con el mes en que empezo y aplica de ahi en adelante.

ALTER TABLE presupuesto_ingresos
  ADD COLUMN IF NOT EXISTS periodicidad TEXT NOT NULL DEFAULT 'mensual'
    CHECK (periodicidad IN ('semanal', 'quincenal', 'mensual')),
  ADD COLUMN IF NOT EXISTS recurrente BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN presupuesto_ingresos.recurrente IS
  'Si es true, anio/mes es el mes en que empezo y aplica de ahi en adelante.';
COMMENT ON COLUMN presupuesto_ingresos.periodicidad IS
  'Como se recibe el monto. La conversion a mensual es semanal*52/12, quincenal*2.';

-- Los vales. Se siembran desde enero 2026, que es el mes mas viejo de la hoja.
-- Si empezaron despues, se corrige el mes de inicio desde la pagina: es un
-- campo, no una migracion.
INSERT INTO presupuesto_ingresos (anio, mes, concepto, monto, tipo, periodicidad, recurrente, nota)
SELECT 2026, 1, 'Vales de despensa', 740, 'fijo', 'semanal', TRUE,
       'No vienen en la hoja de Google. Revisa el mes de inicio si empezaron despues.'
WHERE NOT EXISTS (
  SELECT 1 FROM presupuesto_ingresos WHERE concepto = 'Vales de despensa' AND activo
);
