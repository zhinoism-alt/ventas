import { useEffect, useState } from 'react'
import { Check, Sparkles } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

/* ═══════════════════════════════════════════════════════════════════════════
   Limpieza: el pizarrón "Limpieza Sábado", digitalizado -- con quién.

   Antes solo se sabía que algo estaba marcado. Ahora cada tarea guarda quién
   la hizo (el nombre de la sesión de Clerk, automático, nadie tiene que
   escribirlo) y cuándo. La semana se identifica por el sábado que viene:
   llega el siguiente y no hay fila, así que todo aparece sin marcar, solo --
   igual que borrar el pizarrón de verdad.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Tarea { id: number; nombre: string; orden: number }
interface Estado { tarea_id: number; hecho_por: string | null; hecho_en: string }

function proximoSabadoISO(): string {
  const hoy = new Date()
  const diaHoy = hoy.getDay() === 0 ? 7 : hoy.getDay()
  let delta = 6 - diaHoy
  if (delta < 0) delta += 7
  const f = new Date(hoy)
  f.setDate(hoy.getDate() + delta)
  return f.toISOString().slice(0, 10)
}
const SEMANA_ACTUAL = proximoSabadoISO()

export default function Limpieza() {
  const { usuario } = useAuth()
  const [tareas, setTareas] = useState<Tarea[]>([])
  const [estado, setEstado] = useState<Map<number, Estado>>(new Map())
  const [cargando, setCargando] = useState(true)

  const cargar = async () => {
    const [{ data: t }, { data: e }] = await Promise.all([
      supabase.from('limpieza_tareas').select('id,nombre,orden').eq('activo', true).order('orden'),
      supabase.from('limpieza_estado').select('tarea_id,hecho_por,hecho_en').eq('semana', SEMANA_ACTUAL),
    ])
    setTareas((t ?? []) as Tarea[])
    setEstado(new Map(((e ?? []) as Estado[]).map(x => [x.tarea_id, x])))
    setCargando(false)
  }
  useEffect(() => { cargar() }, [])

  const toggle = async (id: number) => {
    const yaHecha = estado.has(id)
    if (yaHecha) {
      const siguiente = new Map(estado)
      siguiente.delete(id)
      setEstado(siguiente) // optimista
      await supabase.from('limpieza_estado').delete().eq('tarea_id', id).eq('semana', SEMANA_ACTUAL)
    } else {
      const quien = usuario?.nombre ?? null
      const siguiente = new Map(estado)
      siguiente.set(id, { tarea_id: id, hecho_por: quien, hecho_en: new Date().toISOString() })
      setEstado(siguiente) // optimista
      await supabase.from('limpieza_estado').upsert({ tarea_id: id, semana: SEMANA_ACTUAL, hecho_por: quien })
    }
  }

  if (cargando) return <div className="card"><p className="text-xs text-dim">Cargando…</p></div>

  const faltan = tareas.filter(t => !estado.has(t.id))
  const hechas = tareas.filter(t => estado.has(t.id))

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="px-1">
        <h1 className="text-2xl font-bold text-strong flex items-center gap-2">
          <Sparkles className="text-green-400" size={22} /> Limpieza
        </h1>
        <p className="text-muted text-sm mt-0.5">
          El pizarrón "Limpieza Sábado", pero sin borrar con la manga. Se vacía solo — llega
          el sábado siguiente y todo vuelve a aparecer sin marcar.
        </p>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-1">
          <p className="text-strong font-semibold text-sm">Esta semana ({SEMANA_ACTUAL})</p>
          <span className="text-xs text-muted">{hechas.length} de {tareas.length}</span>
        </div>
        <div className="h-2 rounded-full mt-2" style={{ background: 'var(--surface-2)' }}>
          <div className="h-2 rounded-full transition-all" style={{
            width: `${tareas.length ? (hechas.length / tareas.length) * 100 : 0}%`,
            background: 'var(--green)',
          }} />
        </div>
      </div>

      {/* Lo que falta primero: es la pregunta que de verdad se hacen al llegar. */}
      <div className="card">
        <p className="text-strong font-semibold text-sm mb-3">
          Falta {faltan.length > 0 ? `(${faltan.length})` : ''}
        </p>
        {faltan.length === 0 ? (
          <p className="text-xs text-dim text-center py-4">Ya está todo. 🎉</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {faltan.map(t => (
              <button key={t.id} onClick={() => toggle(t.id)}
                className="flex items-center gap-2 text-left px-2.5 py-2 rounded-lg text-xs transition-colors"
                style={{ background: 'var(--surface-2)' }}>
                <span className="w-4 h-4 rounded flex-shrink-0" style={{ border: '1px solid var(--border-hi)' }} />
                <span className="text-body">{t.nombre}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {hechas.length > 0 && (
        <div className="card">
          <p className="text-strong font-semibold text-sm mb-3">Hechas ({hechas.length})</p>
          <div className="space-y-1">
            {hechas
              .slice()
              .sort((a, b) => (estado.get(b.id)?.hecho_en ?? '').localeCompare(estado.get(a.id)?.hecho_en ?? ''))
              .map(t => {
                const e = estado.get(t.id)!
                return (
                  <button key={t.id} onClick={() => toggle(t.id)}
                    className="w-full flex items-center justify-between gap-2 text-left px-2.5 py-2 rounded-lg text-xs transition-colors"
                    style={{ background: 'var(--green-soft, rgba(74,222,128,.15))' }}>
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="w-4 h-4 rounded flex-shrink-0 flex items-center justify-center"
                        style={{ border: '1px solid var(--green)' }}>
                        <Check size={11} style={{ color: 'var(--green)' }} />
                      </span>
                      <span className="line-through text-dim truncate">{t.nombre}</span>
                    </span>
                    <span className="flex-shrink-0" style={{ color: 'var(--green)' }}>
                      {e.hecho_por ?? '—'}
                    </span>
                  </button>
                )
              })}
          </div>
        </div>
      )}
    </div>
  )
}
