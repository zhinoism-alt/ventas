-- Correcciones a partir de la caratula de la poliza.
--
-- 1. OPCION DE LIQUIDACION: "Pago Unico". Yo habia leido en las condiciones
--    generales la clausula de "factor de rentas" y concluido que al
--    vencimiento pagan una renta mensual. Esa es la opcion por defecto del
--    producto; ESTA poliza especifica pago unico. Se entrega el saldo.
--
-- 2. La caratula separa COBERTURA de PAGO por beneficio y confirma 37/15.
--
-- 3. Y deja ver un error de mi modelo: el "costo del seguro" observado son
--    232.6 UDI al mes = 2,791 al anio sobre 97,400 en riesgo, o sea 2.87 por
--    millar. La mortalidad de un hombre de 29 anos no fumador ronda 0.5-1.0
--    por millar. Entre 28 y 57 veces mas. Ese exceso no es mortalidad: es
--    costo de adquisicion amortizado, que se extingue en los primeros anios
--    en vez de crecer.
--
--    Escalar ese cargo por los factores de mortalidad hasta el anio 37 --
--    que es lo que hacia la proyeccion anterior -- infla el costo de forma
--    artificial y por eso el fondo "se agotaba". El modelo queda marcado
--    como no confiable hasta tener el desglose de cargos de la aseguradora.

ALTER TABLE finanzas_perfil
  ADD COLUMN IF NOT EXISTS ppr_liquidacion      TEXT,
  ADD COLUMN IF NOT EXISTS ppr_cobertura_anios  SMALLINT,
  ADD COLUMN IF NOT EXISTS ppr_modelo_confiable BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS ppr_modelo_nota      TEXT;

UPDATE finanzas_perfil SET
  ppr_liquidacion      = 'Pago Unico',
  ppr_cobertura_anios  = 37,
  ppr_modelo_confiable = FALSE,
  ppr_modelo_nota      = 'El costo observado (2.87 por millar) es entre 28 y 57 veces la mortalidad '
                      || 'esperada a los 29 anios. La mayor parte es costo de adquisicion, que se '
                      || 'extingue en los primeros anios en vez de crecer con la edad. Escalarlo por '
                      || 'los factores de mortalidad infla el costo y hace que el fondo parezca '
                      || 'agotarse. Hace falta el desglose de cargos de SMNYL para proyectar bien.',
  updated_at = now()
WHERE id = 1;

SELECT ppr_liquidacion, ppr_cobertura_anios, ppr_modelo_confiable FROM finanzas_perfil WHERE id = 1;
