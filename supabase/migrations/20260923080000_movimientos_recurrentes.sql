-- Gastos e ingresos recurrentes: plantillas, no captura automatica.
--
-- Brandon fue explicito: NO quiere que esto se registre solo, porque el
-- precio varia mes a mes (gas, luz). Lo que quiere es no volver a escribir
-- "Gas" y su categoria/persona/fondo cada vez -- la plantilla trae eso
-- precargado, y el monto lo ajusta el mismo al momento de registrar.
--
-- monto_esperado vive en dos lugares con proposito distinto:
--   - en la plantilla: el estimado actual, que ellos mismos actualizan al
--     final del mes segun lo que de verdad paso.
--   - copiado en el movimiento (movimientos.monto_esperado) al momento de
--     registrar: una instantanea. Si despues editan la plantilla, los
--     movimientos ya capturados no deben cambiar de opinion sobre cual era
--     el estimado de ese mes en particular.

CREATE TABLE IF NOT EXISTS movimientos_recurrentes (
  id             BIGSERIAL PRIMARY KEY,
  descripcion    TEXT NOT NULL,
  tipo           TEXT NOT NULL DEFAULT 'gasto' CHECK (tipo IN ('ingreso', 'gasto')),
  categoria      TEXT NOT NULL,
  monto_esperado NUMERIC(12,2) NOT NULL,
  persona        TEXT NOT NULL DEFAULT 'compartido' CHECK (persona IN ('brandon', 'itzel', 'compartido')),
  fondo_id       BIGINT REFERENCES fondos_ahorro(id) ON DELETE SET NULL,
  metodo_pago    TEXT CHECK (metodo_pago IN ('credito_didi', 'credito_rappi', 'debito_edenred', 'efectivo', 'debito_nu')),
  activo         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE movimientos
  ADD COLUMN IF NOT EXISTS recurrente_id  BIGINT REFERENCES movimientos_recurrentes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS monto_esperado NUMERIC(12,2);

ALTER TABLE movimientos_recurrentes DISABLE ROW LEVEL SECURITY;
