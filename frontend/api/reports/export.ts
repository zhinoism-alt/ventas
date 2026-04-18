import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { createClerkClient } from '@clerk/backend'
import * as XLSX from 'xlsx'

async function verifyAuth(req: VercelRequest): Promise<boolean> {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return false
  try {
    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! })
    await (clerk as any).verifyToken(token)
    return true
  } catch {
    return false
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!await verifyAuth(req)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { from, to } = req.query as Record<string, string>

  try {
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

    // Fetch exchange rate
    const { data: rateRow } = await supabase.from('exchange_rates').select('usd_to_mxn').eq('id', 1).single()
    const usdToMxn: number = rateRow?.usd_to_mxn ?? 17.5

    const toMXN = (price: number, currency: string) => currency === 'USD' ? price * usdToMxn : price

    // ── Fetch all data ────────────────────────────────────────────────────────
    const [productsRes, salesRes, clientsRes, subsRes] = await Promise.all([
      supabase.from('products').select('*').order('created_at', { ascending: false }),
      (() => {
        let q = supabase.from('sales').select('*').order('sale_date', { ascending: false })
        if (from) q = q.gte('sale_date', from)
        if (to)   q = q.lte('sale_date', to)
        return q
      })(),
      supabase
        .from('iptv_clients')
        .select('*, iptv_subscriptions(status)')
        .order('name'),
      (() => {
        let q = supabase.from('iptv_subscriptions').select('*, iptv_clients(phone)').order('start_date', { ascending: false })
        if (from) q = q.gte('start_date', from)
        if (to)   q = q.lte('start_date', to)
        return q
      })(),
    ])

    const products  = productsRes.data  ?? []
    const sales     = salesRes.data     ?? []
    const clients   = clientsRes.data   ?? []
    const subs      = subsRes.data      ?? []

    const wb = XLSX.utils.book_new()

    // ── Sheet 1: Inventario ───────────────────────────────────────────────────
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(products.map(p => ({
      'ID': p.id,
      'Nombre': p.name,
      'Marca': p.brand,
      'Categoría': p.category,
      'Color': p.color,
      'Condición': p.condition,
      'Notas': p.notes,
      'Precio Compra': p.purchase_price,
      'Moneda Compra': p.purchase_currency,
      'Precio Compra (MXN)': toMXN(p.purchase_price, p.purchase_currency).toFixed(2),
      'Precio Venta': p.sale_price,
      'Moneda Venta': p.sale_currency,
      'Precio Venta (MXN)': toMXN(p.sale_price, p.sale_currency).toFixed(2),
      'Cantidad': p.quantity,
      'Vendidos': p.quantity_sold,
      'Estado': p.status,
      'Fecha': p.created_at,
    }))), 'Inventario')

    // ── Sheet 2: Ventas ───────────────────────────────────────────────────────
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sales.map(s => ({
      'ID': s.id,
      'Producto': s.product_name,
      'Fecha': s.sale_date,
      'Cantidad': s.quantity_sold,
      'Precio Venta': s.sale_price,
      'Moneda': s.sale_currency,
      'Total (MXN)': toMXN(s.sale_price * s.quantity_sold, s.sale_currency).toFixed(2),
      'Comprador': s.buyer_name,
      'Método Pago': s.payment_method,
      'Notas': s.notes,
    }))), 'Ventas')

    // ── Sheet 3: Clientes IPTV ────────────────────────────────────────────────
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(clients.map((c: any) => {
      const clientSubs: any[] = c.iptv_subscriptions ?? []
      return {
        'ID': c.id,
        'Nombre': c.name,
        'Teléfono': c.phone,
        'País': c.country,
        'Email': c.email,
        'Total Suscripciones': clientSubs.length,
        'Activas': clientSubs.filter((s: any) => s.status === 'activo').length,
        'Estado': c.is_active ? 'Activo' : 'Inactivo',
        'Notas': c.notes,
        'Fecha Alta': c.created_at,
      }
    })), 'Clientes IPTV')

    // ── Sheet 4: Suscripciones IPTV ───────────────────────────────────────────
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(subs.map((s: any) => ({
      'ID': s.id,
      'Cliente': s.client_name,
      'Teléfono': s.iptv_clients?.phone ?? '',
      'Conexiones': s.connections,
      'Meses': s.months,
      'Precio Cobrado': s.price_charged,
      'Moneda': s.price_currency,
      'Total (MXN)': toMXN(s.price_charged, s.price_currency).toFixed(2),
      'Costo Créditos (MXN)': ((s.cost_per_credit ?? 0) * (s.credits_used ?? 0)).toFixed(2),
      'Ganancia (MXN)': Math.max(0,
        toMXN(s.price_charged, s.price_currency)
        - (s.cost_per_credit ?? 0) * (s.credits_used ?? 0)
      ).toFixed(2),
      'Inicio': s.start_date,
      'Vencimiento': s.end_date,
      'Estado': s.status,
      'Créditos Usados': s.credits_used,
    }))), 'Suscripciones IPTV')

    // ── Sheet 5: Resumen ──────────────────────────────────────────────────────
    const totalInvertido = products.reduce((a: number, p: any) =>
      a + toMXN(p.purchase_price, p.purchase_currency), 0)
    const totalVentasMXN = sales.reduce((a: number, s: any) =>
      a + toMXN(s.sale_price * s.quantity_sold, s.sale_currency), 0)
    const totalIPTVMXN = subs.reduce((a: number, s: any) =>
      a + toMXN(s.price_charged, s.price_currency), 0)

    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['RESUMEN GENERAL', ''],
      ['Tipo de Cambio USD/MXN', usdToMxn],
      ['Fecha Reporte', new Date().toLocaleDateString('es-MX')],
      ['', ''],
      ['ARTÍCULOS', ''],
      ['Total Artículos', products.length],
      ['Total Invertido (MXN)', totalInvertido.toFixed(2)],
      ['Total Ventas', sales.length],
      ['Ingresos por Ventas (MXN)', totalVentasMXN.toFixed(2)],
      ['', ''],
      ['IPTV', ''],
      ['Total Clientes', clients.length],
      ['Clientes Activos', clients.filter((c: any) =>
        (c.iptv_subscriptions ?? []).some((s: any) => s.status === 'activo')).length],
      ['Total Suscripciones', subs.length],
      ['Ingresos IPTV (MXN)', totalIPTVMXN.toFixed(2)],
    ]), 'Resumen')

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    const filename = `reporte_${new Date().toISOString().split('T')[0]}.xlsx`

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    return res.send(Buffer.from(buffer))
  } catch (err: any) {
    return res.status(500).json({ error: err.message })
  }
}
