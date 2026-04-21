import { useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'
import {
  TrendingUp, TrendingDown, DollarSign, Users, AlertTriangle,
  Bell, PiggyBank, Tv, Package, ExternalLink, Star, ArrowRight,
  Percent, RefreshCw,
} from 'lucide-react'
import { getSummary, getExpiringSubscriptions, formatMXN } from '../lib/api'
import { supabase } from '../lib/supabase'
import { TOOLTIP_STYLE, formatMonth } from '../lib/constants'
import { fmt } from '../lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Summary {
  total_ingresos_mxn: number
  total_gastos_mxn: number
  ganancia_neta_mxn: number
  ingresos_productos: number
  ingresos_iptv: number
  clientes_activos_iptv: number
  monthly_chart: { month: string; productos: number; iptv: number; costo_iptv: number }[]
  usd_to_mxn: number
}

interface Ahorro {
  id: number
  nombre: string
  meta: number
  acumulado: number
  moneda: string
  color: string
  icono: string
  fecha_meta: string | null
}

interface Fondo {
  id: number
  nombre: string
  saldo: number
  rendimiento: number
  icono: string
  color: string
}

interface Recordatorio {
  id: number
  titulo: string
  tipo: string
  fecha_hora: string
  importante: boolean
  color: string
  completado: boolean
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ExpiringSub = any

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DAYS_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MONTHS_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

function todayLabel() {
  const d = new Date()
  return `${DAYS_ES[d.getDay()]} ${d.getDate()} de ${MONTHS_ES[d.getMonth()]}, ${d.getFullYear()}`
}

function greet() {
  const h = new Date().getHours()
  if (h < 12) return 'Buenos días'
  if (h < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

function daysUntil(dateStr: string) {
  const diff = new Date(dateStr).getTime() - Date.now()
  return Math.ceil(diff / 86400000)
}

function formatDateTime(dt: string) {
  const d = new Date(dt)
  return d.toLocaleDateString('es-MX', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  title, value, sub, icon, color, trend, accent,
}: {
  title: string; value: string; sub?: string; icon: React.ReactNode
  color: string; trend?: 'up' | 'down' | 'neutral'; accent?: string
}) {
  return (
    <div className="stat-card" style={accent ? { borderTop: `2px solid ${accent}` } : {}}>
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-slate-400 mb-1.5 uppercase tracking-wide font-medium">{title}</p>
          <p className="text-2xl font-bold text-white truncate leading-tight">{value}</p>
          {sub && <p className="text-xs text-slate-400 mt-1.5">{sub}</p>}
        </div>
        <div
          className="p-2.5 rounded-xl flex-shrink-0 ml-3"
          style={{ background: `linear-gradient(135deg, ${color}28, ${color}12)`, border: `1px solid ${color}22` }}
        >
          <span style={{ color }}>{icon}</span>
        </div>
      </div>
      {trend && (
        <div className={`flex items-center gap-1 text-xs mt-0.5 font-medium ${trend === 'up' ? 'text-green-400' : trend === 'down' ? 'text-red-400' : 'text-slate-500'}`}>
          {trend === 'up' && <TrendingUp size={11} />}
          {trend === 'down' && <TrendingDown size={11} />}
          {trend === 'up' ? 'En positivo' : trend === 'down' ? 'En pérdida' : 'Sin variación'}
        </div>
      )}
    </div>
  )
}

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="w-full h-2 rounded-full" style={{ background: '#0f172a' }}>
      <div
        className="h-2 rounded-full transition-all duration-700"
        style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}cc, ${color})` }}
      />
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const [summary, setSummary]         = useState<Summary | null>(null)
  const [expiring, setExpiring]       = useState<ExpiringSub[]>([])
  const [ahorros, setAhorros]         = useState<Ahorro[]>([])
  const [fondos, setFondos]           = useState<Fondo[]>([])
  const [recordatorios, setRecordatorios] = useState<Recordatorio[]>([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState('')

  useEffect(() => {
    const now = new Date().toISOString()

    Promise.all([
      getSummary(),
      getExpiringSubscriptions(7),
      supabase.from('ahorros').select('*').eq('activo', true).order('created_at', { ascending: false }),
      supabase.from('fondos_ahorro').select('*').eq('activo', true).order('created_at', { ascending: false }),
      supabase
        .from('recordatorios')
        .select('*')
        .eq('completado', false)
        .gte('fecha_hora', now)
        .order('fecha_hora', { ascending: true })
        .limit(5),
    ])
      .then(([s, e, a, f, r]) => {
        setSummary(s.data)
        setExpiring(e.data)
        setAhorros(a.data ?? [])
        setFondos(f.data ?? [])
        setRecordatorios(r.data ?? [])
      })
      .catch((err: unknown) => {
        const e = err as { message?: string; code?: string; details?: string }
        const msg = e?.message || e?.details || e?.code || JSON.stringify(err)
        setError(`[${e?.code || '?'}] ${msg}`)
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <div className="animate-spin w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full" />
        <p className="text-slate-500 text-sm">Cargando datos...</p>
      </div>
    </div>
  )

  if (error) return (
    <div className="flex items-center justify-center h-64">
      <div className="card text-center max-w-md">
        <AlertTriangle size={32} className="mx-auto text-yellow-400 mb-3" />
        <p className="text-white font-medium mb-1">Error de conexión</p>
        <p className="text-slate-400 text-sm">{error}</p>
      </div>
    </div>
  )

  if (!summary) return null

  const ganancia = summary.ganancia_neta_mxn ?? 0
  const isProfit = ganancia >= 0
  const profitMargin = summary.total_ingresos_mxn > 0
    ? ((ganancia / summary.total_ingresos_mxn) * 100).toFixed(1)
    : '0'

  const chartData = (summary.monthly_chart || []).map(m => ({
    name: formatMonth(m.month),
    Productos: Math.round(m.productos || 0),
    IPTV: Math.round(m.iptv || 0),
  }))

  const totalAcumulado      = ahorros.reduce((s, a) => s + a.acumulado, 0)
  const totalMeta           = ahorros.reduce((s, a) => s + a.meta, 0)
  const ahorrosPct          = totalMeta > 0 ? Math.round((totalAcumulado / totalMeta) * 100) : 0
  const totalFondos         = fondos.reduce((s, f) => s + f.saldo, 0)
  const rendimientoAnual    = fondos.reduce((s, f) => s + f.saldo * (f.rendimiento / 100), 0)
  const totalAhorradoGeneral = totalAcumulado + totalFondos

  // Upcoming reminders with urgency
  const upcomingRecs = recordatorios.map(r => ({
    ...r,
    daysLeft: daysUntil(r.fecha_hora),
  }))

  return (
    <div className="space-y-5 max-w-7xl mx-auto">

      {/* ── Greeting ── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-white">{greet()}, Brandon 👋</h1>
          <p className="text-slate-400 text-sm mt-0.5 capitalize">{todayLabel()}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {summary.usd_to_mxn > 0 && (
            <div
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
              style={{ background: '#1e293b', border: '1px solid #2d3f58' }}
            >
              <RefreshCw size={11} className="text-slate-500" />
              <span className="text-slate-400">USD</span>
              <span className="text-white font-semibold">${summary.usd_to_mxn.toFixed(2)}</span>
              <span className="text-slate-500">MXN</span>
            </div>
          )}
          <a
            href="/presupuesto"
            className="btn-secondary text-xs flex items-center gap-1.5"
            style={{ textDecoration: 'none' }}
          >
            <ExternalLink size={13} /> Ver Presupuesto
          </a>
        </div>
      </div>

      {/* ── IPTV Expiration Alert ── */}
      {expiring.length > 0 && (
        <div
          className="flex items-start gap-3 p-4 rounded-xl border"
          style={{ background: '#713f1215', borderColor: '#92400e55' }}
        >
          <AlertTriangle size={18} className="text-yellow-400 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-yellow-300 font-medium text-sm">
              {expiring.length} suscripción{expiring.length > 1 ? 'es' : ''} por vencer esta semana
            </p>
            <p className="text-slate-400 text-xs mt-0.5">
              {expiring.slice(0, 3).map((e: ExpiringSub) => e.client_name).join(', ')}
              {expiring.length > 3 ? ` y ${expiring.length - 3} más` : ''}
            </p>
          </div>
          <a href="/iptv" className="text-xs text-yellow-400 hover:text-yellow-300 flex items-center gap-1 flex-shrink-0">
            Gestionar <ArrowRight size={11} />
          </a>
        </div>
      )}

      {/* ── Stat Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Ingresos Totales"
          value={fmt(summary.total_ingresos_mxn)}
          sub={`Prod. ${fmt(summary.ingresos_productos)} · IPTV ${fmt(summary.ingresos_iptv)}`}
          icon={<DollarSign size={20} />}
          color="#22c55e"
          accent="#22c55e"
          trend="up"
        />
        <StatCard
          title={isProfit ? 'Ganancia Neta' : 'Pérdida Neta'}
          value={fmt(Math.abs(ganancia))}
          sub={`Margen: ${profitMargin}% · ${isProfit ? 'Después de gastos' : 'Estás en pérdida'}`}
          icon={isProfit ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
          color={isProfit ? '#6366f1' : '#ef4444'}
          accent={isProfit ? '#6366f1' : '#ef4444'}
          trend={isProfit ? 'up' : 'down'}
        />
        <StatCard
          title="Clientes IPTV"
          value={String(summary.clientes_activos_iptv || 0)}
          sub={expiring.length > 0 ? `${expiring.length} vencen esta semana` : 'Al día, sin vencimientos'}
          icon={<Users size={20} />}
          color="#06b6d4"
          accent="#06b6d4"
        />
        <StatCard
          title="Ahorros"
          value={fmt(totalAhorradoGeneral)}
          sub={
            fondos.length > 0
              ? `${fmt(totalFondos)} fondos · ${fmt(totalAcumulado)} metas${rendimientoAnual > 0 ? ` · +${fmt(rendimientoAnual)}/año` : ''}`
              : totalMeta > 0
                ? `${ahorrosPct}% de meta ${fmt(totalMeta)}`
                : `${ahorros.length} cuentas activas`
          }
          icon={<PiggyBank size={20} />}
          color="#f59e0b"
          accent="#f59e0b"
          trend={totalAhorradoGeneral > 0 ? 'up' : 'neutral'}
        />
      </div>

      {/* ── Middle Row: Chart + Ahorros ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Revenue Chart */}
        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-white">Ingresos Mensuales</h2>
              <p className="text-xs text-slate-500 mt-0.5">En MXN — últimos meses</p>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: '#6366f1', display: 'inline-block' }} />
                Productos
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: '#22c55e', display: 'inline-block' }} />
                IPTV
              </span>
            </div>
          </div>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e3050" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false}
                  tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(v: number) => formatMXN(v)}
                  cursor={{ fill: 'rgba(99, 102, 241, 0.06)' }}
                />
                <Bar dataKey="Productos" fill="#6366f1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="IPTV" fill="#22c55e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-center">
              <div>
                <Package size={40} className="mx-auto mb-2 text-slate-700" />
                <p className="text-slate-500 text-sm">Sin datos aún</p>
                <p className="text-slate-600 text-xs mt-1">Agrega ventas para ver la gráfica</p>
              </div>
            </div>
          )}
        </div>

        {/* Ahorros + Fondos Panel */}
        <div className="card flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <PiggyBank size={14} className="text-yellow-400" />
              Ahorros
            </h2>
            <a href="/ahorros" className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
              Ver todo <ArrowRight size={11} />
            </a>
          </div>

          {fondos.length === 0 && ahorros.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-center text-slate-500 text-sm">
              <div>
                <PiggyBank size={32} className="mx-auto mb-2 text-slate-700" />
                <p>Sin ahorros registrados</p>
                <a href="/ahorros" className="text-indigo-400 text-xs mt-2 block hover:text-indigo-300">
                  Crear primer fondo →
                </a>
              </div>
            </div>
          ) : (
            <div className="space-y-3 flex-1">

              {/* Fondos */}
              {fondos.slice(0, 3).map(f => {
                const gananciaAnual = f.saldo * (f.rendimiento / 100)
                return (
                  <div key={f.id} className="flex items-center justify-between gap-2 py-1.5 px-2 rounded-lg" style={{ background: '#0f172a' }}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-base flex-shrink-0">{f.icono}</span>
                      <div className="min-w-0">
                        <p className="text-xs text-slate-300 truncate">{f.nombre}</p>
                        {f.rendimiento > 0 && (
                          <p className="text-[10px] text-green-400">+{fmt(gananciaAnual)}/año</p>
                        )}
                      </div>
                    </div>
                    <span className="text-xs font-bold text-white flex-shrink-0" style={{ color: f.color }}>{fmt(f.saldo)}</span>
                  </div>
                )
              })}

              {/* Separator if both exist */}
              {fondos.length > 0 && ahorros.length > 0 && (
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-px" style={{ background: '#1e3050' }} />
                  <span className="text-[10px] text-slate-600">METAS</span>
                  <div className="flex-1 h-px" style={{ background: '#1e3050' }} />
                </div>
              )}

              {/* Metas de ahorro */}
              {ahorros.slice(0, 3).map(a => {
                const pct = a.meta > 0 ? Math.min(100, Math.round((a.acumulado / a.meta) * 100)) : 0
                return (
                  <div key={a.id}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-slate-300 flex items-center gap-1.5">
                        <span>{a.icono}</span>
                        <span className="truncate max-w-[100px]">{a.nombre}</span>
                      </span>
                      <span className="text-xs font-semibold" style={{ color: a.color || '#6366f1' }}>{pct}%</span>
                    </div>
                    <ProgressBar value={a.acumulado} max={a.meta} color={a.color || '#6366f1'} />
                  </div>
                )
              })}

              {/* Total summary */}
              <div className="pt-2 mt-1 border-t space-y-1" style={{ borderColor: '#1e3050' }}>
                {totalFondos > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Fondos</span>
                    <span className="text-white font-medium">{fmt(totalFondos)}</span>
                  </div>
                )}
                {totalAcumulado > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Metas</span>
                    <span className="text-white font-medium">{fmt(totalAcumulado)}</span>
                  </div>
                )}
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-slate-400">Total</span>
                  <span className="text-yellow-400">{fmt(totalAhorradoGeneral)}</span>
                </div>
                {rendimientoAnual > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-600">Rendimiento est./año</span>
                    <span className="text-green-400">+{fmt(rendimientoAnual)}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom Row: Reminders + IPTV expiry ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Upcoming Reminders */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Bell size={14} className="text-indigo-400" />
              Próximos Recordatorios
            </h2>
            <a href="/bienestar" className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
              Ver todo <ArrowRight size={11} />
            </a>
          </div>

          {upcomingRecs.length === 0 ? (
            <div className="py-6 text-center">
              <Bell size={28} className="mx-auto mb-2 text-slate-700" />
              <p className="text-slate-500 text-sm">Sin recordatorios próximos</p>
            </div>
          ) : (
            <div className="space-y-2">
              {upcomingRecs.map(r => {
                const urgent = r.daysLeft <= 1
                const soon = r.daysLeft <= 3
                const accentColor = urgent ? '#ef4444' : soon ? '#f59e0b' : (r.color || '#6366f1')
                return (
                  <div
                    key={r.id}
                    className="flex items-center gap-3 p-2.5 rounded-lg"
                    style={{ background: '#0f172a', borderLeft: `3px solid ${accentColor}` }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {r.importante && <Star size={11} className="text-yellow-400 flex-shrink-0" />}
                        <p className="text-sm text-white truncate">{r.titulo}</p>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{formatDateTime(r.fecha_hora)}</p>
                    </div>
                    <span
                      className="text-xs font-semibold flex-shrink-0 px-2 py-0.5 rounded-full"
                      style={{ color: accentColor, background: accentColor + '18' }}
                    >
                      {r.daysLeft <= 0 ? 'Hoy' : r.daysLeft === 1 ? 'Mañana' : `${r.daysLeft}d`}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* IPTV Expiring */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Tv size={14} className="text-cyan-400" />
              Vencimientos IPTV (7 días)
            </h2>
            <a href="/iptv" className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
              Ver todo <ArrowRight size={11} />
            </a>
          </div>

          {expiring.length === 0 ? (
            <div className="py-6 text-center">
              <Tv size={28} className="mx-auto mb-2 text-slate-700" />
              <p className="text-slate-500 text-sm">Sin vencimientos próximos 🎉</p>
            </div>
          ) : (
            <div className="space-y-2">
              {expiring.map((sub: ExpiringSub) => {
                const days = daysUntil(sub.end_date)
                return (
                  <div
                    key={sub.id}
                    className="flex items-center justify-between p-2.5 rounded-lg"
                    style={{ background: '#0f172a' }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{sub.client_name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {sub.connections} equipo{sub.connections > 1 ? 's' : ''} · vence {sub.end_date}
                      </p>
                    </div>
                    <span className={`badge flex-shrink-0 ${days <= 2 ? 'badge-red' : 'badge-yellow'}`}>
                      {days <= 0 ? 'Hoy' : `${days}d`}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Business Totals Footer ── */}
      <div className="card" style={{ background: 'linear-gradient(135deg, #1e293b, #1a2540)' }}>
        <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <Package size={14} className="text-slate-400" />
          Resumen del Negocio
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Ingresos Productos', value: fmt(summary.ingresos_productos), color: '#6366f1', icon: <Package size={14} /> },
            { label: 'Ingresos IPTV', value: fmt(summary.ingresos_iptv), color: '#22c55e', icon: <Tv size={14} /> },
            { label: 'Total Gastos', value: fmt(summary.total_gastos_mxn), color: '#ef4444', icon: <TrendingDown size={14} /> },
            { label: 'Margen Neto', value: `${profitMargin}%`, color: isProfit ? '#a78bfa' : '#ef4444', icon: <Percent size={14} /> },
          ].map(item => (
            <div
              key={item.label}
              className="rounded-xl p-3 text-center"
              style={{ background: '#0f172a', border: `1px solid ${item.color}22` }}
            >
              <div className="flex items-center justify-center gap-1.5 mb-1.5" style={{ color: item.color }}>
                {item.icon}
              </div>
              <p className="text-lg font-bold" style={{ color: item.color }}>{item.value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{item.label}</p>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
