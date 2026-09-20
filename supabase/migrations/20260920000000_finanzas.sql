-- Rendimiento real, PPR, AFORE e INFONAVIT
--
-- El rendimiento nominal de una cuenta no dice nada por si solo. Lo que
-- importa es lo que queda despues del ISR y de la inflacion, y eso depende
-- de tres cosas que casi nunca se ven juntas:
--   1. El ISR se retiene sobre el CAPITAL, no sobre el interes (LIF art. 24).
--      En 2026 es 0.90% anual; en 2025 era 0.50%.
--   2. Las tasas promocionales tienen tope. Arriba del tope aplica otra tasa.
--   3. La inflacion se come el resto. Con 3.26% anual, 10% nominal son ~6% real.

CREATE TABLE IF NOT EXISTS ahorros_cuentas (
  id           BIGSERIAL PRIMARY KEY,
  nombre       TEXT NOT NULL,
  institucion  TEXT,
  -- banco  -> IPAB cubre hasta 400,000 UDI
  -- sofipo -> fondo de proteccion propio, hasta 25,000 UDI
  tipo         TEXT NOT NULL DEFAULT 'banco'
                 CHECK (tipo IN ('banco','sofipo','cetes','otro')),
  saldo        NUMERIC(14,2) NOT NULL DEFAULT 0,
  tasa_promo   NUMERIC(6,3)  NOT NULL DEFAULT 0,   -- % anual
  tope_promo   NUMERIC(14,2) NOT NULL DEFAULT 0,   -- hasta este monto
  tasa_base    NUMERIC(6,3)  NOT NULL DEFAULT 0,   -- sobre el excedente
  notas        TEXT,
  activo       BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

-- Una sola fila (id = 1): parametros fiscales + retiro + vivienda
CREATE TABLE IF NOT EXISTS finanzas_perfil (
  id                     BIGSERIAL PRIMARY KEY,

  -- parametros que cambian cada anio
  isr_retencion_pct      NUMERIC(6,3) NOT NULL DEFAULT 0.90,  -- LIF 2026, sobre capital
  isr_marginal_pct       NUMERIC(6,3) NOT NULL DEFAULT 30,    -- tu tasa marginal
  inflacion_pct          NUMERIC(6,3) NOT NULL DEFAULT 3.26,  -- INPC anual
  udi                    NUMERIC(10,6) NOT NULL DEFAULT 8.82,

  -- PPR
  ppr_producto           TEXT,
  ppr_poliza             TEXT,
  ppr_prima_anual_udi    NUMERIC(12,2) DEFAULT 0,
  ppr_saldo_udi          NUMERIC(12,2) DEFAULT 0,
  ppr_inicio             DATE,
  ppr_suma_asegurada_udi NUMERIC(12,2) DEFAULT 0,
  ppr_rend_garantizado   NUMERIC(6,3)  DEFAULT 0,

  -- AFORE
  afore_nombre           TEXT,
  afore_retiro           NUMERIC(14,2) DEFAULT 0,
  afore_vivienda         NUMERIC(14,2) DEFAULT 0,
  afore_rendimiento_12m  NUMERIC(14,2) DEFAULT 0,
  afore_comisiones_12m   NUMERIC(14,2) DEFAULT 0,
  afore_corte            DATE,

  -- INFONAVIT
  infonavit_credito      NUMERIC(14,2) DEFAULT 0,
  infonavit_tasa         NUMERIC(6,3)  DEFAULT 0,
  infonavit_cat          NUMERIC(6,3)  DEFAULT 0,
  infonavit_meses        SMALLINT      DEFAULT 0,
  infonavit_retencion    NUMERIC(12,2) DEFAULT 0,  -- sale de tu nomina
  infonavit_patron       NUMERIC(12,2) DEFAULT 0,  -- aportacion patronal
  infonavit_fpp          NUMERIC(12,2) DEFAULT 0,  -- fondo de proteccion de pagos

  updated_at             TIMESTAMPTZ DEFAULT now()
);

-- Idempotente por institucion. `ON CONFLICT DO NOTHING` no servia aqui:
-- la unica restriccion unica es el id BIGSERIAL, que se genera solo y nunca
-- choca, asi que volver a correr la migracion duplicaba las cuentas y el
-- capital se contaba doble.
INSERT INTO ahorros_cuentas (nombre, institucion, tipo, saldo, tasa_promo, tope_promo, tasa_base, notas)
SELECT 'Cuenta de ahorro', 'Open Bank', 'banco', 25743.67, 13, 30000, 0,
       'Tasa promocional al 13% sobre los primeros 30,000. Falta confirmar que tasa aplica arriba del tope.'
WHERE NOT EXISTS (SELECT 1 FROM ahorros_cuentas WHERE institucion = 'Open Bank');

INSERT INTO ahorros_cuentas (nombre, institucion, tipo, saldo, tasa_promo, tope_promo, tasa_base, notas)
SELECT 'Cuenta de ahorro', 'Mifel', 'banco', 72039.04, 10, 500000, 0,
       'Tasa del 10% hasta 500,000, asi que todo el saldo esta dentro del tope.'
WHERE NOT EXISTS (SELECT 1 FROM ahorros_cuentas WHERE institucion = 'Mifel');

INSERT INTO finanzas_perfil (
  id, isr_retencion_pct, isr_marginal_pct, inflacion_pct, udi,
  ppr_producto, ppr_poliza, ppr_prima_anual_udi, ppr_saldo_udi, ppr_inicio,
  ppr_suma_asegurada_udi, ppr_rend_garantizado,
  afore_nombre, afore_retiro, afore_vivienda, afore_rendimiento_12m, afore_comisiones_12m, afore_corte,
  infonavit_credito, infonavit_tasa, infonavit_cat, infonavit_meses,
  infonavit_retencion, infonavit_patron, infonavit_fpp
) VALUES (
  1, 0.90, 30, 3.26, 8.8205,
  'Imagina Ser 65 - 15 pagos UDI', 'VI0002903087', 4568.86, 2607.52, '2025-04-10',
  100000, 1.0,
  'Profuturo', 214050.16, 114199.46, 15926.24, 815.75, '2026-08-31',
  1162589.02, 10.45, 12.20, 198,
  10817.38, 1771.91, 211.85
) ON CONFLICT (id) DO NOTHING;

ALTER TABLE ahorros_cuentas  DISABLE ROW LEVEL SECURITY;
ALTER TABLE finanzas_perfil  DISABLE ROW LEVEL SECURITY;

-- Verificacion: 2 cuentas, 1 perfil, y cero instituciones repetidas.
SELECT 'cuentas'        AS concepto, count(*)::text AS valor FROM ahorros_cuentas
UNION ALL SELECT 'perfil',            count(*)::text FROM finanzas_perfil
UNION ALL SELECT 'instituciones dup', coalesce(string_agg(institucion, ', '), 'ninguna')
  FROM (SELECT institucion FROM ahorros_cuentas GROUP BY institucion HAVING count(*) > 1) d;

-- ─────────────────────────────────────────────────────────────────────
-- Si corriste la version anterior mas de una vez, las cuentas quedaron
-- duplicadas y el capital se cuenta doble. Esto conserva la mas reciente
-- de cada institucion y desactiva el resto. Descomentalo solo si la
-- verificacion de arriba reporta instituciones repetidas.
-- ─────────────────────────────────────────────────────────────────────
-- UPDATE ahorros_cuentas SET activo = FALSE
-- WHERE id NOT IN (
--   SELECT max(id) FROM ahorros_cuentas WHERE activo GROUP BY institucion
-- );
