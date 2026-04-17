import { createClient } from '@supabase/supabase-js'

declare global {
  interface Window {
    Clerk?: {
      session?: {
        getToken: (opts?: { template?: string }) => Promise<string | null>
      }
    }
  }
}

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    global: {
      fetch: async (url, init = {}) => {
        let token: string | null = null
        try {
          // Tries Clerk JWT template 'supabase' if configured — falls back to anon key
          token = await window.Clerk?.session?.getToken({ template: 'supabase' }) ?? null
        } catch {
          // Template not set up yet — anon key will be used (RLS allows anon for this personal app)
        }
        const headers = new Headers(init.headers as HeadersInit | undefined)
        if (token) headers.set('Authorization', `Bearer ${token}`)
        return fetch(url, { ...init, headers })
      }
    }
  }
)
