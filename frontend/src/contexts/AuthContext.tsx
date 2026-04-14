import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import api from '../lib/api'

interface Usuario {
  username: string
  nombre: string
  rol: 'admin' | 'editor'
}

interface AuthCtx {
  usuario: Usuario | null
  cargando: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const Ctx = createContext<AuthCtx>(null!)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    api.get('/auth/me')
      .then(r => setUsuario(r.data))
      .catch(() => setUsuario(null))
      .finally(() => setCargando(false))
  }, [])

  const login = async (username: string, password: string) => {
    const r = await api.post('/auth/login', { username, password })
    setUsuario(r.data)
  }

  const logout = async () => {
    await api.post('/auth/logout')
    setUsuario(null)
  }

  return (
    <Ctx.Provider value={{ usuario, cargando, login, logout }}>
      {children}
    </Ctx.Provider>
  )
}

export const useAuth = () => useContext(Ctx)
