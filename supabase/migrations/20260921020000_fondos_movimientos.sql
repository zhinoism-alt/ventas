-- Historial de abonos y retiros de cada fondo.
--
-- Hasta ahora fondos_ahorro solo guardaba el saldo actual. Actualizarlo
-- sobrescribia la cifra anterior sin dejar rastro: no habia forma de saber si
-- los 10,250 de hoy vienen de un abono de 250 o de que alguien se equivoco al
-- teclear. Las metas de ahorro si llevaban movimientos; los fondos, que es
-- donde esta casi todo el dinero, no.
--
-- El saldo se queda en fondos_ahorro y no se calcula sumando movimientos: los
-- fondos ya existian con saldo y sin historia, asi que una suma daria cero.
-- Los movimientos son la bitacora de lo que se fue moviendo desde entonces.

CREATE TABLE IF NOT EXISTS fondos_movimientos (
  id         BIGSERIAL PRIMARY KEY,
  fondo_id   BIGINT NOT NULL REFERENCES fondos_ahorro(id) ON DELETE CASCADE,
  monto      NUMERIC(14,2) NOT NULL,
  tipo       TEXT NOT NULL CHECK (tipo IN ('abono', 'retiro', 'ajuste', 'rendimiento')),
  -- El saldo con el que quedo el fondo tras este movimiento. Guardarlo evita
  -- tener que reconstruirlo, y deja ver de un vistazo si algo no cuadra.
  saldo_despues NUMERIC(14,2),
  nota       TEXT NOT NULL DEFAULT '',
  fecha      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fondos_movimientos_fondo
  ON fondos_movimientos (fondo_id, fecha DESC);

ALTER TABLE fondos_movimientos DISABLE ROW LEVEL SECURITY;
