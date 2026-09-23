-- Lista de super: lo que hay que comprar para la semana, derivado de la
-- dieta activa (o la que se este previsualizando) mas lo que agreguen a
-- mano (papel higienico, lo que no viene en el menu).
--
-- Los renglones de ingrediente NO se guardan aparte: se calculan al vuelo
-- de dietas_comidas.detalle (cada linea del PDF, ya separada por salto de
-- linea, es un renglon). Lo unico que se guarda es que renglones ya se
-- marcaron como comprados, y eso se identifica por texto -- igual que
-- limpieza_estado se identifica por semana, aqui tambien: llega la semana
-- siguiente y no hay fila, asi que la lista aparece sin marcar, sola.

CREATE TABLE IF NOT EXISTS super_estado (
  semana DATE NOT NULL,
  item   TEXT NOT NULL,
  PRIMARY KEY (semana, item)
);

-- Lo que agregan a mano, que no sale de ninguna dieta.
CREATE TABLE IF NOT EXISTS super_extra (
  id         SERIAL PRIMARY KEY,
  semana     DATE NOT NULL,
  texto      TEXT NOT NULL,
  hecho      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_super_extra_semana ON super_extra (semana);

ALTER TABLE super_estado DISABLE ROW LEVEL SECURITY;
ALTER TABLE super_extra  DISABLE ROW LEVEL SECURITY;
