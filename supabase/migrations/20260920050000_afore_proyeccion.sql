-- La AFORE no es un saldo congelado: recibe aportaciones cada bimestre y rinde.
--
-- Tasas 2026 tras la reforma de 2020, para un SBC de 1,218.77 diarios
-- (unas 10 UMA, en el tramo alto de la tabla):
--   Retiro, patron                2.000%
--   Cesantia y Vejez, patron      7.513%   (sube por escalones hasta 2030)
--   Cesantia y Vejez, obrero      1.125%
--   Cuota social, gobierno        0%       solo aplica hasta 4 UMA
--   ------------------------------------
--   Total al saldo individual    10.638%
--
-- Sobre un SBC mensual de 37,050.61 son ~3,941 al mes. Tratar eso como cero
-- subestimaba el patrimonio de retiro por millones.
--
-- Las semanas cotizadas importan aparte: con la reforma el minimo para pension
-- garantizada sube gradualmente hasta 1,000 semanas en 2031.

ALTER TABLE finanzas_perfil
  ADD COLUMN IF NOT EXISTS afore_sbc_diario       NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS afore_tasa_aportacion  NUMERIC(6,3)  DEFAULT 10.638,
  ADD COLUMN IF NOT EXISTS afore_rendimiento_real NUMERIC(5,2)  DEFAULT 4.0,
  ADD COLUMN IF NOT EXISTS afore_semanas          SMALLINT      DEFAULT 0,
  ADD COLUMN IF NOT EXISTS afore_semanas_meta     SMALLINT      DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS afore_semanas_corte    DATE,
  ADD COLUMN IF NOT EXISTS edad_retiro            SMALLINT      DEFAULT 65;

UPDATE finanzas_perfil SET
  afore_sbc_diario       = 1218.77,
  afore_tasa_aportacion  = 10.638,
  afore_rendimiento_real = 4.0,   -- rendimiento real historico de las Siefores
  afore_semanas          = 369,
  afore_semanas_meta     = 1000,
  afore_semanas_corte    = '2026-05-11',
  edad_retiro            = 65,
  updated_at = now()
WHERE id = 1;

SELECT afore_sbc_diario,
       round(afore_sbc_diario * 30.4 * afore_tasa_aportacion / 100, 2) AS aportacion_mensual,
       afore_semanas, afore_semanas_meta
FROM finanzas_perfil WHERE id = 1;
