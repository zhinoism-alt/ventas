-- Cierre de periodo congelado: una fotografia de los totales cuando cierra
-- el periodo (el jueves), para que editar un movimiento viejo despues no
-- cambie en silencio "como nos fue" ese mes. El reporte en vivo (Movimientos)
-- sigue leyendo movimientos directo; este cierre es la version que no se
-- mueve, y es lo que el cron de cierre-periodo llena solo cada jueves.

CREATE TABLE IF NOT EXISTS movimientos_cierres (
  id              BIGSERIAL PRIMARY KEY,
  periodo_inicio  DATE NOT NULL,
  periodo_cierre  DATE NOT NULL UNIQUE,
  total_ingresos  NUMERIC(12,2) NOT NULL,
  total_gastos    NUMERIC(12,2) NOT NULL,
  balance         NUMERIC(12,2) NOT NULL,
  -- por_categoria, por_persona, por_fondo, por_metodo -- mismos desgloses
  -- que ya se ven en vivo, pero congelados.
  desglose        JSONB NOT NULL DEFAULT '{}',
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_movimientos_cierres_fecha ON movimientos_cierres (periodo_cierre DESC);

ALTER TABLE movimientos_cierres DISABLE ROW LEVEL SECURITY;
