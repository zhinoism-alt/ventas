import { useEffect, useState } from 'react'
import {
  PiggyBank, Plus, TrendingUp, Target, Trash2,
  ChevronDown, ChevronUp, ArrowUpCircle, ArrowDownCircle,
  Wallet, Percent, Edit2, Check, X,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { fmt } from '../lib/utils'

// ── Tipos ────────────────────────────────────────────────────────────────────

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

interface Fondo {
  id: number
  nombre: string
  saldo: number
  moneda: string
  rendimiento: number   // % anual
  descripcion: string
  icono: string
  color: string
  activo: boolean
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="w-full h-2 rounded-full" style={{ background: '#1e293b' }}>
      <div className="h-2 rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

const ICONOS = ['💰', '🛡️', '📈', '🏦', '🎯', '🏠', '✈️', '🚗', '💻', '📱', '💍', '🏖️', '📚', '💎']

// ── Componente principal ─────────────────────────────────────────────────────

export default function Ahorros() {
  // — Metas —
  const [ahorros, setAhorros]       = useState<Ahorro[]>([])
  const [movimientos, setMovimientos] = useState<Movimiento[]>([])
  const [showMetaForm, setShowMetaForm] = useState(false)
  const [expanded, setExpanded]     = useState<number | null>(null)
  const [movForm, setMovForm]       = useState<{ id: number | null; tipo: 'deposito' | 'retiro'; monto: string; nota: string }>({
    id: null, tipo: 'deposito', monto: '', nota: '',
  })
  const [metaForm, setMetaForm]     = useState({ nombre: '', meta: '', descripcion: '', fecha_meta: '', color: '#6366f1', icono: '🎯' })

  // — Fondos —
  const [fondos, setFondos]         = useState<Fondo[]>([])
  const [showFondoForm, setShowFondoForm] = useState(false)
  const [fondoForm, setFondoForm]   = useState({ nombre: '', saldo: '', rendimiento: '', descripcion: '', color: '#22c55e', icono: '💰' })
  const [editFondo, setEditFondo]   = useState<Fondo | null>(null)
  const [editSaldo, setEditSaldo]   = useState('')

  // — General —
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [tab, setTab]               = useState<'fondos' | 'metas'>('fondos')

  // ── Carga de datos ──────────────────────────────────────────────────────────

  const load = async () => {
    const [{ data: a }, { data: m }, { data: f }] = await Promise.all([
      supabase.from('ahorros').select('*').eq('activo', true).order('created_at', { ascending: false }),
      supabase.from('ahorros_movimientos').select('*').order('fecha', { ascending: false }),
      supabase.from('fondos_ahorro').select('*').eq('activo', true).order('created_at', { ascending: false }),
    ])
    setAhorros(a ?? [])
    setMovimientos(m ?? [])
    setFondos(f ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // ── Fondos: CRUD ────────────────────────────────────────────────────────────

  const createFondo = async () => {
    if (!fondoForm.nombre || !fondoForm.saldo) return
    setSaving(true)
    await supabase.from('fondos_ahorro').insert({
      nombre:      fondoForm.nombre,
      saldo:       Number(fondoForm.saldo),
      rendimiento: Number(fondoForm.rendimiento) || 0,
      descripcion: fondoForm.descripcion,
      color:       fondoForm.color,
      icono:       fondoForm.icono,
    })
    setFondoForm({ nombre: '', saldo: '', rendimiento: '', descripcion: '', color: '#22c55e', icono: '💰' })
    setShowFondoForm(false)
    setSaving(false)
    load()
  }

  const actualizarSaldoFondo = async (fondo: Fondo) => {
    const nuevoSaldo = Number(editSaldo)
    if (isNaN(nuevoSaldo)) return
    await supabase.from('fondos_ahorro')
      .update({ saldo: nuevoSaldo, updated_at: new Date().toISOString() })
      .eq('id', fondo.id)
    setEditFondo(null)
    setEditSaldo('')
    load()
  }

  const deleteFondo = async (id: number) => {
    if (!confirm('¿Eliminar este fondo?')) return
    await supabase.from('fondos_ahorro').update({ activo: false }).eq('id', id)
    load()
  }

  // ── Metas: CRUD ─────────────────────────────────────────────────────────────

  const createAhorro = async () => {
    if (!metaForm.nombre || !metaForm.meta) return
    setSaving(true)
    await supabase.from('ahorros').insert({
      nombre:     metaForm.nombre,
      meta:       Number(metaForm.meta),
      descripcion: metaForm.descripcion,
      fecha_meta: metaForm.fecha_meta || null,
      color:      metaForm.color,
      icono:      metaForm.icono,
    })
    setMetaForm({ nombre: '', meta: '', descripcion: '', fecha_meta: '', color: '#6366f1', icono: '🎯' })
    setShowMetaForm(false)
    setSaving(false)
    load()
  }

  const agregarMovimiento = async () => {
    if (!movForm.id || !movForm.monto) return
    setSaving(true)
    const monto = Number(movForm.monto)
    await supabase.from('ahorros_movimientos').insert({
      ahorro_id: movForm.id, monto, tipo: movForm.tipo, nota: movForm.nota,
    })
    const ahorro = ahorros.find(a => a.id === movForm.id)
    if (ahorro) {
      const nuevo = movForm.tipo === 'deposito'
        ? ahorro.acumulado + monto
        : Math.max(0, ahorro.acumulado - monto)
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

  // ── Stats ───────────────────────────────────────────────────────────────────

  const totalFondos    = fondos.reduce((s, f) => s + f.saldo, 0)
  const totalMeta      = ahorros.reduce((s, a) => s + a.meta, 0)
  const totalAcumulado = ahorros.reduce((s, a) => s + a.acumulado, 0)
  const totalGeneral   = totalFondos + totalAcumulado
  const gananciasAnualesEstimadas = fondos.reduce((s, f) => s + f.saldo * (f.rendimiento / 100), 0)

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full" />
    </div>
  )

  return (
    <div className="space-y-6 max-w-4xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <PiggyBank className="text-indigo-400" size={24} /> Ahorros
          </h1>
          <p className="text-slate-400 text-sm mt-1">Fondos y metas de ahorro</p>
        </div>
        <button
          onClick={() => tab === 'fondos' ? setShowFondoForm(true) : setShowMetaForm(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
          style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
          <Plus size={16} /> {tab === 'fondos' ? 'Nuevo Fondo' : 'Nueva Meta'}
        </button>
      </div>

      {/* ── Resumen general ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card col-span-2 lg:col-span-1">
          <p className="text-xs text-slate-400 mb-1">Total Ahorrado</p>
          <p className="text-xl font-bold text-white">{fmt(totalGeneral)}</p>
          <p className="text-xs text-slate-400 mt-1">fondos + metas</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-slate-400 mb-1">En Fondos</p>
          <p className="text-xl font-bold text-green-400">{fmt(totalFondos)}</p>
          <p className="text-xs text-slate-400 mt-1">{fondos.length} apartado{fondos.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-slate-400 mb-1">Rend. Anual Est.</p>
          <p className="text-xl font-bold text-yellow-400">{fmt(gananciasAnualesEstimadas)}</p>
          <p className="text-xs text-slate-400 mt-1">suma de fondos</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-slate-400 mb-1">Metas — Progreso</p>
          <p className="text-xl font-bold text-white">
            {totalMeta > 0 ? ((totalAcumulado / totalMeta) * 100).toFixed(1) : '0'}%
          </p>
          <p className="text-xs text-slate-400 mt-1">{fmt(totalAcumulado)} de {fmt(totalMeta)}</p>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 p-1 rounded-xl" style={{ background: '#1e293b' }}>
        {(['fondos', 'metas'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="flex-1 py-2 rounded-lg text-sm font-medium transition-all"
            style={tab === t
              ? { background: '#6366f1', color: '#fff' }
              : { color: '#94a3b8' }}>
            {t === 'fondos' ? `💰 Fondos (${fondos.length})` : `🎯 Metas (${ahorros.length})`}
          </button>
        ))}
      </div>

      {/* ══════════════════ TAB: FONDOS ══════════════════ */}
      {tab === 'fondos' && (
        <div className="space-y-4">

          {/* Form nuevo fondo */}
          {showFondoForm && (
            <div className="card">
              <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <Wallet size={14} className="text-green-400" /> Nuevo Fondo / Apartado
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Nombre *</label>
                  <input className="input w-full" placeholder="Ej: Fondo de Emergencia…"
                    value={fondoForm.nombre}
                    onChange={e => setFondoForm(f => ({ ...f, nombre: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Saldo actual (MXN) *</label>
                  <input className="input w-full" type="number" placeholder="0.00"
                    value={fondoForm.saldo}
                    onChange={e => setFondoForm(f => ({ ...f, saldo: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Rendimiento anual (%)</label>
                  <input className="input w-full" type="number" step="0.1" placeholder="Ej: 8.5"
                    value={fondoForm.rendimiento}
                    onChange={e => setFondoForm(f => ({ ...f, rendimiento: e.target.value }))} />
                  <p className="text-xs text-slate-500 mt-1">Deja en 0 si no genera intereses</p>
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Descripción</label>
                  <input className="input w-full" placeholder="Ej: CETES, cuenta BBVA…"
                    value={fondoForm.descripcion}
                    onChange={e => setFondoForm(f => ({ ...f, descripcion: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Ícono</label>
                  <div className="flex gap-2 flex-wrap">
                    {ICONOS.map(ic => (
                      <button key={ic} onClick={() => setFondoForm(f => ({ ...f, icono: ic }))}
                        className={`text-xl p-1.5 rounded-lg transition-all ${fondoForm.icono === ic ? 'ring-2 ring-green-500' : ''}`}
                        style={{ background: '#1e293b' }}>{ic}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Color</label>
                  <input type="color" className="w-full h-9 rounded-lg cursor-pointer"
                    value={fondoForm.color}
                    onChange={e => setFondoForm(f => ({ ...f, color: e.target.value }))} />
                </div>
              </div>
              <div className="flex gap-3 mt-4">
                <button onClick={createFondo} disabled={saving}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white"
                  style={{ background: '#22c55e' }}>
                  {saving ? 'Guardando…' : 'Crear Fondo'}
                </button>
                <button onClick={() => setShowFondoForm(false)}
                  className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white">
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Lista de fondos */}
          {fondos.length === 0 ? (
            <div className="card text-center py-12">
              <Wallet size={40} className="mx-auto text-slate-600 mb-3" />
              <p className="text-white font-medium">Sin fondos aún</p>
              <p className="text-slate-400 text-sm mt-1">Agrega tus cuentas, CETES, fondos de emergencia…</p>
              <button onClick={() => setShowFondoForm(true)}
                className="mt-4 px-4 py-2 rounded-lg text-sm font-medium text-white inline-flex items-center gap-2"
                style={{ background: '#22c55e' }}>
                <Plus size={14} /> Crear primer fondo
              </button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {fondos.map(f => {
                const gananciasAnual = f.saldo * (f.rendimiento / 100)
                const totalAnio     = f.saldo + gananciasAnual
                const isEditing     = editFondo?.id === f.id
                return (
                  <div key={f.id} className="card relative overflow-hidden">
                    {/* Barra de color lateral */}
                    <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl"
                      style={{ background: f.color }} />

                    <div className="pl-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                            style={{ background: f.color + '22' }}>{f.icono}</div>
                          <div>
                            <p className="font-semibold text-white">{f.nombre}</p>
                            {f.descripcion && <p className="text-xs text-slate-400">{f.descripcion}</p>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button onClick={() => { setEditFondo(f); setEditSaldo(String(f.saldo)) }}
                            className="text-slate-500 hover:text-blue-400 p-1.5 rounded-lg transition-colors"
                            title="Actualizar saldo">
                            <Edit2 size={13} />
                          </button>
                          <button onClick={() => deleteFondo(f.id)}
                            className="text-slate-500 hover:text-red-400 p-1.5 rounded-lg transition-colors">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>

                      {/* Saldo */}
                      <div className="mt-4">
                        {isEditing ? (
                          <div className="flex items-center gap-2">
                            <input className="input flex-1 text-lg font-bold" type="number"
                              value={editSaldo}
                              onChange={e => setEditSaldo(e.target.value)}
                              autoFocus
                              onKeyDown={e => e.key === 'Enter' && actualizarSaldoFondo(f)} />
                            <button onClick={() => actualizarSaldoFondo(f)}
                              className="p-2 rounded-lg bg-green-500 hover:bg-green-400 text-white">
                              <Check size={14} />
                            </button>
                            <button onClick={() => setEditFondo(null)}
                              className="p-2 rounded-lg text-slate-400 hover:text-white"
                              style={{ background: '#1e293b' }}>
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <p className="text-2xl font-bold text-white">{fmt(f.saldo)}</p>
                        )}
                        <p className="text-xs text-slate-500 mt-0.5">saldo actual</p>
                      </div>

                      {/* Rendimiento */}
                      <div className="mt-4 pt-3 grid grid-cols-2 gap-3" style={{ borderTop: '1px solid #1e293b' }}>
                        <div className="rounded-lg p-2.5" style={{ background: '#0f172a' }}>
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <Percent size={11} className="text-yellow-400" />
                            <p className="text-xs text-slate-400">Rendimiento anual</p>
                          </div>
                          <p className="text-base font-bold text-yellow-400">{f.rendimiento}%</p>
                        </div>
                        <div className="rounded-lg p-2.5" style={{ background: '#0f172a' }}>
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <TrendingUp size={11} className="text-green-400" />
                            <p className="text-xs text-slate-400">Ganancia anual est.</p>
                          </div>
                          <p className="text-base font-bold text-green-400">+{fmt(gananciasAnual)}</p>
                        </div>
                      </div>

                      {f.rendimiento > 0 && (
                        <div className="mt-2 rounded-lg px-3 py-2 flex items-center justify-between"
                          style={{ background: f.color + '15', border: `1px solid ${f.color}30` }}>
                          <span className="text-xs text-slate-400">Total en 1 año</span>
                          <span className="text-sm font-bold" style={{ color: f.color }}>{fmt(totalAnio)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Resumen total de fondos */}
          {fondos.length > 1 && (
            <div className="card" style={{ background: 'linear-gradient(135deg, #0f2a1a, #0f172a)', border: '1px solid #22c55e30' }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                  style={{ background: '#22c55e22' }}>📊</div>
                <div>
                  <p className="text-xs text-slate-400">Proyección total en 12 meses</p>
                  <p className="text-xl font-bold text-green-400">
                    {fmt(fondos.reduce((s, f) => s + f.saldo + f.saldo * (f.rendimiento / 100), 0))}
                  </p>
                  <p className="text-xs text-slate-500">
                    +{fmt(gananciasAnualesEstimadas)} de rendimientos sobre {fmt(totalFondos)}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════ TAB: METAS ══════════════════ */}
      {tab === 'metas' && (
        <div className="space-y-4">

          {/* Form nueva meta */}
          {showMetaForm && (
            <div className="card">
              <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <Target size={14} className="text-indigo-400" /> Nueva Meta de Ahorro
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Nombre *</label>
                  <input className="input w-full" placeholder="Ej: Departamento, Viaje…"
                    value={metaForm.nombre}
                    onChange={e => setMetaForm(f => ({ ...f, nombre: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Meta (MXN) *</label>
                  <input className="input w-full" type="number" placeholder="0.00"
                    value={metaForm.meta}
                    onChange={e => setMetaForm(f => ({ ...f, meta: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Descripción</label>
                  <input className="input w-full" placeholder="Opcional…"
                    value={metaForm.descripcion}
                    onChange={e => setMetaForm(f => ({ ...f, descripcion: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Fecha límite</label>
                  <input className="input w-full" type="date"
                    value={metaForm.fecha_meta}
                    onChange={e => setMetaForm(f => ({ ...f, fecha_meta: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Ícono</label>
                  <div className="flex gap-2 flex-wrap">
                    {ICONOS.map(ic => (
                      <button key={ic} onClick={() => setMetaForm(f => ({ ...f, icono: ic }))}
                        className={`text-xl p-1.5 rounded-lg transition-all ${metaForm.icono === ic ? 'ring-2 ring-indigo-500' : ''}`}
                        style={{ background: '#1e293b' }}>{ic}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Color</label>
                  <input type="color" className="w-full h-9 rounded-lg cursor-pointer"
                    value={metaForm.color}
                    onChange={e => setMetaForm(f => ({ ...f, color: e.target.value }))} />
                </div>
              </div>
              <div className="flex gap-3 mt-4">
                <button onClick={createAhorro} disabled={saving}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white"
                  style={{ background: '#6366f1' }}>
                  {saving ? 'Guardando…' : 'Crear Meta'}
                </button>
                <button onClick={() => setShowMetaForm(false)}
                  className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white">
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Lista de metas */}
          {ahorros.length === 0 ? (
            <div className="card text-center py-12">
              <PiggyBank size={40} className="mx-auto text-slate-600 mb-3" />
              <p className="text-white font-medium">Sin metas de ahorro</p>
              <p className="text-slate-400 text-sm mt-1">Crea tu primera meta para empezar a ahorrar</p>
              <button onClick={() => setShowMetaForm(true)}
                className="mt-4 px-4 py-2 rounded-lg text-sm font-medium text-white inline-flex items-center gap-2"
                style={{ background: '#6366f1' }}>
                <Plus size={14} /> Crear primera meta
              </button>
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
                          {a.fecha_meta && (
                            <p className="text-xs text-slate-500 mt-0.5">
                              Meta: {new Date(a.fecha_meta + 'T00:00:00').toLocaleDateString('es-MX', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          <p className="text-white font-bold">{fmt(a.acumulado)}</p>
                          <p className="text-xs text-slate-400">de {fmt(a.meta)}</p>
                        </div>
                        <button onClick={() => setExpanded(isExpanded ? null : a.id)}
                          className="text-slate-400 hover:text-white p-1">
                          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                        <button onClick={() => deleteAhorro(a.id)}
                          className="text-slate-600 hover:text-red-400 p-1">
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
                        <div className="flex gap-2 mb-4">
                          <select className="input flex-shrink-0"
                            value={movForm.id === a.id ? movForm.tipo : 'deposito'}
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
                          <button onClick={agregarMovimiento}
                            disabled={movForm.id !== a.id || saving}
                            className="px-3 py-2 rounded-lg text-sm font-medium text-white flex-shrink-0"
                            style={{ background: '#6366f1' }}>+</button>
                        </div>

                        <p className="text-xs text-slate-400 mb-2">Movimientos recientes</p>
                        {movs.length === 0 ? (
                          <p className="text-xs text-slate-500 text-center py-2">Sin movimientos aún</p>
                        ) : (
                          <div className="space-y-1.5">
                            {movs.slice(0, 10).map(m => (
                              <div key={m.id}
                                className="flex items-center justify-between text-xs py-1.5 px-2 rounded-lg"
                                style={{ background: '#0f172a' }}>
                                <div className="flex items-center gap-2">
                                  {m.tipo === 'deposito'
                                    ? <ArrowUpCircle size={14} className="text-green-400" />
                                    : <ArrowDownCircle size={14} className="text-red-400" />}
                                  <span className="text-slate-300">
                                    {m.nota || (m.tipo === 'deposito' ? 'Depósito' : 'Retiro')}
                                  </span>
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
      )}
    </div>
  )
}
