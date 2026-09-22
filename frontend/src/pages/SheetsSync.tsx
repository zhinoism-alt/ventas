import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { parseCSV } from '../lib/presupuestoSheet'
import {
  FileSpreadsheet, RefreshCw, Plus, Trash2, ChevronDown, ChevronUp,
  Clock, CheckCircle2, XCircle, ExternalLink, AlertTriangle
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────
interface SheetConfig {
  id: number
  nombre: string
  sheet_csv_url: string
  is_active: boolean
  last_synced_at: string | null
  row_count: number
  created_at: string
}

interface SheetRow {
  fila: number
  datos: Record<string, string>
  synced_at: string
}

/* ─── Datos ───────────────────────────────────────────────────────────────────
   Antes esto llamaba a /api/sheets/*, que a su vez invocaba dos edge functions
   de Supabase que hablaban con la API de Google usando una cuenta de servicio.
   Nada de esa cadena existia: las edge functions nunca se desplegaron (404), la
   cuenta de servicio nunca se dio de alta, y faltaban tres tablas.

   Se termina por donde la propia pantalla siempre apunto: el enlace de
   "Publicar en la web ... como CSV". Google lo sirve con
   Access-Control-Allow-Origin: *, asi que el navegador lo lee directo. Sin
   credenciales, sin edge functions, sin cola de escritura. Es lo mismo que
   Presupuesto hace desde hace semanas.
   ──────────────────────────────────────────────────────────────────────────── */

async function getConfigs(): Promise<{ configs: SheetConfig[] }> {
  const { data, error } = await supabase
    .from('sheets_config').select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return { configs: (data ?? []) as SheetConfig[] }
}

/** Lee el CSV publicado y deja el resultado en sheets_datos. */
async function syncOne(config_id: number): Promise<{ rows_synced: number }> {
  const { data: cfg, error: eCfg } = await supabase
    .from('sheets_config').select('*').eq('id', config_id).single()
  if (eCfg) throw new Error(eCfg.message)
  if (!cfg?.sheet_csv_url) throw new Error('Esta hoja no tiene URL de CSV publicado.')

  let filas: string[][]
  try {
    const res = await fetch(cfg.sheet_csv_url, { cache: 'no-store' })
    if (!res.ok) throw new Error(`Google respondió ${res.status}`)
    filas = parseCSV(await res.text())
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await supabase.from('sheets_config')
      .update({ ultimo_error: msg }).eq('id', config_id)
    throw new Error(msg)
  }

  // La primera fila son los encabezados. Una columna sin nombre igual se
  // guarda: perder datos por una celda vacia seria peor que un nombre feo.
  const [encabezados = [], ...cuerpo] = filas
  const nombres = encabezados.map((h, i) => h.trim() || `Columna ${i + 1}`)
  const registros = cuerpo
    .filter(f => f.some(c => c.trim() !== ''))
    .map((f, i) => ({
      config_id,
      fila: i + 1,
      datos: Object.fromEntries(nombres.map((n, j) => [n, f[j] ?? ''])),
    }))

  // Reemplazo completo: la hoja es la verdad, no lo que quedo aqui la vez
  // pasada. Si una fila se borro alla, tiene que desaparecer aca.
  const { error: eDel } = await supabase.from('sheets_datos').delete().eq('config_id', config_id)
  if (eDel) throw new Error(eDel.message)
  if (registros.length) {
    const { error: eIns } = await supabase.from('sheets_datos').insert(registros)
    if (eIns) throw new Error(eIns.message)
  }

  await supabase.from('sheets_config').update({
    last_synced_at: new Date().toISOString(),
    row_count: registros.length,
    ultimo_error: null,
  }).eq('id', config_id)

  return { rows_synced: registros.length }
}

async function syncAll(): Promise<{ results: unknown[] }> {
  const { configs } = await getConfigs()
  const results: unknown[] = []
  for (const c of configs) {
    // `ok` es lo que la pantalla cuenta para su resumen; sin ese campo una
    // sincronizacion exitosa se reportaba como fallida.
    try {
      const { rows_synced } = await syncOne(c.id)
      results.push({ id: c.id, ok: true, rows_synced })
    } catch (e) {
      results.push({ id: c.id, ok: false, error: e instanceof Error ? e.message : String(e) })
    }
  }
  return { results }
}

async function addConfig(nombre: string, sheet_csv_url: string) {
  const { error } = await supabase.from('sheets_config')
    .insert({ nombre, sheet_csv_url })
  if (error) throw new Error(error.message)
}

/** Archiva la hoja. Sus filas se conservan por si se reactiva. */
async function deleteConfig(config_id: number) {
  const { error } = await supabase.from('sheets_config')
    .update({ is_active: false }).eq('id', config_id)
  if (error) throw new Error(error.message)
}

async function getRows(config_id: number, limit = 30): Promise<{ rows: SheetRow[] }> {
  const { data, error } = await supabase
    .from('sheets_datos').select('fila, datos, synced_at')
    .eq('config_id', config_id)
    .order('fila')
    .limit(limit)
  if (error) throw new Error(error.message)
  return { rows: (data ?? []) as SheetRow[] }
}

// ─── Small helpers ────────────────────────────────────────────────────────────
function timeAgo(iso: string | null): string {
  if (!iso) return 'Nunca'
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return 'Hace menos de 1 min'
  if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `Hace ${Math.floor(diff / 3600)} h`
  return `Hace ${Math.floor(diff / 86400)} días`
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function Badge({ children, color = 'slate' }: { children: React.ReactNode; color?: string }) {
  const palette: Record<string, string> = {
    green:  'bg-green-900/40 text-green-400 border-green-800',
    red:    'bg-red-900/40 text-red-400 border-red-800',
    slate:  'surface-2 text-muted bd',
    indigo: 'bg-indigo-900/40 text-indigo-400 border-indigo-800',
  }
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${palette[color] ?? palette.slate}`}>
      {children}
    </span>
  )
}

function StatusIcon({ syncing, ok }: { syncing?: boolean; ok?: boolean }) {
  if (syncing) return <RefreshCw size={14} className="text-indigo-400 animate-spin" />
  if (ok === true) return <CheckCircle2 size={14} className="text-green-400" />
  if (ok === false) return <XCircle size={14} className="text-red-400" />
  return null
}

// ─── Add Sheet Form ───────────────────────────────────────────────────────────
function AddSheetForm({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false)
  const [nombre, setNombre] = useState('')
  const [url, setUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function handleAdd() {
    if (!nombre.trim() || !url.trim()) { setErr('Completa los dos campos'); return }
    if (!url.includes('docs.google.com') && !url.includes('output=csv')) {
      setErr('Usa la URL de CSV publicado de Google Sheets')
      return
    }
    setSaving(true)
    setErr('')
    try {
      await addConfig(nombre.trim(), url.trim())
      setNombre('')
      setUrl('')
      setOpen(false)
      onAdded()
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors hover:opacity-90"
        style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-2))' }}
      >
        <Plus size={15} /> Agregar hoja
      </button>
    )
  }

  return (
    <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--surface-2)', border: '1px solid var(--border-hi)' }}>
      <p className="text-sm font-semibold text-strong">Nueva hoja de Google Sheets</p>

      <input
        type="text"
        value={nombre}
        onChange={e => setNombre(e.target.value)}
        placeholder="Nombre (ej. Presupuesto Mayo)"
        className="w-full rounded-lg px-3 py-2 text-sm text-strong placeholder-slate-500 outline-none focus:ring-2 focus:ring-indigo-500"
        style={{ background: 'var(--bg)', border: '1px solid var(--border-hi)' }}
      />

      <input
        type="url"
        value={url}
        onChange={e => setUrl(e.target.value)}
        placeholder="URL CSV publicado de Google Sheets"
        className="w-full rounded-lg px-3 py-2 text-sm text-strong placeholder-slate-500 outline-none focus:ring-2 focus:ring-indigo-500"
        style={{ background: 'var(--bg)', border: '1px solid var(--border-hi)' }}
      />

      <p className="text-xs text-dim">
        En Google Sheets → Archivo → Compartir → Publicar en la web → CSV → copia el enlace
      </p>

      {err && (
        <div className="flex items-center gap-2 text-xs text-red-400 bg-red-900/20 rounded-lg px-3 py-2 border border-red-900">
          <AlertTriangle size={13} /> {err}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleAdd}
          disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50 transition-colors"
          style={{ background: 'var(--accent)' }}
        >
          {saving ? <RefreshCw size={13} className="animate-spin" /> : <Plus size={13} />}
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
        <button
          onClick={() => { setOpen(false); setErr(''); setNombre(''); setUrl('') }}
          className="px-4 py-2 rounded-lg text-sm text-muted hover:text-strong transition-colors"
          style={{ background: 'var(--bg)', border: '1px solid var(--border-hi)' }}
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}

// ─── Data Preview ─────────────────────────────────────────────────────────────
/**
 * Vista previa de una hoja.
 *
 * El problema real: no toda hoja tiene forma de tabla. La de presupuesto de
 * Brandon empieza con "Ingreso Mensual | $21,767.70" en la primera fila, asi
 * que no hay encabezados que valgan y media hoja son columnas vacias que solo
 * sirven de separacion visual dentro de Google Sheets.
 *
 * Una tabla cruda de eso es ilegible: columnas sin nada, nombres inventados
 * como "Columna 7", y en un telefono no cabe ni la mitad. Asi que la vista se
 * adapta a lo que encuentra:
 *
 *   · Las columnas que estan vacias en todas las filas no se dibujan.
 *   · Si los encabezados son de relleno se usan letras, como en la hoja.
 *   · En pantalla angosta cada fila se muestra como ficha, no como renglon.
 */
function DataPreview({ configId }: { configId: number }) {
  const [rows, setRows] = useState<SheetRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    getRows(configId, 30)
      .then(r => { if (vivo) setRows(r.rows ?? []) })
      .catch(e => { if (vivo) setError(e instanceof Error ? e.message : String(e)) })
      .finally(() => { if (vivo) setLoading(false) })
    return () => { vivo = false }
  }, [configId])

  // Solo las columnas que llevan algo. Una columna vacia en las treinta filas
  // no aporta nada y empuja las demas fuera de la pantalla.
  const columnas = useMemo(() => {
    const todas: string[] = []
    for (const r of rows) for (const k of Object.keys(r.datos ?? {})) if (!todas.includes(k)) todas.push(k)
    return todas.filter(k => rows.some(r => String(r.datos?.[k] ?? '').trim() !== ''))
  }, [rows])

  /**
   * Un encabezado util es una palabra que nombra la columna. Aqui llegan dos
   * cosas que no lo son: el relleno que ponemos cuando la celda venia vacia
   * ("Columna 7"), y los valores que la hoja trae en su primera fila cuando no
   * es una fila de encabezados — "$21,767.70" como titulo no orienta a nadie.
   * En esos casos la letra de la columna, como en la hoja, dice mas.
   */
  const etiqueta = (k: string, i: number) => {
    const limpio = k.trim()
    const esRelleno = /^Columna \d+$/.test(limpio)
    const esValor = /^[$\d][\d,.\s%$-]*$/.test(limpio)
    if (!limpio || esRelleno || esValor) return String.fromCharCode(65 + i)
    return limpio.length > 28 ? limpio.slice(0, 27) + '…' : limpio
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-dim py-4">
        <RefreshCw size={14} className="animate-spin" /> Cargando datos…
      </div>
    )
  }

  if (error) {
    return (
      <p className="text-sm py-4" style={{ color: 'var(--red)' }}>
        No se pudo leer la vista previa: {error}
      </p>
    )
  }

  if (rows.length === 0) {
    return <p className="text-sm text-dim py-4">Sin datos sincronizados aún. Pica «Sincronizar».</p>
  }

  if (columnas.length === 0) {
    return <p className="text-sm text-dim py-4">Se sincronizaron {rows.length} filas, pero están todas vacías.</p>
  }

  return (
    <div>
      {/* Pantalla ancha: tabla */}
      <div className="hidden md:block scroll-x rounded-lg" style={{ border: '1px solid var(--border)' }}>
        <table className="min-w-full text-xs">
          <thead style={{ background: 'var(--bg)' }}>
            <tr>
              <th className="px-3 py-2 text-left text-dim font-medium">#</th>
              {columnas.map((h, i) => (
                <th key={h} className="px-3 py-2 text-left text-muted font-medium whitespace-nowrap">
                  {etiqueta(h, i)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.fila}
                  style={{ background: i % 2 === 0 ? 'var(--bg-card)' : 'var(--surface-2)',
                           borderTop: '1px solid var(--border)' }}>
                <td className="px-3 py-2 text-faint">{row.fila}</td>
                {columnas.map(h => (
                  <td key={h} className="px-3 py-2 text-body whitespace-nowrap" style={{ maxWidth: 220 }}>
                    <span className="block truncate">{row.datos?.[h] ?? ''}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Telefono: una ficha por fila. Una tabla de nueve columnas ahi no se
          lee — se ven dos columnas y el resto queda fuera. */}
      <div className="md:hidden space-y-2">
        {rows.map(row => {
          const llenas = columnas.filter(h => String(row.datos?.[h] ?? '').trim() !== '')
          if (!llenas.length) return null
          return (
            <div key={row.fila} className="rounded-lg p-3"
                 style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <p className="text-xs text-faint mb-1.5">Fila {row.fila}</p>
              <dl className="space-y-1">
                {llenas.map(h => (
                  <div key={h} className="flex justify-between gap-3 text-xs">
                    <dt className="text-muted flex-shrink-0">{etiqueta(h, columnas.indexOf(h))}</dt>
                    <dd className="text-body text-right break-words">{row.datos[h]}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )
        })}
      </div>

      <p className="text-xs text-faint px-1 py-2">
        {rows.length} filas · {columnas.length} columnas con datos
        {columnas.length < Object.keys(rows[0]?.datos ?? {}).length &&
          ` (se ocultaron ${Object.keys(rows[0]?.datos ?? {}).length - columnas.length} vacías)`}
      </p>
    </div>
  )
}

// ─── Config Card ──────────────────────────────────────────────────────────────
function ConfigCard({
  cfg,
  onSynced,
  onDeleted,
}: {
  cfg: SheetConfig
  onSynced: (id: number, rows: number) => void
  onDeleted: (id: number) => void
}) {
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{ ok: boolean; rows?: number } | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleSync() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const r = await syncOne(cfg.id)
      setSyncResult({ ok: true, rows: r.rows_synced })
      onSynced(cfg.id, r.rows_synced)
    } catch {
      setSyncResult({ ok: false })
    } finally {
      setSyncing(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      await deleteConfig(cfg.id)
      onDeleted(cfg.id)
    } catch {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  return (
    <div className="rounded-xl overflow-hidden transition-all" style={{ background: 'var(--surface-2)', border: '1px solid var(--border-hi)' }}>
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: '#16a34a22' }}>
          <FileSpreadsheet size={18} className="text-green-400" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-strong truncate">{cfg.nombre}</span>
            <Badge color={cfg.is_active ? 'green' : 'slate'}>
              {cfg.is_active ? 'Activa' : 'Inactiva'}
            </Badge>
            <Badge color="slate">{cfg.row_count} filas</Badge>
          </div>
          <div className="flex items-center gap-2 text-xs text-dim mt-0.5 flex-wrap">
            <Clock size={11} />
            <span>Última sync: {timeAgo(cfg.last_synced_at)}</span>
            <a
              href={cfg.sheet_csv_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 transition-colors"
              onClick={e => e.stopPropagation()}
            >
              <ExternalLink size={10} /> CSV
            </a>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <StatusIcon syncing={syncing} ok={syncResult?.ok} />
          {syncResult?.ok && (
            <span className="text-xs text-green-400">{syncResult.rows} filas</span>
          )}
          {syncResult?.ok === false && (
            <span className="text-xs text-red-400">Error</span>
          )}

          <button
            onClick={handleSync}
            disabled={syncing}
            title="Sincronizar ahora"
            className="p-2 rounded-lg text-muted hover:text-indigo-400 hover:bg-indigo-900/30 transition-colors disabled:opacity-40"
          >
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
          </button>

          <button
            onClick={() => setExpanded(e => !e)}
            title="Ver datos"
            className="p-2 rounded-lg text-muted hover:text-strong transition-colors"
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded bg-red-900/30 transition-colors"
              >
                {deleting ? '…' : 'Confirmar'}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-xs text-dim hover:text-strong px-2 py-1 rounded surface-2 transition-colors"
              >
                No
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              title="Eliminar"
              className="p-2 rounded-lg text-dim hover:text-red-400 hover:bg-red-900/20 transition-colors"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Expanded data preview */}
      {expanded && (
        <div className="px-4 pb-4 pt-0">
          <div style={{ borderTop: '1px solid var(--border-hi)', paddingTop: '12px' }}>
            <DataPreview configId={cfg.id} key={cfg.last_synced_at ?? cfg.id} />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function SheetsSync() {
  const [configs, setConfigs] = useState<SheetConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [syncingAll, setSyncingAll] = useState(false)
  const [syncAllResult, setSyncAllResult] = useState<string>('')

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    getConfigs()
      .then(r => setConfigs(r.configs))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  async function handleSyncAll() {
    setSyncingAll(true)
    setSyncAllResult('')
    try {
      const r = await syncAll()
      const buenas = r.results.filter((x: any) => x.ok)
      const fail = r.results.length - buenas.length
      const filas = buenas.reduce((t: number, x: any) => t + (x.rows_synced ?? 0), 0)
      setSyncAllResult(
        `${buenas.length} hoja${buenas.length === 1 ? '' : 's'} · ${filas} fila${filas === 1 ? '' : 's'}` +
        (fail > 0 ? ` · ${fail} con error` : ''))
      load()
    } catch (e: any) {
      setSyncAllResult('Error al sincronizar: ' + e.message)
    } finally {
      setSyncingAll(false)
    }
  }

  function handleSynced(id: number, rows: number) {
    setConfigs(prev => prev.map(c =>
      c.id === id
        ? { ...c, row_count: rows, last_synced_at: new Date().toISOString() }
        : c
    ))
  }

  function handleDeleted(id: number) {
    setConfigs(prev => prev.filter(c => c.id !== id))
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-strong flex items-center gap-2">
            <FileSpreadsheet size={24} className="text-green-400" />
            Google Sheets Sync
          </h1>
          <p className="text-sm text-muted mt-1">
            Importa datos de hojas publicadas de Google Sheets y consúltalos desde la app.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {configs.length > 0 && (
            <button
              onClick={handleSyncAll}
              disabled={syncingAll}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-strong disabled:opacity-50 transition-colors"
              style={{ background: 'var(--surface-3)' }}
            >
              <RefreshCw size={14} className={syncingAll ? 'animate-spin' : ''} />
              {syncingAll ? 'Sincronizando…' : 'Sync todo'}
            </button>
          )}
          <AddSheetForm onAdded={load} />
        </div>
      </div>

      {/* Sync-all result */}
      {syncAllResult && (
        <div className="flex items-center gap-2 text-sm text-green-400 bg-green-900/20 rounded-lg px-4 py-2.5 border border-green-900">
          <CheckCircle2 size={15} /> {syncAllResult}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-400 bg-red-900/20 rounded-lg px-4 py-2.5 border border-red-900">
          <XCircle size={15} /> {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-3 text-muted py-8">
          <RefreshCw size={18} className="animate-spin" />
          <span>Cargando hojas configuradas…</span>
        </div>
      )}

      {/* Config list */}
      {!loading && configs.length === 0 && !error && (
        <div className="text-center py-16 space-y-3">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto"
            style={{ background: '#16a34a22' }}>
            <FileSpreadsheet size={32} className="text-green-400 opacity-60" />
          </div>
          <p className="text-body font-medium">No hay hojas configuradas</p>
          <p className="text-dim text-sm max-w-sm mx-auto">
            Agrega una hoja de Google Sheets publicada como CSV para importar y visualizar sus datos aquí.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {configs.map(cfg => (
          <ConfigCard
            key={cfg.id}
            cfg={cfg}
            onSynced={handleSynced}
            onDeleted={handleDeleted}
          />
        ))}
      </div>

      {/* How-to */}
      {configs.length === 0 && !loading && (
        <div className="rounded-xl p-5 space-y-3" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
          <p className="text-sm font-semibold text-body">¿Cómo publicar tu hoja como CSV?</p>
          <ol className="space-y-2 text-sm text-muted">
            <li>1. Abre tu hoja de Google Sheets.</li>
            <li>2. Ve a <strong className="text-body">Archivo → Compartir → Publicar en la web</strong>.</li>
            <li>3. En el primer desplegable elige la hoja que quieres; en el segundo elige <strong className="text-body">Valores separados por comas (.csv)</strong>.</li>
            <li>4. Haz clic en <strong className="text-body">Publicar</strong> y copia el enlace generado.</li>
            <li>5. Pega ese enlace en el campo "URL CSV publicado" al agregar la hoja aquí.</li>
          </ol>
        </div>
      )}
    </div>
  )
}
