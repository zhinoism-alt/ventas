import { useState } from 'react'
import { Pencil, Check, X } from 'lucide-react'
import { AvisoForm } from './FormAvisos'

/* ═══════════════════════════════════════════════════════════════════════════
   Editor generico de un puñado de campos.

   Patrimonio mostraba unos cuarenta datos — saldos, tasas, topes, semanas
   cotizadas, parametros del PPR — todos de solo lectura. Venian sembrados por
   migracion y no habia forma de tocarlos desde la aplicacion: cuando el banco
   movia su tasa o se acababa una promocion, el numero se quedaba viejo y los
   calculos seguian corriendo sobre el.

   Escribir un formulario a mano por seccion habria sido cuarenta campos
   repetidos. En vez de eso, cada seccion declara que campos tiene y este
   componente arma la forma. Agregar un campo nuevo es una linea.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface Campo {
  clave: string
  etiqueta: string
  tipo?: 'numero' | 'texto' | 'fecha' | 'porcentaje' | 'dinero' | 'si-no' | 'opciones'
  ayuda?: string
  opciones?: { valor: string; texto: string }[]
  paso?: string
}

export type Valores = Record<string, string | number | boolean | null>

/** Deja los valores listos para un <input>: null y undefined molestan a React. */
function aTexto(v: unknown): string {
  if (v === null || v === undefined) return ''
  return String(v)
}

/** Convierte de vuelta al tipo que espera la base. */
function aValor(campo: Campo, texto: string): string | number | boolean | null {
  const t = campo.tipo ?? 'texto'
  if (t === 'si-no') return texto === 'true'
  if (t === 'numero' || t === 'porcentaje' || t === 'dinero') {
    if (texto.trim() === '') return 0
    const n = Number(texto)
    return Number.isFinite(n) ? n : 0
  }
  if (t === 'fecha') return texto.trim() === '' ? null : texto
  return texto
}

export function EditorCampos({ titulo, campos, valores, onGuardar, onCancelar }: {
  titulo: string
  campos: Campo[]
  valores: Valores
  onGuardar: (cambios: Valores) => Promise<string | null>
  onCancelar: () => void
}) {
  const [borrador, setBorrador] = useState<Record<string, string>>(() =>
    Object.fromEntries(campos.map(c => [c.clave, aTexto(valores[c.clave])])))
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const guardar = async () => {
    setError(null)
    setGuardando(true)
    try {
      const cambios: Valores = {}
      for (const c of campos) cambios[c.clave] = aValor(c, borrador[c.clave] ?? '')
      const err = await onGuardar(cambios)
      if (err) setError(err)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="rounded-xl p-4 mb-4" style={{ background: 'var(--surface-2)' }}>
      <p className="text-sm font-semibold text-strong mb-3">{titulo}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {campos.map(c => {
          const t = c.tipo ?? 'texto'
          const comun = {
            className: 'input w-full',
            value: borrador[c.clave] ?? '',
            onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
              setBorrador(b => ({ ...b, [c.clave]: e.target.value })),
          }
          return (
            <div key={c.clave}>
              <label className="text-xs text-muted mb-1 block">
                {c.etiqueta}
                {t === 'porcentaje' && <span className="text-dim"> (%)</span>}
              </label>

              {t === 'si-no' ? (
                <select {...comun}>
                  <option value="true">Sí</option>
                  <option value="false">No</option>
                </select>
              ) : t === 'opciones' ? (
                <select {...comun}>
                  {(c.opciones ?? []).map(o => (
                    <option key={o.valor} value={o.valor}>{o.texto}</option>
                  ))}
                </select>
              ) : (
                <input {...comun}
                  type={t === 'fecha' ? 'date'
                      : (t === 'numero' || t === 'porcentaje' || t === 'dinero') ? 'number' : 'text'}
                  step={c.paso ?? (t === 'porcentaje' ? '0.01' : t === 'dinero' ? '0.01' : undefined)} />
              )}

              {c.ayuda && <p className="text-xs text-dim mt-1">{c.ayuda}</p>}
            </div>
          )
        })}
      </div>

      <AvisoForm mensaje={error} />

      <div className="flex gap-2 mt-4">
        <button onClick={guardar} disabled={guardando} className="btn-primary text-sm">
          <Check size={14} /> {guardando ? 'Guardando…' : 'Guardar'}
        </button>
        <button onClick={onCancelar} className="btn-secondary text-sm">
          <X size={14} /> Cancelar
        </button>
      </div>
    </div>
  )
}

/** Boton de lapiz uniforme para abrir la edicion de una seccion. */
export function BotonEditar({ activo, onClick, titulo = 'Editar estos datos' }: {
  activo: boolean; onClick: () => void; titulo?: string
}) {
  return (
    <button onClick={onClick} title={titulo}
      className="text-dim hover:text-blue-400 p-1.5 rounded-lg transition-colors flex-shrink-0"
      style={activo ? { color: 'var(--accent)' } : undefined}>
      {activo ? <X size={14} /> : <Pencil size={14} />}
    </button>
  )
}
