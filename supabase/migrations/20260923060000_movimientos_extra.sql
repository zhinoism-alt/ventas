-- Movimientos: contexto que FetPocket nunca tuvo.
--
-- FetPocket solo sabia "entro/salio X". Lo que Brandon e Itzel de verdad
-- necesitan saber es de donde sale el dinero y de quien es el gasto, porque
-- no todo su dinero vive en un solo lugar:
--
--   - Lo que entra de ventas/IPTV se va a Fondo de Inversion, no a gasto
--     corriente.
--   - A veces sacan de Fondo de Emergencia para pagar algo y lo reponen
--     despues con tarjeta de credito -- un prestamo de si mismos a si
--     mismos.
--   - Un gasto puede ser de Brandon, de Itzel, o compartido.
--
-- fondo_id es solo etiqueta para reportear (Brandon decidio explicitamente
-- que NO debe tocar el saldo real de fondos_ahorro -- eso lo sigue
-- ajustando el a mano en Ahorros con "Abonar o sacar". Dos fuentes de
-- verdad para el mismo saldo ya causo un bug de doble conteo entre
-- Patrimonio y Fondos; no lo repetimos aqui).

ALTER TABLE movimientos
  ADD COLUMN IF NOT EXISTS fondo_id BIGINT REFERENCES fondos_ahorro(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS persona TEXT NOT NULL DEFAULT 'compartido'
    CHECK (persona IN ('brandon', 'itzel', 'compartido')),
  ADD COLUMN IF NOT EXISTS es_prestamo BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS prestamo_pagado BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_movimientos_prestamo
  ON movimientos (es_prestamo, prestamo_pagado) WHERE es_prestamo;
CREATE INDEX IF NOT EXISTS idx_movimientos_fondo ON movimientos (fondo_id) WHERE fondo_id IS NOT NULL;
