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
        const token = await window.Clerk?.session?.getToken({ template: 'supabase' })
        const headers = new Headers(init.headers as HeadersInit | undefined)
        if (token) headers.set('Authorization', `Bearer ${token}`)
        return fetch(url, { ...init, headers })
      }
    }
  }
)
