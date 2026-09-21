-- Proyeccion del PPR hasta los 65, no solo hasta el ultimo pago.
--
-- La poliza es "IMAGINA SER 65 - 15 PAGOS": se pagan 15 anios pero cubre 37,
-- hasta abril de 2062. Cortar en el anio 15 respondia la pregunta equivocada.
--
-- Y queda una duda que los documentos NO resuelven: despues del pago 15,
-- se sigue descontando el costo del seguro del Fondo de Reserva?
--   * Si se sigue: el fondo se vacia antes de los 65, porque los factores de
--     mortalidad se multiplican por 4 entre el anio 15 y el 34 sin primas que
--     los cubran.
--   * Si la poliza queda saldada: el fondo crece hasta el vencimiento.
-- La diferencia es el resultado entero, asi que se guarda como NULL
-- (desconocido) hasta confirmarlo con la aseguradora.
--
-- Nota del contrato: al llegar a la Fecha de Vencimiento la aseguradora NO
-- entrega el saldo. Aplica un "factor de rentas" y paga una renta mensual.

ALTER TABLE finanzas_perfil
  ADD COLUMN IF NOT EXISTS ppr_anios_total      SMALLINT DEFAULT 37,
  ADD COLUMN IF NOT EXISTS ppr_costo_tras_pagos BOOLEAN,   -- NULL = sin confirmar
  ADD COLUMN IF NOT EXISTS ppr_vencimiento      DATE,
  ADD COLUMN IF NOT EXISTS ppr_aseguradora      TEXT;

UPDATE finanzas_perfil SET
  ppr_anios_total      = 37,
  ppr_costo_tras_pagos = NULL,
  ppr_vencimiento      = '2062-04-10',
  ppr_aseguradora      = 'Seguros Monterrey New York Life',
  ppr_rend_garantizado = 1.0,
  -- factores de mortalidad anios 1-34 de la poliza; 35-37 extrapolados al 8%
  ppr_factores = '1.08,1.08,1.22,1.27,1.31,1.34,1.40,1.43,1.49,1.54,1.62,1.70,1.77,1.85,1.94,'
              || '2.04,2.13,2.24,2.40,2.59,2.80,3.02,3.26,3.53,3.80,4.11,4.45,4.82,5.21,5.63,'
              || '6.08,6.59,7.12,7.68,8.29,8.96,9.68',
  updated_at = now()
WHERE id = 1;

SELECT ppr_anios_pago, ppr_anios_total, ppr_costo_tras_pagos, ppr_vencimiento,
       array_length(string_to_array(ppr_factores, ','), 1) AS factores
FROM finanzas_perfil WHERE id = 1;
