import { useCallback, useEffect, useRef, useState } from 'react'

/* ═══════════════════════════════════════════════════════════════════════════
   Borradores de formulario que sobreviven a cualquier cosa.

   El sintoma era siempre el mismo: escribes media vacante, o medio fondo, algo
   hace que el arbol se vuelva a montar, y lo escrito desaparece. Las causas son
   varias y no todas estan bajo nuestro control: Clerk revalida la sesion y
   LayoutProtegido desmonta la pagina entera, el navegador descarta la pestana
   en el movil, se recarga sin querer, se le da a Cancelar por error.

   En vez de perseguir cada causa, quitamos la consecuencia. Cada formulario
   guarda lo que escribes en localStorage mientras lo escribes, y lo recupera al
   montarse. Al guardar con exito se limpia. Si el borrador queda ahi, la pagina
   lo dice y ofrece descartarlo.
   ═══════════════════════════════════════════════════════════════════════════ */

const PREFIJO = 'vp-borrador:'

function leer<T>(clave: string, inicial: T): { valor: T; recuperado: boolean } {
  try {
    const crudo = localStorage.getItem(PREFIJO + clave)
    if (!crudo) return { valor: inicial, recuperado: false }
    const guardado = JSON.parse(crudo)
    if (!guardado || typeof guardado !== 'object') return { valor: inicial, recuperado: false }
    // Mezclamos sobre el inicial para que un campo nuevo del formulario no
    // llegue undefined desde un borrador viejo.
    return { valor: { ...inicial, ...guardado }, recuperado: true }
  } catch {
    // Modo privado, cuota llena, JSON corrupto. Nada de esto justifica romper.
    return { valor: inicial, recuperado: false }
  }
}

/** true si el formulario tiene algo que valga la pena conservar. */
function tieneContenido(v: unknown, inicial: unknown): boolean {
  if (typeof v !== 'object' || v === null) return false
  const ini = (inicial ?? {}) as Record<string, unknown>
  return Object.entries(v as Record<string, unknown>).some(([k, val]) => {
    if (val === ini[k]) return false
    if (val === '' || val == null || val === false) return false
    return true
  })
}

export interface Borrador<T> {
  valor: T
  set: React.Dispatch<React.SetStateAction<T>>
  /** Cambia un solo campo. `set('nombre', 'x')` */
  campo: <K extends keyof T>(k: K, v: T[K]) => void
  /** Vacia el formulario y borra el borrador. Usalo tras guardar con exito. */
  limpiar: () => void
  /** true si al montar habia un borrador de una sesion anterior. */
  recuperado: boolean
  /** Olvida el aviso de recuperado sin tocar los valores. */
  aceptar: () => void
}

/* ───────────────────────────────────────────────────────────────────────────
   Variante para formularios que viven dentro de un modal.

   Ahi no sirve el borrador normal: cuando el arbol se vuelve a montar el modal
   se cierra, y al reabrirlo el propio codigo suele reiniciar los campos. Asi
   que lo que se espeja es el contenido *mientras el modal esta abierto*, y al
   volver se ofrece retomarlo en vez de restaurarlo a escondidas.

   `valor` se pasa como null cuando el modal esta cerrado. Cerrar a proposito
   (Cancelar, o guardar bien) limpia el rescate, que es justo lo que se quiere.
   ─────────────────────────────────────────────────────────────────────────── */
export function useRescate<T>(clave: string, valor: T | null) {
  const [rescate, setRescate] = useState<T | null>(() => {
    try {
      const crudo = localStorage.getItem(PREFIJO + clave)
      return crudo ? (JSON.parse(crudo) as T) : null
    } catch { return null }
  })

  useEffect(() => {
    try {
      if (valor) localStorage.setItem(PREFIJO + clave, JSON.stringify(valor))
      else localStorage.removeItem(PREFIJO + clave)
    } catch { /* sin almacenamiento: el formulario funciona igual */ }
  }, [clave, valor])

  const descartar = useCallback(() => {
    setRescate(null)
    try { localStorage.removeItem(PREFIJO + clave) } catch { /* ignorar */ }
  }, [clave])

  return { rescate, descartar }
}

export function useDraft<T extends object>(clave: string, inicial: T): Borrador<T> {
  // El inicial suele venir como literal inline, asi que cambia de identidad en
  // cada render. Lo congelamos en la primera pasada.
  const iniRef = useRef(inicial)
  const primera = useRef(leer(clave, iniRef.current))

  const [valor, set] = useState<T>(primera.current.valor)
  const [recuperado, setRecuperado] = useState(primera.current.recuperado)

  // Persistimos en cada cambio. Es sincronico y diminuto; un debounce aqui solo
  // abriria una ventana en la que se pierde justo lo ultimo que escribiste.
  useEffect(() => {
    try {
      if (tieneContenido(valor, iniRef.current)) {
        localStorage.setItem(PREFIJO + clave, JSON.stringify(valor))
      } else {
        localStorage.removeItem(PREFIJO + clave)
      }
    } catch { /* sin almacenamiento: el formulario sigue funcionando igual */ }
  }, [clave, valor])

  const limpiar = useCallback(() => {
    set(iniRef.current)
    setRecuperado(false)
    try { localStorage.removeItem(PREFIJO + clave) } catch { /* ignorar */ }
  }, [clave])

  const campo = useCallback(<K extends keyof T>(k: K, v: T[K]) => {
    set(prev => ({ ...prev, [k]: v }))
  }, [])

  const aceptar = useCallback(() => setRecuperado(false), [])

  return { valor, set, campo, limpiar, recuperado, aceptar }
}
