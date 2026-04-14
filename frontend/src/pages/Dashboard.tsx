import { useEffect, useState } from 'react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts'
import { TrendingUp, TrendingDown, DollarSign, Users, Package, Tv, AlertTriangle } from 'lucide-react'
import { getSummary, getExpiringSubscriptions, formatMXN } from '../lib/api'

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

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4']

const monthNames: Record<string, string> = {
  '01': 'Ene', '02': 'Feb', '03': 'Mar', '04': 'Abr', '05': 'May', '06': 'Jun',
  '07': 'Jul', '08': 'Ago', '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dic'
}

function formatMonth(m: string) {
  if (!m) return ''
  const [, mo] = m.split('-')
  return monthNames[mo] || m
}

function StatCard({ title, value, sub, icon, color, trend }: {
  title: string; value: string; sub?: string; icon: React.ReactNode;
  color: string; trend?: 'up' | 'down' | 'neutral'
}) {
  return (
    <div className="stat-card">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-slate-400 mb-1">{title}</p>
          <p className="text-xl font-bold text-white">{value}</p>
          {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
        </div>
        <div className="p-2 rounded-lg" style={{ background: color + '22' }}>
          <span style={{ color }}>{icon}</span>
        </div>
      </div>
      {trend && (
        <div className={`flex items-center gap-1 text-xs mt-1 ${trend === 'up' ? 'text-green-400' : trend === 'down' ? 'text-red-400' : 'text-slate-400'}`}>
          {trend === 'up' ? <TrendingUp size={12} /> : trend === 'down' ? <TrendingDown size={12} /> : null}
        </div>
      )}
    </div>
  )
}

export default function Dashboard() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [expiring, setExpiring] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      getSummary(),
      getExpiringSubscriptions(7)
    ]).then(([s, e]) => {
      setSummary(s.data)
      setExpiring(e.data)
    }).finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!summary) return null

  const ganancia = summary.ganancia_neta_mxn || 0
  const isProfit = ganancia >= 0

  const pieData = [
    { name: 'Productos', value: Math.round(summary.ingresos_productos || 0) },
    { name: 'IPTV', value: Math.round(summary.ingresos_iptv || 0) },
  ].filter(d => d.value > 0)

  const chartData = summary.monthly_chart.map(m => ({
    name: formatMonth(m.month),
    Productos: Math.round(m.productos || 0),
    IPTV: Math.round(m.iptv || 0),
    Ganancia: Math.round((m.iptv || 0) - (m.costo_iptv || 0) + (m.productos || 0)),
  }))

  const tooltipStyle = {
    backgroundColor: '#1e293b',
    border: '1px solid #2d3f58',
    borderRadius: '8px',
    color: '#f1f5f9',
    fontSize: '12px',
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-slate-400 text-sm mt-1">Resumen general de tu negocio</p>
      </div>

      {/* Alerts */}
      {expiring.length > 0 && (
        <div className="flex items-start gap-3 p-4 rounded-lg border border-yellow-500/30"
          style={{ background: '#713f1222' }}>
          <AlertTriangle size={18} className="text-yellow-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-yellow-400 font-medium text-sm">{expiring.length} suscripción{expiring.length > 1 ? 'es' : ''} por vencer esta semana</p>
            <p className="text-slate-400 text-xs mt-0.5">
              {expiring.slice(0, 3).map(e => e.client_name).join(', ')}
              {expiring.length > 3 ? ` y ${expiring.length - 3} más` : ''}
            </p>
          </div>
        </div>
      )}

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Ingresos Totales"
          value={formatMXN(summary.total_ingresos_mxn)}
          sub="Todos los tiempos"
          icon={<DollarSign size={20} />}
          color="#22c55e"
          trend="up"
        />
        <StatCard
          title={isProfit ? 'Ganancia Neta' : 'Pérdida Neta'}
          value={formatMXN(Math.abs(ganancia))}
          sub={isProfit ? 'Después de gastos' : 'Estás perdiendo dinero'}
          icon={isProfit ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
          color={isProfit ? '#6366f1' : '#ef4444'}
          trend={isProfit ? 'up' : 'down'}
        />
        <StatCard
          title="Clientes IPTV"
          value={String(summary.clientes_activos_iptv || 0)}
          sub="Activos actualmente"
          icon={<Users size={20} />}
          color="#06b6d4"
        />
        <StatCard
          title="Total Gastos"
          value={formatMXN(summary.total_gastos_mxn)}
          sub="Inversión total"
          icon={<Package size={20} />}
          color="#f59e0b"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Monthly revenue chart */}
        <div className="card lg:col-span-2">
          <h2 className="text-sm font-semibold text-white mb-4">Ingresos Mensuales (MXN)</h2>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chartData} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2d3f58" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false}
                  tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatMXN(v)} />
                <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
                <Bar dataKey="Productos" fill="#6366f1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="IPTV" fill="#22c55e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-60 flex items-center justify-center text-slate-500 text-sm">
              Sin datos aún. Agrega ventas para ver la gráfica.
            </div>
          )}
        </div>

        {/* Pie chart */}
        <div className="card">
          <h2 className="text-sm font-semibold text-white mb-4">Distribución de Ingresos</h2>
          {pieData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={75}
                    dataKey="value" paddingAngle={4}>
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatMXN(v)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-2">
                {pieData.map((d, i) => {
                  const total = pieData.reduce((a, b) => a + b.value, 0)
                  const pct = total > 0 ? ((d.value / total) * 100).toFixed(1) : '0'
                  return (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[i] }} />
                        <span className="text-slate-300">{d.name}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-white font-medium">{formatMXN(d.value)}</span>
                        <span className="text-slate-500 ml-1">({pct}%)</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            <div className="h-48 flex items-center justify-center text-slate-500 text-sm text-center">
              <div>
                <Tv size={32} className="mx-auto mb-2 opacity-30" />
                Sin ingresos registrados
              </div>
            </div>
          )}
        </div>
      </div>

      {/* P&L line chart */}
      {chartData.length > 0 && (
        <div className="card">
          <h2 className="text-sm font-semibold text-white mb-4">Tendencia de Ganancia</h2>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2d3f58" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false}
                tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatMXN(v)} />
              <Line type="monotone" dataKey="Ganancia" stroke="#6366f1" strokeWidth={2}
                dot={{ fill: '#6366f1', r: 4 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Expiring subs table */}
      {expiring.length > 0 && (
        <div className="card">
          <h2 className="text-sm font-semibold text-white mb-4">
            <span className="flex items-center gap-2">
              <AlertTriangle size={14} className="text-yellow-400" />
              Vencimientos Próximos (7 días)
            </span>
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid #2d3f58' }}>
                  {['Cliente', 'Conexiones', 'Vence', 'Estado'].map(h => (
                    <th key={h} className="text-left py-2 px-3 text-xs text-slate-400 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {expiring.map(sub => {
                  const daysLeft = Math.ceil((new Date(sub.end_date).getTime() - Date.now()) / 86400000)
                  return (
                    <tr key={sub.id} style={{ borderBottom: '1px solid #1e293b' }}>
                      <td className="py-2 px-3 text-white">{sub.client_name}</td>
                      <td className="py-2 px-3 text-slate-300">{sub.connections} equipo{sub.connections > 1 ? 's' : ''}</td>
                      <td className="py-2 px-3 text-slate-300">{sub.end_date}</td>
                      <td className="py-2 px-3">
                        <span className={`badge ${daysLeft <= 2 ? 'badge-red' : 'badge-yellow'}`}>
                          {daysLeft <= 0 ? 'Hoy' : `${daysLeft}d`}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
