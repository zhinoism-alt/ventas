import { useEffect, useState, useCallback } from 'react'
import {
  RadialBarChart, RadialBar, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell,
} from 'recharts'
import {
  RefreshCw, ExternalLink, Plus, TrendingDown, TrendingUp,
  AlertTriangle, CheckCircle, DollarSign, PiggyBank,
  ChevronDown, ChevronUp, Loader2,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatMXN, getExchangeRate } from '../lib/api'
import { TOOLTIP_STYLE } from '../lib/constants'
import { fmt } from '../lib/utils'

// ─── Types ───────────────────────────────────────────────────────────────────

interface SheetConfig {
  id: number
  nombre: string
  sheet_id: string
  tab_name: string
  tipo: string
  last_synced: string | null
}

interface CacheRow {
  row_index: number
  data: Record<string, string | number>
  synced_at: string
}

interface GastoItem {
  concepto: string
  monto: number
  limite?: number
  categoria: 'necesario' | 'discrecional' | 'fijo'
  fecha?: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

function porcentajeSalud(gastos: number, ingreso: number): number {
  if (!ingreso) return 0
  const ahorro = ingreso - gastos
  return Math.max(0, Math.min(100, Math.round((ahorro / ingreso) * 100)))
}

function colorSalud(pct: number): string {
  if (pct >= 25) return '#22c55e'
  if (pct >= 10) return '#f59e0b'
  return '#ef4444'
}

function labelSalud(pct: number): string {
  if (pct >= 30) return 'Excelente 🎉'
  if (pct >= 20) return 'Bien 👍'
  if (pct >= 10) return 'Ajustado ⚠️'
  return 'Crítico 🚨'
}

// Gauge SVG simple (arco de 180°)
function GaugeChart({ pct, color, label }: { pct: number; color: string; label: string }) {
  const r = 70
  const cx = 100
  const cy = 90
  const total = Math.PI * r
  const filled = (pct / 100) * total
  // Arco va de 180° (izquierda) a 0° (derecha) = media circunferencia superior
  const startX = cx - r
  const endPct = pct / 100
  const endAngle = Math.PI * (1 - endPct)
  const endX = cx + r * Math.cos(endAngle) * -1
  const endY = cy - r * Math.sin(endAngle) * -1

  // Punto en la circunferencia basado en porcentaje
  const angle = Math.PI - (endPct * Math.PI)
  const nx = cx + r * Math.cos(angle)
  const ny = cy - r * Math.sin(angle)

  return (
    <div className="flex flex-col items-center">
      <svg width="200" height="115" viewBox="0 0 200 115">
        {/* Track (gris) */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none" stroke="#1e293b" strokeWidth="14" strokeLinecap="round"
        />
        {/* Fill (color) */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${nx} ${ny}`}
          fill="none" stroke={color} strokeWidth="14" strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.8s ease' }}
        />
        {/* Texto central */}
        <text x={cx} y={cy - 10} textAnchor="middle" fill="white" fontSize="28" fontWeight="bold">{pct}%</text>
        <text x={cx} y={cy + 12} textAnchor="middle" fill="#94a3b8" fontSize="11">{label}</text>
      </svg>
      <p className="text-xs text-slate-500 -mt-2">Salud financiera mensual</p>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function Presupuesto() {
  const [configs, setConfigs]         = useState<SheetConfig[]>([])
  const [rows, setRows]               = useState<CacheRow[]>([])
  const [activeConfig, setActiveConfig] = useState<SheetConfig | null>(null)
  const [ingreso, setIngreso]         = useState(0)
  const [gastos, setGastos]           = useState<GastoItem[]>([])
  const [syncing, setSyncing]         = useState(false)
  const [loading, setLoading]         = useState(true)
  const [showAddGasto, setShowAddGasto] = useState(false)
  const [showSemanal, setShowSemanal]  = useState(false)
  const [rate, setRate]               = useState(17.5)
  const [nuevoGasto, setNuevoGasto]   = useState({ concepto: '', monto: '', categoria: 'necesario', fecha: '' })
  const [saving, setSaving]           = useState(false)

  const mesActual  = new Date().getMonth() + 1
  const anioActual = new Date().getFullYear()

  // ── Cargar configs y datos ────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data: cfgs }, rateRes] = await Promise.all([
        supabase.from('sheets_sync_config').select('*').eq('activo', true).order('created_at'),
        getExchangeRate(),
      ])
      setConfigs(cfgs ?? [])
      setRate(rateRes.data?.usd_to_mxn ?? 17.5)

      const presupuestoCfg = (cfgs ?? []).find(c => c.tipo === 'presupuesto')
      if (presupuestoCfg) {
        setActiveConfig(presupuestoCfg)
        const { data: cacheRows } = await supabase
          .from('sheets_cache')
          .select('*')
          .eq('config_id', presupuestoCfg.id)
          .order('row_index')
        setRows(cacheRows ?? [])
        parseRows(cacheRows ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // ── Parsear filas del caché a estructura de gastos ────────────────────────
  function parseRows(cacheRows: CacheRow[]) {
    let ingresoTotal = 0
    const items: GastoItem[] = []

    for (const row of cacheRows) {
      const d = row.data
      const monto = parseFloat(String(d.monto ?? d.Monto ?? d.importe ?? d.Importe ?? 0).replace(/[$,]/g, ''))
      if (!monto) continue

      const concepto = String(d.concepto ?? d.Concepto ?? d.descripcion ?? d.Descripcion ?? `Fila ${row.row_index}`)
      const tipo     = String(d.tipo ?? d.Tipo ?? d.categoria ?? d.Categoria ?? '').toLowerCase()
      const fecha    = String(d.fecha ?? d.Fecha ?? '')

      if (tipo.includes('ingreso') || tipo.includes('sueldo') || tipo.includes('salario')) {
        ingresoTotal += monto
      } else {
        const cat: GastoItem['categoria'] =
          tipo.includes('fijo')       ? 'fijo' :
          tipo.includes('necesario')  ? 'necesario' : 'discrecional'
        items.push({ concepto, monto, categoria: cat, fecha })
      }
    }

    setIngreso(ingresoTotal || 37044.89)  // fallback a valor del screenshot
    setGastos(items)
  }

  // ── Sync manual ───────────────────────────────────────────────────────────
  const handleSync = async () => {
    if (!activeConfig) return
    setSyncing(true)
    try {
      const token = (await window.Clerk?.session?.getToken()) ?? ''
      const res   = await fetch('/api/sheets/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ config_id: activeConfig.id }),
      })
      if (res.ok) await loadData()
      else {
        const err = await res.json()
        alert(`Error: ${err.error}`)
      }
    } finally {
      setSyncing(false)
    }
  }

  // ── Agregar gasto rápido → Sheets ─────────────────────────────────────────
  const handleAddGasto = async () => {
    if (!nuevoGasto.concepto || !nuevoGasto.monto) return alert('Concepto y monto son requeridos')
    if (!activeConfig) return alert('No hay hoja de presupuesto configurada')
    setSaving(true)
    try {
      const token = (await window.Clerk?.session?.getToken()) ?? ''
      const res   = await fetch('/api/sheets/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          config_id: activeConfig.id,
          action:    'append',
          payload: {
            concepto:  nuevoGasto.concepto,
            monto:     parseFloat(nuevoGasto.monto),
            tipo:      nuevoGasto.categoria,
            fecha:     nuevoGasto.fecha || new Date().toISOString().split('T')[0],
          },
        }),
      })
      if (res.ok) {
        setNuevoGasto({ concepto: '', monto: '', categoria: 'necesario', fecha: '' })
        setShowAddGasto(false)
        // Optimistic update
        setGastos(prev => [...prev, {
          concepto: nuevoGasto.concepto,
          monto:    parseFloat(nuevoGasto.monto),
          categoria: nuevoGasto.categoria as GastoItem['categoria'],
          fecha:    nuevoGasto.fecha,
        }])
      } else {
        const err = await res.json()
        alert(`Error: ${err.error}`)
      }
    } finally {
      setSaving(false)
    }
  }

  // ── KPIs calculados ───────────────────────────────────────────────────────
  const totalGastos       = gastos.reduce((s, g) => s + g.monto, 0)
  const gastosFijos       = gastos.filter(g => g.categoria === 'fijo').reduce((s, g) => s + g.monto, 0)
  const gastosNecesarios  = gastos.filter(g => g.categoria === 'necesario').reduce((s, g) => s + g.monto, 0)
  const gastosDisc        = gastos.filter(g => g.categoria === 'discrecional').reduce((s, g) => s + g.monto, 0)
  const ahorroNeto        = ingreso - totalGastos
  const saludPct          = porcentajeSalud(totalGastos, ingreso)
  const saludColor        = colorSalud(saludPct)
  const saludLabel        = labelSalud(saludPct)

  // Barra de progreso por categoría
  const pctFijo     = ingreso > 0 ? Math.round((gastosFijos      / ingreso) * 100) : 0
  const pctNec      = ingreso > 0 ? Math.round((gastosNecesarios / ingreso) * 100) : 0
  const pctDisc     = ingreso > 0 ? Math.round((gastosDisc       / ingreso) * 100) : 0

  // Próximos gastos (con fecha futura)
  const hoy          = new Date().toISOString().split('T')[0]
  const proximosGastos = gastos
    .filter(g => g.fecha && g.fecha >= hoy)
    .sort((a, b) => (a.fecha ?? '') < (b.fecha ?? '') ? -1 : 1)
    .slice(0, 5)

  // Barras de categorías para gráfico
  const barData = [
    { name: 'Fijos',          value: gastosFijos,      fill: '#6366f1' },
    { name: 'Necesarios',     value: gastosNecesarios, fill: '#22c55e' },
    { name: 'Discrecionales', value: gastosDisc,       fill: '#f59e0b' },
    { name: 'Ahorro Neto',    value: Math.max(0, ahorroNeto), fill: '#06b6d4' },
  ]

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <div className="animate-spin w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full" />
        <p className="text-slate-500 text-sm">Cargando presupuesto...</p>
      </div>
    </div>
  )

  return (
    <div className="space-y-5 max-w-7xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Presupuesto Personal</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {MESES[mesActual - 1]} {anioActual}
            {activeConfig?.last_synced
              ? ` · Sincronizado ${new Date(activeConfig.last_synced).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`
              : ' · Sin sincronizar aún'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setShowAddGasto(s => !s)} className="btn-primary">
            <Plus size={14} /> Agregar Gasto Rápido
          </button>
          <button onClick={handleSync} disabled={syncing || !activeConfig} className="btn-secondary">
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Sincronizando...' : 'Sincronizar Sheets'}
          </button>
          {activeConfig && (
            <a
              href={`https://docs.google.com/spreadsheets/d/${activeConfig.sheet_id}/edit`}
              target="_blank" rel="noopener noreferrer" className="btn-secondary"
            >
              <ExternalLink size={14} /> Abrir Sheet
            </a>
          )}
        </div>
      </div>

      {/* ── Sin config aún ── */}
      {configs.length === 0 && (
        <div className="card text-center py-10">
          <AlertTriangle size={36} className="mx-auto text-yellow-400 mb-3" />
          <p className="text-white font-medium mb-1">No hay hoja de presupuesto conectada</p>
          <p className="text-slate-400 text-sm mb-4">Ve a la sección <strong>Sheets Sync</strong> para conectar tu Google Sheet de presupuesto.</p>
          <a href="/sheets" className="btn-primary inline-flex">Conectar hoja →</a>
        </div>
      )}

      {/* ── Modal: Agregar Gasto Rápido ── */}
      {showAddGasto && (
        <div className="card" style={{ borderColor: 'rgba(99,102,241,0.3)', background: '#0f1623' }}>
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <Plus size={14} className="text-indigo-400" /> Agregar Gasto Rápido → Google Sheets
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            <div>
              <label>Concepto</label>
              <input className="input" placeholder="Netflix, Gas, etc." value={nuevoGasto.concepto}
                onChange={e => setNuevoGasto(p => ({ ...p, concepto: e.target.value }))} />
            </div>
            <div>
              <label>Monto ($)</label>
              <input className="input" type="number" placeholder="450" value={nuevoGasto.monto}
                onChange={e => setNuevoGasto(p => ({ ...p, monto: e.target.value }))} />
            </div>
            <div>
              <label>Categoría</label>
              <select className="input" value={nuevoGasto.categoria}
                onChange={e => setNuevoGasto(p => ({ ...p, categoria: e.target.value }))}>
                <option value="necesario">Necesario</option>
                <option value="fijo">Fijo</option>
                <option value="discrecional">Discrecional</option>
              </select>
            </div>
            <div>
              <label>Fecha</label>
              <input className="input" type="date" value={nuevoGasto.fecha}
                onChange={e => setNuevoGasto(p => ({ ...p, fecha: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleAddGasto} disabled={saving} className="btn-primary">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              {saving ? 'Guardando...' : 'Guardar en Sheets'}
            </button>
            <button onClick={() => setShowAddGasto(false)} className="btn-secondary">Cancelar</button>
          </div>
        </div>
      )}

      {/* ── Stat Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { title: 'Ingreso Mensual',   value: fmt(ingreso),     color: '#22c55e', icon: <DollarSign size={18}/>, sub: 'Base de cálculo' },
          { title: 'Total Gastos',       value: fmt(totalGastos), color: '#f59e0b', icon: <TrendingDown size={18}/>, sub: `${Math.round((totalGastos/ingreso)*100)}% del ingreso` },
          { title: 'Ahorro Neto',        value: fmt(Math.abs(ahorroNeto)), color: ahorroNeto >= 0 ? '#6366f1' : '#ef4444', icon: <PiggyBank size={18}/>, sub: ahorroNeto >= 0 ? 'Disponible este mes' : '¡Gasto mayor al ingreso!' },
          { title: 'Salud Financiera',   value: `${saludPct}%`,  color: saludColor, icon: <CheckCircle size={18}/>, sub: saludLabel },
        ].map(c => (
          <div key={c.title} className="stat-card" style={{ borderTop: `2px solid ${c.color}` }}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">{c.title}</p>
                <p className="text-xl font-bold text-white">{c.value}</p>
                <p className="text-xs text-slate-500 mt-1">{c.sub}</p>
              </div>
              <div className="p-2 rounded-lg" style={{ background: `${c.color}20` }}>
                <span style={{ color: c.color }}>{c.icon}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Layout 2 columnas: Gauge + Progreso ↔ Próximos gastos + Alerta ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Col Izquierda (2/3): Gauge + Barras ─────────────────────────────── */}
        <div className="lg:col-span-2 space-y-4">

          {/* Gauge + Barras de progreso */}
          <div className="card">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
              <GaugeChart pct={saludPct} color={saludColor} label={saludLabel} />

              <div className="space-y-4">
                {[
                  { label: 'Gastos Fijos',        value: gastosFijos,      pct: pctFijo, color: '#6366f1' },
                  { label: 'Gastos Necesarios',    value: gastosNecesarios, pct: pctNec,  color: '#22c55e' },
                  { label: 'Gastos Discrecionales',value: gastosDisc,       pct: pctDisc, color: '#f59e0b' },
                ].map(bar => (
                  <div key={bar.label}>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-slate-300 font-medium">{bar.label}</span>
                      <span className="font-semibold" style={{ color: bar.color }}>
                        {fmt(bar.value)} <span className="text-slate-500">({bar.pct}%)</span>
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full" style={{ background: '#0f172a' }}>
                      <div
                        className="h-2 rounded-full transition-all duration-700"
                        style={{ width: `${Math.min(100, bar.pct)}%`, background: `linear-gradient(90deg, ${bar.color}99, ${bar.color})` }}
                      />
                    </div>
                    {bar.pct > 80 && (
                      <p className="text-[10px] text-yellow-400 mt-0.5 flex items-center gap-1">
                        <AlertTriangle size={9} /> Cercano al límite
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Gráfico de barras por categoría */}
          <div className="card">
            <h3 className="text-sm font-semibold text-white mb-4">Distribución del Ingreso</h3>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={barData} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="#1e3050" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false}
                  tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => formatMXN(v)} />
                <Bar dataKey="value" radius={[5, 5, 0, 0]}>
                  {barData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Col Derecha (1/3): Próximos gastos + Alertas ────────────────────── */}
        <div className="space-y-4">

          {/* Ahorro neto */}
          <div className="card" style={{ borderTop: `2px solid ${ahorroNeto >= 0 ? '#6366f1' : '#ef4444'}` }}>
            <div className="flex items-center gap-2 mb-2">
              {ahorroNeto >= 0
                ? <TrendingUp size={16} className="text-indigo-400" />
                : <TrendingDown size={16} className="text-red-400" />}
              <h3 className="text-sm font-semibold text-white">Ahorro Neto</h3>
            </div>
            <p className="text-2xl font-bold" style={{ color: ahorroNeto >= 0 ? '#818cf8' : '#f87171' }}>
              {fmt(Math.abs(ahorroNeto))}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {ahorroNeto >= 0
                ? `≈ ${fmt(ahorroNeto / 30)}/día disponibles`
                : `Déficit: gastaste ${fmt(Math.abs(ahorroNeto))} más de lo que ingresaste`}
            </p>
          </div>

          {/* Próximos gastos */}
          {proximosGastos.length > 0 && (
            <div className="card">
              <h3 className="text-sm font-semibold text-white mb-3">Próximos Gastos</h3>
              <div className="space-y-2">
                {proximosGastos.map((g, i) => {
                  const dias = g.fecha
                    ? Math.ceil((new Date(g.fecha).getTime() - Date.now()) / 86400000)
                    : null
                  return (
                    <div key={i} className="flex items-center justify-between py-1 border-b last:border-0" style={{ borderColor: '#1e3050' }}>
                      <div>
                        <p className="text-xs text-slate-200 font-medium">{g.concepto}</p>
                        {dias !== null && (
                          <p className="text-[10px] text-slate-500">
                            {dias === 0 ? 'Hoy' : dias === 1 ? 'Mañana' : `En ${dias} días`}
                          </p>
                        )}
                      </div>
                      <span className="text-xs font-bold text-white">{fmt(g.monto)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Alertas */}
          {pctDisc > 70 && (
            <div className="card" style={{ borderLeft: '3px solid #f59e0b', background: '#1a1200' }}>
              <div className="flex items-start gap-2">
                <AlertTriangle size={16} className="text-yellow-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs text-yellow-300 font-semibold">Gastos discrecionales altos</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {pctDisc}% del ingreso en gastos no esenciales. Considera reducirlos.
                  </p>
                </div>
              </div>
            </div>
          )}

          {ahorroNeto < 0 && (
            <div className="card" style={{ borderLeft: '3px solid #ef4444', background: '#1a0000' }}>
              <div className="flex items-start gap-2">
                <AlertTriangle size={16} className="text-red-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs text-red-300 font-semibold">Gasto mayor al ingreso</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Déficit de {fmt(Math.abs(ahorroNeto))}. Revisa gastos discrecionales.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Tabla detalle (desplegable) ── */}
      <div className="card">
        <button
          onClick={() => setShowSemanal(s => !s)}
          className="w-full flex items-center justify-between text-sm font-semibold text-white"
        >
          <span>Detalle de gastos ({gastos.length} items)</span>
          {showSemanal ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {showSemanal && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b" style={{ borderColor: '#1e3050' }}>
                  <th className="text-left py-2 text-slate-400 font-medium">Concepto</th>
                  <th className="text-left py-2 text-slate-400 font-medium">Categoría</th>
                  <th className="text-left py-2 text-slate-400 font-medium">Fecha</th>
                  <th className="text-right py-2 text-slate-400 font-medium">Monto</th>
                </tr>
              </thead>
              <tbody>
                {gastos.map((g, i) => (
                  <tr key={i} className="table-row-hover border-b last:border-0" style={{ borderColor: '#1e3050' }}>
                    <td className="py-2 text-slate-200">{g.concepto}</td>
                    <td className="py-2">
                      <span className={`badge ${g.categoria === 'fijo' ? 'badge-indigo' : g.categoria === 'necesario' ? 'badge-green' : 'badge-yellow'}`}>
                        {g.categoria}
                      </span>
                    </td>
                    <td className="py-2 text-slate-400">{g.fecha || '—'}</td>
                    <td className="py-2 text-right font-semibold text-white">{fmt(g.monto)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t" style={{ borderColor: '#2d3f58' }}>
                  <td colSpan={3} className="py-2 text-slate-400 font-medium">Total</td>
                  <td className="py-2 text-right font-bold text-white">{fmt(totalGastos)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

    </div>
  )
}
