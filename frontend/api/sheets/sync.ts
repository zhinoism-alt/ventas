/**
 * Serverless function: POST /api/sheets/sync
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import Clerk from '@clerk/backend'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Unauthorized' })

  try {
    await (Clerk as any).verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY })
  } catch {
    return res.status(401).json({ error: 'Invalid token' })
  }

  const { config_id } = req.body ?? {}

  try {
    const syncRes = await fetch(`${process.env.SUPABASE_URL}/functions/v1/sync-sheets`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ config_id: config_id ?? null }),
    })
    const result = await syncRes.json()
    return res.status(syncRes.ok ? 200 : 500).json(result)
  } catch (err: any) {
    return res.status(500).json({ error: err.message })
  }
}
