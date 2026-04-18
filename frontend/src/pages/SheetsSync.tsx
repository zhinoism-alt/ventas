import { useState, useEffect, useCallback } from 'react'
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

// ─── API helpers ──────────────────────────────────────────────────────────────
const API = '/api/sheets'

async function apiFetch(path: string, opts?: RequestInit) {
  const r = await fetch(`${API}${path}`, opts)
  const json = await r.json()
  if (!r.ok) throw new Error(json.error ?? 'Error desconocido')
  return json
}

function getConfigs(): Promise<{ configs: SheetConfig[] }> {
  return apiFetch('/sync')
}

function syncOne(config_id: number): Promise<{ rows_synced: number }> {
  return apiFetch('/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config_id }),
  })
}

function syncAll(): Promise<{ results: any[] }> {
  return apiFetch('/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sync_all: true }),
  })
}

function addConfig(nombre: string, sheet_csv_url: string) {
  return apiFetch('/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'add', nombre, sheet_csv_url }),
  })
}

function deleteConfig(config_id: number) {
  return apiFetch('/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'delete', config_id }),
  })
}

function getRows(config_id: number, limit = 30): Promise<{ rows: SheetRow[] }> {
  return apiFetch(`/data?config_id=${config_id}&limit=${limit}`)
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
    slate:  'bg-slate-800 text-slate-400 border-slate-700',
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
        style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
      >
        <Plus size={15} /> Agregar hoja
      </button>
    )
  }

  return (
    <div className="rounded-xl p-4 space-y-3" style={{ background: '#1e293b', border: '1px solid #334155' }}>
      <p className="text-sm font-semibold text-white">Nueva hoja de Google Sheets</p>

      <input
        type="text"
        value={nombre}
        onChange={e => setNombre(e.target.value)}
        placeholder="Nombre (ej. Presupuesto Mayo)"
        className="w-full rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:ring-2 focus:ring-indigo-500"
        style={{ background: '#0f172a', border: '1px solid #334155' }}
      />

      <input
        type="url"
        value={url}
        onChange={e => setUrl(e.target.value)}
        placeholder="URL CSV publicado de Google Sheets"
        className="w-full rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:ring-2 focus:ring-indigo-500"
        style={{ background: '#0f172a', border: '1px solid #334155' }}
      />

      <p className="text-xs text-slate-500">
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
          style={{ background: '#6366f1' }}
        >
          {saving ? <RefreshCw size={13} className="animate-spin" /> : <Plus size={13} />}
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
        <button
          onClick={() => { setOpen(false); setErr(''); setNombre(''); setUrl('') }}
          className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white transition-colors"
          style={{ background: '#0f172a', border: '1px solid #334155' }}
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}

// ─── Data Preview ─────────────────────────────────────────────────────────────
function DataPreview({ configId }: { configId: number }) {
  const [rows, setRows] = useState<SheetRow[]>([])
  const [loading, setLoading] = useState(true)
  const [headers, setHeaders] = useState<string[]>([])

  useEffect(() => {
    getRows(configId, 30)
      .then(r => {
        setRows(r.rows)
        if (r.rows.length > 0) setHeaders(Object.keys(r.rows[0].datos))
      })
      .finally(() => setLoading(false))
  }, [configId])

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500 py-4">
        <RefreshCw size={14} className="animate-spin" /> Cargando datos…
      </div>
    )
  }

  if (rows.length === 0) {
    return <p className="text-sm text-slate-500 py-4">Sin datos sincronizados aún. Haz clic en "Sincronizar".</p>
  }

  return (
    <div className="overflow-x-auto rounded-lg" style={{ border: '1px solid #1e293b' }}>
      <table className="min-w-full text-xs">
        <thead style={{ background: '#0f172a' }}>
          <tr>
            <th className="px-3 py-2 text-left text-slate-500 font-medium">#</th>
            {headers.map(h => (
              <th key={h} className="px-3 py-2 text-left text-slate-400 font-medium whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={row.fila}
              style={{ background: i % 2 === 0 ? '#0a0f1e' : '#0d1526', borderTop: '1px solid #1e293b' }}
            >
              <td className="px-3 py-2 text-slate-600">{row.fila}</td>
              {headers.map(h => (
                <td key={h} className="px-3 py-2 text-slate-300 whitespace-nowrap max-w-xs truncate">
                  {row.datos[h] ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-slate-600 px-3 py-2">Mostrando {rows.length} filas</p>
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
    <div className="rounded-xl overflow-hidden transition-all" style={{ background: '#1e293b', border: '1px solid #334155' }}>
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: '#16a34a22' }}>
          <FileSpreadsheet size={18} className="text-green-400" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-white truncate">{cfg.nombre}</span>
            <Badge color={cfg.is_active ? 'green' : 'slate'}>
              {cfg.is_active ? 'Activa' : 'Inactiva'}
            </Badge>
            <Badge color="slate">{cfg.row_count} filas</Badge>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5 flex-wrap">
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
            className="p-2 rounded-lg text-slate-400 hover:text-indigo-400 hover:bg-indigo-900/30 transition-colors disabled:opacity-40"
          >
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
          </button>

          <button
            onClick={() => setExpanded(e => !e)}
            title="Ver datos"
            className="p-2 rounded-lg text-slate-400 hover:text-white transition-colors"
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
                className="text-xs text-slate-500 hover:text-white px-2 py-1 rounded bg-slate-800 transition-colors"
              >
                No
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              title="Eliminar"
              className="p-2 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-900/20 transition-colors"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Expanded data preview */}
      {expanded && (
        <div className="px-4 pb-4 pt-0">
          <div style={{ borderTop: '1px solid #334155', paddingTop: '12px' }}>
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
      const ok = r.results.filter((x: any) => x.ok).length
      const fail = r.results.filter((x: any) => !x.ok).length
      setSyncAllResult(`${ok} hojas sincronizadas${fail > 0 ? `, ${fail} con error` : ''}`)
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
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <FileSpreadsheet size={24} className="text-green-400" />
            Google Sheets Sync
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Importa datos de hojas publicadas de Google Sheets y consúltalos desde la app.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {configs.length > 0 && (
            <button
              onClick={handleSyncAll}
              disabled={syncingAll}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50 transition-colors"
              style={{ background: '#334155' }}
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
        <div className="flex items-center gap-3 text-slate-400 py-8">
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
          <p className="text-slate-300 font-medium">No hay hojas configuradas</p>
          <p className="text-slate-500 text-sm max-w-sm mx-auto">
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
        <div className="rounded-xl p-5 space-y-3" style={{ background: '#0f172a', border: '1px solid #1e293b' }}>
          <p className="text-sm font-semibold text-slate-300">¿Cómo publicar tu hoja como CSV?</p>
          <ol className="space-y-2 text-sm text-slate-400">
            <li>1. Abre tu hoja de Google Sheets.</li>
            <li>2. Ve a <strong className="text-slate-300">Archivo → Compartir → Publicar en la web</strong>.</li>
            <li>3. En el primer desplegable elige la hoja que quieres; en el segundo elige <strong className="text-slate-300">Valores separados por comas (.csv)</strong>.</li>
            <li>4. Haz clic en <strong className="text-slate-300">Publicar</strong> y copia el enlace generado.</li>
            <li>5. Pega ese enlace en el campo "URL CSV publicado" al agregar la hoja aquí.</li>
          </ol>
        </div>
      )}
    </div>
  )
}
