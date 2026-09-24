-- Viajes: gastos de excepcion que NO deben contar contra el presupuesto
-- normal. Un viaje (Cancun, un concierto fuera de la ciudad, etc.) tiene
-- su propio dinero -- separado, ya apartado -- y mezclarlo con "cuanto
-- gastamos este periodo en Comida rapida" solo ensucia el numero que de
-- verdad importa dia a dia. Se captura igual en Movimientos (mismo
-- historial, mismo flujo), pero se etiqueta con el viaje y se excluye de
-- los totales del periodo, del presupuesto por categoria, de la tendencia
-- y de la proyeccion -- todo lo que responde "como vamos" del dia a dia.

CREATE TABLE IF NOT EXISTS viajes (
  id          BIGSERIAL PRIMARY KEY,
  nombre      TEXT NOT NULL,
  presupuesto NUMERIC(12,2),
  activo      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE movimientos
  ADD COLUMN IF NOT EXISTS viaje_id BIGINT REFERENCES viajes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_movimientos_viaje ON movimientos (viaje_id) WHERE viaje_id IS NOT NULL;

ALTER TABLE viajes DISABLE ROW LEVEL SECURITY;
