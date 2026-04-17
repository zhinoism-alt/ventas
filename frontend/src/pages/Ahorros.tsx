import { useEffect, useState } from 'react'
import { PiggyBank, Plus, TrendingUp, Target, Trash2, ChevronDown, ChevronUp, ArrowUpCircle, ArrowDownCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { fmt } from '../lib/utils'

interface Ahorro {
  id: number
  nombre: string
  meta: number
  acumulado: number
  moneda: string
  fecha_meta: string | null
  descripcion: string
  icono: string
  color: string
  activo: boolean
}

interface Movimiento {
  id: number
  ahorro_id: number
  monto: number
  tipo: 'deposito' | 'retiro'
  nota: string
  fecha: string
}

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="w-full h-2 rounded-full" style={{ background: '#1e293b' }}>
      <div className="h-2 rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

export default function Ahorros() {
  const [ahorros, setAhorros] = useState<Ahorro[]>([])
  const [movimientos, setMovimientos] = useState<Movimiento[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [movForm, setMovForm] = useState<{ id: number | null; tipo: 'deposito' | 'retiro'; monto: string; nota: string }>({
    id: null, tipo: 'deposito', monto: '', nota: ''
  })
  const [form, setForm] = useState({ nombre: '', meta: '', descripcion: '', fecha_meta: '', color: '#6366f1', icono: '🎯' })
  const [saving, setSaving] = useState(false)

  const load = async () => {
    const [{ data: a }, { data: m }] = await Promise.all([
      supabase.from('ahorros').select('*').eq('activo', true).order('created_at', { ascending: false }),
      supabase.from('ahorros_movimientos').select('*').order('fecha', { ascending: false })
    ])
    setAhorros(a ?? [])
    setMovimientos(m ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const createAhorro = async () => {
    if (!form.nombre || !form.meta) return
    setSaving(true)
    await supabase.from('ahorros').insert({
      nombre: form.nombre, meta: Number(form.meta), descripcion: form.descripcion,
      fecha_meta: form.fecha_meta || null, color: form.color, icono: form.icono
    })
    setForm({ nombre: '', meta: '', descripcion: '', fecha_meta: '', color: '#6366f1', icono: '🎯' })
    setShowForm(false)
    setSaving(false)
    load()
  }

  const agregarMovimiento = async () => {
    if (!movForm.id || !movForm.monto) return
    setSaving(true)
    const monto = Number(movForm.monto)
    await supabase.from('ahorros_movimientos').insert({
      ahorro_id: movForm.id, monto, tipo: movForm.tipo, nota: movForm.nota
    })
    // Update accumulated amount
    const ahorro = ahorros.find(a => a.id === movForm.id)
    if (ahorro) {
      const nuevo = movForm.tipo === 'deposito' ? ahorro.acumulado + monto : Math.max(0, ahorro.acumulado - monto)
      await supabase.from('ahorros').update({ acumulado: nuevo, updated_at: new Date().toISOString() }).eq('id', movForm.id)
    }
    setMovForm({ id: null, tipo: 'deposito', monto: '', nota: '' })
    setSaving(false)
    load()
  }

  const deleteAhorro = async (id: number) => {
    if (!confirm('¿Eliminar esta meta de ahorro?')) return
    await supabase.from('ahorros').update({ activo: false }).eq('id', id)
    load()
  }

  const totalMeta = ahorros.reduce((s, a) => s + a.meta, 0)
  const totalAcumulado = ahorros.reduce((s, a) => s + a.acumulado, 0)

  const iconOptions = ['🎯', '🏠', '✈️', '🚗', '💻', '📱', '💍', '🏖️', '📚', '💰']

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full" />
    </div>
  )

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <PiggyBank className="text-indigo-400" size={24} /> Ahorros
          </h1>
          <p className="text-slate-400 text-sm mt-1">Metas de ahorro y seguimiento</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
          style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
          <Plus size={16} /> Nueva Meta
        </button>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="stat-card">
          <p className="text-xs text-slate-400 mb-1">Total Acumulado</p>
          <p className="text-xl font-bold text-white">{fmt(totalAcumulado)}</p>
          <p className="text-xs text-slate-400 mt-1">de {fmt(totalMeta)} meta total</p>
          <div className="mt-2">
            <ProgressBar value={totalAcumulado} max={totalMeta} color="#22c55e" />
          </div>
        </div>
        <div className="stat-card">
          <p className="text-xs text-slate-400 mb-1">Metas Activas</p>
          <p className="text-xl font-bold text-white">{ahorros.length}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-slate-400 mb-1">Progreso General</p>
          <p className="text-xl font-bold text-white">
            {totalMeta > 0 ? ((totalAcumulado / totalMeta) * 100).toFixed(1) : '0'}%
          </p>
          <div className="flex items-center gap-1 text-xs text-green-400 mt-1">
            <TrendingUp size={12} />
          </div>
        </div>
      </div>

      {/* Form nueva meta */}
      {showForm && (
        <div className="card">
          <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Target size={14} className="text-indigo-400" /> Nueva Meta de Ahorro
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Nombre *</label>
              <input className="input w-full" placeholder="Ej: Departamento, Viaje..." value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Meta (MXN) *</label>
              <input className="input w-full" type="number" placeholder="0.00" value={form.meta} onChange={e => setForm(f => ({ ...f, meta: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Descripción</label>
              <input className="input w-full" placeholder="Opcional..." value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Fecha límite</label>
              <input className="input w-full" type="date" value={form.fecha_meta} onChange={e => setForm(f => ({ ...f, fecha_meta: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Ícono</label>
              <div className="flex gap-2 flex-wrap">
                {iconOptions.map(ic => (
                  <button key={ic} onClick={() => setForm(f => ({ ...f, icono: ic }))}
                    className={`text-xl p-1.5 rounded-lg transition-all ${form.icono === ic ? 'ring-2 ring-indigo-500' : ''}`}
                    style={{ background: '#1e293b' }}>{ic}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Color</label>
              <input type="color" className="w-full h-9 rounded-lg cursor-pointer" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={createAhorro} disabled={saving}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white"
              style={{ background: '#6366f1' }}>{saving ? 'Guardando...' : 'Crear Meta'}</button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white">Cancelar</button>
          </div>
        </div>
      )}

      {/* Lista de metas */}
      {ahorros.length === 0 ? (
        <div className="card text-center py-12">
          <PiggyBank size={40} className="mx-auto text-slate-600 mb-3" />
          <p className="text-white font-medium">Sin metas de ahorro</p>
          <p className="text-slate-400 text-sm mt-1">Crea tu primera meta para empezar a ahorrar</p>
        </div>
      ) : (
        <div className="space-y-3">
          {ahorros.map(a => {
            const pct = a.meta > 0 ? Math.min(100, (a.acumulado / a.meta) * 100) : 0
            const isExpanded = expanded === a.id
            const movs = movimientos.filter(m => m.ahorro_id === a.id)
            return (
              <div key={a.id} className="card">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                      style={{ background: a.color + '22' }}>{a.icono}</div>
                    <div>
                      <p className="font-semibold text-white">{a.nombre}</p>
                      {a.descripcion && <p className="text-xs text-slate-400">{a.descripcion}</p>}
                      {a.fecha_meta && <p className="text-xs text-slate-500 mt-0.5">Meta: {new Date(a.fecha_meta + 'T00:00:00').toLocaleDateString('es-MX', { month: 'short', day: 'numeric', year: 'numeric' })}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <p className="text-white font-bold">{fmt(a.acumulado)}</p>
                      <p className="text-xs text-slate-400">de {fmt(a.meta)}</p>
                    </div>
                    <button onClick={() => setExpanded(isExpanded ? null : a.id)} className="text-slate-400 hover:text-white p-1">
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                    <button onClick={() => deleteAhorro(a.id)} className="text-slate-600 hover:text-red-400 p-1">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <div className="mt-3">
                  <div className="flex justify-between text-xs text-slate-400 mb-1">
                    <span>{pct.toFixed(1)}% completado</span>
                    <span>Faltan {fmt(Math.max(0, a.meta - a.acumulado))}</span>
                  </div>
                  <ProgressBar value={a.acumulado} max={a.meta} color={a.color} />
                </div>

                {isExpanded && (
                  <div className="mt-4 pt-4" style={{ borderTop: '1px solid #1e293b' }}>
                    {/* Agregar movimiento */}
                    <div className="flex gap-2 mb-4">
                      <select className="input flex-shrink-0" value={movForm.id === a.id ? movForm.tipo : 'deposito'}
                        onChange={e => setMovForm(m => ({ ...m, id: a.id, tipo: e.target.value as 'deposito' | 'retiro' }))}>
                        <option value="deposito">Depósito</option>
                        <option value="retiro">Retiro</option>
                      </select>
                      <input className="input flex-1" type="number" placeholder="Monto"
                        value={movForm.id === a.id ? movForm.monto : ''}
                        onChange={e => setMovForm(m => ({ ...m, id: a.id, monto: e.target.value }))} />
                      <input className="input flex-1" placeholder="Nota (opcional)"
                        value={movForm.id === a.id ? movForm.nota : ''}
                        onChange={e => setMovForm(m => ({ ...m, id: a.id, nota: e.target.value }))} />
                      <button onClick={agregarMovimiento} disabled={movForm.id !== a.id || saving}
                        className="px-3 py-2 rounded-lg text-sm font-medium text-white flex-shrink-0"
                        style={{ background: '#6366f1' }}>+</button>
                    </div>

                    {/* Historial */}
                    <p className="text-xs text-slate-400 mb-2">Movimientos recientes</p>
                    {movs.length === 0 ? (
                      <p className="text-xs text-slate-500 text-center py-2">Sin movimientos aún</p>
                    ) : (
                      <div className="space-y-1.5">
                        {movs.slice(0, 10).map(m => (
                          <div key={m.id} className="flex items-center justify-between text-xs py-1.5 px-2 rounded-lg" style={{ background: '#0f172a' }}>
                            <div className="flex items-center gap-2">
                              {m.tipo === 'deposito'
                                ? <ArrowUpCircle size={14} className="text-green-400" />
                                : <ArrowDownCircle size={14} className="text-red-400" />}
                              <span className="text-slate-300">{m.nota || (m.tipo === 'deposito' ? 'Depósito' : 'Retiro')}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className={m.tipo === 'deposito' ? 'text-green-400' : 'text-red-400'}>
                                {m.tipo === 'deposito' ? '+' : '-'}{fmt(m.monto)}
                              </span>
                              <span className="text-slate-600">{m.fecha}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
