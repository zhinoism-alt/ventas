import { useEffect, useState, useRef, useCallback } from 'react'
import {
  ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, PieChart, Pie, Cell, Legend, Line,
} from 'recharts'
import {
  Download, TrendingUp, TrendingDown, DollarSign, Package, Tv,
  Upload, FileText, Trash2, RefreshCw, Calendar, ChevronLeft,
  ChevronRight, Eye, AlertTriangle, Loader2, CheckCircle,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { getSummary, getMonthlyReport, formatMXN } from '../lib/api'
import { supabase } from '../lib/supabase'
import { TOOLTIP_STYLE, MONTH_NAMES } from '../lib/constants'
import { fmt } from '../lib/utils'
import { AvisoError } from '../components/AvisoError'

// ─── Types ───────────────────────────────────────────────────────────────────

interface PdfReporte {
  id: number
  nombre: string
  tipo: 'gastos' | 'ingresos' | 'mixto'
  mes: number
  anio: number
  monto_total: number | null
  notas: string | null
  storage_path: string
  created_at: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const MESES_FULL = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const COLORS = ['var(--accent)','var(--green)','var(--yellow)','var(--red)','var(--cyan)']

// Waterfall chart data builder
function buildWaterfall(ingreso: number, gastosNec: number, gastosDisc: number) {
  const ahorro = ingreso - gastosNec - gastosDisc
  return [
    { name: 'Ingreso',     value: ingreso,     spacer: 0,                         fill: 'var(--green)',  type: 'positive' },
    { name: 'G. Fijos',    value: gastosNec,   spacer: ingreso - gastosNec,        fill: 'var(--accent)',  type: 'negative' },
    { name: 'G. Discr.',   value: gastosDisc,  spacer: ingreso - gastosNec - gastosDisc, fill: 'var(--yellow)', type: 'negative' },
    { name: 'Ahorro',      value: Math.max(0, ahorro), spacer: 0,                  fill: 'var(--cyan)',  type: 'result' },
  ]
}

// ─── PDF Drop Zone ────────────────────────────────────────────────────────────

function PdfDropZone({ onUpload }: { onUpload: () => void }) {
  const [dragging, setDragging]   = useState(false)
  const [file, setFile]           = useState<File | null>(null)
  const [form, setForm]           = useState({ mes: String(new Date().getMonth() + 1), anio: String(new Date().getFullYear()), tipo: 'gastos', notas: '', monto_total: '' })
  const [uploading, setUploading] = useState(false)
  const [error, setError]         = useState('')
  const [success, setSuccess]     = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) validateAndSet(f)
  }

  const validateAndSet = (f: File) => {
    setError('')
    if (f.size > 25 * 1024 * 1024) return setError('Archivo muy grande (máximo 25MB)')
    if (!f.name.toLowerCase().endsWith('.pdf') && f.type !== 'application/pdf') return setError('Solo archivos PDF')
    setFile(f)
    setSuccess(false)
  }

  const handleUpload = async () => {
    if (!file) return
    setUploading(true)
    setError('')
    try {
      const token = (await window.Clerk?.session?.getToken()) ?? ''
      const fd = new FormData()
      fd.append('file', file)
      fd.append('mes',        form.mes)
      fd.append('anio',       form.anio)
      fd.append('tipo',       form.tipo)
      fd.append('notas',      form.notas)
      if (form.monto_total) fd.append('monto_total', form.monto_total)

      const res = await fetch('/api/pdf/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error)
      }
      setSuccess(true)
      setFile(null)
      onUpload()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Drop area */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className="rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors py-10"
        style={{
          borderColor: dragging ? 'var(--accent)' : file ? 'var(--green-soft)' : 'var(--border)',
          background:  dragging ? 'rgba(99,102,241,0.06)' : file ? 'rgba(34,197,94,0.04)' : 'var(--bg-card)',
        }}
      >
        {success ? (
          <>
            <CheckCircle size={40} className="text-green-400" />
            <p className="text-green-400 font-medium text-sm">¡PDF subido correctamente!</p>
          </>
        ) : file ? (
          <>
            <FileText size={36} className="text-green-400" />
            <p className="text-strong text-sm font-medium">{file.name}</p>
            <p className="text-dim text-xs">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
          </>
        ) : (
          <>
            <Upload size={36} className="text-faint" />
            <p className="text-muted text-sm font-medium">Arrastra un PDF aquí o haz clic para seleccionar</p>
            <p className="text-faint text-xs">Máximo 25MB · Solo .pdf</p>
          </>
        )}
        <input ref={inputRef} type="file" accept=".pdf,application/pdf" className="hidden"
          onChange={e => { if (e.target.files?.[0]) validateAndSet(e.target.files[0]) }} />
      </div>

      {/* Metadata form (solo si hay archivo) */}
      {file && !success && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label>Mes</label>
            <select className="input" value={form.mes} onChange={e => setForm(p => ({ ...p, mes: e.target.value }))}>
              {MESES_FULL.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label>Año</label>
            <select className="input" value={form.anio} onChange={e => setForm(p => ({ ...p, anio: e.target.value }))}>
              {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label>Tipo</label>
            <select className="input" value={form.tipo} onChange={e => setForm(p => ({ ...p, tipo: e.target.value }))}>
              <option value="gastos">Gastos</option>
              <option value="ingresos">Ingresos</option>
              <option value="mixto">Mixto</option>
            </select>
          </div>
          <div>
            <label>Monto total (opcional)</label>
            <input className="input" type="number" placeholder="0.00" value={form.monto_total}
              onChange={e => setForm(p => ({ ...p, monto_total: e.target.value }))} />
          </div>
          <div className="col-span-2 md:col-span-4">
            <label>Notas (opcional)</label>
            <input className="input" placeholder="Ej: Extracto banco BBVA Abril" value={form.notas}
              onChange={e => setForm(p => ({ ...p, notas: e.target.value }))} />
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-red-400 text-xs p-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)' }}>
          <AlertTriangle size={13} /> {error}
        </div>
      )}

      {file && !success && (
        <div className="flex gap-2">
          <button onClick={handleUpload} disabled={uploading} className="btn-primary">
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            {uploading ? 'Subiendo...' : 'Subir PDF'}
          </button>
          <button onClick={() => setFile(null)} className="btn-secondary">Cancelar</button>
        </div>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Reports() {
  const [summary, setSummary]   = useState<any>(null)
  const [monthly, setMonthly]   = useState<any>(null)
  const [pdfs, setPdfs]         = useState<PdfReporte[]>([])
  const [loading, setLoading]   = useState(true)
  const [year, setYear]         = useState(new Date().getFullYear())
  const [tab, setTab]           = useState<'overview'|'waterfall'|'pdfs'>('overview')
  const [filterTipo, setFilterTipo] = useState('todos')
  const [errorCarga, setErrorCarga] = useState<string | null>(null)

  const loadAll = useCallback(async () => {
    setLoading(true)
    setErrorCarga(null)
    const userId = window.Clerk?.user?.id
    // Sin try/finally esta pagina no fallaba: se colgaba. getSummary lanza si
    // cualquiera de sus cuatro consultas devuelve error, el await de arriba
    // reventaba, y setLoading(false) nunca corria. El spinner giraba para
    // siempre y parecia "no abre" en vez de "no se pudo leer".
    //
    // allSettled y no all: que la tabla pdf_reportes no exista no debe impedir
    // ver el resumen del negocio, que es lo que viene a ver uno aqui.
    try {
      const [res, mes, pdf] = await Promise.allSettled([
        getSummary(),
        getMonthlyReport(year),
        userId
          ? supabase.from('pdf_reportes').select('*').eq('user_id', userId)
              .order('anio', { ascending: false }).order('mes', { ascending: false })
          : Promise.resolve({ data: [], error: null }),
      ])

      if (res.status === 'fulfilled') setSummary(res.value.data)
      if (mes.status === 'fulfilled') setMonthly(mes.value.data)
      if (pdf.status === 'fulfilled') setPdfs((pdf.value.data ?? []) as PdfReporte[])

      const fallos = [res, mes].filter(r => r.status === 'rejected') as PromiseRejectedResult[]
      if (fallos.length) {
        const m = fallos.map(f => f.reason?.message ?? String(f.reason)).join(' · ')
        console.error('[Reportes] no se pudieron cargar los datos', fallos)
        setErrorCarga(m)
      }
    } catch (e) {
      console.error('[Reportes] fallo inesperado', e)
      setErrorCarga(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [year])

  useEffect(() => { loadAll() }, [loadAll])

  // ── Monthly chart data ────────────────────────────────────────────────────
  const monthlyCombined = (() => {
    if (!monthly) return []
    const map: Record<string, any> = {}
    for (let i = 1; i <= 12; i++) {
      const mo = String(i).padStart(2, '0')
      map[mo] = { name: MESES[i - 1], productos: 0, iptv: 0 }
    }
    monthly.products?.forEach((p: any) => { if (map[p.mes]) map[p.mes].productos = p.ingresos || 0 })
    monthly.iptv?.forEach((p: any)     => { if (map[p.mes]) map[p.mes].iptv      = p.ingresos || 0 })
    return Object.values(map)
  })()

  const pieData = summary ? [
    { name: 'Productos', value: Math.round(summary.ingresos_productos || 0) },
    { name: 'IPTV',      value: Math.round(summary.ingresos_iptv      || 0) },
  ].filter(d => d.value > 0) : []

  // ── Waterfall data (mes actual estimado desde summary) ────────────────────
  const waterfallData = buildWaterfall(
    summary?.ingreso_mensual_estimado ?? summary?.total_ingresos_mxn ?? 0,
    summary?.gastos_fijos             ?? 0,
    summary?.gastos_discrecionales    ?? 0,
  )

  // ── Export Excel ──────────────────────────────────────────────────────────
  const handleExportExcel = async () => {
    const { data: ventas }   = await supabase.from('sales').select('*').order('sale_date', { ascending: false })
    const { data: subs }     = await supabase.from('iptv_subscriptions').select('*').order('created_at', { ascending: false })
    const { data: products } = await supabase.from('products').select('*').order('created_at', { ascending: false })

    const wb = XLSX.utils.book_new()
    if (ventas?.length)   XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ventas),   'Ventas')
    if (subs?.length)     XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(subs),     'IPTV')
    if (products?.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(products), 'Inventario')

    XLSX.writeFile(wb, `VentasPro_Reporte_${year}.xlsx`)
  }

  // ── PDF: obtener URL firmada para descargar ───────────────────────────────
  const handleDownloadPdf = async (pdf: PdfReporte) => {
    const { data, error } = await supabase.storage
      .from('pdf-reportes')
      .createSignedUrl(pdf.storage_path, 60)
    if (error || !data?.signedUrl) return alert('Error al generar enlace de descarga')
    window.open(data.signedUrl, '_blank')
  }

  const filteredPdfs = pdfs.filter(p => filterTipo === 'todos' || p.tipo === filterTipo)

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <div className="animate-spin w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full" />
        <p className="text-dim text-sm">Cargando reportes...</p>
      </div>
    </div>
  )

  return (
    <div className="space-y-5 max-w-7xl mx-auto">

      <AvisoError mensaje={errorCarga} onReintentar={loadAll} />

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-strong">Reportes</h1>
          <p className="text-muted text-sm mt-0.5">Análisis financiero · {year}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            <button onClick={() => setYear(y => y - 1)} className="btn-secondary p-2"><ChevronLeft size={14} /></button>
            <span className="text-strong font-semibold text-sm px-3">{year}</span>
            <button onClick={() => setYear(y => y + 1)} className="btn-secondary p-2"><ChevronRight size={14} /></button>
          </div>
          <button onClick={loadAll} className="btn-secondary"><RefreshCw size={14} /> Actualizar</button>
          <button onClick={handleExportExcel} className="btn-primary"><Download size={14} /> Exportar Excel</button>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-2 flex-wrap">
        {(['overview','waterfall','pdfs'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`tab-btn ${tab === t ? 'active' : ''}`}>
            {t === 'overview'   ? '📊 Resumen'         : ''}
            {t === 'waterfall'  ? '🌊 Flujo de Dinero'  : ''}
            {t === 'pdfs'       ? `📄 PDFs (${pdfs.length})` : ''}
          </button>
        ))}
      </div>

      {/* ══════════════ TAB: OVERVIEW ══════════════ */}
      {tab === 'overview' && (
        <div className="space-y-4">

          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { title: 'Ingresos Totales', value: fmt(summary?.total_ingresos_mxn ?? 0), color: 'var(--green)', icon: <DollarSign size={18} />, sub: `Prod. ${fmt(summary?.ingresos_productos ?? 0)}` },
              { title: 'Ganancia Neta',    value: fmt(summary?.ganancia_neta_mxn    ?? 0), color: 'var(--accent)', icon: <TrendingUp size={18} />,   sub: `Margen ${summary?.total_ingresos_mxn > 0 ? Math.round((summary.ganancia_neta_mxn / summary.total_ingresos_mxn) * 100) : 0}%` },
              { title: 'Clientes IPTV',   value: String(summary?.clientes_activos_iptv ?? 0), color: 'var(--cyan)', icon: <Tv size={18} />,  sub: 'Suscriptores activos' },
              { title: 'Productos',        value: String(summary?.total_productos     ?? 0), color: 'var(--yellow)', icon: <Package size={18} />, sub: `${summary?.disponibles ?? 0} disponibles` },
            ].map(c => (
              <div key={c.title} className="stat-card" style={{ borderTop: `2px solid ${c.color}` }}>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs text-muted uppercase tracking-wide mb-1">{c.title}</p>
                    <p className="text-xl font-bold text-strong">{c.value}</p>
                    <p className="text-xs text-dim mt-1">{c.sub}</p>
                  </div>
                  <div className="p-2 rounded-lg" style={{ background: `${c.color}20` }}>
                    <span style={{ color: c.color }}>{c.icon}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Chart + Pie */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="card lg:col-span-2">
              <h3 className="text-sm font-semibold text-strong mb-4">Ingresos por Mes — {year}</h3>
              {monthlyCombined.some((m: any) => m.productos + m.iptv > 0) ? (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={monthlyCombined} barGap={3}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: 'var(--text-dim)', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: 'var(--text-dim)', fontSize: 10 }} axisLine={false} tickLine={false}
                      tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => formatMXN(v)} />
                    <Bar dataKey="productos" name="Productos" fill="var(--accent)" radius={[3,3,0,0]} />
                    <Bar dataKey="iptv"      name="IPTV"      fill="var(--green)" radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-60 flex items-center justify-center text-faint text-sm">Sin datos de ventas aún</div>
              )}
            </div>

            <div className="card">
              <h3 className="text-sm font-semibold text-strong mb-4">Distribución de Ingresos</h3>
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80}
                      dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}>
                      {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => formatMXN(v)} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-48 flex items-center justify-center text-faint text-sm">Sin datos</div>
              )}
            </div>
          </div>

          {/* Monthly table */}
          <div className="card">
            <h3 className="text-sm font-semibold text-strong mb-4">Tabla Mensual — {year}</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
                    <th className="text-left py-2 text-muted">Mes</th>
                    <th className="text-right py-2 text-muted">Productos</th>
                    <th className="text-right py-2 text-muted">IPTV</th>
                    <th className="text-right py-2 text-muted">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyCombined.map((m: any) => (
                    <tr key={m.name} className="table-row-hover border-b" style={{ borderColor: 'var(--border)' }}>
                      <td className="py-2 text-body">{m.name}</td>
                      <td className="py-2 text-right text-body">{m.productos > 0 ? fmt(m.productos) : '—'}</td>
                      <td className="py-2 text-right text-body">{m.iptv      > 0 ? fmt(m.iptv)      : '—'}</td>
                      <td className="py-2 text-right font-semibold text-strong">
                        {m.productos + m.iptv > 0 ? fmt(m.productos + m.iptv) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ TAB: WATERFALL ══════════════ */}
      {tab === 'waterfall' && (
        <div className="space-y-4">
          <div className="card">
            <h3 className="text-sm font-semibold text-strong mb-1">Flujo de Dinero Mensual (Waterfall)</h3>
            <p className="text-xs text-dim mb-5">Ingreso → Gastos → Ahorro neto del mes actual</p>

            {waterfallData.every(d => d.value === 0) ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-faint">
                <TrendingDown size={40} />
                <p className="text-sm">Conecta tu hoja de Presupuesto para ver el flujo de dinero</p>
                <a href="/presupuesto" className="btn-secondary text-xs">Ir a Presupuesto →</a>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <ComposedChart data={waterfallData} barCategoryGap="25%">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--text-dim)', fontSize: 11 }} axisLine={false} tickLine={false}
                    tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(v: number, name: string) => name === 'spacer' ? null : [formatMXN(v), '']}
                  />
                  {/* Barra invisible (spacer) para efecto waterfall */}
                  <Bar dataKey="spacer" stackId="a" fill="transparent" />
                  {/* Barra visible con color por tipo */}
                  <Bar dataKey="value" stackId="a" radius={[5, 5, 0, 0]}>
                    {waterfallData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </ComposedChart>
              </ResponsiveContainer>
            )}

            {/* Leyenda */}
            <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
              {waterfallData.map(d => (
                <div key={d.name} className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-sm" style={{ background: d.fill, display: 'inline-block' }} />
                  <span className="text-xs text-body">{d.name}</span>
                  <span className="text-xs font-semibold text-strong">{fmt(d.value)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ TAB: PDFs ══════════════ */}
      {tab === 'pdfs' && (
        <div className="space-y-4">

          {/* Upload zone */}
          <div className="card">
            <h3 className="text-sm font-semibold text-strong mb-4 flex items-center gap-2">
              <Upload size={14} className="text-indigo-400" /> Subir Reporte PDF
            </h3>
            <PdfDropZone onUpload={loadAll} />
          </div>

          {/* Lista de PDFs */}
          <div className="card">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h3 className="text-sm font-semibold text-strong">PDFs subidos ({filteredPdfs.length})</h3>
              <select className="input w-auto" value={filterTipo} onChange={e => setFilterTipo(e.target.value)}>
                <option value="todos">Todos los tipos</option>
                <option value="gastos">Gastos</option>
                <option value="ingresos">Ingresos</option>
                <option value="mixto">Mixto</option>
              </select>
            </div>

            {filteredPdfs.length === 0 ? (
              <div className="flex flex-col items-center py-12 gap-3 text-faint">
                <FileText size={40} />
                <p className="text-sm">No hay PDFs subidos aún</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredPdfs.map(pdf => (
                  <div key={pdf.id} className="flex items-center gap-4 py-3 px-3 rounded-xl table-row-hover border" style={{ borderColor: 'var(--border)' }}>
                    <div className="p-2 rounded-lg" style={{ background: 'var(--surface-2)' }}>
                      <FileText size={18} className={
                        pdf.tipo === 'gastos'   ? 'text-red-400'    :
                        pdf.tipo === 'ingresos' ? 'text-green-400'  : 'text-blue-400'
                      } />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-strong font-medium truncate">{pdf.nombre}</p>
                      <p className="text-xs text-dim mt-0.5">
                        {MESES_FULL[pdf.mes - 1]} {pdf.anio}
                        {pdf.monto_total ? ` · ${fmt(pdf.monto_total)}` : ''}
                        {pdf.notas ? ` · ${pdf.notas}` : ''}
                      </p>
                    </div>
                    <span className={`badge ${pdf.tipo === 'gastos' ? 'badge-red' : pdf.tipo === 'ingresos' ? 'badge-green' : 'badge-blue'}`}>
                      {pdf.tipo}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleDownloadPdf(pdf)}
                        className="btn-secondary p-2" title="Descargar"
                      >
                        <Download size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  )
}
