import type { VercelRequest, VercelResponse } from '@vercel/node'
import { Redis } from '@upstash/redis'
import { createClient } from '@supabase/supabase-js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Verify cron secret
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const response = await fetch('https://open.er-api.com/v6/latest/USD', { signal: AbortSignal.timeout(5000) })
    if (!response.ok) throw new Error('External API error')
    const json = await response.json()
    const mxnRate: number = json.rates.MXN

    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    await supabase
      .from('exchange_rates')
      .update({ usd_to_mxn: mxnRate, updated_at: new Date().toISOString() })
      .eq('id', 1)

    try {
      const redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL!,
        token: process.env.UPSTASH_REDIS_REST_TOKEN!,
      })
      await redis.set('exchange_rate', JSON.stringify({ usd_to_mxn: mxnRate, updated_at: new Date().toISOString() }), { ex: 3600 })
    } catch { /* Redis optional */ }

    console.log(`[CRON] Tipo de cambio actualizado: 1 USD = ${mxnRate} MXN`)
    return res.json({ success: true, usd_to_mxn: mxnRate })
  } catch (err: any) {
    console.error('[CRON] Error actualizando tipo de cambio:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
