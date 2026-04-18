import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' })

  const configId = req.query.config_id
  if (!configId) return res.status(400).json({ error: 'config_id requerido' })

  const limit = Math.min(Number(req.query.limit ?? 50), 500)

  try {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('sheets_datos')
      .select('fila, datos, synced_at')
      .eq('config_id', Number(configId))
      .order('fila', { ascending: true })
      .limit(limit)

    if (error) throw error
    return res.json({ rows: data ?? [] })
  } catch (err: any) {
    return res.status(500).json({ error: err.message })
  }
}
