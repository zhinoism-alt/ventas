-- Metodo de pago: con que tarjeta o cuenta salio el dinero.
--
-- Usan 5: credito Didi (Brandon), credito Rappi (Itzel), debito Edenred
-- (vale de despensa, compartida), efectivo, y debito Nu (transferencias).
-- Edenred es el caso especial: ese saldo no sale de su bolsillo -- es un
-- beneficio de nomina, no dinero liquido -- asi que un gasto pagado con
-- Edenred no deberia sentirse como presion sobre su presupuesto real aunque
-- si se quiera ver cuanto se gasta ahi.
--
-- Igual que fondo_id: solo etiqueta para reportear, no mueve saldos de
-- ninguna tarjeta.

ALTER TABLE movimientos
  ADD COLUMN IF NOT EXISTS metodo_pago TEXT CHECK (metodo_pago IN (
    'credito_didi', 'credito_rappi', 'debito_edenred', 'efectivo', 'debito_nu'
  ));

CREATE INDEX IF NOT EXISTS idx_movimientos_metodo ON movimientos (metodo_pago) WHERE metodo_pago IS NOT NULL;
