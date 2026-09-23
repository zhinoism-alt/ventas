-- Movimientos: reemplazo nativo de FetPocket. Antes cada gasto y cada
-- ingreso se anotaba en una app externa; esta tabla es donde vive esa
-- misma captura diaria (transaccion por transaccion), no un presupuesto
-- planeado como presupuesto_meses/presupuesto_ingresos ni un ahorro como
-- ahorros/fondos. Es el registro de lo que de verdad entro y salio.
--
-- Categoria es texto libre a proposito: empezar con un select de
-- categorias comunes + "Otra" es mas rapido de construir y de usar que un
-- catalogo rigido, y se puede promover a tabla aparte despues si hace
-- falta reportar por categoria de forma mas fina.

CREATE TABLE IF NOT EXISTS movimientos (
  id             BIGSERIAL PRIMARY KEY,
  tipo           TEXT NOT NULL CHECK (tipo IN ('ingreso', 'gasto')),
  monto          NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  categoria      TEXT NOT NULL,
  descripcion    TEXT NOT NULL DEFAULT '',
  fecha          DATE NOT NULL DEFAULT CURRENT_DATE,
  registrado_por TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_movimientos_fecha ON movimientos (fecha DESC);
CREATE INDEX IF NOT EXISTS idx_movimientos_tipo   ON movimientos (tipo, fecha DESC);

ALTER TABLE movimientos DISABLE ROW LEVEL SECURITY;
