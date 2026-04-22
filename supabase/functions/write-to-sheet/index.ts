/**
 * Edge Function: write-to-sheet
 * Procesa un item de sheets_write_queue y lo escribe en Google Sheets.
 * Llamada por la serverless function frontend/api/sheets/write.ts
 *
 * Body: { queue_id: number }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL    = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY     = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const GOOGLE_SA_JSON  = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')!

// ── Reutilizar getGoogleToken del otro Edge Function ──────────────────────────
async function getGoogleToken(): Promise<string> {
  const sa  = JSON.parse(GOOGLE_SA_JSON)
  const now = Math.floor(Date.now() / 1000)
  const claim = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',  // lectura + escritura
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }
  const header  = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).replace(/[=+/]/g, c => ({ '=': '', '+': '-', '/': '_' }[c]!))
  const payload = btoa(JSON.stringify(claim)).replace(/[=+/]/g, c => ({ '=': '', '+': '-', '/': '_' }[c]!))
  const toSign  = `${header}.${payload}`

  const pem     = sa.private_key.replace(/\\n/g, '\n')
  const keyData = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\n/g, '')
  const keyBuf  = Uint8Array.from(atob(keyData), c => c.charCodeAt(0))
  const key     = await crypto.subtle.importKey('pkcs8', keyBuf.buffer, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const sigBuf  = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(toSign))
  const sig     = btoa(String.fromCharCode(...new Uint8Array(sigBuf))).replace(/[=+/]/g, c => ({ '=': '', '+': '-', '/': '_' }[c]!))

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${toSign}.${sig}`,
  })
  const { access_token } = await res.json()
  return access_token
}

// ── Append: agrega nueva fila al final ───────────────────────────────────────
async function appendRow(token: string, sheetId: string, tabName: string, values: unknown[][]) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(tabName)}:append?valueInputOption=USER_ENTERED`
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values }),
  })
  if (!res.ok) throw new Error(`Sheets append error ${res.status}: ${await res.text()}`)
  return await res.json()
}

// ── Update: actualiza fila específica ────────────────────────────────────────
async function updateRow(token: string, sheetId: string, tabName: string, rowIndex: number, values: unknown[][]) {
  // rowIndex es 1-based (fila de datos), + 1 para el header
  const range = `${tabName}!A${rowIndex + 1}`
  const url   = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`
  const res = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values }),
  })
  if (!res.ok) throw new Error(`Sheets update error ${res.status}: ${await res.text()}`)
  return await res.json()
}

// ── Convertir payload JSONB a array de valores según column_map ───────────────
function payloadToRow(payload: Record<string, unknown>, headers: string[], columnMap: Record<string, string>): unknown[] {
  // Invertir column_map: campo→columna_letter, necesitamos campo→índice
  const fieldToIdx: Record<string, number> = {}
  for (const [letter, field] of Object.entries(columnMap)) {
    fieldToIdx[field] = letter.charCodeAt(0) - 65
  }
  // Si no hay column_map, usar headers directamente
  if (Object.keys(fieldToIdx).length === 0) {
    return headers.map(h => payload[h] ?? '')
  }
  const maxIdx = Math.max(...Object.values(fieldToIdx))
  const row    = new Array(maxIdx + 1).fill('')
  for (const [field, idx] of Object.entries(fieldToIdx)) {
    row[idx] = payload[field] ?? ''
  }
  return row
}

// ── Handler ───────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' } })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

  try {
    const { queue_id } = await req.json()

    // Cargar item de la cola
    const { data: item, error: qErr } = await supabase
      .from('sheets_write_queue')
      .select('*, sheets_sync_config(*)')
      .eq('id', queue_id)
      .single()

    if (qErr || !item) throw new Error(`Queue item ${queue_id} not found`)
    if (item.status === 'done') return Response.json({ already: 'done' })

    // Marcar como intentando
    await supabase.from('sheets_write_queue').update({ attempts: item.attempts + 1 }).eq('id', queue_id)

    const config     = item.sheets_sync_config
    const token      = await getGoogleToken()
    const columnMap  = config.column_map ?? {}

    // Obtener headers de la hoja (primera fila)
    const headersRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${config.sheet_id}/values/${encodeURIComponent(config.tab_name + '!1:1')}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const { values: hv } = await headersRes.json()
    const headers = hv?.[0] ?? []

    const row = payloadToRow(item.payload, headers, columnMap)

    if (item.action === 'append') {
      await appendRow(token, config.sheet_id, config.tab_name, [row])
    } else if (item.action === 'update' && item.row_index) {
      await updateRow(token, config.sheet_id, config.tab_name, item.row_index, [row])
    }

    // Marcar como procesado
    await supabase.from('sheets_write_queue').update({
      status:       'done',
      processed_at: new Date().toISOString(),
    }).eq('id', queue_id)

    // Disparar re-sync para que el caché refleje el cambio
    await fetch(`${SUPABASE_URL}/functions/v1/sync-sheets`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ config_id: config.id }),
    })

    return Response.json({ ok: true, action: item.action })
  } catch (err) {
    const msg = (err as Error).message
    // Marcar como fallido si tenemos el queue_id
    try {
      const { queue_id } = await req.json().catch(() => ({}))
      if (queue_id) {
        await supabase.from('sheets_write_queue').update({ status: 'failed', error_msg: msg }).eq('id', queue_id)
      }
    } catch { /* ignorar */ }
    return Response.json({ error: msg }, { status: 500 })
  }
})
