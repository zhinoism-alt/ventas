import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { createClerkClient } from '@clerk/backend'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // Verify Clerk JWT
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  try {
    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! })
    await clerk.verifyToken(token)
  } catch {
    return res.status(401).json({ error: 'Invalid token' })
  }

  try {
    const response = await fetch('https://open.er-api.com/v6/latest/USD', {
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) throw new Error('Exchange rate API error')
    const json = await response.json() as { rates: { MXN: number } }
    const mxnRate = json.rates.MXN

    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    const { error } = await supabase
      .from('exchange_rates')
      .update({ usd_to_mxn: mxnRate, updated_at: new Date().toISOString() })
      .eq('id', 1)

    if (error) throw error

    return res.json({ usd_to_mxn: mxnRate, updated_at: new Date().toISOString() })
  } catch (err: any) {
    return res.status(500).json({ error: 'Could not update exchange rate', details: err.message })
  }
}
