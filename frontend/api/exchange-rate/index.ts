import type { VercelRequest, VercelResponse } from '@vercel/node'
import { Redis } from '@upstash/redis'
import { createClient } from '@supabase/supabase-js'

const CACHE_KEY = 'exchange_rate'
const CACHE_TTL = 3600 // 1 hour

function getRedis() {
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  })
}

function getSupabase() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')

  // POST /api/exchange-rate — force refresh
  if (req.method === 'POST') {
    try {
      const response = await fetch('https://open.er-api.com/v6/latest/USD', { signal: AbortSignal.timeout(5000) })
      if (!response.ok) throw new Error('External API error')
      const json = await response.json()
      const mxnRate: number = json.rates.MXN

      const supabase = getSupabase()
      await supabase
        .from('exchange_rates')
        .update({ usd_to_mxn: mxnRate, updated_at: new Date().toISOString() })
        .eq('id', 1)

      try {
        const redis = getRedis()
        await redis.set(CACHE_KEY, JSON.stringify({ usd_to_mxn: mxnRate, updated_at: new Date().toISOString() }), { ex: CACHE_TTL })
      } catch { /* Redis optional */ }

      return res.json({ usd_to_mxn: mxnRate, updated_at: new Date().toISOString() })
    } catch (err: any) {
      // Fallback: return current rate from Supabase
      const supabase = getSupabase()
      const { data } = await supabase.from('exchange_rates').select('*').eq('id', 1).single()
      return res.status(500).json({ error: 'No se pudo actualizar', current: data })
    }
  }

  // GET /api/exchange-rate
  try {
    // 1. Try Redis cache
    try {
      const redis = getRedis()
      const cached = await redis.get<string>(CACHE_KEY)
      if (cached) {
        const parsed = typeof cached === 'string' ? JSON.parse(cached) : cached
        return res.json(parsed)
      }
    } catch { /* Redis miss/error — fall through */ }

    // 2. Fallback: Supabase
    const supabase = getSupabase()
    const { data, error } = await supabase.from('exchange_rates').select('*').eq('id', 1).single()
    if (error) throw error

    // Populate cache
    try {
      const redis = getRedis()
      await redis.set(CACHE_KEY, JSON.stringify(data), { ex: CACHE_TTL })
    } catch { /* Redis optional */ }

    return res.json(data)
  } catch (err: any) {
    return res.status(500).json({ error: err.message })
  }
}
