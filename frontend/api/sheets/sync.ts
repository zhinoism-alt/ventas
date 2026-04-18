import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

/** Parse a CSV string into an array of objects using the first row as headers */
function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []

  const headers = splitCSVLine(lines[0])
  const rows: Record<string, string>[] = []

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCSVLine(lines[i])
    if (cols.every(c => c === '')) continue // skip blank rows
    const obj: Record<string, string> = {}
    headers.forEach((h, idx) => {
      obj[h.trim()] = (cols[idx] ?? '').trim()
    })
    rows.push(obj)
  }
  return rows
}

/** Split a single CSV line respecting quoted fields */
function splitCSVLine(line: string): string[] {
  const result: string[] = []
  let cur = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      result.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  result.push(cur)
  return result
}

/** Sync a single sheets_config row — fetches CSV, upserts rows into sheets_datos */
async function syncOne(configId: number, supabase: ReturnType<typeof createClient>) {
  // Fetch config
  const { data: cfg, error: cfgErr } = await supabase
    .from('sheets_config')
    .select('*')
    .eq('id', configId)
    .single()

  if (cfgErr || !cfg) throw new Error(`Config ${configId} not found`)
  if (!cfg.sheet_csv_url) throw new Error(`Config ${configId} has no sheet_csv_url`)

  // Fetch published CSV
  const resp = await fetch(cfg.sheet_csv_url, { signal: AbortSignal.timeout(10000) })
  if (!resp.ok) throw new Error(`Failed to fetch CSV: HTTP ${resp.status}`)
  const csvText = await resp.text()

  // Parse
  const rows = parseCSV(csvText)

  // Delete existing rows for this config
  await supabase.from('sheets_datos').delete().eq('config_id', configId)

  // Insert new rows (batch of 500 at a time)
  if (rows.length > 0) {
    const inserts = rows.map((datos, idx) => ({
      config_id: configId,
      fila: idx + 1,
      datos,
      synced_at: new Date().toISOString(),
    }))

    const BATCH = 500
    for (let i = 0; i < inserts.length; i += BATCH) {
      const { error: insertErr } = await supabase.from('sheets_datos').insert(inserts.slice(i, i + BATCH))
      if (insertErr) throw insertErr
    }
  }

  // Update last_synced_at
  await supabase
    .from('sheets_config')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('id', configId)

  return { config_id: configId, nombre: cfg.nombre, rows_synced: rows.length }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()

  const supabase = getSupabase()

  // ── GET /api/sheets/sync ─────────────────────────────────────────────────────
  // Returns all configs with their row counts
  if (req.method === 'GET') {
    try {
      const { data: configs, error } = await supabase
        .from('sheets_config')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error

      // Get row counts per config
      const counts = await Promise.all(
        (configs ?? []).map(async (cfg: any) => {
          const { count } = await supabase
            .from('sheets_datos')
            .select('*', { count: 'exact', head: true })
            .eq('config_id', cfg.id)
          return { config_id: cfg.id, row_count: count ?? 0 }
        })
      )

      const countMap: Record<number, number> = {}
      counts.forEach(c => { countMap[c.config_id] = c.row_count })

      const result = (configs ?? []).map((cfg: any) => ({
        ...cfg,
        row_count: countMap[cfg.id] ?? 0,
      }))

      return res.json({ configs: result })
    } catch (err: any) {
      return res.status(500).json({ error: err.message })
    }
  }

  // ── POST /api/sheets/sync ────────────────────────────────────────────────────
  // Body: { config_id: number } | { sync_all: true } | { action: 'add', nombre, sheet_csv_url }
  //       | { action: 'delete', config_id: number }
  if (req.method === 'POST') {
    try {
      const body = req.body ?? {}

      // Add a new config
      if (body.action === 'add') {
        const { nombre, sheet_csv_url } = body
        if (!nombre || !sheet_csv_url) {
          return res.status(400).json({ error: 'nombre y sheet_csv_url son requeridos' })
        }
        const { data, error } = await supabase
          .from('sheets_config')
          .insert({ nombre, sheet_csv_url, is_active: true })
          .select()
          .single()
        if (error) throw error
        return res.json({ config: data })
      }

      // Delete a config (and its data)
      if (body.action === 'delete') {
        const { config_id } = body
        if (!config_id) return res.status(400).json({ error: 'config_id requerido' })
        await supabase.from('sheets_datos').delete().eq('config_id', config_id)
        await supabase.from('sheets_config').delete().eq('id', config_id)
        return res.json({ deleted: true })
      }

      // Sync all active configs
      if (body.sync_all) {
        const { data: configs, error } = await supabase
          .from('sheets_config')
          .select('id')
          .eq('is_active', true)
        if (error) throw error

        const results = await Promise.allSettled(
          (configs ?? []).map((c: any) => syncOne(c.id, supabase))
        )

        const summary = results.map((r, i) =>
          r.status === 'fulfilled'
            ? { ...r.value, ok: true }
            : { config_id: (configs ?? [])[i]?.id, ok: false, error: r.reason?.message }
        )
        return res.json({ results: summary })
      }

      // Sync single config
      if (body.config_id) {
        const result = await syncOne(Number(body.config_id), supabase)
        return res.json(result)
      }

      return res.status(400).json({ error: 'Parámetros inválidos' })
    } catch (err: any) {
      return res.status(500).json({ error: err.message })
    }
  }

  // ── GET /api/sheets/sync?config_id=X&preview=true ───────────────────────────
  // (handled above via GET — preview param returns first 20 rows)
  return res.status(405).json({ error: 'Método no permitido' })
}
