/**
 * Serverless function: POST /api/sheets/write
 * Encola una escritura a Google Sheets y la procesa async via Edge Function.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { createClerkClient } from '@clerk/backend'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
) as any

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // Verificar auth de Clerk
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Unauthorized' })

  try {
    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! })
    await (clerk as any).verifyToken(token)
  } catch {
    return res.status(401).json({ error: 'Invalid token' })
  }

  const { config_id, action, payload, row_index } = req.body

  if (!config_id || !action || !payload) {
    return res.status(400).json({ error: 'config_id, action, y payload son requeridos' })
  }
  if (!['append', 'update', 'delete'].includes(action)) {
    return res.status(400).json({ error: 'action debe ser append, update, o delete' })
  }

  // 1. Guardar en cola (respuesta inmediata)
  const { data, error } = await supabase
    .from('sheets_write_queue')
    .insert({ config_id, action, payload, row_index: row_index ?? null })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })

  // 2. Disparar Edge Function async (fire-and-forget)
  fetch(`${process.env.SUPABASE_URL}/functions/v1/write-to-sheet`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ queue_id: data.id }),
  }).catch(() => { /* el cron reintentará si falla */ })

  return res.status(200).json({ queued: true, queue_id: data.id })
}
