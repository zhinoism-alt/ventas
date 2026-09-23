/**
 * GET /api/calendario/link
 *
 * Devuelve la URL completa (con token) del feed .ics, pero solo a quien ya
 * inicio sesion con Clerk. El token en si nunca viaja en el bundle publico
 * del navegador (por eso CALENDAR_FEED_TOKEN no lleva prefijo VITE_) -- esta
 * funcion es el unico lugar donde se le entrega a alguien, y solo despues de
 * verificar su sesion.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { verifyToken } from '@clerk/backend'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  try {
    // verifyToken es funcion suelta en @clerk/backend v1, no metodo del
    // cliente -- ver la nota en api/pdf/upload.ts.
    await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY! })
  } catch {
    return res.status(401).json({ error: 'Invalid token' })
  }

  if (!process.env.CALENDAR_FEED_TOKEN) {
    return res.status(500).json({ error: 'CALENDAR_FEED_TOKEN no está configurado' })
  }

  const host = req.headers['x-forwarded-host'] || req.headers.host
  const url = `https://${host}/api/calendario/feed?token=${process.env.CALENDAR_FEED_TOKEN}`
  return res.status(200).json({ url })
}
