-- Reportes en PDF: lo ultimo que quedaba colgando del backend de Node.
--
-- La pestana Reportes ya estaba casi toda en Supabase: getSummary y
-- getMonthlyReport leen de products/sales/iptv_*, el Excel se arma en el
-- navegador con XLSX, y la descarga usa una URL firmada de Storage.
--
-- Faltaban dos piezas que nunca se crearon, asi que la seccion fallaba entera:
--   1. La tabla pdf_reportes. La consulta devolvia 404 (PGRST205).
--   2. El bucket pdf-reportes. La descarga no tenia de donde.
--
-- La subida si funciona: POST /api/pdf/upload es una funcion serverless de
-- Vercel, no un backend aparte, y esta bien escrita — verifica el token de
-- Clerk y sube con service_role del lado del servidor, que es lo correcto para
-- estados de cuenta. Lo que la tiraba era un import roto, arreglado aparte.

CREATE TABLE IF NOT EXISTS pdf_reportes (
  id           BIGSERIAL PRIMARY KEY,
  -- El id de Clerk. La pagina ya filtra por el.
  user_id      TEXT NOT NULL,
  nombre       TEXT NOT NULL,
  tipo         TEXT NOT NULL DEFAULT 'mixto' CHECK (tipo IN ('gastos', 'ingresos', 'mixto')),
  mes          SMALLINT NOT NULL CHECK (mes BETWEEN 1 AND 12),
  anio         SMALLINT NOT NULL,
  monto_total  NUMERIC(12,2),
  notas        TEXT,
  -- Ruta dentro del bucket, no una URL: las URL firmadas caducan.
  storage_path TEXT NOT NULL,
  tamano_bytes BIGINT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pdf_reportes_usuario
  ON pdf_reportes (user_id, anio DESC, mes DESC);

ALTER TABLE pdf_reportes DISABLE ROW LEVEL SECURITY;

-- ── El bucket ──────────────────────────────────────────────────────────────
-- Privado a proposito: son estados de cuenta. Se leen con URL firmada de 60
-- segundos, que es lo que ya hace la pagina.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('pdf-reportes', 'pdf-reportes', FALSE, 20971520, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;
