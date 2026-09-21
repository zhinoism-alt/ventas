-- Presupuesto: leerlo de la hoja de Google en vez de capturarlo a mano.
--
-- La hoja "Budget 2026" tiene una pestana por mes, siempre con la misma forma
-- pero nunca con las mismas coordenadas. Cargarla a mano cada mes era el
-- trabajo que hacia que este modulo no se usara. Ahora el frontend descubre las
-- pestanas, descarga la del mes en curso y deja aqui una instantanea.
--
-- La instantanea va en jsonb a proposito. La hoja es un documento vivo: un mes
-- aparece "Ingreso Quincenal Extra", otro "Saldo de Fondo de inversion", otro
-- se agrega un renglon de gastos. Un esquema rigido obligaria a una migracion
-- cada vez que Brandon agrega una fila a su propia hoja. Las cifras que si
-- necesitamos para graficar y comparar se promueven a columnas.

-- ── Configuracion: de donde se lee y que se cuenta ──────────────────────────
CREATE TABLE IF NOT EXISTS presupuesto_config (
  id              BIGSERIAL PRIMARY KEY,
  nombre          TEXT NOT NULL DEFAULT 'Budget 2026',
  -- El identificador 2PACX-... del enlace de "Publicar en la web".
  pub_id          TEXT NOT NULL,
  url             TEXT NOT NULL DEFAULT '',
  -- Sincronizar sola al abrir la pagina.
  auto_sync       BOOLEAN NOT NULL DEFAULT TRUE,
  -- Fuentes de ingreso que NO deben contarse, separadas por |.
  -- "extra" = el bloque "Ingreso Quincenal Extra".
  ingresos_excluidos TEXT NOT NULL DEFAULT 'extra',
  ultima_sync     TIMESTAMPTZ,
  activo          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Una instantanea por mes ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS presupuesto_meses (
  id                   BIGSERIAL PRIMARY KEY,
  anio                 SMALLINT NOT NULL,
  mes                  SMALLINT NOT NULL CHECK (mes BETWEEN 1 AND 12),
  hoja                 TEXT NOT NULL,
  gid                  TEXT NOT NULL,
  datos                JSONB NOT NULL,
  -- Promovidas desde `datos` para graficar sin desempaquetar json.
  ingreso_principal    NUMERIC(12,2) DEFAULT 0,
  ingreso_extra        NUMERIC(12,2) DEFAULT 0,
  gastos_necesarios    NUMERIC(12,2) DEFAULT 0,
  gastos_no_necesarios NUMERIC(12,2) DEFAULT 0,
  disponible           NUMERIC(12,2),
  fondo_emergencia     NUMERIC(12,2),
  sincronizado         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (anio, mes)
);

CREATE INDEX IF NOT EXISTS idx_presupuesto_meses_fecha
  ON presupuesto_meses (anio DESC, mes DESC);

-- Semilla: el enlace publicado que ya existe. WHERE NOT EXISTS y no
-- ON CONFLICT DO NOTHING, porque la llave primaria es un BIGSERIAL y nunca
-- choca: volver a correr esto insertaria un duplicado silencioso.
INSERT INTO presupuesto_config (nombre, pub_id, url)
SELECT
  'Budget 2026',
  '2PACX-1vT2YTKIDdQ4aW22utLTZFGw0ZNvCMSz5Eh9fx4JSMsRQSvAoXNpA2bSRFs2VESqhe_m2nLjApHaM3vr',
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vT2YTKIDdQ4aW22utLTZFGw0ZNvCMSz5Eh9fx4JSMsRQSvAoXNpA2bSRFs2VESqhe_m2nLjApHaM3vr/pubhtml'
WHERE NOT EXISTS (SELECT 1 FROM presupuesto_config WHERE activo);
