/**
 * Thin Clerk adapter — exposes the same AuthCtx interface as before so all
 * existing components work unchanged.
 */
import { createContext, useContext, ReactNode } from 'react'
import { useUser, useClerk } from '@clerk/clerk-react'

interface Usuario {
  username: string
  nombre: string
  rol: 'admin' | 'editor'
}

interface AuthCtx {
  usuario: Usuario | null
  cargando: boolean
  logout: () => Promise<void>
}

const Ctx = createContext<AuthCtx>(null!)

export function AuthProvider({ children }: { children: ReactNode }) {
  const { user, isLoaded } = useUser()
  const { signOut } = useClerk()

  const usuario: Usuario | null = user
    ? {
        username: user.username ?? user.emailAddresses[0]?.emailAddress ?? '',
        nombre: user.fullName ?? user.firstName ?? user.username ?? 'Usuario',
        rol: ((user.publicMetadata as any)?.rol as 'admin' | 'editor') ?? 'editor',
      }
    : null

  return (
    <Ctx.Provider value={{ usuario, cargando: !isLoaded, logout: () => signOut() }}>
      {children}
    </Ctx.Provider>
  )
}

export const useAuth = () => useContext(Ctx)
