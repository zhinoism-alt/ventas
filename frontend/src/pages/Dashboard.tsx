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
  pagada: boolean
}

interface Fondo {
  id: number
  nombre: string
  descripcion: string | null
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
          <p className="text-xs text-muted mb-1.5 uppercase tracking-wide font-medium">{title}</p>
          <p className="text-2xl font-bold text-strong truncate leading-tight">{value}</p>
          {sub && <p className="text-xs text-muted mt-1.5">{sub}</p>}
        </div>
        <div
          className="p-2.5 rounded-xl flex-shrink-0 ml-3"
          style={{ background: `linear-gradient(135deg, ${color}28, ${color}12)`, border: `1px solid ${color}22` }}
        >
          <span style={{ color }}>{icon}</span>
        </div>
      </div>
      {trend && (
        <div className={`flex items-center gap-1 text-xs mt-0.5 font-medium ${trend === 'up' ? 'text-green-400' : trend === 'down' ? 'text-red-400' : 'text-dim'}`}>
          {trend === 'up' && <TrendingUp size={11} />}
          {trend === 'down' && <TrendingDown size={11} />}
          {trend === 'up' ? 'En positivo' : trend === 'down' ? 'En pérdida' : 'Sin variación'}
        </div>
      )}
    </div>
  )
}

/**
 * `${color}cc` (para el degradado) solo es CSS valido si `color` es un hex de
 * verdad. Una meta con color guardado como el texto "var(--accent)" (el
 * default viejo del formulario, antes de tocar el selector) daba
 * "var(--accent)cc" -- invalido, así que el navegador ignoraba todo el
 * `background` y la barra quedaba invisible aunque el % de al lado sí se viera
 * bien. Fondo solido, sin concatenar nada: funciona con hex, var(--x) o
 * cualquier color CSS valido.
 */
function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="w-full h-2 rounded-full" style={{ background: 'var(--bg)' }}>
      <div
        className="h-2 rounded-full transition-all duration-700"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  )
}

/**
 * Pendientes: eventos de HOY (dosis, citas), limpieza si es sábado, y
 * pendientes simples (sin fecha) mientras no estén marcados.
 *
 * A proposito NO es un modal/popup que bloquee al cargar. Un modal que
 * interrumpe cada vez se vuelve ruido en un par de dias -- la gente aprende
 * a cerrarlo por reflejo sin leerlo, que es lo contrario de "que se note".
 * Un banner que solo aparece cuando hay algo real, arriba de todo, en un
 * color que no se confunde con el resto del panel, se mantiene efectivo
 * porque no esta ahi cuando no hace falta.
 *
 * Los eventos son solo de HOY, no "en 3 dias": para eso ya esta la pestana
 * Calendario. Los pendientes simples si son abiertos (no tienen fecha), pero
 * se limitan a 4 aqui para que esto no crezca sin limite -- el resto se ve
 * completo en Calendario.
 */
interface EventoPendiente { id: number; titulo: string; hora: string; recurrencia: 'ninguna' | 'semanal'; fecha: string }
interface PendienteSimple { id: number; texto: string }

function BannerPendientes() {
  const [eventos, setEventos] = useState<EventoPendiente[]>([])
  const [limpiezaFalta, setLimpiezaFalta] = useState<number | null>(null)
  const [pendientes, setPendientes] = useState<PendienteSimple[]>([])
  const [totalPendientes, setTotalPendientes] = useState(0)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    (async () => {
      const hoy = new Date()
      const esSabado = hoy.getDay() === 6
      const [{ data: ev }, limpieza, { data: pend, count }] = await Promise.all([
        supabase.from('calendario_eventos')
          .select('id,titulo,hora,recurrencia,fecha')
          .eq('activo', true),
        esSabado
          ? supabase.from('limpieza_tareas').select('id').eq('activo', true)
              .then(async ({ data: tareas }) => {
                if (!tareas?.length) return 0
                const sabadoISO = hoy.toISOString().slice(0, 10)
                const { data: hechas } = await supabase.from('limpieza_estado')
                  .select('tarea_id').eq('semana', sabadoISO)
                return tareas.length - (hechas?.length ?? 0)
              })
          : Promise.resolve(null),
        supabase.from('pendientes').select('id,texto', { count: 'exact' })
          .eq('hecho', false).order('created_at', { ascending: false }).limit(4),
      ])

      const hoyDia = hoy.getDay()
      const deHoy = ((ev ?? []) as EventoPendiente[]).filter(e => {
        if (e.recurrencia === 'ninguna') return e.fecha === hoy.toISOString().slice(0, 10)
        return new Date(e.fecha + 'T00:00:00').getDay() === hoyDia
      }).sort((a, b) => a.hora.localeCompare(b.hora))

      setEventos(deHoy)
      setLimpiezaFalta(limpieza)
      setPendientes((pend ?? []) as PendienteSimple[])
      setTotalPendientes(count ?? 0)
      setCargando(false)
    })()
  }, [])

  if (cargando) return null
  if (eventos.length === 0 && !limpiezaFalta && pendientes.length === 0) return null

  return (
    <div className="flex items-start gap-3 p-4 rounded-xl border"
      style={{ background: 'var(--yellow-soft)', borderColor: 'var(--yellow)' }}>
      <Bell size={18} className="text-yellow-400 mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0 space-y-1.5">
        <p className="text-yellow-300 font-medium text-sm">Pendientes</p>
        {eventos.map(e => (
          <div key={`ev-${e.id}`} className="flex items-center justify-between gap-2 text-xs">
            <span className="text-body">{e.titulo}</span>
            <span className="text-dim flex-shrink-0">{e.hora?.slice(0, 5)}</span>
          </div>
        ))}
        {!!limpiezaFalta && (
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-body">🧹 Limpieza del sábado</span>
            <span className="text-dim flex-shrink-0">faltan {limpiezaFalta}</span>
          </div>
        )}
        {pendientes.map(p => (
          <div key={`p-${p.id}`} className="flex items-center justify-between gap-2 text-xs">
            <span className="text-body">📝 {p.texto}</span>
          </div>
        ))}
        {totalPendientes > pendientes.length && (
          <p className="text-dim text-xs">+{totalPendientes - pendientes.length} pendiente{totalPendientes - pendientes.length !== 1 ? 's' : ''} más</p>
        )}
      </div>
      <a href="/calendario" className="text-xs text-yellow-400 hover:text-yellow-300 flex items-center gap-1 flex-shrink-0">
        Ver <ArrowRight size={11} />
      </a>
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
  // Los mismos supuestos que usan Ahorros y Patrimonio. Sin ellos este panel
  // mostraba el rendimiento bruto y contradecia a las otras dos pantallas.
  const [supuestos, setSupuestos] = useState<{ isr_retencion_pct: number; inflacion_pct: number } | null>(null)
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState('')

  useEffect(() => {
    const now = new Date().toISOString()

    Promise.all([
      getSummary(),
      getExpiringSubscriptions(7),
      supabase.from('ahorros').select('*').eq('activo', true).order('created_at', { ascending: false }),
      supabase.from('fondos_ahorro').select('*').eq('activo', true).order('created_at', { ascending: false }),
      supabase.from('finanzas_perfil').select('isr_retencion_pct,inflacion_pct').eq('id', 1).maybeSingle(),
      supabase
        .from('recordatorios')
        .select('*')
        .eq('completado', false)
        .gte('fecha_hora', now)
        .order('fecha_hora', { ascending: true })
        .limit(5),
    ])
      .then(([s, e, a, f, sup, r]) => {
        setSummary(s.data)
        setExpiring(e.data)
        setAhorros(a.data ?? [])
        setFondos(f.data ?? [])
        setSupuestos((sup.data as { isr_retencion_pct: number; inflacion_pct: number }) ?? null)
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
        <p className="text-dim text-sm">Cargando datos...</p>
      </div>
    </div>
  )

  if (error) return (
    <div className="flex items-center justify-center h-64">
      <div className="card text-center max-w-md">
        <AlertTriangle size={32} className="mx-auto text-yellow-400 mb-3" />
        <p className="text-strong font-medium mb-1">Error de conexión</p>
        <p className="text-muted text-sm">{error}</p>
      </div>
    </div>
  )

  if (!summary) return null

  const ganancia = summary.ganancia_neta_mxn ?? 0
  const isProfit = ganancia >= 0
  const ingresosTotales = Number(summary.total_ingresos_mxn ?? 0)
  const profitMargin = summary.total_ingresos_mxn > 0
    ? ((ganancia / summary.total_ingresos_mxn) * 100).toFixed(1)
    : '0'

  const chartData = (summary.monthly_chart || []).map(m => ({
    name: formatMonth(m.month),
    Productos: Math.round(m.productos || 0),
    IPTV: Math.round(m.iptv || 0),
  }))

  // Una meta pagada ya se gasto: no es fondos, y tampoco cuenta como avance
  // pendiente. Mismo criterio que Ahorros.tsx.
  const metasEnCurso        = ahorros.filter(a => !a.pagada)
  const totalAcumulado      = metasEnCurso.reduce((s, a) => s + a.acumulado, 0)
  const totalMeta           = metasEnCurso.reduce((s, a) => s + a.meta, 0)
  const ahorrosPct          = totalMeta > 0 ? Math.round((totalAcumulado / totalMeta) * 100) : 0
  const totalFondos         = fondos.reduce((s, f) => s + f.saldo, 0)
  // El bruto que anuncia el banco no es lo que ganas. Ahorros ya descuenta el
  // ISR sobre el capital y la inflacion; este panel mostraba el bruto, asi que
  // las dos pantallas decian cifras distintas del mismo dinero — 12,316 aqui y
  // 7,660 alla — sin forma de saber cual creer.
  const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0 }
  const rendimientoBruto    = fondos.reduce((s, f) => s + f.saldo * (f.rendimiento / 100), 0)
  const rendimientoAnual    = supuestos
    ? rendimientoBruto - totalFondos * (n(supuestos.isr_retencion_pct) / 100) - totalFondos * (n(supuestos.inflacion_pct) / 100)
    : rendimientoBruto
  // Upcoming reminders with urgency
  const upcomingRecs = recordatorios.map(r => ({
    ...r,
    daysLeft: daysUntil(r.fecha_hora),
  }))

  return (
    <div className="space-y-5 max-w-7xl mx-auto">

      {/* ── Pendientes de hoy: eventos + limpieza (solo aparece si hay algo) ── */}
      <BannerPendientes />

      {/* ── Greeting ── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-strong">{greet()}, Brandon 👋</h1>
          <p className="text-muted text-sm mt-0.5 capitalize">{todayLabel()}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {summary.usd_to_mxn > 0 && (
            <div
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border-hi)' }}
            >
              <RefreshCw size={11} className="text-dim" />
              <span className="text-muted">USD</span>
              <span className="text-strong font-semibold">${summary.usd_to_mxn.toFixed(2)}</span>
              <span className="text-dim">MXN</span>
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
          style={{ background: 'var(--yellow-soft)', borderColor: 'var(--yellow)' }}
        >
          <AlertTriangle size={18} className="text-yellow-400 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-yellow-300 font-medium text-sm">
              {expiring.length} suscripción{expiring.length > 1 ? 'es' : ''} por vencer esta semana
            </p>
            <p className="text-muted text-xs mt-0.5">
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
          color="var(--green)"
          accent="var(--green)"
          trend="up"
        />
        <StatCard
          title={isProfit ? 'Ganancia Neta' : 'Pérdida Neta'}
          value={fmt(Math.abs(ganancia))}
          sub={ingresosTotales < 1000
            ? 'Muy pocas ventas para un margen'
            : `Margen: ${profitMargin}% · ${isProfit ? 'Después de gastos' : 'Estás en pérdida'}`}
          icon={isProfit ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
          color={isProfit ? 'var(--accent)' : 'var(--red)'}
          accent={isProfit ? 'var(--accent)' : 'var(--red)'}
          trend={isProfit ? 'up' : 'down'}
        />
        <StatCard
          title="Clientes IPTV"
          value={String(summary.clientes_activos_iptv || 0)}
          sub={expiring.length > 0 ? `${expiring.length} vencen esta semana` : 'Al día, sin vencimientos'}
          icon={<Users size={20} />}
          color="var(--cyan)"
          accent="var(--cyan)"
        />
        <StatCard
          title="Ahorros"
          value={fmt(totalFondos)}
          sub={
            fondos.length > 0
              ? rendimientoAnual > 0
                ? `+${fmt(rendimientoAnual)}/año real${totalMeta > 0 ? ` · metas al ${ahorrosPct}%` : ''}`
                : `${fondos.length} apartado${fondos.length !== 1 ? 's' : ''}${totalMeta > 0 ? ` · metas al ${ahorrosPct}%` : ''}`
              : totalMeta > 0
                ? `${ahorrosPct}% de meta ${fmt(totalMeta)}`
                : `${ahorros.length} cuentas activas`
          }
          icon={<PiggyBank size={20} />}
          color="var(--yellow)"
          accent="var(--yellow)"
          trend={totalFondos > 0 ? 'up' : 'neutral'}
        />
      </div>

      {/* ── Middle Row: Chart + Ahorros ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Revenue Chart */}
        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-strong">Ingresos Mensuales</h2>
              <p className="text-xs text-dim mt-0.5">En MXN — últimos meses</p>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: 'var(--accent)', display: 'inline-block' }} />
                Productos
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: 'var(--green)', display: 'inline-block' }} />
                IPTV
              </span>
            </div>
          </div>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: 'var(--text-dim)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--text-dim)', fontSize: 11 }} axisLine={false} tickLine={false}
                  tickFormatter={v => Math.abs(v) >= 10000 ? `$${Math.round(v / 1000)}k`
                                     : Math.abs(v) >= 1000 ? `$${(v / 1000).toFixed(1)}k`
                                     : `$${Math.round(v)}`} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(v: number) => formatMXN(v)}
                  cursor={{ fill: 'rgba(99, 102, 241, 0.06)' }}
                />
                <Bar dataKey="Productos" fill="var(--accent)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="IPTV" fill="var(--green)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-center">
              <div>
                <Package size={40} className="mx-auto mb-2 text-faint" />
                <p className="text-dim text-sm">Sin datos aún</p>
                <p className="text-faint text-xs mt-1">Agrega ventas para ver la gráfica</p>
              </div>
            </div>
          )}
        </div>

        {/* Ahorros + Fondos Panel */}
        <div className="card flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-strong flex items-center gap-2">
              <PiggyBank size={14} className="text-yellow-400" />
              Ahorros
            </h2>
            <a href="/ahorros" className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
              Ver todo <ArrowRight size={11} />
            </a>
          </div>

          {fondos.length === 0 && ahorros.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-center text-dim text-sm">
              <div>
                <PiggyBank size={32} className="mx-auto mb-2 text-faint" />
                <p>Sin ahorros registrados</p>
                <a href="/ahorros" className="text-indigo-400 text-xs mt-2 block hover:text-indigo-300">
                  Crear primer fondo →
                </a>
              </div>
            </div>
          ) : (
            <div className="space-y-3 flex-1">

              {/* Fondos. El nombre se repite a proposito (dos "Fondo de
                  Inversion" en Nu y en Didi, dos "Fondo Emergencia" en Mifel
                  y OpenBank) -- son cuentas distintas, no el mismo dato
                  calculado dos veces. Sin la institucion debajo, dos saldos
                  y dos rendimientos distintos bajo el mismo nombre se ven
                  como un error. */}
              {fondos.slice(0, 3).map(f => {
                const gananciaAnual = supuestos
                  ? f.saldo * (f.rendimiento / 100)
                    - f.saldo * (n(supuestos.isr_retencion_pct) / 100)
                    - f.saldo * (n(supuestos.inflacion_pct) / 100)
                  : f.saldo * (f.rendimiento / 100)
                return (
                  <div key={f.id} className="flex items-center justify-between gap-2 py-1.5 px-2 rounded-lg" style={{ background: 'var(--bg)' }}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-base flex-shrink-0">{f.icono}</span>
                      <div className="min-w-0">
                        <p className="text-xs text-body truncate">
                          {f.nombre}{f.descripcion && <span className="text-faint"> · {f.descripcion}</span>}
                        </p>
                        {f.rendimiento > 0 && (
                          <p className="text-[10px] text-green-400">+{fmt(gananciaAnual)}/año</p>
                        )}
                      </div>
                    </div>
                    <span className="text-xs font-bold text-strong flex-shrink-0" style={{ color: f.color }}>{fmt(f.saldo)}</span>
                  </div>
                )
              })}

              {/* Separator if both exist */}
              {fondos.length > 0 && ahorros.length > 0 && (
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-px" style={{ background: 'var(--surface-2)' }} />
                  <span className="text-[10px] text-faint">METAS</span>
                  <div className="flex-1 h-px" style={{ background: 'var(--surface-2)' }} />
                </div>
              )}

              {/* Metas de ahorro */}
              {ahorros.slice(0, 3).map(a => {
                const pct = a.meta > 0 ? Math.min(100, Math.round((a.acumulado / a.meta) * 100)) : 0
                return (
                  <div key={a.id}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-body flex items-center gap-1.5">
                        <span>{a.icono}</span>
                        <span className="truncate max-w-[100px]">{a.nombre}</span>
                      </span>
                      <span className="text-xs font-semibold" style={{ color: a.color || 'var(--accent)' }}>{pct}%</span>
                    </div>
                    <ProgressBar value={a.acumulado} max={a.meta} color={a.color || 'var(--accent)'} />
                  </div>
                )
              })}

              {/* Total summary */}
              <div className="pt-2 mt-1 border-t space-y-1" style={{ borderColor: 'var(--border)' }}>
                {totalFondos > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-dim">Fondos</span>
                    <span className="text-strong font-medium">{fmt(totalFondos)}</span>
                  </div>
                )}
                {totalAcumulado > 0 && (
                  // Metas en curso: no es dinero aparte, es una intencion que
                  // se actualiza a mano. Se muestra su avance, no se suma a
                  // Fondos -- sumarlos daba una cifra de "Total" que hacia
                  // ver mas dinero liquido del que en realidad hay.
                  <div className="flex justify-between text-xs">
                    <span className="text-dim">Metas (en curso)</span>
                    <span className="text-strong font-medium">{fmt(totalAcumulado)} de {fmt(totalMeta)}</span>
                  </div>
                )}
                {rendimientoAnual > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-faint">Rendimiento est./año</span>
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
            <h2 className="text-sm font-semibold text-strong flex items-center gap-2">
              <Bell size={14} className="text-indigo-400" />
              Próximos Recordatorios
            </h2>
            <a href="/bienestar" className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
              Ver todo <ArrowRight size={11} />
            </a>
          </div>

          {upcomingRecs.length === 0 ? (
            <div className="py-6 text-center">
              <Bell size={28} className="mx-auto mb-2 text-faint" />
              <p className="text-dim text-sm">Sin recordatorios próximos</p>
            </div>
          ) : (
            <div className="space-y-2">
              {upcomingRecs.map(r => {
                const urgent = r.daysLeft <= 1
                const soon = r.daysLeft <= 3
                const accentColor = urgent ? 'var(--red)' : soon ? 'var(--yellow)' : (r.color || 'var(--accent)')
                return (
                  <div
                    key={r.id}
                    className="flex items-center gap-3 p-2.5 rounded-lg"
                    style={{ background: 'var(--bg)', borderLeft: `3px solid ${accentColor}` }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {r.importante && <Star size={11} className="text-yellow-400 flex-shrink-0" />}
                        <p className="text-sm text-strong truncate">{r.titulo}</p>
                      </div>
                      <p className="text-xs text-dim mt-0.5">{formatDateTime(r.fecha_hora)}</p>
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
            <h2 className="text-sm font-semibold text-strong flex items-center gap-2">
              <Tv size={14} className="text-cyan-400" />
              Vencimientos IPTV (7 días)
            </h2>
            <a href="/iptv" className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
              Ver todo <ArrowRight size={11} />
            </a>
          </div>

          {expiring.length === 0 ? (
            <div className="py-6 text-center">
              <Tv size={28} className="mx-auto mb-2 text-faint" />
              <p className="text-dim text-sm">Sin vencimientos próximos 🎉</p>
            </div>
          ) : (
            <div className="space-y-2">
              {expiring.map((sub: ExpiringSub) => {
                const days = daysUntil(sub.end_date)
                return (
                  <div
                    key={sub.id}
                    className="flex items-center justify-between p-2.5 rounded-lg"
                    style={{ background: 'var(--bg)' }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-strong truncate">{sub.client_name}</p>
                      <p className="text-xs text-dim mt-0.5">
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
      <div className="card" style={{ background: 'var(--accent-soft)', borderColor: 'var(--accent)' }}>
        <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <Package size={14} className="text-muted" />
          Resumen del Negocio
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Ingresos Productos', value: fmt(summary.ingresos_productos), color: 'var(--accent)', icon: <Package size={14} /> },
            { label: 'Ingresos IPTV', value: fmt(summary.ingresos_iptv), color: 'var(--green)', icon: <Tv size={14} /> },
            { label: 'Total Gastos', value: fmt(summary.total_gastos_mxn), color: 'var(--red)', icon: <TrendingDown size={14} /> },
            { label: 'Margen Neto', value: ingresosTotales < 1000 ? '—' : `${profitMargin}%`, color: isProfit ? '#a78bfa' : 'var(--red)', icon: <Percent size={14} /> },
          ].map(item => (
            <div
              key={item.label}
              className="rounded-xl p-3 text-center"
              style={{ background: 'var(--bg)', border: `1px solid ${item.color}22` }}
            >
              <div className="flex items-center justify-center gap-1.5 mb-1.5" style={{ color: item.color }}>
                {item.icon}
              </div>
              <p className="text-lg font-bold" style={{ color: item.color }}>{item.value}</p>
              <p className="text-xs text-dim mt-0.5">{item.label}</p>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
