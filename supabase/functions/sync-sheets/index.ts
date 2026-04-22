/**
 * Edge Function: sync-sheets
 * Lee datos de Google Sheets y actualiza el caché en Supabase.
 * Se puede llamar manualmente (POST /functions/v1/sync-sheets)
 * o via Supabase cron (pg_cron).
 *
 * Body: { config_id?: number }  — sin config_id sincroniza TODAS las configs activas
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { crypto } from 'https://deno.land/std@0.177.0/crypto/mod.ts'
import { encode as hexEncode } from 'https://deno.land/std@0.177.0/encoding/hex.ts'

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const GOOGLE_SA_JSON = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')!  // JSON completo del SA

// ── Google Sheets Auth (Service Account JWT) ─────────────────────────────────
async function getGoogleToken(): Promise<string> {
  const sa = JSON.parse(GOOGLE_SA_JSON)

  const now   = Math.floor(Date.now() / 1000)
  const claim = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }

  // Construir JWT manualmente (header.payload.signature)
  const header  = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const payload = btoa(JSON.stringify(claim)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const toSign  = `${header}.${payload}`

  // Importar clave privada RSA
  const pemKey = sa.private_key.replace(/\\n/g, '\n')
  const keyData = pemKey.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\n/g, '')
  const keyBuf  = Uint8Array.from(atob(keyData), c => c.charCodeAt(0))
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', keyBuf.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  )

  const sigBuf = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', cryptoKey,
    new TextEncoder().encode(toSign)
  )
  const sig = btoa(String.fromCharCode(...new Uint8Array(sigBuf)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

  const jwt = `${toSign}.${sig}`

  // Intercambiar JWT por access token
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  })
  const { access_token } = await tokenRes.json()
  return access_token
}

// ── Leer rango de una hoja ────────────────────────────────────────────────────
async function readSheet(token: string, sheetId: string, tabName: string): Promise<string[][]> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(tabName)}`
  const res  = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Sheets API error ${res.status}: ${err}`)
  }
  const { values } = await res.json()
  return values ?? []
}

// ── MD5 checksum de un objeto ─────────────────────────────────────────────────
async function md5(obj: unknown): Promise<string> {
  const data = new TextEncoder().encode(JSON.stringify(obj))
  const hash = await crypto.subtle.digest('MD5', data)
  return new TextDecoder().decode(hexEncode(new Uint8Array(hash)))
}

// ── Sincronizar una config ────────────────────────────────────────────────────
async function syncConfig(supabase: ReturnType<typeof createClient>, config: Record<string, unknown>, token: string) {
  const rows   = await readSheet(token, config.sheet_id as string, config.tab_name as string)
  if (rows.length < 2) return { synced: 0, changed: 0 }  // solo header o vacío

  const headers   = rows[0]
  const dataRows  = rows.slice(1)
  const columnMap = (config.column_map as Record<string, string>) ?? {}

  // Convertir filas a objetos usando column_map o headers directamente
  const objects = dataRows.map((row, i) => {
    const obj: Record<string, unknown> = {}
    headers.forEach((h, ci) => {
      const key = columnMap[String.fromCharCode(65 + ci)] ?? h  // A→index 0, B→1, etc.
      obj[key] = row[ci] ?? ''
    })
    return { row_index: i + 1, data: obj }
  })

  // Obtener checksums actuales
  const { data: existing } = await supabase
    .from('sheets_cache')
    .select('row_index, checksum')
    .eq('config_id', config.id)

  const existingMap: Record<number, string> = {}
  for (const e of existing ?? []) existingMap[e.row_index] = e.checksum

  // Filtrar solo filas que cambiaron
  const toUpsert = []
  for (const obj of objects) {
    const checksum = await md5(obj.data)
    if (existingMap[obj.row_index] !== checksum) {
      toUpsert.push({
        config_id: config.id,
        row_index: obj.row_index,
        data:      obj.data,
        checksum,
        synced_at: new Date().toISOString(),
      })
    }
  }

  // Borrar filas que ya no existen en Sheets
  const currentIndexes = objects.map(o => o.row_index)
  await supabase
    .from('sheets_cache')
    .delete()
    .eq('config_id', config.id)
    .not('row_index', 'in', `(${currentIndexes.join(',')})`)

  // Upsert solo las cambiadas
  if (toUpsert.length > 0) {
    const { error } = await supabase
      .from('sheets_cache')
      .upsert(toUpsert, { onConflict: 'config_id,row_index' })
    if (error) throw error
  }

  // Actualizar last_synced
  await supabase
    .from('sheets_sync_config')
    .update({ last_synced: new Date().toISOString() })
    .eq('id', config.id)

  return { synced: objects.length, changed: toUpsert.length }
}

// ── Handler principal ─────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' } })
  }

  try {
    const body       = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
    const config_id  = body.config_id ?? null

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

    // Cargar configs a sincronizar
    let query = supabase.from('sheets_sync_config').select('*').eq('activo', true)
    if (config_id) query = query.eq('id', config_id)
    const { data: configs, error: cErr } = await query
    if (cErr) throw cErr

    const token   = await getGoogleToken()
    const results = []

    for (const config of configs ?? []) {
      try {
        const r = await syncConfig(supabase, config, token)
        results.push({ id: config.id, nombre: config.nombre, ...r, ok: true })
      } catch (e) {
        results.push({ id: config.id, nombre: config.nombre, ok: false, error: (e as Error).message })
      }
    }

    return Response.json({ results, timestamp: new Date().toISOString() })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 })
  }
})
