-- Un gasto con fondo_id hoy solo dice "de aqui salio el dinero" (retiro): usar
-- ahorro ya guardado no es gasto nuevo del periodo, y por eso se va a excluir
-- del Reporte. Pero aportar A un fondo (meter dinero nuevo al ahorro) si es
-- una salida real de dinero liquido de este periodo, y hay que poder
-- distinguir los dos casos -- hoy son indistinguibles con solo fondo_id.
ALTER TABLE movimientos
  ADD COLUMN IF NOT EXISTS es_aportacion BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN movimientos.es_aportacion IS
  'Solo aplica a gastos con fondo_id: true = aportacion al fondo (cuenta como gasto del periodo), false/default = retiro del fondo (no cuenta, ya estaba ahorrado).';
