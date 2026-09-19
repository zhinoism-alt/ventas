-- ═══════════════════════════════════════════════════════════════════════════
-- RLS: cerrar el acceso anonimo a todas las tablas.
--
-- ⚠️  NO CORRAS ESTO TODAVIA.  Es el ULTIMO paso de supabase/RLS.md.
--
-- Hoy RLS esta apagado y la anon key viaja en el bundle publico del navegador:
-- cualquiera con la URL desplegada puede leer y escribir el presupuesto, los
-- ahorros y el sueldo. Esta migracion lo cierra.
--
-- Si la corres ANTES de que Clerk este registrado como Third-Party Auth en
-- Supabase y VITE_SUPABASE_CLERK_AUTH este en true, la app se queda ciega:
-- las consultas seguiran yendo como anon y ya no habra politica que las deje
-- pasar. Al final del archivo esta la reversa por si eso pasa.
--
-- Las funciones serverless (crons, sheets) usan SERVICE_ROLE_KEY, que ignora
-- RLS por diseno: no se ven afectadas.
-- ═══════════════════════════════════════════════════════════════════════════

-- Recorre todas las tablas de public en vez de listarlas: una tabla nueva que
-- alguien olvide agregar aqui quedaria abierta, y ese es justo el error caro.
DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);

    -- Una sola politica, para los tres que usan la app. No hay datos por
    -- usuario que separar: es un sistema domestico compartido, y fingir
    -- aislamiento por fila daria una falsa sensacion de seguridad.
    EXECUTE format('DROP POLICY IF EXISTS "clerk_autenticados" ON public.%I', t.tablename);
    EXECUTE format(
      'CREATE POLICY "clerk_autenticados" ON public.%I '
      'FOR ALL TO authenticated USING (true) WITH CHECK (true)', t.tablename);
  END LOOP;
END $$;

-- ── Verificacion ───────────────────────────────────────────────────────────
-- rls_activo debe ser true y politicas = 1 en TODAS las filas.
SELECT c.relname                AS tabla,
       c.relrowsecurity         AS rls_activo,
       count(p.polname)         AS politicas
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE n.nspname = 'public' AND c.relkind = 'r'
GROUP BY c.relname, c.relrowsecurity
ORDER BY c.relrowsecurity, c.relname;

-- ── Reversa de emergencia ──────────────────────────────────────────────────
-- Si la app se queda sin leer nada, corre ESTO para volver al estado anterior
-- (inseguro, pero funcionando) mientras se arregla la integracion:
--
-- DO $$
-- DECLARE t record;
-- BEGIN
--   FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
--   LOOP
--     EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t.tablename);
--   END LOOP;
-- END $$;
