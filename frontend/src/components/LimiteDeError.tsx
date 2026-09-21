import { Component, ReactNode } from 'react'
import { AlertTriangle, RotateCcw, Home, WifiOff } from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════════════════
   Limite de error a nivel de ruta.

   Antes el unico limite estaba en main.tsx, envolviendo a <App/> entero. Eso
   significaba que cualquier fallo en una pagina desmontaba tambien la barra
   lateral y el encabezado del movil: te quedabas con una pantalla que solo
   ofrecia "Recargar pagina", sin manera de volver al menu. En el telefono, que
   es donde mas pasa, eso deja la aplicacion inservible hasta recargar a mano.

   Este limite vive DENTRO del <main>, asi que el menu sobrevive: el error se
   queda en el area de contenido y puedes irte a otra seccion.

   Caso aparte: cuando falla la carga de un modulo diferido. Las paginas van con
   lazy(), y sus archivos llevan un hash en el nombre que cambia en cada
   despliegue. Un navegador con el index.html viejo en cache pide un archivo que
   ya no existe y el import revienta. No hay nada que reintentar en memoria: la
   unica salida real es recargar para traer el index nuevo. Se detecta y se hace
   una sola vez, con una marca en sessionStorage para no caer en un ciclo de
   recargas si el fallo fuera otro.
   ═══════════════════════════════════════════════════════════════════════════ */

const MARCA_RECARGA = 'vp-recarga-por-chunk'

/** Un modulo diferido que no se pudo traer. Cada navegador lo dice distinto. */
export function esErrorDeModulo(e: unknown): boolean {
  const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e ?? '')
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Failed to fetch dynamically/i
    .test(msg)
}

interface Props {
  children: ReactNode
  /** Cambia al navegar: reinicia el limite para que el error no se quede pegado. */
  claveReinicio?: string
  onIrAlInicio?: () => void
}

interface Estado {
  error: Error | null
  claveVista: string | undefined
  recargando: boolean
}

export class LimiteDeError extends Component<Props, Estado> {
  state: Estado = { error: null, claveVista: undefined, recargando: false }

  static getDerivedStateFromError(error: Error): Partial<Estado> {
    return { error }
  }

  static getDerivedStateFromProps(props: Props, state: Estado): Partial<Estado> | null {
    // Al cambiar de ruta se limpia el error: si no, una seccion rota dejaria
    // la aplicacion atorada aunque te muevas a otra.
    if (state.claveVista !== props.claveReinicio) {
      return { error: null, claveVista: props.claveReinicio }
    }
    return null
  }

  componentDidCatch(error: Error) {
    console.error('[VentasPro] la pagina fallo al renderizar', error)

    if (esErrorDeModulo(error)) {
      let yaSeRecargo = false
      try { yaSeRecargo = sessionStorage.getItem(MARCA_RECARGA) === '1' } catch { /* modo privado */ }
      if (!yaSeRecargo) {
        try { sessionStorage.setItem(MARCA_RECARGA, '1') } catch { /* ignorar */ }
        this.setState({ recargando: true })
        window.location.reload()
        return
      }
    }
    // Si llegamos hasta aqui el fallo no era de carga, o recargar ya no
    // ayudo. Limpiamos la marca para que la proxima vez si se intente.
    try { sessionStorage.removeItem(MARCA_RECARGA) } catch { /* ignorar */ }
  }

  render() {
    const { error, recargando } = this.state
    if (!error) return this.props.children

    const deModulo = esErrorDeModulo(error)

    if (recargando) {
      return (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <RotateCcw size={24} className="animate-spin accent" />
            <p className="text-sm text-muted">Trayendo la versión nueva…</p>
          </div>
        </div>
      )
    }

    return (
      <div className="max-w-lg mx-auto mt-6">
        <div className="card" style={{ borderColor: 'var(--red)' }}>
          <div className="flex items-start gap-3">
            {deModulo
              ? <WifiOff size={18} style={{ color: 'var(--red)' }} className="mt-0.5 flex-shrink-0" />
              : <AlertTriangle size={18} style={{ color: 'var(--red)' }} className="mt-0.5 flex-shrink-0" />}
            <div className="min-w-0">
              <p className="font-semibold text-strong">
                {deModulo ? 'No se pudo cargar esta sección' : 'Esta sección falló'}
              </p>
              <p className="text-sm text-muted mt-1">
                {deModulo
                  ? 'Suele ser la conexión. Las demás secciones siguen funcionando: puedes moverte por el menú mientras tanto.'
                  : 'El resto del tablero sigue bien. Puedes ir a otra sección desde el menú.'}
              </p>
            </div>
          </div>

          <div className="flex gap-2 mt-4 flex-wrap">
            <button onClick={() => this.setState({ error: null })} className="btn-primary text-sm">
              <RotateCcw size={14} /> Reintentar
            </button>
            {this.props.onIrAlInicio && (
              <button onClick={() => { this.setState({ error: null }); this.props.onIrAlInicio!() }}
                      className="btn-secondary text-sm">
                <Home size={14} /> Ir al inicio
              </button>
            )}
            <button onClick={() => window.location.reload()} className="btn-secondary text-sm">
              Recargar todo
            </button>
          </div>

          <details className="mt-4">
            <summary className="text-xs text-dim cursor-pointer">Detalle técnico</summary>
            <pre className="text-xs mt-2 p-2 rounded-lg overflow-x-auto whitespace-pre-wrap break-words"
                 style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
              {error.name}: {error.message}
            </pre>
          </details>
        </div>
      </div>
    )
  }
}
