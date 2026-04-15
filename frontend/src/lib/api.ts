import { supabase } from './supabase'
import { PANEL_PRICES, SELL_PRICES } from './constants'

// ── Clerk token helper ────────────────────────────────────────────────────────
async function getToken(): Promise<string> {
  return (await window.Clerk?.session?.getToken()) ?? ''
}

// ── FB Post generator (ported from backend) ───────────────────────────────────
export function generateFBPost(product: Record<string, unknown>): string {
  const conditionMap: Record<string, string> = {
    nuevo: '✨ NUEVO / Sin uso',
    como_nuevo: '🌟 Como nuevo',
    buen_estado: '👍 Buen estado',
    regular: '⚠️ Estado regular',
  }
  const cond = conditionMap[product.condition as string] || (product.condition as string) || ''
  const price = product.sale_price
    ? `💰 $${Number(product.sale_price).toLocaleString('es-MX')} ${product.sale_currency || 'MXN'}`
    : ''

  let post = `🔥 EN VENTA: ${product.name}\n`
  if (cond) post += `${cond}\n`
  if (price) post += `${price}\n`
  post += `\n`

  const details: string[] = []
  if (product.brand)    details.push(`Marca: ${product.brand}`)
  if (product.color)    details.push(`Color: ${product.color}`)
  if (product.category) details.push(`Categoría: ${product.category}`)
  if (details.length)   post += details.join(' | ') + '\n'

  if (product.notes) {
    post += `\n📝 ${product.notes}\n`
  }

  post += `\n✅ Precio fijo / No cambios\n`
  post += `📍 Entrega en punto acordado o envío disponible\n`
  post += `📲 Escríbeme por DM o WhatsApp para más info`

  return post
}

// ── Productos ─────────────────────────────────────────────────────────────────
export const getProducts = async (params?: { status?: string; category?: string; search?: string }) => {
  // Pinecone search (optional)
  if (params?.search && import.meta.env.VITE_ENABLE_PINECONE === 'true') {
    try {
      const token = await getToken()
      const res = await fetch(`/api/products/search?q=${encodeURIComponent(params.search)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const result = await res.json()
        return { data: result.products ?? [] }
      }
    } catch {
      // fall through to direct query
    }
  }

  let query = supabase.from('products').select('*')
  if (params?.status && params.status !== 'todos')     query = query.eq('status', params.status)
  if (params?.category && params.category !== 'todas') query = query.eq('category', params.category)
  if (params?.search) {
    query = query.or(
      `name.ilike.%${params.search}%,brand.ilike.%${params.search}%,notes.ilike.%${params.search}%,color.ilike.%${params.search}%`
    )
  }
  query = query.order('created_at', { ascending: false })

  const { data, error } = await query
  if (error) throw error
  return { data: data ?? [] }
}

export const createProduct = async (data: Record<string, unknown>) => {
  const fbPost = generateFBPost(data)
  const { data: product, error } = await supabase
    .from('products')
    .insert({ ...data, fb_post: fbPost })
    .select()
    .single()
  if (error) throw error

  // Fire-and-forget Pinecone upsert
  if (import.meta.env.VITE_ENABLE_PINECONE === 'true' && product) {
    getToken().then(token =>
      fetch('/api/products/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'upsert', product }),
      }).catch(() => {})
    )
  }

  return { data: product }
}

export const updateProduct = async (id: number, data: Record<string, unknown>) => {
  const fbPost = generateFBPost(data)
  const { data: product, error } = await supabase
    .from('products')
    .update({ ...data, fb_post: fbPost, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error

  // Fire-and-forget Pinecone upsert
  if (import.meta.env.VITE_ENABLE_PINECONE === 'true' && product) {
    getToken().then(token =>
      fetch('/api/products/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'upsert', product }),
      }).catch(() => {})
    )
  }

  return { data: product }
}

export const deleteProduct = async (id: number) => {
  const { error } = await supabase.from('products').delete().eq('id', id)
  if (error) throw error

  // Fire-and-forget Pinecone delete
  if (import.meta.env.VITE_ENABLE_PINECONE === 'true') {
    getToken().then(token =>
      fetch('/api/products/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'delete', id }),
      }).catch(() => {})
    )
  }

  return { data: { success: true } }
}

export const sellProduct = async (id: number, data: Record<string, unknown>) => {
  const { data: result, error } = await supabase.rpc('sell_product', {
    p_product_id:     id,
    p_quantity_sold:  data.quantity_sold,
    p_sale_price:     data.sale_price,
    p_sale_currency:  data.sale_currency,
    p_buyer_name:     data.buyer_name ?? '',
    p_payment_method: data.payment_method ?? 'efectivo',
    p_notes:          data.notes ?? '',
    p_sale_date:      data.sale_date ?? null,
  })
  if (error) throw error
  return { data: result }
}

export const getFBPost = async (id: number) => {
  const { data: product, error } = await supabase.from('products').select('*').eq('id', id).single()
  if (error) throw error
  return { data: { post: generateFBPost(product as Record<string, unknown>) } }
}

export const getProductStats = async () => {
  const [{ data: products, error: pErr }, rateRes] = await Promise.all([
    supabase.from('products').select('*'),
    getExchangeRate(),
  ])
  if (pErr) throw pErr

  const rate = rateRes.data?.usd_to_mxn ?? 17.5
  const allProducts = products ?? []

  const total        = allProducts.length
  const disponibles  = allProducts.filter(p => p.status === 'disponible').length
  const vendidos     = allProducts.filter(p => p.status === 'vendido').length
  const reservados   = allProducts.filter(p => p.status === 'reservado').length

  const total_invertido = allProducts.reduce((sum, p) => {
    const price = p.purchase_currency === 'USD' ? p.purchase_price * rate : p.purchase_price
    return sum + price * (p.quantity + p.quantity_sold)
  }, 0)

  const total_vendido = allProducts
    .filter(p => p.status === 'vendido')
    .reduce((sum, p) => {
      const price = p.sale_currency === 'USD' ? p.sale_price * rate : p.sale_price
      return sum + price * p.quantity_sold
    }, 0)

  return {
    data: { total, disponibles, vendidos, reservados, total_invertido, total_vendido, usd_to_mxn: rate }
  }
}

export const getCategories = async () => {
  const { data, error } = await supabase
    .from('products')
    .select('category')
    .not('category', 'eq', '')
    .order('category')
  if (error) throw error
  const cats = [...new Set((data ?? []).map(r => r.category).filter(Boolean))]
  return { data: cats }
}

// ── Ventas ────────────────────────────────────────────────────────────────────
export const getSales = async (params?: { from?: string; to?: string; search?: string }) => {
  let query = supabase
    .from('sales')
    .select('*, products(purchase_price, purchase_currency)')
    .order('created_at', { ascending: false })

  if (params?.from)   query = query.gte('sale_date', params.from)
  if (params?.to)     query = query.lte('sale_date', params.to)
  if (params?.search) {
    query = query.or(`product_name.ilike.%${params.search}%,buyer_name.ilike.%${params.search}%`)
  }

  const { data, error } = await query
  if (error) throw error

  // Flatten nested products join
  const flattened = (data ?? []).map((s: Record<string, unknown>) => {
    const prod = s.products as Record<string, unknown> | null
    return {
      ...s,
      products: undefined,
      purchase_price:    prod?.purchase_price ?? null,
      purchase_currency: prod?.purchase_currency ?? null,
    }
  })

  return { data: flattened }
}

export const getSalesStats = async () => {
  const [{ data: sales, error }, rateRes] = await Promise.all([
    supabase.from('sales').select('*'),
    getExchangeRate(),
  ])
  if (error) throw error

  const rate = rateRes.data?.usd_to_mxn ?? 17.5
  const allSales = sales ?? []
  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const total_ventas = allSales.length
  const total_ingresos_mxn = allSales.reduce((sum, s) => {
    const amount = s.sale_currency === 'USD' ? s.sale_price * s.quantity_sold * rate : s.sale_price * s.quantity_sold
    return sum + amount
  }, 0)

  const ingresos_mes_actual = allSales
    .filter(s => s.sale_date?.slice(0, 7) === currentMonth)
    .reduce((sum, s) => {
      const amount = s.sale_currency === 'USD' ? s.sale_price * s.quantity_sold * rate : s.sale_price * s.quantity_sold
      return sum + amount
    }, 0)

  return { data: { total_ventas, total_ingresos_mxn, ingresos_mes_actual, usd_to_mxn: rate } }
}

export const getMonthlySales = async () => {
  const [{ data: sales, error }, rateRes] = await Promise.all([
    supabase.from('sales').select('*').gte('sale_date', getDateMinusMonths(12)),
    getExchangeRate(),
  ])
  if (error) throw error

  const rate = rateRes.data?.usd_to_mxn ?? 17.5
  const byMonth: Record<string, { month: string; total_sales: number; revenue_mxn: number }> = {}

  for (const s of sales ?? []) {
    const month = s.sale_date?.slice(0, 7)
    if (!month) continue
    if (!byMonth[month]) byMonth[month] = { month, total_sales: 0, revenue_mxn: 0 }
    byMonth[month].total_sales++
    byMonth[month].revenue_mxn +=
      s.sale_currency === 'USD' ? s.sale_price * s.quantity_sold * rate : s.sale_price * s.quantity_sold
  }

  return { data: Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month)) }
}

export const deleteSale = async (id: number) => {
  const { data, error } = await supabase.rpc('delete_sale', { p_id: id })
  if (error) throw error
  return { data }
}

// ── IPTV ──────────────────────────────────────────────────────────────────────
export const getIPTVPackages = async () => {
  const { data, error } = await supabase
    .from('iptv_packages')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return { data: data ?? [] }
}

export const getIPTVBalance = async () => {
  const { data: pkgs, error } = await supabase
    .from('iptv_packages')
    .select('*')
    .eq('is_active', true)
  if (error) throw error

  // Group by connections
  const grouped: Record<number, { connections: number; total_comprados: number; disponibles: number; usados: number }> = {}
  for (const pkg of pkgs ?? []) {
    const c = pkg.connections
    if (!grouped[c]) grouped[c] = { connections: c, total_comprados: 0, disponibles: 0, usados: 0 }
    grouped[c].total_comprados += pkg.credits
    grouped[c].disponibles     += pkg.credits_remaining
    grouped[c].usados          += pkg.credits - pkg.credits_remaining
  }

  return { data: Object.values(grouped) }
}

export const createIPTVPackage = async (data: Record<string, unknown>) => {
  const { data: pkg, error } = await supabase
    .from('iptv_packages')
    .insert({ ...data, credits_remaining: data.credits })
    .select()
    .single()
  if (error) throw error
  return { data: pkg }
}

export const deleteIPTVPackage = async (id: number) => {
  const { error } = await supabase.from('iptv_packages').delete().eq('id', id)
  if (error) throw error
  return { data: { success: true } }
}

export const getIPTVClients = async () => {
  const { data, error } = await supabase
    .from('iptv_clients')
    .select('*, iptv_subscriptions(status, end_date)')
    .order('created_at', { ascending: false })
  if (error) throw error

  const clients = (data ?? []).map((c: Record<string, unknown>) => {
    const subs = (c.iptv_subscriptions as Array<{ status: string; end_date: string }>) ?? []
    const activeSubs  = subs.filter(s => s.status === 'activo')
    const active_subs = activeSubs.length
    const nextExpiry  = activeSubs.length
      ? activeSubs.map(s => s.end_date).sort().pop() ?? null
      : null
    return { ...c, iptv_subscriptions: undefined, active_subs, next_expiry: nextExpiry }
  })

  return { data: clients }
}

export const createIPTVClient = async (data: Record<string, unknown>) => {
  const { data: client, error } = await supabase
    .from('iptv_clients')
    .insert(data)
    .select()
    .single()
  if (error) throw error
  return { data: client }
}

export const updateIPTVClient = async (id: number, data: Record<string, unknown>) => {
  const { data: client, error } = await supabase
    .from('iptv_clients')
    .update(data)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return { data: client }
}

export const deleteIPTVClient = async (id: number) => {
  const { error } = await supabase.from('iptv_clients').delete().eq('id', id)
  if (error) throw error
  return { data: { success: true } }
}

export const getIPTVSubscriptions = async (params?: { status?: string; client_id?: number }) => {
  let query = supabase
    .from('iptv_subscriptions')
    .select('*, iptv_clients(phone, country)')
    .order('created_at', { ascending: false })

  if (params?.status && params.status !== 'todos') query = query.eq('status', params.status)
  if (params?.client_id)                           query = query.eq('client_id', params.client_id)

  const { data, error } = await query
  if (error) throw error

  const flattened = (data ?? []).map((s: Record<string, unknown>) => {
    const cl = s.iptv_clients as Record<string, unknown> | null
    return {
      ...s,
      iptv_clients:  undefined,
      client_phone:  cl?.phone ?? '',
      client_country: cl?.country ?? '',
    }
  })

  return { data: flattened }
}

export const getExpiringSubscriptions = async (days = 7) => {
  const future = new Date()
  future.setDate(future.getDate() + days)
  const today  = new Date().toISOString().split('T')[0]
  const futureStr = future.toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('iptv_subscriptions')
    .select('*, iptv_clients(phone, country)')
    .eq('status', 'activo')
    .lte('end_date', futureStr)
    .gte('end_date', today)
    .order('end_date', { ascending: true })
  if (error) throw error

  const flattened = (data ?? []).map((s: Record<string, unknown>) => {
    const cl = s.iptv_clients as Record<string, unknown> | null
    return {
      ...s,
      iptv_clients:   undefined,
      client_phone:   cl?.phone ?? '',
      client_country: cl?.country ?? '',
    }
  })

  return { data: flattened }
}

export const createIPTVSubscription = async (data: Record<string, unknown>) => {
  const { data: result, error } = await supabase.rpc('create_iptv_subscription', {
    p_client_id:      data.client_id,
    p_package_id:     data.package_id ?? null,
    p_connections:    data.connections ?? 1,
    p_months:         data.months ?? 1,
    p_price_charged:  data.price_charged,
    p_price_currency: data.price_currency ?? 'MXN',
    p_start_date:     data.start_date,
    p_notes:          data.notes ?? '',
  })
  if (error) throw error
  return { data: result }
}

export const updateSubscriptionStatus = async (id: number, status: string) => {
  const { error } = await supabase
    .from('iptv_subscriptions')
    .update({ status })
    .eq('id', id)
  if (error) throw error
  return { data: { success: true } }
}

export const deleteIPTVSubscription = async (id: number) => {
  const { data, error } = await supabase.rpc('delete_iptv_subscription', { p_id: id })
  if (error) throw error
  return { data }
}

export const getIPTVStats = async () => {
  const [
    { data: clients, error: cErr },
    { data: subs,    error: sErr },
    { data: pkgs,    error: pkgErr },
    rateRes,
  ] = await Promise.all([
    supabase.from('iptv_clients').select('*'),
    supabase.from('iptv_subscriptions').select('*'),
    supabase.from('iptv_packages').select('*'),
    getExchangeRate(),
  ])
  if (cErr)   throw cErr
  if (sErr)   throw sErr
  if (pkgErr) throw pkgErr

  const rate = rateRes.data?.usd_to_mxn ?? 17.5
  const allClients = clients ?? []
  const allSubs    = subs ?? []
  const allPkgs    = pkgs ?? []
  const now        = new Date()
  const twelveAgo  = getDateMinusMonths(12)

  // Clients summary
  const clientsSummary = {
    total:   allClients.length,
    activos: allClients.filter(c => c.is_active).length,
  }

  // Subs summary
  const activeSubs = allSubs.filter(s => s.status === 'activo')
  const subsSummary = {
    total:   allSubs.length,
    activas: activeSubs.length,
    vencidas: allSubs.filter(s => s.status === 'vencido').length,
    ingresos_activos_mxn: activeSubs.reduce((sum, s) => {
      return sum + (s.price_currency === 'USD' ? s.price_charged * rate : s.price_charged)
    }, 0),
  }

  // Monthly revenue
  const recentSubs = allSubs.filter(s => s.start_date >= twelveAgo)
  const byMonth: Record<string, { month: string; revenue_mxn: number; cost_mxn: number; subscriptions: number }> = {}
  for (const s of recentSubs) {
    const month = s.start_date?.slice(0, 7)
    if (!month) continue
    if (!byMonth[month]) byMonth[month] = { month, revenue_mxn: 0, cost_mxn: 0, subscriptions: 0 }
    byMonth[month].revenue_mxn += s.price_currency === 'USD' ? s.price_charged * rate : s.price_charged
    byMonth[month].cost_mxn    += (s.cost_per_credit ?? 0) * (s.credits_used ?? 0)
    byMonth[month].subscriptions++
  }
  const monthly_revenue = Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month))

  // Credits by connection type
  const activePkgs = allPkgs.filter(p => p.is_active)
  const creditsByConn: Record<number, { connections: number; total_comprados: number; disponibles: number; usados: number }> = {}
  for (const pkg of activePkgs) {
    const c = pkg.connections
    if (!creditsByConn[c]) creditsByConn[c] = { connections: c, total_comprados: 0, disponibles: 0, usados: 0 }
    creditsByConn[c].total_comprados += pkg.credits
    creditsByConn[c].disponibles     += pkg.credits_remaining
    creditsByConn[c].usados          += pkg.credits - pkg.credits_remaining
  }
  const credits = Object.values(creditsByConn)

  // Expiring soon
  const todayStr = now.toISOString().split('T')[0]
  const sevenDays = new Date(now)
  sevenDays.setDate(sevenDays.getDate() + 7)
  const sevenStr = sevenDays.toISOString().split('T')[0]
  const expiring_soon = activeSubs.filter(s => s.end_date >= todayStr && s.end_date <= sevenStr).length

  return {
    data: {
      clients: clientsSummary,
      subscriptions: subsSummary,
      monthly_revenue,
      credits,
      expiring_soon,
      usd_to_mxn: rate,
    }
  }
}

export const getIPTVPricing = () => {
  const analysis: Array<Record<string, unknown>> = []

  for (const [connKey, prices] of Object.entries(PANEL_PRICES)) {
    for (const pkg of prices) {
      const costPerCredit = pkg.price_mxn / pkg.credits
      const sellOptions = SELL_PRICES[connKey]

      for (const sell of sellOptions) {
        const profitPerCredit = sell.price_mxn - costPerCredit
        const margin          = ((profitPerCredit / sell.price_mxn) * 100).toFixed(1)
        const profitUsd       = sell.price_usd - pkg.price_usd / pkg.credits

        analysis.push({
          connections:           Number(connKey),
          package_credits:       pkg.credits,
          buy_price_mxn:         pkg.price_mxn,
          buy_price_usd:         pkg.price_usd,
          cost_per_credit_mxn:   costPerCredit.toFixed(2),
          sell_months:           sell.months,
          sell_price_mxn:        sell.price_mxn,
          sell_price_usd:        sell.price_usd,
          profit_per_credit_mxn: profitPerCredit.toFixed(2),
          profit_usd:            profitUsd.toFixed(2),
          margin_percent:        margin,
        })
      }
    }
  }

  const costPerCredit30 = PANEL_PRICES['1'][1].price_mxn / PANEL_PRICES['1'][1].credits
  const custom_comparison = [150, 200, 250, 300].map(price => ({
    price_mxn:           price,
    cost_per_credit:     costPerCredit30,
    profit_per_client:   (price - costPerCredit30).toFixed(2),
    margin:              (((price - costPerCredit30) / price) * 100).toFixed(1),
    monthly_18_clients:  ((price - costPerCredit30) * 18).toFixed(0),
  }))

  return Promise.resolve({
    data: { analysis, custom_comparison, panel_prices: PANEL_PRICES, sell_prices: SELL_PRICES }
  })
}

// ── Reportes ──────────────────────────────────────────────────────────────────
export const getSummary = async () => {
  const [
    { data: products,  error: pErr },
    { data: sales,     error: sErr },
    { data: subs,      error: subErr },
    { data: packages,  error: pkgErr },
    rateRes,
  ] = await Promise.all([
    supabase.from('products').select('*'),
    supabase.from('sales').select('*'),
    supabase.from('iptv_subscriptions').select('*'),
    supabase.from('iptv_packages').select('*'),
    getExchangeRate(),
  ])
  if (pErr)   throw pErr
  if (sErr)   throw sErr
  if (subErr) throw subErr
  if (pkgErr) throw pkgErr

  const rate        = rateRes.data?.usd_to_mxn ?? 17.5
  const allProducts = products ?? []
  const allSales    = sales    ?? []
  const allSubs     = subs     ?? []
  const allPkgs     = packages ?? []
  const sixAgo      = getDateMinusMonths(6)

  // Product investment
  const total_invertido = allProducts.reduce((sum, p) => {
    const price = p.purchase_currency === 'USD' ? p.purchase_price * rate : p.purchase_price
    return sum + price * (p.quantity + p.quantity_sold)
  }, 0)

  // Sales revenue
  const ingresos_productos = allSales.reduce((sum, s) => {
    return sum + (s.sale_currency === 'USD' ? s.sale_price * s.quantity_sold * rate : s.sale_price * s.quantity_sold)
  }, 0)

  // IPTV revenue
  const ingresos_iptv = allSubs.reduce((sum, s) => {
    return sum + (s.price_currency === 'USD' ? s.price_charged * rate : s.price_charged)
  }, 0)

  // IPTV package cost
  const iptv_cost = allPkgs.reduce((sum, p) => {
    return sum + (p.price_currency === 'USD' ? p.price_paid * rate : p.price_paid)
  }, 0)

  // Active IPTV clients
  const clientes_activos_iptv = new Set(
    allSubs.filter(s => s.status === 'activo').map(s => s.client_id)
  ).size

  // Monthly chart (last 6 months)
  const monthlyProducts: Record<string, number> = {}
  const monthlyIPTV:     Record<string, { revenue: number; costo: number }> = {}

  for (const s of allSales.filter(s => s.sale_date >= sixAgo)) {
    const month = s.sale_date?.slice(0, 7)
    if (!month) continue
    monthlyProducts[month] = (monthlyProducts[month] ?? 0) +
      (s.sale_currency === 'USD' ? s.sale_price * s.quantity_sold * rate : s.sale_price * s.quantity_sold)
  }
  for (const s of allSubs.filter(s => s.start_date >= sixAgo)) {
    const month = s.start_date?.slice(0, 7)
    if (!month) continue
    if (!monthlyIPTV[month]) monthlyIPTV[month] = { revenue: 0, costo: 0 }
    monthlyIPTV[month].revenue += s.price_currency === 'USD' ? s.price_charged * rate : s.price_charged
    monthlyIPTV[month].costo   += (s.cost_per_credit ?? 0) * (s.credits_used ?? 0)
  }

  const months: Record<string, { month: string; productos: number; iptv: number; costo_iptv: number }> = {}
  for (const [month, rev] of Object.entries(monthlyProducts)) {
    if (!months[month]) months[month] = { month, productos: 0, iptv: 0, costo_iptv: 0 }
    months[month].productos = rev
  }
  for (const [month, val] of Object.entries(monthlyIPTV)) {
    if (!months[month]) months[month] = { month, productos: 0, iptv: 0, costo_iptv: 0 }
    months[month].iptv       = val.revenue
    months[month].costo_iptv = val.costo
  }
  const monthly_chart = Object.values(months).sort((a, b) => a.month.localeCompare(b.month))

  const total_ingresos_mxn = ingresos_productos + ingresos_iptv
  const total_gastos_mxn   = total_invertido + iptv_cost
  const ganancia_neta_mxn  = total_ingresos_mxn - total_gastos_mxn

  return {
    data: {
      total_ingresos_mxn,
      total_gastos_mxn,
      ganancia_neta_mxn,
      ingresos_productos,
      ingresos_iptv,
      clientes_activos_iptv,
      monthly_chart,
      usd_to_mxn: rate,
    }
  }
}

export const getMonthlyReport = async (year?: number) => {
  const y = year ? String(year) : String(new Date().getFullYear())
  const [
    { data: sales, error: sErr },
    { data: subs,  error: subErr },
    rateRes,
  ] = await Promise.all([
    supabase.from('sales').select('*').like('sale_date', `${y}-%`),
    supabase.from('iptv_subscriptions').select('*').like('start_date', `${y}-%`),
    getExchangeRate(),
  ])
  if (sErr)   throw sErr
  if (subErr) throw subErr

  const rate = rateRes.data?.usd_to_mxn ?? 17.5

  // Products by month
  const prodByMonth: Record<string, { mes: string; ventas: number; ingresos: number }> = {}
  for (const s of sales ?? []) {
    const mes = s.sale_date?.slice(5, 7)
    if (!mes) continue
    if (!prodByMonth[mes]) prodByMonth[mes] = { mes, ventas: 0, ingresos: 0 }
    prodByMonth[mes].ventas++
    prodByMonth[mes].ingresos +=
      s.sale_currency === 'USD' ? s.sale_price * s.quantity_sold * rate : s.sale_price * s.quantity_sold
  }

  // IPTV by month
  const iptvByMonth: Record<string, { mes: string; suscripciones: number; ingresos: number; costos: number }> = {}
  for (const s of subs ?? []) {
    const mes = s.start_date?.slice(5, 7)
    if (!mes) continue
    if (!iptvByMonth[mes]) iptvByMonth[mes] = { mes, suscripciones: 0, ingresos: 0, costos: 0 }
    iptvByMonth[mes].suscripciones++
    iptvByMonth[mes].ingresos += s.price_currency === 'USD' ? s.price_charged * rate : s.price_charged
    iptvByMonth[mes].costos   += (s.cost_per_credit ?? 0) * (s.credits_used ?? 0)
  }

  return {
    data: {
      products: Object.values(prodByMonth).sort((a, b) => a.mes.localeCompare(b.mes)),
      iptv:     Object.values(iptvByMonth).sort((a, b) => a.mes.localeCompare(b.mes)),
      year:     y,
    }
  }
}

export const exportExcel = async (from?: string, to?: string) => {
  const params = new URLSearchParams()
  if (from) params.append('from', from)
  if (to)   params.append('to', to)

  const token = await getToken()
  const res = await fetch(`/api/reports/export?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) throw new Error('Error al exportar')
  const blob = await res.blob()
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `reporte_${new Date().toISOString().split('T')[0]}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Tipo de cambio ─────────────────────────────────────────────────────────────
export const getExchangeRate = async () => {
  const res = await fetch('/api/exchange-rate')
  if (!res.ok) {
    // Fallback: fetch from Supabase directly
    const { data } = await supabase.from('exchange_rates').select('*').eq('id', 1).single()
    return { data: data ?? { usd_to_mxn: 17.5, updated_at: new Date().toISOString() } }
  }
  const data = await res.json()
  return { data }
}

export const refreshExchangeRate = async () => {
  const token = await getToken()
  const res = await fetch('/api/exchange-rate', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('No se pudo actualizar el tipo de cambio')
  const data = await res.json()
  return { data }
}

// ── WhatsApp (disabled in serverless) ─────────────────────────────────────────
export const getWhatsAppStatus    = () => Promise.resolve({ data: { status: 'disabled' } })
export const getWhatsAppQR        = () => Promise.resolve({ data: { qr: null } })
export const sendWhatsApp         = (_phone: string, _message: string) => Promise.resolve({ data: { success: false } })
export const getPreviewRenewals   = (_days?: number) => Promise.resolve({ data: [] })
export const sendRenewalReminders = (_days?: number) => Promise.resolve({ data: { sent: 0 } })

// ── Helpers de formato ────────────────────────────────────────────────────────
export const formatMXN = (amount: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount || 0)

export const formatUSD = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount || 0)

export const toMXN = (price: number, currency: string, rate: number) =>
  currency === 'USD' ? price * rate : price

// ── Internal helpers ──────────────────────────────────────────────────────────
function getDateMinusMonths(months: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - months)
  return d.toISOString().split('T')[0]
}

export default { getExchangeRate, refreshExchangeRate }
