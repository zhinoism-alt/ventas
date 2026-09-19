import { AlertTriangle } from 'lucide-react'

/**
 * Aviso de carga fallida.
 *
 * Sin esto, una consulta que falla deja la pagina vacia y parece "no hay
 * datos" cuando en realidad es "no se pudo leer" — dos cosas muy distintas
 * para quien mira sus ahorros o su presupuesto.
 */
export function AvisoError({ mensaje, onReintentar }: {
  mensaje: string | null
  onReintentar: () => void
}) {
  if (!mensaje) return null
  return (
    <div className="card flex items-start gap-3"
      style={{ borderColor: 'var(--red)', background: 'var(--red-soft)' }}>
      <AlertTriangle size={16} style={{ color: 'var(--red)' }} className="mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold" style={{ color: 'var(--red)' }}>
          No se pudieron cargar los datos
        </p>
        <p className="text-xs text-muted mt-0.5 break-words">{mensaje}</p>
      </div>
      <button className="btn-secondary text-xs flex-shrink-0" onClick={onReintentar}>
        Reintentar
      </button>
    </div>
  )
}
