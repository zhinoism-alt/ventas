import { useEffect, useState } from 'react'
import { Leaf, Plus, CheckCircle2, Circle, Trash2, Flame, Bell, BellOff, Star } from 'lucide-react'
import { supabase } from '../lib/supabase'

interface Habito {
  id: number
  nombre: string
  descripcion: string
  categoria: 'salud' | 'ejercicio' | 'nutricion' | 'mental' | 'otro'
  frecuencia: 'diario' | 'semanal' | 'mensual'
  icono: string
  color: string
  activo: boolean
  orden: number
}

interface Registro {
  id: number
  habito_id: number
  fecha: string
  completado: boolean
  nota: string
}

interface Recordatorio {
  id: number
  titulo: string
  descripcion: string
  tipo: 'general' | 'pago' | 'cita' | 'tarea' | 'otro'
  fecha_hora: string
  repetir: 'nunca' | 'diario' | 'semanal' | 'mensual' | 'anual'
  completado: boolean
  importante: boolean
  color: string
}

const CAT_COLORS: Record<string, string> = {
  salud: '#22c55e', ejercicio: '#f59e0b', nutricion: '#06b6d4', mental: '#8b5cf6', otro: '#94a3b8'
}
const ICON_OPT = ['💪', '🏃', '🥗', '💧', '🧘', '📚', '😴', '🚴', '🏋️', '🧠', '❤️', '🌟']

function getStreak(registros: Registro[], habitoId: number): number {
  const dates = registros.filter(r => r.habito_id === habitoId && r.completado).map(r => r.fecha).sort().reverse()
  if (dates.length === 0) return 0
  let streak = 0
  const today = new Date()
  for (let i = 0; i < 30; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const dateStr = d.toISOString().split('T')[0]
    if (dates.includes(dateStr)) streak++
    else if (i > 0) break
  }
  return streak
}

export default function Bienestar() {
  const [habitos, setHabitos] = useState<Habito[]>([])
  const [registros, setRegistros] = useState<Registro[]>([])
  const [recordatorios, setRecordatorios] = useState<Recordatorio[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'habitos' | 'recordatorios'>('habitos')
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [today] = useState(new Date().toISOString().split('T')[0])
  const [form, setForm] = useState({ nombre: '', descripcion: '', categoria: 'salud' as Habito['categoria'], frecuencia: 'diario' as Habito['frecuencia'], icono: '💪', color: '#22c55e' })
  const [remForm, setRemForm] = useState({ titulo: '', descripcion: '', tipo: 'general' as Recordatorio['tipo'], fecha_hora: '', repetir: 'nunca' as Recordatorio['repetir'], importante: false, color: '#6366f1' })

  const load = async () => {
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 30)
    const since = sevenDaysAgo.toISOString().split('T')[0]

    const [{ data: h }, { data: r }, { data: rec }] = await Promise.all([
      supabase.from('habitos').select('*').eq('activo', true).order('orden'),
      supabase.from('habitos_registros').select('*').gte('fecha', since).order('fecha', { ascending: false }),
      supabase.from('recordatorios').select('*').eq('completado', false).order('fecha_hora')
    ])
    setHabitos(h ?? [])
    setRegistros(r ?? [])
    setRecordatorios(rec ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const toggleHoy = async (habito: Habito) => {
    const existing = registros.find(r => r.habito_id === habito.id && r.fecha === today)
    if (existing) {
      await supabase.from('habitos_registros').delete().eq('id', existing.id)
      setRegistros(prev => prev.filter(r => r.id !== existing.id))
    } else {
      const { data } = await supabase.from('habitos_registros').insert({ habito_id: habito.id, fecha: today, completado: true }).select().single()
      if (data) setRegistros(prev => [...prev, data])
    }
  }

  const createHabito = async () => {
    if (!form.nombre) return
    setSaving(true)
    await supabase.from('habitos').insert(form)
    setForm({ nombre: '', descripcion: '', categoria: 'salud', frecuencia: 'diario', icono: '💪', color: '#22c55e' })
    setShowForm(false)
    setSaving(false)
    load()
  }

  const deleteHabito = async (id: number) => {
    await supabase.from('habitos').update({ activo: false }).eq('id', id)
    setHabitos(prev => prev.filter(h => h.id !== id))
  }

  const createRecordatorio = async () => {
    if (!remForm.titulo || !remForm.fecha_hora) return
    setSaving(true)
    await supabase.from('recordatorios').insert(remForm)
    setRemForm({ titulo: '', descripcion: '', tipo: 'general', fecha_hora: '', repetir: 'nunca', importante: false, color: '#6366f1' })
    setShowForm(false)
    setSaving(false)
    load()
  }

  const completeRecordatorio = async (id: number) => {
    await supabase.from('recordatorios').update({ completado: true }).eq('id', id)
    setRecordatorios(prev => prev.filter(r => r.id !== id))
  }

  const completadosHoy = habitos.filter(h => registros.some(r => r.habito_id === h.id && r.fecha === today && r.completado)).length
  const proxRecordatorios = recordatorios.filter(r => {
    const d = new Date(r.fecha_hora)
    const now = new Date()
    const diffDays = (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    return diffDays <= 7 && diffDays >= -1
  })

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full" />
    </div>
  )

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Leaf className="text-green-400" size={24} /> Bienestar
          </h1>
          <p className="text-slate-400 text-sm mt-1">Hábitos diarios y recordatorios</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
          style={{ background: 'linear-gradient(135deg, #22c55e, #06b6d4)' }}>
          <Plus size={16} /> Agregar
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="stat-card">
          <p className="text-xs text-slate-400 mb-1">Hoy</p>
          <p className="text-xl font-bold text-white">{completadosHoy}/{habitos.length}</p>
          <p className="text-xs text-slate-400 mt-1">hábitos completados</p>
          <div className="w-full h-1.5 rounded-full mt-2" style={{ background: '#1e293b' }}>
            <div className="h-1.5 rounded-full bg-green-400 transition-all"
              style={{ width: `${habitos.length > 0 ? (completadosHoy / habitos.length) * 100 : 0}%` }} />
          </div>
        </div>
        <div className="stat-card">
          <p className="text-xs text-slate-400 mb-1">Recordatorios Pendientes</p>
          <p className="text-xl font-bold text-yellow-400">{proxRecordatorios.length}</p>
          <p className="text-xs text-slate-400 mt-1">próximos 7 días</p>
        </div>
        <div className="stat-card col-span-2 lg:col-span-1">
          <p className="text-xs text-slate-400 mb-1">Mejor Racha</p>
          <p className="text-xl font-bold text-orange-400 flex items-center gap-1">
            <Flame size={18} />
            {Math.max(0, ...habitos.map(h => getStreak(registros, h.id)))} días
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-lg" style={{ background: '#1e293b' }}>
        {[{ id: 'habitos', label: 'Hábitos' }, { id: 'recordatorios', label: 'Recordatorios' }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id as 'habitos' | 'recordatorios')}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${tab === t.id ? 'bg-green-600 text-white' : 'text-slate-400 hover:text-white'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Form */}
      {showForm && tab === 'habitos' && (
        <div className="card">
          <h2 className="text-sm font-semibold text-white mb-4">Nuevo Hábito</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Nombre *</label>
              <input className="input w-full" placeholder="Ej: Beber 2L de agua..." value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Categoría</label>
              <select className="input w-full" value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value as Habito['categoria'] }))}>
                <option value="salud">Salud</option>
                <option value="ejercicio">Ejercicio</option>
                <option value="nutricion">Nutrición</option>
                <option value="mental">Mental</option>
                <option value="otro">Otro</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Frecuencia</label>
              <select className="input w-full" value={form.frecuencia} onChange={e => setForm(f => ({ ...f, frecuencia: e.target.value as Habito['frecuencia'] }))}>
                <option value="diario">Diario</option>
                <option value="semanal">Semanal</option>
                <option value="mensual">Mensual</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Ícono</label>
              <div className="flex gap-1.5 flex-wrap">
                {ICON_OPT.map(ic => (
                  <button key={ic} onClick={() => setForm(f => ({ ...f, icono: ic }))}
                    className={`text-lg p-1.5 rounded-lg transition-all ${form.icono === ic ? 'ring-2 ring-green-500' : ''}`}
                    style={{ background: '#1e293b' }}>{ic}</button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={createHabito} disabled={saving}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: '#22c55e' }}>
              {saving ? 'Guardando...' : 'Crear Hábito'}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white">Cancelar</button>
          </div>
        </div>
      )}

      {showForm && tab === 'recordatorios' && (
        <div className="card">
          <h2 className="text-sm font-semibold text-white mb-4">Nuevo Recordatorio</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Título *</label>
              <input className="input w-full" placeholder="Ej: Pagar renta..." value={remForm.titulo} onChange={e => setRemForm(f => ({ ...f, titulo: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Tipo</label>
              <select className="input w-full" value={remForm.tipo} onChange={e => setRemForm(f => ({ ...f, tipo: e.target.value as Recordatorio['tipo'] }))}>
                <option value="general">General</option>
                <option value="pago">Pago</option>
                <option value="cita">Cita</option>
                <option value="tarea">Tarea</option>
                <option value="otro">Otro</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Fecha y Hora *</label>
              <input className="input w-full" type="datetime-local" value={remForm.fecha_hora} onChange={e => setRemForm(f => ({ ...f, fecha_hora: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Repetir</label>
              <select className="input w-full" value={remForm.repetir} onChange={e => setRemForm(f => ({ ...f, repetir: e.target.value as Recordatorio['repetir'] }))}>
                <option value="nunca">No repetir</option>
                <option value="diario">Diario</option>
                <option value="semanal">Semanal</option>
                <option value="mensual">Mensual</option>
                <option value="anual">Anual</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="imp" checked={remForm.importante} onChange={e => setRemForm(f => ({ ...f, importante: e.target.checked }))} className="rounded" />
              <label htmlFor="imp" className="text-sm text-slate-300">Marcar como importante</label>
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={createRecordatorio} disabled={saving}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: '#6366f1' }}>
              {saving ? 'Guardando...' : 'Crear Recordatorio'}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white">Cancelar</button>
          </div>
        </div>
      )}

      {/* Hábitos */}
      {tab === 'habitos' && (
        habitos.length === 0 ? (
          <div className="card text-center py-12">
            <Leaf size={40} className="mx-auto text-slate-600 mb-3" />
            <p className="text-white font-medium">Sin hábitos aún</p>
            <p className="text-slate-400 text-sm mt-1">Empieza creando tu primer hábito</p>
          </div>
        ) : (
          <div className="space-y-3">
            {habitos.map(h => {
              const completadoHoy = registros.some(r => r.habito_id === h.id && r.fecha === today && r.completado)
              const streak = getStreak(registros, h.id)
              // Last 7 days
              const last7 = Array.from({ length: 7 }, (_, i) => {
                const d = new Date()
                d.setDate(d.getDate() - (6 - i))
                return d.toISOString().split('T')[0]
              })
              return (
                <div key={h.id} className={`card flex items-center gap-4 transition-all ${completadoHoy ? 'opacity-90' : ''}`}
                  style={completadoHoy ? { borderColor: h.color + '44' } : {}}>
                  <button onClick={() => toggleHoy(h)} className="flex-shrink-0">
                    {completadoHoy
                      ? <CheckCircle2 size={24} style={{ color: h.color }} />
                      : <Circle size={24} className="text-slate-500 hover:text-slate-300 transition-colors" />}
                  </button>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-2xl">{h.icono}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={`font-medium text-sm ${completadoHoy ? 'line-through text-slate-400' : 'text-white'}`}>{h.nombre}</p>
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: CAT_COLORS[h.categoria] + '22', color: CAT_COLORS[h.categoria] }}>
                        {h.categoria}
                      </span>
                    </div>
                    {/* Last 7 day dots */}
                    <div className="flex gap-1 mt-1.5">
                      {last7.map(d => {
                        const done = registros.some(r => r.habito_id === h.id && r.fecha === d && r.completado)
                        return (
                          <div key={d} className="w-4 h-4 rounded-full border"
                            style={{ background: done ? h.color : 'transparent', borderColor: done ? h.color : '#2d3f58' }}
                            title={d} />
                        )
                      })}
                    </div>
                  </div>
                  {streak > 1 && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Flame size={14} className="text-orange-400" />
                      <span className="text-xs text-orange-400 font-bold">{streak}</span>
                    </div>
                  )}
                  <button onClick={() => deleteHabito(h.id)} className="text-slate-600 hover:text-red-400 flex-shrink-0">
                    <Trash2 size={14} />
                  </button>
                </div>
              )
            })}
          </div>
        )
      )}

      {/* Recordatorios */}
      {tab === 'recordatorios' && (
        recordatorios.length === 0 ? (
          <div className="card text-center py-12">
            <BellOff size={40} className="mx-auto text-slate-600 mb-3" />
            <p className="text-white font-medium">Sin recordatorios</p>
            <p className="text-slate-400 text-sm mt-1">Agrega recordatorios para pagos, citas o tareas</p>
          </div>
        ) : (
          <div className="space-y-3">
            {recordatorios.map(r => {
              const fecha = new Date(r.fecha_hora)
              const now = new Date()
              const diffMs = fecha.getTime() - now.getTime()
              const diffDays = diffMs / (1000 * 60 * 60 * 24)
              const isOverdue = diffDays < 0
              const isSoon = diffDays >= 0 && diffDays <= 1
              return (
                <div key={r.id} className="card flex items-start gap-3"
                  style={isOverdue ? { borderColor: '#ef4444' + '44' } : isSoon ? { borderColor: '#f59e0b' + '44' } : {}}>
                  {r.importante && <Star size={14} className="text-yellow-400 mt-1 flex-shrink-0" />}
                  <Bell size={16} className="mt-0.5 flex-shrink-0" style={{ color: r.color }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium text-sm">{r.titulo}</p>
                    {r.descripcion && <p className="text-xs text-slate-400">{r.descripcion}</p>}
                    <div className="flex items-center gap-3 mt-1">
                      <span className={`text-xs ${isOverdue ? 'text-red-400' : isSoon ? 'text-yellow-400' : 'text-slate-400'}`}>
                        {fecha.toLocaleDateString('es-MX', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {r.repetir !== 'nunca' && <span className="text-xs text-slate-500">↻ {r.repetir}</span>}
                    </div>
                  </div>
                  <button onClick={() => completeRecordatorio(r.id)}
                    className="flex-shrink-0 text-xs px-2 py-1 rounded-lg text-green-400 hover:bg-green-500/20 transition-all">
                    Listo
                  </button>
                </div>
              )
            })}
          </div>
        )
      )}
    </div>
  )
}
