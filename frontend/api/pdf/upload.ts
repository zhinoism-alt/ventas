/**
 * Serverless function: POST /api/pdf/upload
 * Recibe un PDF (multipart/form-data), valida magic bytes, y lo sube a Supabase Storage.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { createClerkClient } from '@clerk/backend'
import formidable from 'formidable'
import fs from 'fs'
import path from 'path'

export const config = { api: { bodyParser: false } }

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
) as any

/**
 * Antes era `import Clerk from '@clerk/backend'` con `Clerk.verifyToken(...)`.
 * Ese paquete no exporta nada por defecto, asi que el import fallaba al cargar
 * el modulo y la funcion respondia 500 FUNCTION_INVOCATION_FAILED antes de
 * ejecutar una sola linea del handler: ni siquiera llegaba a pedir el token.
 *
 * Las otras funciones de api/ ya usaban createClerkClient, que es la forma
 * correcta en la version 1. Esta se quedo atras.
 */
async function getUserId(token: string): Promise<string> {
  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! })
  const payload = await (clerk as any).verifyToken(token)
  return payload.sub
}

function isPDF(buffer: Buffer): boolean {
  return buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Unauthorized' })

  let userId: string
  try {
    userId = await getUserId(token)
  } catch {
    return res.status(401).json({ error: 'Invalid token' })
  }

  // Parsear multipart
  const form = formidable({ maxFileSize: 25 * 1024 * 1024 })
  const [fields, files] = await form.parse(req)

  const file  = Array.isArray(files.file) ? files.file[0] : files.file
  const mes   = parseInt(String(Array.isArray(fields.mes)  ? fields.mes[0]  : fields.mes))
  const anio  = parseInt(String(Array.isArray(fields.anio) ? fields.anio[0] : fields.anio))
  const tipo  = String(Array.isArray(fields.tipo)  ? fields.tipo[0]  : fields.tipo) as 'gastos' | 'ingresos' | 'mixto'
  const notas = String(Array.isArray(fields.notas) ? fields.notas[0] : fields.notas ?? '')
  const monto = fields.monto_total ? parseFloat(String(Array.isArray(fields.monto_total) ? fields.monto_total[0] : fields.monto_total)) : null

  if (!file)                                return res.status(400).json({ error: 'No se recibió archivo' })
  if (!mes || !anio || !tipo)               return res.status(400).json({ error: 'mes, anio y tipo son requeridos' })
  if (!['gastos','ingresos','mixto'].includes(tipo)) return res.status(400).json({ error: 'tipo inválido' })
  if (mes < 1 || mes > 12)                  return res.status(400).json({ error: 'mes inválido' })

  // Validar magic bytes (seguridad real)
  const buf = Buffer.alloc(4)
  const fd  = fs.openSync(file.filepath, 'r')
  fs.readSync(fd, buf, 0, 4, 0)
  fs.closeSync(fd)

  if (!isPDF(buf)) {
    fs.unlinkSync(file.filepath)
    return res.status(400).json({ error: 'El archivo no es un PDF válido' })
  }

  // Construir path en Storage
  const ext          = path.extname(file.originalFilename ?? 'reporte.pdf') || '.pdf'
  const safeName     = (file.originalFilename ?? 'reporte').replace(/[^a-zA-Z0-9._-]/g, '_')
  const storagePath  = `${userId}/${anio}/${String(mes).padStart(2,'0')}/${tipo}_${safeName}`

  const fileBuffer = fs.readFileSync(file.filepath)
  fs.unlinkSync(file.filepath)  // cleanup tmp

  // Subir a Supabase Storage
  const { error: upErr } = await supabase.storage
    .from('pdf-reportes')
    .upload(storagePath, fileBuffer, {
      contentType: 'application/pdf',
      upsert: false,
    })

  if (upErr) return res.status(500).json({ error: upErr.message })

  // Guardar referencia en DB
  const { data: record, error: dbErr } = await supabase
    .from('pdf_reportes')
    .insert({
      user_id:      userId,
      storage_path: storagePath,
      nombre:       file.originalFilename ?? 'reporte.pdf',
      tipo,
      mes,
      anio,
      monto_total:  monto,
      notas,
    })
    .select()
    .single()

  if (dbErr) return res.status(500).json({ error: dbErr.message })

  return res.status(200).json({ ok: true, id: record.id, path: storagePath })
}
