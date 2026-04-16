import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { createClerkClient } from '@clerk/backend'
import { Pinecone } from '@pinecone-database/pinecone'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Verify Clerk JWT
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  try {
    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! })
    await clerk.verifyToken(token)
  } catch {
    return res.status(401).json({ error: 'Invalid token' })
  }

  const { q } = req.query
  if (!q || typeof q !== 'string') return res.status(400).json({ error: 'Missing query' })

  try {
    const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! })
    const index = pc.index(process.env.PINECONE_INDEX_NAME ?? 'ventas-products')

    // Search with Pinecone (index must be created with integrated embedding)
    const results = await (index as any).searchRecords({
      query: { inputs: { text: q }, topK: 20 },
    })

    const ids = (results?.result?.hits ?? [])
      .filter((h: any) => (h._score ?? 0) > 0.4)
      .map((h: any) => parseInt(String(h._id).replace('product-', '')))
      .filter((id: number) => !isNaN(id))

    if (ids.length === 0) return res.json({ products: [] })

    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const { data, error } = await supabase.from('products').select('*').in('id', ids)
    if (error) throw error

    return res.json({ products: data ?? [] })
  } catch (err: any) {
    return res.status(500).json({ error: err.message })
  }
}
