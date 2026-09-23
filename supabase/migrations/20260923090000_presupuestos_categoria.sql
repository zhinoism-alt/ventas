-- Presupuesto por categoria (envelope budgeting): un limite por categoria
-- de gasto que se compara contra lo gastado en el periodo actual. No esta
-- ligado a un mes especifico -- el mismo limite aplica cada periodo, igual
-- que ellos piensan su presupuesto ("comida rapida: $1500 al mes"), y se
-- reinicia solo porque el reporte ya filtra por periodo.

CREATE TABLE IF NOT EXISTS movimientos_presupuestos (
  id         BIGSERIAL PRIMARY KEY,
  categoria  TEXT NOT NULL UNIQUE,
  limite     NUMERIC(12,2) NOT NULL CHECK (limite >= 0),
  activo     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE movimientos_presupuestos DISABLE ROW LEVEL SECURITY;
