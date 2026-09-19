import { createClient } from '@supabase/supabase-js'

// Fallbacks para desarrollo local (anon key es pública por diseño en Supabase)
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://kydfkrrjhmliybtuymuf.supabase.co'
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt5ZGZrcnJqaG1saXlidHV5bXVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyODA5MjQsImV4cCI6MjA5MTg1NjkyNH0.qcRu96c57g5Z-vit_gjb5n-WY6gTxZ1w5x8CXLd4bSE'

// RLS está deshabilitado en todas las tablas — anon key es suficiente para uso local personal
// El custom fetch con Clerk JWT fue eliminado porque inyectaba un JWT sin template configurado,
// lo que sobreescribía el header Authorization de Supabase causando 401 en todas las queries.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
