-- Historia del UDI y parametros de independencia financiera.
--
-- Por que importa el historico: el UDI se mueve con la inflacion, no de forma
-- constante. En 10 anios fue de 2.63% (2020) a 7.77% (2023). Proyectar con un
-- solo numero esconde esa varianza, y en horizontes de 36 anios la diferencia
-- entre 3% y 7% cambia el resultado nominal por un factor de 4.
--
-- Un saldo en UDI NO cambia de poder adquisitivo: 1 UDI de 2062 compra lo
-- mismo que 1 de hoy. Lo que cambia es el numero de pesos que representa.
-- Por eso el panel muestra las dos cifras y dice cual es cual.

CREATE TABLE IF NOT EXISTS udi_historico (
  anio       SMALLINT PRIMARY KEY,
  valor      NUMERIC(12,6) NOT NULL,   -- valor al 10 de enero
  fuente     TEXT DEFAULT 'Banxico / DOF'
);

INSERT INTO udi_historico (anio, valor) VALUES
  (2016,5.389834),(2017,5.577329),(2018,5.950678),(2019,6.248483),
  (2020,6.413049),(2021,6.619514),(2022,7.112667),(2023,7.665425),
  (2024,8.007473),(2025,8.362982),(2026,8.674409)
ON CONFLICT (anio) DO UPDATE SET valor = EXCLUDED.valor;

-- Parametros de libertad financiera.
-- La tasa de retiro seguro es cuanto puedes sacar al anio, en terminos REALES,
-- sin agotar el capital. El 4% viene del estudio Trinity sobre carteras
-- estadounidenses a 30 anios; para horizontes mas largos suele usarse 3-3.5%.
-- Es un supuesto, no una ley: por eso es editable.
ALTER TABLE finanzas_perfil
  ADD COLUMN IF NOT EXISTS fi_gasto_mensual    NUMERIC(12,2) DEFAULT 14000,
  ADD COLUMN IF NOT EXISTS fi_tasa_retiro      NUMERIC(5,2)  DEFAULT 4.0,
  ADD COLUMN IF NOT EXISTS fi_aporte_mensual   NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fi_rendimiento_real NUMERIC(5,2)  DEFAULT 5.0,
  ADD COLUMN IF NOT EXISTS fi_edad_actual      SMALLINT      DEFAULT 29,
  ADD COLUMN IF NOT EXISTS inflacion_esperada  NUMERIC(5,2)  DEFAULT 4.87;

UPDATE finanzas_perfil SET
  fi_gasto_mensual    = 14000,
  fi_tasa_retiro      = 4.0,
  fi_rendimiento_real = 5.0,
  fi_edad_actual      = 29,
  inflacion_esperada  = 4.87,   -- CAGR del UDI en los ultimos 10 anios
  updated_at = now()
WHERE id = 1;

SELECT count(*) AS anios_udi,
       round((( (SELECT valor FROM udi_historico WHERE anio=2026)
              / (SELECT valor FROM udi_historico WHERE anio=2016) )^(1/10.0) - 1) * 100, 3) AS cagr_pct
FROM udi_historico;
