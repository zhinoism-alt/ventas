-- Ingresos que no vienen de la nomina ni de la hoja de Google.
--
-- Brandon confirmo dos cosas que cambian como hay que leer el presupuesto:
--
--   1. El bloque "Ingreso Quincenal Extra" de la hoja es de su pareja, y ella
--      va a dejar de trabajar. Deja de contarse por defecto.
--   2. El tiene ingresos propios que aparecen de vez en cuando (ventas, IPTV)
--      y que la hoja no registra.
--
-- Esos dos no son lo mismo y meterlos en un solo numero seria enganoso. El de
-- la pareja va a desaparecer; el de ventas existe pero es irregular, y
-- presupuestar gastos fijos contra el es justo como se rompe un presupuesto.
-- Por eso se guardan aparte y la interfaz los muestra marcados como variables.

CREATE TABLE IF NOT EXISTS presupuesto_ingresos (
  id         BIGSERIAL PRIMARY KEY,
  anio       SMALLINT NOT NULL,
  mes        SMALLINT NOT NULL CHECK (mes BETWEEN 1 AND 12),
  concepto   TEXT NOT NULL,
  monto      NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- 'variable' es lo que entra a veces y no hay que dar por seguro.
  -- 'fijo' es lo que si se repite todos los meses.
  tipo       TEXT NOT NULL DEFAULT 'variable' CHECK (tipo IN ('variable', 'fijo')),
  nota       TEXT NOT NULL DEFAULT '',
  activo     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_presupuesto_ingresos_fecha
  ON presupuesto_ingresos (anio DESC, mes DESC) WHERE activo;

-- El bloque de la hoja ya no es una suposicion: es el ingreso de su pareja.
UPDATE presupuesto_config
   SET ingresos_excluidos = 'extra'
 WHERE activo AND ingresos_excluidos IS DISTINCT FROM 'extra';
