-- ──────────────────────────────────────────────────────────────────────────────
-- Anon access policies — allows the Supabase anon key to read/write
-- This is safe for a personal app where page-level auth is handled by Clerk
-- ──────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  -- Core business tables
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='products' AND policyname='anon_all') THEN CREATE POLICY "anon_all" ON products FOR ALL TO anon USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='sales' AND policyname='anon_all') THEN CREATE POLICY "anon_all" ON sales FOR ALL TO anon USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='iptv_packages' AND policyname='anon_all') THEN CREATE POLICY "anon_all" ON iptv_packages FOR ALL TO anon USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='iptv_clients' AND policyname='anon_all') THEN CREATE POLICY "anon_all" ON iptv_clients FOR ALL TO anon USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='iptv_subscriptions' AND policyname='anon_all') THEN CREATE POLICY "anon_all" ON iptv_subscriptions FOR ALL TO anon USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='exchange_rates' AND policyname='anon_all') THEN CREATE POLICY "anon_all" ON exchange_rates FOR ALL TO anon USING (true) WITH CHECK (true); END IF;
  -- Life OS tables
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='presupuesto' AND policyname='anon_all') THEN CREATE POLICY "anon_all" ON presupuesto FOR ALL TO anon USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ahorros' AND policyname='anon_all') THEN CREATE POLICY "anon_all" ON ahorros FOR ALL TO anon USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ahorros_movimientos' AND policyname='anon_all') THEN CREATE POLICY "anon_all" ON ahorros_movimientos FOR ALL TO anon USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='mudanza_tareas' AND policyname='anon_all') THEN CREATE POLICY "anon_all" ON mudanza_tareas FOR ALL TO anon USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='mudanza_presupuesto' AND policyname='anon_all') THEN CREATE POLICY "anon_all" ON mudanza_presupuesto FOR ALL TO anon USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pareja_gastos' AND policyname='anon_all') THEN CREATE POLICY "anon_all" ON pareja_gastos FOR ALL TO anon USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pareja_metas' AND policyname='anon_all') THEN CREATE POLICY "anon_all" ON pareja_metas FOR ALL TO anon USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='habitos' AND policyname='anon_all') THEN CREATE POLICY "anon_all" ON habitos FOR ALL TO anon USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='habitos_registros' AND policyname='anon_all') THEN CREATE POLICY "anon_all" ON habitos_registros FOR ALL TO anon USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='recordatorios' AND policyname='anon_all') THEN CREATE POLICY "anon_all" ON recordatorios FOR ALL TO anon USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='sheets_config' AND policyname='anon_all') THEN CREATE POLICY "anon_all" ON sheets_config FOR ALL TO anon USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='sheets_datos' AND policyname='anon_all') THEN CREATE POLICY "anon_all" ON sheets_datos FOR ALL TO anon USING (true) WITH CHECK (true); END IF;
END $$;
