import { useEffect, useState } from 'react'
import { Heart, Plus, Trash2, Users, Target, TrendingUp } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { fmt } from '../lib/utils'

interface Gasto {
  id: number
  concepto: string
  monto: number
  moneda: string
  pagado_por: 'brandon' | 'pareja' | 'ambos'
  categoria: string
  dividir: boolean
  porcentaje_brandon: number
  fecha: string
  mes: string
  notas: string
}

interface Meta {
  id: number
  nombre: string
  descripcion: string
  tipo: 'financiera' | 'relacion' | 'bienestar' | 'otro'
  completado: boolean
  fecha_meta: string | null
}

const CATEGORIAS_GASTO = ['general', 'renta', 'comida', 'entretenimiento', 'salud', 'transporte', 'ropa', 'servicios', 'viaje', 'otro']
const TIPO_META = { financiera: '#22c55e', relacion: '#ec4899', bienestar: '#06b6d4', otro: '#94a3b8' }

export default function Pareja() {
  const [gastos, setGastos] = useState<Gasto[]>([])
  const [metas, setMetas] = useState<Meta[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'gastos' | 'metas'>('gastos')
  const [mes, setMes] = useState(new Date().toISOString().slice(0, 7))
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    concepto: '', monto: '', pagado_por: 'brandon' as 'brandon' | 'pareja' | 'ambos',
    categoria: 'general', dividir: true, porcentaje_brandon: '50', fecha: new Date().toISOString().split('T')[0], notas: ''
  })
  const [metaForm, setMetaForm] = useState({ nombre: '', descripcion: '', tipo: 'relacion' as 'financiera' | 'relacion' | 'bienestar' | 'otro', fecha_meta: '' })

  const load = async () => {
    const [{ data: g }, { data: m }] = await Promise.all([
      supabase.from('pareja_gastos').select('*').eq('mes', mes).order('fecha', { ascending: false }),
      supabase.from('pareja_metas').select('*').order('completado').order('created_at', { ascending: false })
    ])
    setGastos(g ?? [])
    setMetas(m ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [mes])

  const createGasto = async () => {
    if (!form.concepto || !form.monto) return
    setSaving(true)
    await supabase.from('pareja_gastos').insert({
      concepto: form.concepto, monto: Number(form.monto), pagado_por: form.pagado_por,
      categoria: form.categoria, dividir: form.dividir,
      porcentaje_brandon: Number(form.porcentaje_brandon),
      fecha: form.fecha, mes, notas: form.notas
    })
    setForm({ concepto: '', monto: '', pagado_por: 'brandon', categoria: 'general', dividir: true, porcentaje_brandon: '50', fecha: new Date().toISOString().split('T')[0], notas: '' })
    setShowForm(false)
    setSaving(false)
    load()
  }

  const createMeta = async () => {
    if (!metaForm.nombre) return
    setSaving(true)
    await supabase.from('pareja_metas').insert({
      nombre: metaForm.nombre, descripcion: metaForm.descripcion,
      tipo: metaForm.tipo, fecha_meta: metaForm.fecha_meta || null
    })
    setMetaForm({ nombre: '', descripcion: '', tipo: 'relacion', fecha_meta: '' })
    setSaving(false)
    load()
  }

  const toggleMeta = async (id: number, val: boolean) => {
    await supabase.from('pareja_metas').update({ completado: val }).eq('id', id)
    setMetas(prev => prev.map(m => m.id === id ? { ...m, completado: val } : m))
  }

  const deleteGasto = async (id: number) => {
    await supabase.from('pareja_gastos').delete().eq('id', id)
    setGastos(prev => prev.filter(g => g.id !== id))
  }

  // Calculate split
  const totalMes = gastos.reduce((s, g) => s + g.monto, 0)
  const toBrandon = gastos.reduce((s, g) => {
    if (!g.dividir) return g.pagado_por === 'brandon' ? s + g.monto : s
    return s + (g.monto * g.porcentaje_brandon / 100)
  }, 0)
  const toPareja = totalMes - toBrandon

  const pagoBrandon = gastos.filter(g => g.pagado_por === 'brandon').reduce((s, g) => s + g.monto, 0)
  const pagoPareja = gastos.filter(g => g.pagado_por === 'pareja').reduce((s, g) => s + g.monto, 0)

  // Balance: positive = pareja owes Brandon, negative = Brandon owes pareja
  const balanceBrandon = pagoBrandon - toBrandon
  const balancePareja = pagoPareja - toPareja

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
            <Heart className="text-pink-400" size={24} /> Finanzas en Pareja
          </h1>
          <p className="text-slate-400 text-sm mt-1">Gastos compartidos y metas juntos</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
          style={{ background: 'linear-gradient(135deg, #ec4899, #8b5cf6)' }}>
          <Plus size={16} /> Agregar
        </button>
      </div>

      {/* Balance del mes */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="stat-card">
          <p className="text-xs text-slate-400 mb-1">Total del Mes</p>
          <p className="text-xl font-bold text-white">{fmt(totalMes)}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-slate-400 mb-1">Le corresponde a Brandon</p>
          <p className="text-xl font-bold text-indigo-400">{fmt(toBrandon)}</p>
          <p className="text-xs text-slate-400">Pagó: {fmt(pagoBrandon)}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-slate-400 mb-1">Le corresponde a Pareja</p>
          <p className="text-xl font-bold text-pink-400">{fmt(toPareja)}</p>
          <p className="text-xs text-slate-400">Pagó: {fmt(pagoPareja)}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-slate-400 mb-1">Balance</p>
          {Math.abs(balanceBrandon) < 1 ? (
            <p className="text-xl font-bold text-green-400">¡Par!</p>
          ) : balanceBrandon > 0 ? (
            <div>
              <p className="text-sm font-bold text-green-400">Pareja debe {fmt(balanceBrandon)}</p>
            </div>
          ) : (
            <div>
              <p className="text-sm font-bold text-red-400">Brandon debe {fmt(Math.abs(balanceBrandon))}</p>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-4">
        <div className="flex gap-1 p-1 rounded-lg flex-1" style={{ background: '#1e293b' }}>
          {[{ id: 'gastos', label: 'Gastos' }, { id: 'metas', label: 'Metas Juntos' }].map(t => (
            <button key={t.id} onClick={() => setTab(t.id as 'gastos' | 'metas')}
              className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${tab === t.id ? 'bg-pink-600 text-white' : 'text-slate-400 hover:text-white'}`}>
              {t.label}
            </button>
          ))}
        </div>
        {tab === 'gastos' && (
          <input type="month" className="input" value={mes} onChange={e => setMes(e.target.value)} />
        )}
      </div>

      {/* Form gasto */}
      {showForm && tab === 'gastos' && (
        <div className="card">
          <h2 className="text-sm font-semibold text-white mb-4">Nuevo Gasto</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Concepto *</label>
              <input className="input w-full" placeholder="Ej: Cena, Renta..." value={form.concepto} onChange={e => setForm(f => ({ ...f, concepto: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Monto (MXN) *</label>
              <input className="input w-full" type="number" placeholder="0.00" value={form.monto} onChange={e => setForm(f => ({ ...f, monto: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">¿Quién pagó?</label>
              <select className="input w-full" value={form.pagado_por} onChange={e => setForm(f => ({ ...f, pagado_por: e.target.value as 'brandon' | 'pareja' | 'ambos' }))}>
                <option value="brandon">Brandon</option>
                <option value="pareja">Pareja</option>
                <option value="ambos">Ambos</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Categoría</label>
              <select className="input w-full" value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}>
                {CATEGORIAS_GASTO.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">% para Brandon</label>
              <div className="flex items-center gap-2">
                <input className="input flex-1" type="number" min="0" max="100" value={form.porcentaje_brandon}
                  onChange={e => setForm(f => ({ ...f, porcentaje_brandon: e.target.value }))} />
                <span className="text-slate-400 text-sm">/ {100 - Number(form.porcentaje_brandon)}% pareja</span>
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Fecha</label>
              <input className="input w-full" type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={createGasto} disabled={saving}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: '#ec4899' }}>
              {saving ? 'Guardando...' : 'Agregar Gasto'}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white">Cancelar</button>
          </div>
        </div>
      )}

      {/* Gastos del mes */}
      {tab === 'gastos' && (
        gastos.length === 0 ? (
          <div className="card text-center py-12">
            <Users size={40} className="mx-auto text-slate-600 mb-3" />
            <p className="text-white font-medium">Sin gastos este mes</p>
            <p className="text-slate-400 text-sm mt-1">Registra los gastos del mes para ver el balance</p>
          </div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid #2d3f58' }}>
                  {['Concepto', 'Monto', 'Pagó', 'Brandon', 'Pareja', ''].map(h => (
                    <th key={h} className="text-left py-2 px-3 text-xs text-slate-400 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gastos.map(g => {
                  const bParte = g.dividir ? g.monto * g.porcentaje_brandon / 100 : (g.pagado_por === 'brandon' ? g.monto : 0)
                  const pParte = g.dividir ? g.monto * (100 - g.porcentaje_brandon) / 100 : (g.pagado_por === 'pareja' ? g.monto : 0)
                  return (
                    <tr key={g.id} style={{ borderBottom: '1px solid #1e293b' }}>
                      <td className="py-2 px-3">
                        <div className="text-white">{g.concepto}</div>
                        <div className="text-xs text-slate-500">{g.categoria} · {g.fecha}</div>
                      </td>
                      <td className="py-2 px-3 text-white font-medium">{fmt(g.monto)}</td>
                      <td className="py-2 px-3">
                        <span className={`text-xs px-2 py-1 rounded-full ${g.pagado_por === 'brandon' ? 'bg-indigo-500/20 text-indigo-400' : g.pagado_por === 'pareja' ? 'bg-pink-500/20 text-pink-400' : 'bg-slate-700 text-slate-400'}`}>
                          {g.pagado_por === 'brandon' ? 'Brandon' : g.pagado_por === 'pareja' ? 'Pareja' : 'Ambos'}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-indigo-400">{fmt(bParte)}</td>
                      <td className="py-2 px-3 text-pink-400">{fmt(pParte)}</td>
                      <td className="py-2 px-3">
                        <button onClick={() => deleteGasto(g.id)} className="text-slate-600 hover:text-red-400">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Metas */}
      {tab === 'metas' && (
        <div className="space-y-4">
          {/* Form meta */}
          <div className="card">
            <h2 className="text-sm font-semibold text-white mb-3">Nueva Meta</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <input className="input w-full" placeholder="Nombre de la meta *" value={metaForm.nombre} onChange={e => setMetaForm(f => ({ ...f, nombre: e.target.value }))} />
              </div>
              <div>
                <select className="input w-full" value={metaForm.tipo} onChange={e => setMetaForm(f => ({ ...f, tipo: e.target.value as 'financiera' | 'relacion' | 'bienestar' | 'otro' }))}>
                  <option value="financiera">Financiera</option>
                  <option value="relacion">Relación</option>
                  <option value="bienestar">Bienestar</option>
                  <option value="otro">Otro</option>
                </select>
              </div>
              <div>
                <button onClick={createMeta} disabled={saving}
                  className="w-full px-3 py-2 rounded-lg text-sm font-medium text-white" style={{ background: '#ec4899' }}>
                  {saving ? '...' : 'Agregar Meta'}
                </button>
              </div>
            </div>
          </div>

          {metas.length === 0 ? (
            <div className="card text-center py-12">
              <Target size={40} className="mx-auto text-slate-600 mb-3" />
              <p className="text-white font-medium">Sin metas aún</p>
              <p className="text-slate-400 text-sm mt-1">Agrega metas que quieran lograr juntos</p>
            </div>
          ) : (
            <div className="space-y-3">
              {metas.filter(m => !m.completado).map(m => (
                <div key={m.id} className="card flex items-center gap-3">
                  <button onClick={() => toggleMeta(m.id, true)} className="flex-shrink-0">
                    <div className="w-5 h-5 rounded-full border-2" style={{ borderColor: TIPO_META[m.tipo] }} />
                  </button>
                  <div className="flex-1">
                    <p className="text-white font-medium text-sm">{m.nombre}</p>
                    {m.descripcion && <p className="text-xs text-slate-400">{m.descripcion}</p>}
                  </div>
                  <span className="text-xs px-2 py-1 rounded-full" style={{ background: TIPO_META[m.tipo] + '22', color: TIPO_META[m.tipo] }}>
                    {m.tipo}
                  </span>
                  {m.fecha_meta && <span className="text-xs text-slate-500">{m.fecha_meta}</span>}
                </div>
              ))}
              {metas.filter(m => m.completado).length > 0 && (
                <div className="space-y-2 opacity-50">
                  <p className="text-xs text-slate-500 px-1">Logradas</p>
                  {metas.filter(m => m.completado).map(m => (
                    <div key={m.id} className="card flex items-center gap-3 py-2">
                      <button onClick={() => toggleMeta(m.id, false)} className="flex-shrink-0">
                        <TrendingUp size={16} className="text-green-400" />
                      </button>
                      <p className="text-slate-400 text-sm line-through flex-1">{m.nombre}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
