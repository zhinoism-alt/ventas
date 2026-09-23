import { useEffect, useMemo, useState } from 'react'
import { ShoppingCart, Check, Plus, X } from 'lucide-react'
import { supabase } from '../lib/supabase'

/* ═══════════════════════════════════════════════════════════════════════════
   Lista de Super: que comprar para la semana, sacado de la dieta activa.

   No suma cantidades entre dias -- "2 pzas de huevo" el lunes y "2 pzas de
   huevo" el martes aparecen como una sola linea (mismo texto exacto), con un
   contador de cuantas veces sale. Sumar gramos y tazas de renglones en
   texto libre habria sido adivinar; esto es honesto sobre lo que sabe.

   Se marca "comprado" por semana, igual que Limpieza: llega la semana
   siguiente y no hay fila, asi que aparece sin marcar, solo.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Menu { id: number; nombre: string }
interface Comida { menu_id: number; detalle: string }
interface Extra { id: number; texto: string; hecho: boolean }

function semanaISO(fecha: Date): number {
  const d = new Date(Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()))
  const diaSemana = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - diaSemana)
  const inicioAnio = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - inicioAnio.getTime()) / 86400000 + 1) / 7)
}

/** Mismo lunes de la semana en curso, como YYYY-MM-DD -- clave de "semana". */
function lunesDeEstaSemanaISO(): string {
  const hoy = new Date()
  const diaHoy = hoy.getDay() === 0 ? 7 : hoy.getDay()
  const f = new Date(hoy)
  f.setDate(hoy.getDate() - (diaHoy - 1))
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`
}

const SEMANA_ACTUAL = lunesDeEstaSemanaISO()

export default function ListaSuper() {
  const [menus, setMenus] = useState<Menu[]>([])
  const [comidas, setComidas] = useState<Comida[]>([])
  const [comprados, setComprados] = useState<Set<string>>(new Set())
  const [extras, setExtras] = useState<Extra[]>([])
  const [verMenuId, setVerMenuId] = useState<number | null>(null)
  const [cargando, setCargando] = useState(true)
  const [nuevoExtra, setNuevoExtra] = useState('')

  const cargar = async () => {
    const [{ data: m }, { data: c }, { data: e }, { data: ex }] = await Promise.all([
      supabase.from('dietas_menus').select('id,nombre').order('id'),
      supabase.from('dietas_comidas').select('menu_id,detalle'),
      supabase.from('super_estado').select('item').eq('semana', SEMANA_ACTUAL),
      supabase.from('super_extra').select('id,texto,hecho').eq('semana', SEMANA_ACTUAL).order('created_at'),
    ])
    setMenus((m ?? []) as Menu[])
    setComidas((c ?? []) as Comida[])
    setComprados(new Set(((e ?? []) as { item: string }[]).map(x => x.item)))
    setExtras((ex ?? []) as Extra[])
    setCargando(false)
  }
  useEffect(() => { cargar() }, [])

  const menuOficial = menus[semanaISO(new Date()) % 2 === 1 ? 0 : 1 % Math.max(menus.length, 1)]
  const menuMostrado = menus.find(m => m.id === verMenuId) ?? menuOficial

  const ingredientes = useMemo(() => {
    if (!menuMostrado) return []
    const conteo = new Map<string, number>()
    for (const c of comidas) {
      if (c.menu_id !== menuMostrado.id) continue
      for (const linea of c.detalle.split('\n')) {
        const t = linea.trim()
        if (!t) continue
        conteo.set(t, (conteo.get(t) ?? 0) + 1)
      }
    }
    return [...conteo.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es'))
  }, [comidas, menuMostrado])

  const toggleItem = async (item: string) => {
    const yaMarcado = comprados.has(item)
    const siguiente = new Set(comprados)
    if (yaMarcado) siguiente.delete(item); else siguiente.add(item)
    setComprados(siguiente)
    if (yaMarcado) {
      await supabase.from('super_estado').delete().eq('semana', SEMANA_ACTUAL).eq('item', item)
    } else {
      await supabase.from('super_estado').upsert({ semana: SEMANA_ACTUAL, item })
    }
  }

  const agregarExtra = async () => {
    if (!nuevoExtra.trim()) return
    const { data } = await supabase.from('super_extra')
      .insert({ semana: SEMANA_ACTUAL, texto: nuevoExtra.trim() }).select().single()
    if (data) setExtras(e => [...e, data as Extra])
    setNuevoExtra('')
  }

  const toggleExtra = async (ex: Extra) => {
    setExtras(es => es.map(x => x.id === ex.id ? { ...x, hecho: !x.hecho } : x))
    await supabase.from('super_extra').update({ hecho: !ex.hecho }).eq('id', ex.id)
  }

  const borrarExtra = async (id: number) => {
    setExtras(es => es.filter(x => x.id !== id))
    await supabase.from('super_extra').delete().eq('id', id)
  }

  if (cargando) return <div className="card"><p className="text-xs text-dim">Cargando lista…</p></div>
  if (!menuMostrado) return <div className="card"><p className="text-xs text-dim">Todavía no hay dieta cargada.</p></div>

  const total = ingredientes.length + extras.length
  const hechos = ingredientes.filter(([item]) => comprados.has(item)).length + extras.filter(e => e.hecho).length

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="px-1">
        <h1 className="text-2xl font-bold text-strong flex items-center gap-2">
          <ShoppingCart className="text-indigo-400" size={22} /> Lista de Súper
        </h1>
        <p className="text-muted text-sm mt-0.5">
          Sacada de la dieta de la semana. No suma cantidades entre días — si sale dos veces
          el mismo renglón, aparece una vez con un contador. {hechos} de {total} marcados.
        </p>
      </div>

      <div className="flex gap-1.5">
        {menus.map(m => {
          const esEsta = m.id === menuMostrado.id
          const esLaOficial = m.id === menuOficial.id
          return (
            <button key={m.id} onClick={() => setVerMenuId(m.id)}
              className="px-3 py-1 rounded-full text-xs font-medium transition-colors"
              style={esEsta
                ? { background: 'var(--accent)', color: '#fff' }
                : { background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
              {m.nombre}{esLaOficial ? ' · esta semana' : ''}
            </button>
          )
        })}
      </div>

      <div className="card">
        <p className="text-strong font-semibold mb-3 text-sm">Ingredientes ({ingredientes.length})</p>
        <div className="space-y-1">
          {ingredientes.map(([item, veces]) => {
            const hecho = comprados.has(item)
            return (
              <button key={item} onClick={() => toggleItem(item)}
                className="w-full flex items-center gap-2.5 text-left px-2.5 py-2 rounded-lg text-xs transition-colors"
                style={{ background: hecho ? 'var(--green-soft, rgba(74,222,128,.15))' : 'var(--surface-2)' }}>
                <span className="w-4 h-4 rounded flex-shrink-0 flex items-center justify-center"
                  style={{ border: `1px solid ${hecho ? 'var(--green)' : 'var(--border-hi)'}` }}>
                  {hecho && <Check size={11} style={{ color: 'var(--green)' }} />}
                </span>
                <span className={hecho ? 'line-through text-dim flex-1' : 'text-body flex-1'}>{item}</span>
                {veces > 1 && <span className="text-faint flex-shrink-0">×{veces}</span>}
              </button>
            )
          })}
        </div>
      </div>

      <div className="card">
        <p className="text-strong font-semibold mb-3 text-sm">Aparte (lo que no viene en la dieta)</p>
        <div className="flex gap-2 mb-3">
          <input className="input flex-1 text-xs" placeholder="Ej: Papel higiénico"
            value={nuevoExtra} onChange={e => setNuevoExtra(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && agregarExtra()} />
          <button onClick={agregarExtra} className="btn-secondary text-xs flex-shrink-0"><Plus size={12} /></button>
        </div>
        {!extras.length ? (
          <p className="text-xs text-dim text-center py-2">Nada agregado todavía.</p>
        ) : (
          <div className="space-y-1">
            {extras.map(ex => (
              <div key={ex.id} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs"
                style={{ background: ex.hecho ? 'var(--green-soft, rgba(74,222,128,.15))' : 'var(--surface-2)' }}>
                <button onClick={() => toggleExtra(ex)} className="flex items-center gap-2.5 flex-1 text-left">
                  <span className="w-4 h-4 rounded flex-shrink-0 flex items-center justify-center"
                    style={{ border: `1px solid ${ex.hecho ? 'var(--green)' : 'var(--border-hi)'}` }}>
                    {ex.hecho && <Check size={11} style={{ color: 'var(--green)' }} />}
                  </span>
                  <span className={ex.hecho ? 'line-through text-dim' : 'text-body'}>{ex.texto}</span>
                </button>
                <button onClick={() => borrarExtra(ex.id)} className="text-faint hover:text-red-400 flex-shrink-0">
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
