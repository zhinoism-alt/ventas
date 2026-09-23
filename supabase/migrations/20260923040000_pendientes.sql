-- Pendientes simples: sin fecha, sin hora, sin repeticion. Para "comprar
-- pan" o "llamar al doctor" -- cosas que no ameritan pasar por el formulario
-- completo de un evento de calendario, y que no tienen sentido en un feed
-- de calendario porque no ocurren un dia en particular.
--
-- A diferencia de limpieza_estado (que se vacia solo cada semana), un
-- pendiente se queda hasta que alguien lo marca hecho -- no tiene fecha de
-- caducidad. Por eso vive en su propia tabla en vez de forzarlo dentro de
-- calendario_eventos.

CREATE TABLE IF NOT EXISTS pendientes (
  id         SERIAL PRIMARY KEY,
  texto      TEXT NOT NULL,
  hecho      BOOLEAN NOT NULL DEFAULT FALSE,
  hecho_por  TEXT,
  hecho_en   TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pendientes_hecho ON pendientes (hecho, created_at);

ALTER TABLE pendientes DISABLE ROW LEVEL SECURITY;
