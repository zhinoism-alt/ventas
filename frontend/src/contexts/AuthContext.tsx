/**
 * Adaptador delgado sobre Clerk: expone la misma interfaz AuthCtx de antes para
 * que ningun componente tenga que cambiar.
 *
 * Dos detalles que no son cosmeticos:
 *
 * 1. El value va memoizado. Sin useMemo se crea un objeto nuevo en cada render
 *    del provider y todos los consumidores se vuelven a renderizar con el.
 *
 * 2. `cargando` solo es true la primera vez. Clerk vuelve a poner isLoaded en
 *    false cuando revalida la sesion (y en una instancia de desarrollo, sobre
 *    un dominio *.clerk.accounts.dev, eso pasa seguido). Como LayoutProtegido
 *    desmonta el arbol entero mientras `cargando`, ese parpadeo tiraba la
 *    pagina completa: formularios a medio llenar, pestana activa, scroll. Una
 *    vez que sabemos quien eres, un parpadeo de revalidacion ya no desmonta
 *    nada; solo un cierre de sesion real lo hace.
 */
import { createContext, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react'
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

  // Se levanta la primera vez que Clerk resuelve, y ya no vuelve a bajar.
  const [resuelto, setResuelto] = useState(false)
  useEffect(() => { if (isLoaded) setResuelto(true) }, [isLoaded])

  // Durante una revalidacion Clerk puede devolver user=null un instante. Si ya
  // teniamos usuario, conservamos el anterior mientras isLoaded sea false: es
  // un hueco tecnico, no un cierre de sesion.
  const ultimo = useRef<Usuario | null>(null)

  const usuario = useMemo<Usuario | null>(() => {
    if (user) {
      ultimo.current = {
        username: user.username ?? user.emailAddresses[0]?.emailAddress ?? '',
        nombre: user.fullName ?? user.firstName ?? user.username ?? 'Usuario',
        rol: ((user.publicMetadata as Record<string, unknown>)?.rol as 'admin' | 'editor') ?? 'editor',
      }
      return ultimo.current
    }
    if (!isLoaded) return ultimo.current   // parpadeo: sostenemos el anterior
    ultimo.current = null                  // cierre de sesion de verdad
    return null
  }, [user, isLoaded])

  const cerrar = useMemo(() => async () => {
    ultimo.current = null
    await signOut()
  }, [signOut])

  const value = useMemo<AuthCtx>(
    () => ({ usuario, cargando: !resuelto, logout: cerrar }),
    [usuario, resuelto, cerrar],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useAuth = () => useContext(Ctx)
