import { useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts'
import { Download, TrendingUp, TrendingDown, DollarSign, Package, Tv } from 'lucide-react'
import { getSummary, getMonthlyReport, exportExcel, formatMXN } from '../lib/api'

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4']

const tooltipStyle = {
  backgroundColor: '#1e293b', border: '1px solid #2d3f58',
  borderRadius: '8px', color: '#f1f5f9', fontSize: '12px',
}

const monthNames: Record<string, string> = {
  '01': 'Ene', '02': 'Feb', '03': 'Mar', '04': 'Abr', '05': 'May', '06': 'Jun',
  '07': 'Jul', '08': 'Ago', '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dic'
}

export default function Reports() {
  const [summary, setSummary] = useState<any>(null)
  const [monthly, setMonthly] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [exportFrom, setExportFrom] = useState('')
  const [exportTo, setExportTo] = useState('')
  const [year, setYear] = useState(new Date().getFullYear())

  useEffect(() => {
    Promise.all([getSummary(), getMonthlyReport(year)])
      .then(([s, m]) => { setSummary(s.data); setMonthly(m.data) })
      .finally(() => setLoading(false))
  }, [year])

  const monthlyCombined = (() => {
    if (!monthly) return []
    const map: Record<string, any> = {}
    for (let i = 1; i <= 12; i++) {
      const mo = String(i).padStart(2, '0')
      map[mo] = { name: monthNames[mo], productos: 0, iptv: 0, ganancia: 0 }
    }
    monthly.products.forEach((p: any) => {
      if (map[p.mes]) map[p.mes].productos = p.ingresos || 0
    })
    monthly.iptv.forEach((p: any) => {
      if (map[p.mes]) {
        map[p.mes].iptv = p.ingresos || 0
        map[p.mes].ganancia = (p.ingresos || 0) - (p.costos || 0)
      }
    })
    return Object.values(map)
  })()

  const pieData = summary ? [
    { name: 'Productos', value: Math.round(summary.ingresos_productos || 0) },
    { name: 'IPTV', value: Math.round(summary.ingresos_iptv || 0) },
  ].filter(d => d.value > 0) : []

  const profitRate = summary && summary.total_ingresos_mxn > 0
    ? ((summary.ganancia_neta_mxn / summary.total_ingresos_mxn) * 100).toFixed(1)
    : '0'

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full" />
    </div>
  )

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Reportes</h1>
          <p className="text-slate-400 text-sm mt-0.5">Análisis de tu negocio y exportación de datos</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input className="input w-36" type="date" value={exportFrom} onChange={e => setExportFrom(e.target.value)} placeholder="Desde" />
          <input className="input w-36" type="date" value={exportTo} onChange={e => setExportTo(e.target.value)} placeholder="Hasta" />
          <button onClick={() => exportExcel(exportFrom, exportTo)} className="btn-primary">
            <Download size={14} />Exportar Excel
          </button>
        </div>
      </div>

      {/* P&L Summary */}
      {summary && (
        <div className="card">
          <h2 className="text-sm font-semibold text-white mb-4">Resumen Financiero Global</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <div className="text-center p-3 rounded-lg" style={{ background: '#0f172a' }}>
              <DollarSign size={20} className="mx-auto text-green-400 mb-1" />
              <p className="text-lg font-bold text-green-400">{formatMXN(summary.total_ingresos_mxn)}</p>
              <p className="text-xs text-slate-400">Ingresos totales</p>
            </div>
            <div className="text-center p-3 rounded-lg" style={{ background: '#0f172a' }}>
              <TrendingDown size={20} className="mx-auto text-red-400 mb-1" />
              <p className="text-lg font-bold text-red-400">{formatMXN(summary.total_gastos_mxn)}</p>
              <p className="text-xs text-slate-400">Gastos / inversión</p>
            </div>
            <div className="text-center p-3 rounded-lg" style={{
              background: '#0f172a',
              border: `1px solid ${summary.ganancia_neta_mxn >= 0 ? '#22c55e33' : '#ef444433'}`
            }}>
              <TrendingUp size={20} className={`mx-auto mb-1 ${summary.ganancia_neta_mxn >= 0 ? 'text-indigo-400' : 'text-red-400'}`} />
              <p className={`text-lg font-bold ${summary.ganancia_neta_mxn >= 0 ? 'text-indigo-400' : 'text-red-400'}`}>
                {formatMXN(summary.ganancia_neta_mxn)}
              </p>
              <p className="text-xs text-slate-400">Ganancia neta</p>
            </div>
            <div className="text-center p-3 rounded-lg" style={{ background: '#0f172a' }}>
              <Package size={20} className="mx-auto text-blue-400 mb-1" />
              <p className="text-lg font-bold text-blue-400">{formatMXN(summary.ingresos_productos)}</p>
              <p className="text-xs text-slate-400">Ingresos artículos</p>
            </div>
            <div className="text-center p-3 rounded-lg" style={{ background: '#0f172a' }}>
              <Tv size={20} className="mx-auto text-cyan-400 mb-1" />
              <p className="text-lg font-bold text-cyan-400">{formatMXN(summary.ingresos_iptv)}</p>
              <p className="text-xs text-slate-400">Ingresos IPTV</p>
            </div>
          </div>

          {/* Profit indicator */}
          <div className="mt-4 p-3 rounded-lg flex items-center justify-between" style={{ background: '#0f172a' }}>
            <div>
              <p className="text-xs text-slate-400">Tasa de ganancia</p>
              <p className={`text-2xl font-bold ${parseFloat(profitRate) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {profitRate}%
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400">Estado del negocio</p>
              <p className={`font-semibold text-sm ${summary.ganancia_neta_mxn >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {summary.ganancia_neta_mxn >= 10000
                  ? '🟢 Excelente'
                  : summary.ganancia_neta_mxn >= 3000
                  ? '🟡 Bueno'
                  : summary.ganancia_neta_mxn >= 0
                  ? '🟠 Apenas positivo'
                  : '🔴 En pérdida'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white">Ingresos por mes</h2>
            <select className="input w-28 text-xs" value={year} onChange={e => setYear(parseInt(e.target.value))}>
              {[2024, 2025, 2026].map(y => <option key={y}>{y}</option>)}
            </select>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={monthlyCombined}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2d3f58" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false}
                tickFormatter={v => v >= 1000 ? `$${(v/1000).toFixed(0)}k` : `$${v}`} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatMXN(v)} />
              <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
              <Bar dataKey="productos" name="Artículos" fill="#6366f1" radius={[3, 3, 0, 0]} />
              <Bar dataKey="iptv" name="IPTV" fill="#22c55e" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h2 className="text-sm font-semibold text-white mb-4">Fuentes de ingreso</h2>
          {pieData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={70}
                    dataKey="value" paddingAngle={4}>
                    {pieData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
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
                      <div>
                        <span className="text-white font-medium">{pct}%</span>
                        <span className="text-slate-500 ml-1">({formatMXN(d.value)})</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            <div className="h-48 flex items-center justify-center text-slate-500 text-sm text-center">
              Sin datos registrados aún
            </div>
          )}
        </div>
      </div>

      {/* Monthly breakdown table */}
      <div className="card overflow-x-auto">
        <h2 className="text-sm font-semibold text-white mb-4">Detalle mensual {year}</h2>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid #2d3f58' }}>
              {['Mes', 'Ventas artículos', 'Ingresos IPTV', 'Total', 'Ganancia IPTV'].map(h => (
                <th key={h} className="text-left py-2 px-3 text-xs text-slate-400 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {monthlyCombined.map((m: any) => {
              const total = (m.productos || 0) + (m.iptv || 0)
              return (
                <tr key={m.name} style={{ borderBottom: '1px solid #1e293b' }}>
                  <td className="py-2 px-3 text-white font-medium">{m.name}</td>
                  <td className="py-2 px-3 text-slate-300">{m.productos > 0 ? formatMXN(m.productos) : '-'}</td>
                  <td className="py-2 px-3 text-slate-300">{m.iptv > 0 ? formatMXN(m.iptv) : '-'}</td>
                  <td className="py-2 px-3">
                    <span className={total > 0 ? 'text-white font-semibold' : 'text-slate-600'}>
                      {total > 0 ? formatMXN(total) : '-'}
                    </span>
                  </td>
                  <td className="py-2 px-3">
                    {m.ganancia !== 0 ? (
                      <span className={m.ganancia >= 0 ? 'text-green-400' : 'text-red-400'}>
                        {formatMXN(m.ganancia)}
                      </span>
                    ) : '-'}
                  </td>
                </tr>
              )
            })}
            {/* Totals row */}
            {(() => {
              const totProd = monthlyCombined.reduce((a: number, m: any) => a + (m.productos || 0), 0)
              const totIPTV = monthlyCombined.reduce((a: number, m: any) => a + (m.iptv || 0), 0)
              const totGain = monthlyCombined.reduce((a: number, m: any) => a + (m.ganancia || 0), 0)
              if (totProd + totIPTV === 0) return null
              return (
                <tr style={{ borderTop: '2px solid #3d5068', background: '#0f172a' }}>
                  <td className="py-2 px-3 text-white font-bold">TOTAL</td>
                  <td className="py-2 px-3 text-indigo-400 font-bold">{formatMXN(totProd)}</td>
                  <td className="py-2 px-3 text-green-400 font-bold">{formatMXN(totIPTV)}</td>
                  <td className="py-2 px-3 text-white font-bold">{formatMXN(totProd + totIPTV)}</td>
                  <td className={`py-2 px-3 font-bold ${totGain >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {formatMXN(totGain)}
                  </td>
                </tr>
              )
            })()}
          </tbody>
        </table>
      </div>

      {/* Tips based on data */}
      {summary && (
        <div className="card" style={{ border: '1px solid #3730a3' }}>
          <h2 className="text-sm font-semibold text-white mb-3">💡 Análisis y recomendaciones</h2>
          <div className="space-y-2 text-sm">
            {summary.ganancia_neta_mxn < 0 && (
              <p className="text-red-300">⚠️ Tus gastos superan tus ingresos. Considera aumentar precios de IPTV o reducir compras de artículos.</p>
            )}
            {summary.clientes_activos_iptv < 10 && (
              <p className="text-yellow-300">📈 Tienes {summary.clientes_activos_iptv} clientes IPTV activos. Aumentar a 20+ clientes incrementaría significativamente tu ganancia mensual.</p>
            )}
            {summary.ingresos_iptv > summary.ingresos_productos && (
              <p className="text-green-300">✅ IPTV es tu principal fuente de ingresos ({formatMXN(summary.ingresos_iptv)}). Buen negocio recurrente.</p>
            )}
            {summary.ingresos_productos > 0 && summary.total_gastos_mxn > 0 && (
              <p className="text-blue-300">📦 Has invertido {formatMXN(summary.total_gastos_mxn)} en artículos y recuperado {formatMXN(summary.ingresos_productos)}.</p>
            )}
            {summary.ganancia_neta_mxn > 0 && (
              <p className="text-green-300">🎉 ¡Vas bien! Tienes una ganancia neta de {formatMXN(summary.ganancia_neta_mxn)} ({profitRate}% de margen).</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
