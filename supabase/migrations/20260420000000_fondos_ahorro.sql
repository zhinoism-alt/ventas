-- Tabla: fondos_ahorro
-- Apartados de dinero con rendimiento anual estimado
-- (convive con la tabla "ahorros" que maneja metas)

CREATE TABLE IF NOT EXISTS fondos_ahorro (
  id            BIGSERIAL PRIMARY KEY,
  nombre        TEXT        NOT NULL,
  saldo         NUMERIC(14,2) NOT NULL DEFAULT 0,
  moneda        TEXT        NOT NULL DEFAULT 'MXN',
  rendimiento   NUMERIC(6,2) NOT NULL DEFAULT 0,   -- % anual (ej: 8.5 = 8.5%)
  descripcion   TEXT,
  icono         TEXT        NOT NULL DEFAULT '💰',
  color         TEXT        NOT NULL DEFAULT '#6366f1',
  activo        BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE fondos_ahorro DISABLE ROW LEVEL SECURITY;

-- Datos de ejemplo (bórralos si no los necesitas)
-- INSERT INTO fondos_ahorro (nombre, saldo, rendimiento, descripcion, icono, color)
-- VALUES
--   ('Fondo de Emergencia', 20000, 0, '3-6 meses de gastos', '🛡️', '#ef4444'),
--   ('Fondo de Inversión',  15000, 8.5, 'CETES / Fondo indexado', '📈', '#22c55e');
