-- Módulo: Empleo
-- Seguimiento de vacantes, certificaciones y avance escolar.
-- Compara cada oferta contra tu situación actual llevando todo a "disponible
-- anual": el paquete completo menos lo que se va en trasladarte y en vivir.
-- Es la única cifra comparable entre remoto, híbrido, presencial y reubicación.

-- ─────────────────────────────────────────────────────────────
-- Tu situación actual + escuela. Una sola fila (id = 1).
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS empleo_perfil (
  id                    BIGSERIAL PRIMARY KEY,

  -- puesto actual
  empresa_actual        TEXT,
  puesto_actual         TEXT,
  ciudad                TEXT,

  -- sueldo y prestaciones (bruto mensual, como viene en el recibo)
  sueldo_bruto          NUMERIC(12,2) NOT NULL DEFAULT 0,
  aguinaldo_dias        NUMERIC(5,1)  NOT NULL DEFAULT 15,   -- la ley marca 15
  vacaciones_dias       NUMERIC(5,1)  NOT NULL DEFAULT 12,
  prima_vacacional_pct  NUMERIC(5,2)  NOT NULL DEFAULT 25,   -- la ley marca 25%
  vales_mensual         NUMERIC(12,2) NOT NULL DEFAULT 0,
  fondo_ahorro_pct      NUMERIC(5,2)  NOT NULL DEFAULT 0,    -- aportación patronal
  bono_anual            NUMERIC(12,2) NOT NULL DEFAULT 0,
  ptu_anual             NUMERIC(12,2) NOT NULL DEFAULT 0,
  valor_seguros         NUMERIC(12,2) NOT NULL DEFAULT 0,    -- GMM + vida + dental al año
  deuda_colegiatura     NUMERIC(12,2) NOT NULL DEFAULT 0,    -- lo que debes si sales

  -- cómo trabajas
  modalidad             TEXT     NOT NULL DEFAULT 'presencial',  -- remoto | hibrido | presencial
  dias_oficina          SMALLINT NOT NULL DEFAULT 5,
  traslado_mensual      NUMERIC(12,2) NOT NULL DEFAULT 0,
  horas_traslado_semana NUMERIC(5,1)  NOT NULL DEFAULT 0,

  -- cómo vives
  renta_mensual         NUMERIC(12,2) NOT NULL DEFAULT 0,
  otros_gastos_mensual  NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- reglas de comparación
  umbral_pct            NUMERIC(5,2) NOT NULL DEFAULT 20,    -- mejora mínima de paquete
  tipo_cambio           NUMERIC(8,2) NOT NULL DEFAULT 17.50,

  -- escuela
  escuela               TEXT,
  carrera               TEXT,
  modalidad_escuela     TEXT     DEFAULT 'linea',            -- linea | ejecutiva | presencial
  cuatri_actual         SMALLINT DEFAULT 1,
  cuatri_total          SMALLINT DEFAULT 12,
  fin_cuatri_actual     DATE,
  dias_clase            TEXT,
  colegiatura_mensual   NUMERIC(12,2) DEFAULT 0,
  servicio_social       BOOLEAN DEFAULT FALSE,
  ingles                BOOLEAN DEFAULT FALSE,
  practicas             BOOLEAN DEFAULT FALSE,
  titulacion            BOOLEAN DEFAULT FALSE,

  updated_at            TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- Vacantes a las que aplicas
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS empleo_vacantes (
  id                    BIGSERIAL PRIMARY KEY,
  empresa               TEXT NOT NULL,
  puesto                TEXT NOT NULL,
  fuente                TEXT,
  link                  TEXT,

  -- interes → aplicado → screening → tecnica → final → oferta
  --         → aceptada | rechazada | declinada
  estado                TEXT NOT NULL DEFAULT 'interes',
  fecha_aplicacion      DATE,
  proximo_paso          TEXT,
  proxima_fecha         DATE,

  -- oferta económica
  moneda                TEXT NOT NULL DEFAULT 'MXN',      -- MXN | USD
  periodo               TEXT NOT NULL DEFAULT 'mensual',  -- mensual | anual
  sueldo_min            NUMERIC(12,2) DEFAULT 0,
  sueldo_max            NUMERIC(12,2) DEFAULT 0,
  aguinaldo_dias        NUMERIC(5,1)  DEFAULT 15,
  vacaciones_dias       NUMERIC(5,1)  DEFAULT 12,
  prima_vacacional_pct  NUMERIC(5,2)  DEFAULT 25,
  vales_mensual         NUMERIC(12,2) DEFAULT 0,
  fondo_ahorro_pct      NUMERIC(5,2)  DEFAULT 0,
  bono_anual            NUMERIC(12,2) DEFAULT 0,
  ptu_anual             NUMERIC(12,2) DEFAULT 0,
  valor_seguros         NUMERIC(12,2) DEFAULT 0,
  bono_firma            NUMERIC(12,2) DEFAULT 0,          -- pago único, solo año 1

  -- modalidad y ubicación
  modalidad             TEXT     DEFAULT 'presencial',
  dias_oficina          SMALLINT DEFAULT 5,
  ciudad                TEXT,
  traslado_mensual      NUMERIC(12,2) DEFAULT 0,
  horas_traslado_semana NUMERIC(5,1)  DEFAULT 0,
  apoyo_home_office     NUMERIC(12,2) DEFAULT 0,          -- LFT art. 330-E, mensual

  -- si implica mudarte
  reubicacion           BOOLEAN DEFAULT FALSE,
  apoyo_reubicacion     NUMERIC(12,2) DEFAULT 0,          -- pago único, solo año 1
  renta_nueva           NUMERIC(12,2) DEFAULT 0,
  ajuste_costo_vida     NUMERIC(5,2)  DEFAULT 0,          -- % sobre tus otros gastos

  requisitos            TEXT,                              -- separado por comas
  notas                 TEXT,

  activo                BOOLEAN DEFAULT TRUE,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS empleo_vacantes_estado_idx ON empleo_vacantes (estado) WHERE activo;
CREATE INDEX IF NOT EXISTS empleo_vacantes_proxima_idx ON empleo_vacantes (proxima_fecha) WHERE activo;

-- ─────────────────────────────────────────────────────────────
-- Certificaciones
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS empleo_certificaciones (
  id             BIGSERIAL PRIMARY KEY,
  nombre         TEXT NOT NULL,
  proveedor      TEXT,
  -- planeada | estudiando | agendada | obtenida | expirada
  estado         TEXT NOT NULL DEFAULT 'planeada',
  avance         SMALLINT DEFAULT 0,
  fecha_objetivo DATE,
  fecha_examen   DATE,
  costo          NUMERIC(12,2) DEFAULT 0,
  vigencia_anios SMALLINT DEFAULT 3,
  obtenida_el    DATE,
  notas          TEXT,
  activo         BOOLEAN DEFAULT TRUE,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- Semilla: tu situación actual en Resideo.
-- Los campos que el análisis de Xylem no menciona quedan en cero
-- a propósito — complétalos en la pestaña "Mi base".
-- ─────────────────────────────────────────────────────────────
INSERT INTO empleo_perfil (
  id, empresa_actual, puesto_actual, ciudad,
  sueldo_bruto, aguinaldo_dias, vacaciones_dias, prima_vacacional_pct,
  vales_mensual, fondo_ahorro_pct, ptu_anual, valor_seguros, deuda_colegiatura,
  modalidad, dias_oficina, traslado_mensual, horas_traslado_semana,
  renta_mensual, otros_gastos_mensual,
  umbral_pct, tipo_cambio, escuela
) VALUES (
  1, 'Resideo', 'Supplier Master Data', 'Ciudad Juárez',
  31724, 17, 16, 45,
  3302, 13, 15645, 12000, 17364,
  'presencial', 5, 0, 0,
  0, 14000,
  20, 17.50, 'UNITEC'
) ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- RLS al final, a propósito: en este proyecto algo lo reactiva al
-- crear tablas en public, y con RLS activo y cero políticas
-- PostgREST devuelve 200 con lista vacía — parece "sin datos"
-- cuando en realidad es "sin permiso". Ejecutarlo de último gana.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE empleo_perfil          DISABLE ROW LEVEL SECURITY;
ALTER TABLE empleo_vacantes        DISABLE ROW LEVEL SECURITY;
ALTER TABLE empleo_certificaciones DISABLE ROW LEVEL SECURITY;

-- Verificación: las tres deben salir con rls_activo = false.
SELECT relname AS tabla, relrowsecurity AS rls_activo
FROM pg_class
WHERE relname IN ('empleo_perfil','empleo_vacantes','empleo_certificaciones');
