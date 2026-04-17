import { useEffect, useState } from 'react'
import { Truck, Plus, CheckCircle2, Circle, Trash2, AlertTriangle, DollarSign, TrendingUp } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { fmt } from '../lib/utils'

interface Tarea {
  id: number
  titulo: string
  descripcion: string
  categoria: string
  prioridad: 'alta' | 'media' | 'baja'
  completado: boolean
  fecha_limite: string | null
  costo: number
  moneda: string
  notas: string
  orden: number
}

interface PresupuestoItem {
  id: number
  concepto: string
  monto_est: number
  monto_real: number
  moneda: string
  pagado: boolean
  categoria: string
  notas: string
}

const CATEGORIAS = ['general', 'vivienda', 'transporte', 'servicios', 'documentos', 'compras', 'otro']
const PRIORIDADES = { alta: '#ef4444', media: '#f59e0b', baja: '#22c55e' }

export default function Mudanza() {
  const [tareas, setTareas] = useState<Tarea[]>([])
  const [presupuesto, setPresupuesto] = useState<PresupuestoItem[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'tareas' | 'presupuesto'>('tareas')
  const [showForm, setShowForm] = useState(false)
  const [catFilter, setCatFilter] = useState('todas')
  const [form, setForm] = useState({ titulo: '', descripcion: '', categoria: 'general', prioridad: 'media' as 'alta' | 'media' | 'baja', fecha_limite: '', costo: '', notas: '' })
  const [presForm, setPresForm] = useState({ concepto: '', monto_est: '', monto_real: '', categoria: 'general', notas: '' })
  const [saving, setSaving] = useState(false)

  const load = async () => {
    const [{ data: t }, { data: p }] = await Promise.all([
      supabase.from('mudanza_tareas').select('*').order('orden').order('prioridad'),
      supabase.from('mudanza_presupuesto').select('*').order('categoria')
    ])
    setTareas(t ?? [])
    setPresupuesto(p ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const toggleTarea = async (id: number, val: boolean) => {
    await supabase.from('mudanza_tareas').update({ completado: val, updated_at: new Date().toISOString() }).eq('id', id)
    setTareas(prev => prev.map(t => t.id === id ? { ...t, completado: val } : t))
  }

  const createTarea = async () => {
    if (!form.titulo) return
    setSaving(true)
    await supabase.from('mudanza_tareas').insert({
      titulo: form.titulo, descripcion: form.descripcion, categoria: form.categoria,
      prioridad: form.prioridad, fecha_limite: form.fecha_limite || null,
      costo: Number(form.costo) || 0, notas: form.notas
    })
    setForm({ titulo: '', descripcion: '', categoria: 'general', prioridad: 'media', fecha_limite: '', costo: '', notas: '' })
    setShowForm(false)
    setSaving(false)
    load()
  }

  const createPresupuesto = async () => {
    if (!presForm.concepto) return
    setSaving(true)
    await supabase.from('mudanza_presupuesto').insert({
      concepto: presForm.concepto, monto_est: Number(presForm.monto_est) || 0,
      monto_real: Number(presForm.monto_real) || 0, categoria: presForm.categoria, notas: presForm.notas
    })
    setPresForm({ concepto: '', monto_est: '', monto_real: '', categoria: 'general', notas: '' })
    setSaving(false)
    load()
  }

  const deleteTarea = async (id: number) => {
    await supabase.from('mudanza_tareas').delete().eq('id', id)
    setTareas(prev => prev.filter(t => t.id !== id))
  }

  const togglePagado = async (id: number, val: boolean) => {
    await supabase.from('mudanza_presupuesto').update({ pagado: val }).eq('id', id)
    setPresupuesto(prev => prev.map(p => p.id === id ? { ...p, pagado: val } : p))
  }

  const completadas = tareas.filter(t => t.completado).length
  const total = tareas.length
  const pct = total > 0 ? (completadas / total) * 100 : 0

  const totalEst = presupuesto.reduce((s, p) => s + p.monto_est, 0)
  const totalReal = presupuesto.reduce((s, p) => s + p.monto_real, 0)
  const totalPagado = presupuesto.filter(p => p.pagado).reduce((s, p) => s + p.monto_real, 0)

  const filteredTareas = catFilter === 'todas' ? tareas : tareas.filter(t => t.categoria === catFilter)
  const pendientes = filteredTareas.filter(t => !t.completado)
  const hechas = filteredTareas.filter(t => t.completado)

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
            <Truck className="text-orange-400" size={24} /> Plan de Mudanza
          </h1>
          <p className="text-slate-400 text-sm mt-1">Organiza tu mudanza paso a paso</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
          style={{ background: 'linear-gradient(135deg, #f59e0b, #ef4444)' }}>
          <Plus size={16} /> Agregar
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="stat-card">
          <p className="text-xs text-slate-400 mb-1">Progreso</p>
          <p className="text-xl font-bold text-white">{pct.toFixed(0)}%</p>
          <p className="text-xs text-slate-400">{completadas}/{total} tareas</p>
          <div className="w-full h-1.5 rounded-full mt-2" style={{ background: '#1e293b' }}>
            <div className="h-1.5 rounded-full bg-orange-400 transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="stat-card">
          <p className="text-xs text-slate-400 mb-1">Pendientes</p>
          <p className="text-xl font-bold text-orange-400">{pendientes.filter(t => !catFilter || catFilter === 'todas' || t.categoria === catFilter).length}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-slate-400 mb-1">Presupuesto Est.</p>
          <p className="text-xl font-bold text-white">{fmt(totalEst)}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-slate-400 mb-1">Gasto Real</p>
          <p className="text-xl font-bold text-white">{fmt(totalReal)}</p>
          <p className="text-xs text-slate-400">Pagado: {fmt(totalPagado)}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-lg" style={{ background: '#1e293b' }}>
        {[{ id: 'tareas', label: 'Checklist' }, { id: 'presupuesto', label: 'Presupuesto' }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id as 'tareas' | 'presupuesto')}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${tab === t.id ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Form */}
      {showForm && tab === 'tareas' && (
        <div className="card">
          <h2 className="text-sm font-semibold text-white mb-4">Nueva Tarea</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <label className="text-xs text-slate-400 mb-1 block">Título *</label>
              <input className="input w-full" placeholder="Ej: Contratar empresa de mudanza..." value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Categoría</label>
              <select className="input w-full" value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}>
                {CATEGORIAS.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Prioridad</label>
              <select className="input w-full" value={form.prioridad} onChange={e => setForm(f => ({ ...f, prioridad: e.target.value as 'alta' | 'media' | 'baja' }))}>
                <option value="alta">Alta</option>
                <option value="media">Media</option>
                <option value="baja">Baja</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Fecha límite</label>
              <input className="input w-full" type="date" value={form.fecha_limite} onChange={e => setForm(f => ({ ...f, fecha_limite: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Costo estimado (MXN)</label>
              <input className="input w-full" type="number" placeholder="0" value={form.costo} onChange={e => setForm(f => ({ ...f, costo: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={createTarea} disabled={saving}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: '#6366f1' }}>
              {saving ? 'Guardando...' : 'Agregar Tarea'}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white">Cancelar</button>
          </div>
        </div>
      )}

      {/* Tareas */}
      {tab === 'tareas' && (
        <div className="space-y-4">
          {/* Filter by category */}
          <div className="flex gap-2 flex-wrap">
            {['todas', ...CATEGORIAS].map(c => (
              <button key={c} onClick={() => setCatFilter(c)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${catFilter === c ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
                style={catFilter !== c ? { background: '#1e293b' } : {}}>
                {c.charAt(0).toUpperCase() + c.slice(1)}
              </button>
            ))}
          </div>

          {pendientes.length === 0 && hechas.length === 0 ? (
            <div className="card text-center py-12">
              <Truck size={40} className="mx-auto text-slate-600 mb-3" />
              <p className="text-white font-medium">Sin tareas aún</p>
              <p className="text-slate-400 text-sm mt-1">Agrega las tareas de tu mudanza</p>
            </div>
          ) : (
            <>
              {pendientes.length > 0 && (
                <div className="space-y-2">
                  {pendientes.map(t => (
                    <div key={t.id} className="card flex items-start gap-3 py-3">
                      <button onClick={() => toggleTarea(t.id, true)} className="mt-0.5 flex-shrink-0">
                        <Circle size={18} className="text-slate-500 hover:text-indigo-400 transition-colors" />
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-white font-medium text-sm">{t.titulo}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: PRIORIDADES[t.prioridad] + '22', color: PRIORIDADES[t.prioridad] }}>
                            {t.prioridad}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded-full text-slate-400" style={{ background: '#1e293b' }}>{t.categoria}</span>
                        </div>
                        {t.descripcion && <p className="text-xs text-slate-400 mt-0.5">{t.descripcion}</p>}
                        <div className="flex gap-3 mt-1 text-xs text-slate-500">
                          {t.fecha_limite && <span className="flex items-center gap-1"><AlertTriangle size={10} className="text-yellow-400" />{t.fecha_limite}</span>}
                          {t.costo > 0 && <span className="flex items-center gap-1"><DollarSign size={10} className="text-green-400" />{fmt(t.costo)}</span>}
                        </div>
                      </div>
                      <button onClick={() => deleteTarea(t.id)} className="text-slate-600 hover:text-red-400 flex-shrink-0">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {hechas.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-slate-500 font-medium px-1">Completadas ({hechas.length})</p>
                  {hechas.map(t => (
                    <div key={t.id} className="card flex items-center gap-3 py-3 opacity-50">
                      <button onClick={() => toggleTarea(t.id, false)} className="flex-shrink-0">
                        <CheckCircle2 size={18} className="text-green-400" />
                      </button>
                      <span className="text-slate-400 text-sm line-through flex-1">{t.titulo}</span>
                      <button onClick={() => deleteTarea(t.id)} className="text-slate-600 hover:text-red-400 flex-shrink-0">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Presupuesto */}
      {tab === 'presupuesto' && (
        <div className="space-y-4">
          {/* Form presupuesto */}
          <div className="card">
            <h2 className="text-sm font-semibold text-white mb-3">Agregar Concepto</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="col-span-2 md:col-span-1">
                <input className="input w-full" placeholder="Concepto *" value={presForm.concepto} onChange={e => setPresForm(f => ({ ...f, concepto: e.target.value }))} />
              </div>
              <div>
                <input className="input w-full" type="number" placeholder="Estimado" value={presForm.monto_est} onChange={e => setPresForm(f => ({ ...f, monto_est: e.target.value }))} />
              </div>
              <div>
                <input className="input w-full" type="number" placeholder="Real" value={presForm.monto_real} onChange={e => setPresForm(f => ({ ...f, monto_real: e.target.value }))} />
              </div>
              <div>
                <button onClick={createPresupuesto} disabled={saving}
                  className="w-full px-3 py-2 rounded-lg text-sm font-medium text-white" style={{ background: '#6366f1' }}>
                  {saving ? '...' : 'Agregar'}
                </button>
              </div>
            </div>
          </div>

          {presupuesto.length === 0 ? (
            <div className="card text-center py-8">
              <TrendingUp size={32} className="mx-auto text-slate-600 mb-2" />
              <p className="text-slate-400 text-sm">Sin conceptos en el presupuesto</p>
            </div>
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid #2d3f58' }}>
                    {['Concepto', 'Estimado', 'Real', 'Diferencia', 'Pagado'].map(h => (
                      <th key={h} className="text-left py-2 px-3 text-xs text-slate-400 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {presupuesto.map(p => {
                    const diff = p.monto_real - p.monto_est
                    return (
                      <tr key={p.id} style={{ borderBottom: '1px solid #1e293b' }}>
                        <td className="py-2 px-3 text-white">{p.concepto}</td>
                        <td className="py-2 px-3 text-slate-300">{fmt(p.monto_est)}</td>
                        <td className="py-2 px-3 text-slate-300">{fmt(p.monto_real)}</td>
                        <td className="py-2 px-3">
                          <span className={diff > 0 ? 'text-red-400' : diff < 0 ? 'text-green-400' : 'text-slate-400'}>
                            {diff !== 0 ? (diff > 0 ? '+' : '') + fmt(diff) : '-'}
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          <button onClick={() => togglePagado(p.id, !p.pagado)}
                            className={`text-xs px-2 py-1 rounded-full transition-all ${p.pagado ? 'bg-green-500/20 text-green-400' : 'bg-slate-700 text-slate-400'}`}>
                            {p.pagado ? 'Pagado' : 'Pendiente'}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                  <tr style={{ borderTop: '2px solid #2d3f58' }}>
                    <td className="py-2 px-3 text-white font-semibold">Total</td>
                    <td className="py-2 px-3 text-white font-semibold">{fmt(totalEst)}</td>
                    <td className="py-2 px-3 text-white font-semibold">{fmt(totalReal)}</td>
                    <td className="py-2 px-3">
                      <span className={totalReal - totalEst > 0 ? 'text-red-400 font-semibold' : 'text-green-400 font-semibold'}>
                        {totalReal !== totalEst ? (totalReal - totalEst > 0 ? '+' : '') + fmt(totalReal - totalEst) : '-'}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-slate-400 text-xs">{fmt(totalPagado)} pagado</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
