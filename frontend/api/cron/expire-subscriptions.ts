import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
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
