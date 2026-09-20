-- Datos para proyectar el PPR hasta el final de los pagos.
--
-- El costo del seguro no es fijo: sube cada anio con la edad, segun los
-- "Factores Anuales de Costos de Mortalidad" de la poliza. Del anio 2 al 15
-- ese factor pasa de 1.08 a 1.94 -- casi el doble. Proyectar con el costo de
-- hoy daria una cifra optimista y falsa.
--
-- El costo se cobra sobre la SUMA EN RIESGO (asegurada menos saldo), que baja
-- conforme crece el ahorro. Sin ese ajuste la proyeccion castiga de mas.

ALTER TABLE finanzas_perfil
  ADD COLUMN IF NOT EXISTS ppr_anios_pago       SMALLINT      DEFAULT 15,
  ADD COLUMN IF NOT EXISTS ppr_anio_poliza      SMALLINT      DEFAULT 1,
  ADD COLUMN IF NOT EXISTS ppr_costo_anual_udi  NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ppr_rend_observado   NUMERIC(6,3)  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ppr_factores         TEXT,
  ADD COLUMN IF NOT EXISTS ppr_cargo_rescate    TEXT;

UPDATE finanzas_perfil SET
  ppr_anios_pago      = 15,
  ppr_anio_poliza     = 2,
  ppr_costo_anual_udi = 2791.08,   -- observado: 697.77 UDI en el trimestre abr-jun 2026
  ppr_rend_observado  = 4.3,       -- 22.13 UDI sobre ~2,050 de saldo medio, anualizado
  ppr_factores        = '1.08,1.08,1.22,1.27,1.31,1.34,1.40,1.43,1.49,1.54,1.62,1.70,1.77,1.85,1.94',
  ppr_cargo_rescate   = '100% de la prima basica el anio 1; 150% del anio 2 en adelante',
  updated_at = now()
WHERE id = 1;

SELECT ppr_anio_poliza, ppr_anios_pago, ppr_costo_anual_udi, ppr_rend_observado
FROM finanzas_perfil WHERE id = 1;
