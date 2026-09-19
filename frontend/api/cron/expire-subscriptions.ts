import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Ver la nota en refresh-exchange-rate.ts: sin CRON_SECRET configurado esta
  // comparacion daba `Bearer undefined` y devolvia 401 en cada ejecucion.
  const secreto = process.env.CRON_SECRET
  const autorizado = secreto
    ? req.headers.authorization === `Bearer ${secreto}`
    : req.headers['x-vercel-cron'] !== undefined
  if (!autorizado) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const { data, error } = await supabase.rpc('expire_old_subscriptions')
    if (error) throw error

    console.log(`[CRON] Suscripciones vencidas: ${data?.expired_count ?? 0}`)
    return res.json({ success: true, expired: data?.expired_count ?? 0 })
  } catch (err: any) {
    console.error('[CRON] Error expirando suscripciones:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
