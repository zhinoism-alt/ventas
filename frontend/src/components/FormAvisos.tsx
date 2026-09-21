import { AlertCircle, RotateCcw } from 'lucide-react'
import type { Borrador } from '../lib/useDraft'

/* ═══════════════════════════════════════════════════════════════════════════
   Los dos avisos que le faltaban a todos los formularios de VentasPro.

   El primero, porque la validacion era un `return` mudo: si faltaba un campo,
   el boton no hacia nada y no habia ninguna pista de por que. Lo mismo si la
   insercion fallaba del lado de Supabase.

   El segundo, porque ahora lo escrito se guarda solo. Recuperar el borrador en
   silencio seria peor que perderlo: verias campos llenos sin saber de donde
   salieron. Se avisa y se ofrece empezar de cero.
   ═══════════════════════════════════════════════════════════════════════════ */

export function AvisoForm({ mensaje }: { mensaje: string | null }) {
  if (!mensaje) return null
  return (
    <div className="flex items-start gap-2 mt-4 px-3 py-2.5 rounded-lg"
      style={{ background: 'var(--red-soft)' }}>
      <AlertCircle size={14} style={{ color: 'var(--red)' }} className="mt-0.5 flex-shrink-0" />
      <p className="text-xs break-words" style={{ color: 'var(--red)' }}>{mensaje}</p>
    </div>
  )
}

/** Aviso de "dejaste algo a medio llenar" para formularios dentro de un modal. */
export function AvisoRescate({ que, onRetomar, onDescartar }: {
  que: string
  onRetomar: () => void
  onDescartar: () => void
}) {
  return (
    <div className="card flex items-center gap-3 py-3 flex-wrap"
      style={{ background: 'var(--cyan-soft)', borderColor: 'var(--cyan)' }}>
      <RotateCcw size={15} style={{ color: 'var(--cyan)' }} className="flex-shrink-0" />
      <p className="text-sm flex-1 min-w-0" style={{ color: 'var(--cyan)' }}>
        Dejaste {que} a medio llenar.
      </p>
      <button className="btn-secondary text-xs" onClick={onRetomar}>Retomar</button>
      <button className="btn-secondary text-xs" onClick={onDescartar}>Descartar</button>
    </div>
  )
}

export function BorradorRecuperado<T extends object>({ b }: { b: Borrador<T> }) {
  if (!b.recuperado) return null
  return (
    <div className="flex items-center gap-2 mt-4 px-3 py-2.5 rounded-lg flex-wrap"
      style={{ background: 'var(--cyan-soft)' }}>
      <RotateCcw size={14} style={{ color: 'var(--cyan)' }} className="flex-shrink-0" />
      <p className="text-xs flex-1" style={{ color: 'var(--cyan)' }}>
        Recuperé lo que habías escrito la última vez.
      </p>
      <button onClick={b.aceptar} className="btn-secondary text-xs">Está bien</button>
      <button onClick={b.limpiar} className="btn-secondary text-xs">Empezar de cero</button>
    </div>
  )
}
