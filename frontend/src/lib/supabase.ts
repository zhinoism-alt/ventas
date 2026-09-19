import { createClient } from '@supabase/supabase-js'

// La interfaz de Window.Clerk se declara en lib/api.ts.

// La anon key es publica por diseno en Supabase: va en el bundle del navegador.
// Lo que protege los datos NO es esconderla, es RLS. Ver supabase/RLS.md.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://kydfkrrjhmliybtuymuf.supabase.co'
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt5ZGZrcnJqaG1saXlidHV5bXVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyODA5MjQsImV4cCI6MjA5MTg1NjkyNH0.qcRu96c57g5Z-vit_gjb5n-WY6gTxZ1w5x8CXLd4bSE'

/**
 * Autenticacion con el token de Clerk, detras de bandera.
 *
 * Esta apagada a proposito. Si mandamos un JWT de Clerk antes de registrar a
 * Clerk como Third-Party Auth en Supabase, Supabase lo rechaza y TODA consulta
 * responde 401 -- que es exactamente lo que le paso a esta app desde abril.
 *
 * Orden correcto para encenderla (detalle en supabase/RLS.md):
 *   1. Clerk: agregar el claim  "role": "authenticated"  al session token.
 *   2. Supabase: Authentication -> Third-Party Auth -> agregar Clerk.
 *   3. Recien entonces poner VITE_SUPABASE_CLERK_AUTH=true y verificar que se
 *      siga leyendo bien.
 *   4. Al final, y solo al final, correr la migracion que activa RLS.
 *
 * Si getToken falla devolvemos null: el cliente cae a la anon key en vez de
 * dejar la app ciega.
 */
const USAR_CLERK = import.meta.env.VITE_SUPABASE_CLERK_AUTH === 'true'

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  USAR_CLERK
    ? {
        accessToken: async () => {
          try {
            return (await window.Clerk?.session?.getToken()) ?? null
          } catch {
            return null
          }
        },
      }
    : undefined
)

/** Para la UI: dice si las consultas van firmadas por Clerk o como anonimo. */
export const authDeClerkActiva = USAR_CLERK
