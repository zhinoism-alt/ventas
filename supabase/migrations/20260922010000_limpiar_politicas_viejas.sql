-- Limpiar politicas de RLS que quedaron de un intento anterior a esta sesion.
--
-- Al activar RLS (20260922000000_rls.sql) aparecieron 18 tablas con dos
-- politicas de mas, ademas de la nueva "clerk_autenticados":
--
--   - "anon_all": FOR ALL TO anon USING (true) WITH CHECK (true).
--     Esta era el hoyo real: le daba paso total al rol anonimo, la misma
--     anon key que va en el bundle publico. Con ella ahi, activar RLS no
--     cerraba nada en esas 18 tablas -- solo se veia cerrado.
--
--   - "auth_all": FOR ALL TO authenticated USING (true) WITH CHECK (true).
--     Identica en efecto a "clerk_autenticados", puro sobrante.
--
-- Verificado antes de borrar: una consulta anonima (solo la anon key, sin
-- token de Clerk) contra una de estas tablas volvia [] despues de quitar
-- "anon_all" -- 200 OK con cero filas, que es como RLS bloquea sin verse
-- como un error. La misma consulta con el token de Clerk seguia trayendo
-- datos reales.

DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname = 'public' AND policyname IN ('anon_all', 'auth_all')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, p.tablename);
  END LOOP;
END $$;

-- Verificacion: debe devolver 0 filas (cada tabla, exactamente 1 politica).
SELECT tablename, count(*) AS politicas
FROM pg_policies WHERE schemaname = 'public'
GROUP BY tablename HAVING count(*) <> 1;
