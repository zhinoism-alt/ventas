import { useEffect, useState } from 'react'
import { Plus, Search, Edit2, Trash2, ShoppingCart, Copy, Check, Tag, Package, ArrowUpDown } from 'lucide-react'
import {
  getProducts, createProduct, updateProduct, deleteProduct,
  sellProduct, getFBPost, getProductStats, getExchangeRate, formatMXN, toMXN
} from '../lib/api'
import { CONDITIONS, COND_LABELS, COND_COLORS, STATUS_COLORS } from '../lib/constants'
import { safeFloat, calcProfit, profitClass, fmt } from '../lib/utils'

interface Product {
  id: number; name: string; brand: string; category: string; color: string
  condition: string; notes: string; purchase_price: number; purchase_currency: string
  sale_price: number; sale_currency: string; quantity: number; quantity_sold: number
  status: string; fb_post: string; created_at: string
}

const EMPTY_FORM = {
  name: '', brand: '', category: '', color: '', condition: 'buen_estado',
  notes: '', purchase_price: '', purchase_currency: 'USD',
  sale_price: '', sale_currency: 'MXN', quantity: '1',
}

export default function Inventory() {
  const [products, setProducts] = useState<Product[]>([])
  const [stats, setStats] = useState<any>({})
  const [rate, setRate] = useState(17.5)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('todos')
  const [showModal, setShowModal] = useState(false)
  const [showFBModal, setShowFBModal] = useState(false)
  const [showSellModal, setShowSellModal] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [selected, setSelected] = useState<Product | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [fbPost, setFBPost] = useState('')
  const [copied, setCopied] = useState(false)
  const [sellForm, setSellForm] = useState({ quantity_sold: '1', sale_price: '', buyer_name: '', payment_method: 'efectivo', notes: '' })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [sortBy, setSortBy] = useState('default')

  const load = async () => {
    const [p, s, r] = await Promise.all([
      getProducts({ status: filterStatus, search }),
      getProductStats(),
      getExchangeRate(),
    ])
    setProducts(p.data)
    setStats(s.data)
    setRate(r.data.usd_to_mxn || 17.5)
    setLoading(false)
  }

  useEffect(() => { load() }, [search, filterStatus])

  const openAdd = () => {
    setEditing(null); setForm({ ...EMPTY_FORM }); setFormError(''); setShowModal(true)
  }
  const openEdit = (p: Product) => {
    setEditing(p)
    setForm({
      name: p.name, brand: p.brand, category: p.category, color: p.color,
      condition: p.condition, notes: p.notes,
      purchase_price: String(p.purchase_price), purchase_currency: p.purchase_currency,
      sale_price: String(p.sale_price), sale_currency: p.sale_currency,
      quantity: String(p.quantity),
    })
    setFormError('')
    setShowModal(true)
  }
  const openFB = async (p: Product) => {
    setSelected(p)
    const r = await getFBPost(p.id)
    setFBPost(r.data.post)
    setShowFBModal(true)
  }
  const openSell = (p: Product) => {
    setSelected(p)
    setSellForm({ quantity_sold: '1', sale_price: String(p.sale_price), buyer_name: '', payment_method: 'efectivo', notes: '' })
    setShowSellModal(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) { setFormError('El nombre es requerido'); return }
    setFormError('')
    setSaving(true)
    try {
      const data = {
        ...form,
        purchase_price: safeFloat(form.purchase_price),
        sale_price: safeFloat(form.sale_price),
        quantity: parseInt(form.quantity) || 1,
      }
      if (editing) await updateProduct(editing.id, data)
      else await createProduct(data)
      setShowModal(false)
      load()
    } finally { setSaving(false) }
  }

  const handleDelete = async (p: Product) => {
    if (!confirm(`¿Eliminar "${p.name}"?`)) return
    await deleteProduct(p.id)
    load()
  }

  const handleSell = async () => {
    if (!selected) return
    setSaving(true)
    try {
      await sellProduct(selected.id, {
        quantity_sold: parseInt(sellForm.quantity_sold) || 1,
        sale_price: safeFloat(sellForm.sale_price) || selected.sale_price,
        sale_currency: selected.sale_currency,
        buyer_name: sellForm.buyer_name,
        payment_method: sellForm.payment_method,
        notes: sellForm.notes,
      })
      setShowSellModal(false)
      load()
    } finally { setSaving(false) }
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(fbPost)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Sort products
  const sortedProducts = [...products].sort((a, b) => {
    if (sortBy === 'name_asc') return a.name.localeCompare(b.name)
    if (sortBy === 'name_desc') return b.name.localeCompare(a.name)
    if (sortBy === 'profit_desc') {
      const ga = calcProfit(a.sale_price, a.sale_currency, a.purchase_price, a.purchase_currency, rate)
      const gb = calcProfit(b.sale_price, b.sale_currency, b.purchase_price, b.purchase_currency, rate)
      return gb - ga
    }
    if (sortBy === 'profit_asc') {
      const ga = calcProfit(a.sale_price, a.sale_currency, a.purchase_price, a.purchase_currency, rate)
      const gb = calcProfit(b.sale_price, b.sale_currency, b.purchase_price, b.purchase_currency, rate)
      return ga - gb
    }
    if (sortBy === 'price_desc') return (b.sale_price || 0) - (a.sale_price || 0)
    if (sortBy === 'price_asc') return (a.sale_price || 0) - (b.sale_price || 0)
    return 0
  })

  // Preview profit (safe — no NaN)
  const previewProfit = (() => {
    const sp = safeFloat(form.sale_price)
    const pp = safeFloat(form.purchase_price)
    if (!sp && !pp) return null
    return calcProfit(sp, form.sale_currency, pp, form.purchase_currency, rate)
  })()

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full" />
    </div>
  )

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Inventario</h1>
          <p className="text-slate-400 text-sm mt-0.5">Gestión de artículos y ventas</p>
        </div>
        <button onClick={openAdd} className="btn-primary"><Plus size={16} />Agregar artículo</button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total artículos', value: stats.total ?? 0, color: '#6366f1' },
          { label: 'Disponibles', value: stats.disponibles ?? 0, color: '#22c55e' },
          { label: 'Vendidos', value: stats.vendidos ?? 0, color: '#94a3b8' },
          { label: 'Invertido', value: fmt(stats.total_invertido), color: '#f59e0b' },
        ].map(s => (
          <div key={s.label} className="card">
            <p className="text-xs text-slate-400">{s.label}</p>
            <p className="text-lg font-bold mt-1" style={{ color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input className="input pl-8" placeholder="Buscar por nombre, marca, notas..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="input w-auto" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="todos">Todos</option>
          <option value="disponible">Disponibles</option>
          <option value="vendido">Vendidos</option>
          <option value="reservado">Reservados</option>
        </select>
        <div className="relative">
          <ArrowUpDown size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          <select className="input w-auto pl-8" value={sortBy} onChange={e => setSortBy(e.target.value)}>
            <option value="default">Ordenar por</option>
            <option value="profit_desc">Mayor ganancia</option>
            <option value="profit_asc">Menor ganancia</option>
            <option value="price_desc">Mayor precio</option>
            <option value="price_asc">Menor precio</option>
            <option value="name_asc">Nombre A→Z</option>
            <option value="name_desc">Nombre Z→A</option>
          </select>
        </div>
      </div>

      {/* Product grid */}
      {sortedProducts.length === 0 ? (
        <div className="card text-center py-16">
          <Package size={48} className="mx-auto mb-3 text-slate-700" />
          <p className="text-slate-400 font-medium">No hay artículos</p>
          <p className="text-slate-600 text-sm mt-1">
            {search || filterStatus !== 'todos' ? 'Intenta con otros filtros' : '¡Agrega el primero!'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sortedProducts.map(p => {
            const gain = calcProfit(p.sale_price, p.sale_currency, p.purchase_price, p.purchase_currency, rate)
            // ROI: gain / cost_in_mxn * 100
            const costMxn = p.purchase_currency === 'USD' ? p.purchase_price * rate : p.purchase_price
            const roi = costMxn > 0 ? (gain / costMxn) * 100 : null
            return (
              <div key={p.id} className="card flex flex-col gap-3 hover:border-indigo-500/40 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-white truncate">{p.name}</h3>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      {p.brand && <span className="text-xs text-slate-400">{p.brand}</span>}
                      {p.color && <span className="text-xs text-slate-500">· {p.color}</span>}
                      {p.category && <span className="text-xs text-slate-600">· {p.category}</span>}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className={`badge ${COND_COLORS[p.condition] || 'badge-gray'}`}>
                      {COND_LABELS[p.condition] || p.condition}
                    </span>
                    <span className={`badge ${STATUS_COLORS[p.status] || 'badge-gray'}`}>{p.status}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-lg p-2.5" style={{ background: '#0f172a' }}>
                    <p className="text-xs text-slate-500 mb-1">Compré</p>
                    <p className="font-semibold text-slate-300">${p.purchase_price} {p.purchase_currency}</p>
                    {p.purchase_currency === 'USD' && (
                      <p className="text-xs text-slate-600 mt-0.5">≈ {fmt(p.purchase_price * rate)}</p>
                    )}
                  </div>
                  <div className="rounded-lg p-2.5" style={{ background: '#0f172a' }}>
                    <p className="text-xs text-slate-500 mb-1">Vendo</p>
                    <p className="font-semibold text-white">${p.sale_price} {p.sale_currency}</p>
                    {p.sale_currency === 'USD' && (
                      <p className="text-xs text-slate-600 mt-0.5">≈ {fmt(p.sale_price * rate)}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">
                      Gan: <span className={`font-bold ${profitClass(gain)}`}>{fmt(gain)}</span>
                    </span>
                    {roi !== null && (
                      <span
                        className="px-1.5 py-0.5 rounded text-xs font-semibold"
                        style={{
                          background: roi >= 30 ? '#14532d55' : roi >= 10 ? '#71380055' : '#7f1d1d55',
                          color: roi >= 30 ? '#86efac' : roi >= 10 ? '#fcd34d' : '#fca5a5',
                        }}
                      >
                        {roi >= 0 ? '+' : ''}{roi.toFixed(0)}% ROI
                      </span>
                    )}
                  </div>
                  <span className="text-slate-400">
                    Stock: <span className="text-white font-semibold">{p.quantity}</span>
                    {p.quantity_sold > 0 && <span className="text-slate-500"> ({p.quantity_sold} vend.)</span>}
                  </span>
                </div>

                {p.notes && (
                  <p className="text-xs text-slate-500 italic border-t pt-2" style={{ borderColor: '#1e3050' }}>
                    {p.notes}
                  </p>
                )}

                <div className="flex gap-2 pt-1 border-t" style={{ borderColor: '#1e3050' }}>
                  {p.status !== 'vendido' && (
                    <button onClick={() => openSell(p)} className="btn-success flex-1 justify-center py-1.5 text-xs">
                      <ShoppingCart size={12} />Vender
                    </button>
                  )}
                  <button onClick={() => openFB(p)} className="btn-secondary flex-1 justify-center py-1.5 text-xs">
                    <Tag size={12} />Post FB
                  </button>
                  <button onClick={() => openEdit(p)} className="btn-secondary px-2 py-1.5">
                    <Edit2 size={12} />
                  </button>
                  <button onClick={() => handleDelete(p)} className="btn-danger px-2 py-1.5">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="w-full max-w-lg rounded-xl" style={{ background: '#1e293b', border: '1px solid #2d3f58', maxHeight: '92vh', overflowY: 'auto' }}>
            <div className="p-5">
              <h2 className="text-lg font-bold text-white mb-5">{editing ? 'Editar artículo' : 'Agregar artículo'}</h2>

              {formError && (
                <div className="mb-4 p-3 rounded-lg text-red-400 text-sm" style={{ background: '#7f1d1d33' }}>
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label>Nombre *</label>
                  <input className="input" value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Ej: Audífonos Razer" />
                </div>
                <div>
                  <label>Marca</label>
                  <input className="input" value={form.brand}
                    onChange={e => setForm(f => ({ ...f, brand: e.target.value }))} placeholder="Razer, Samsung..." />
                </div>
                <div>
                  <label>Categoría</label>
                  <input className="input" value={form.category}
                    onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="Electrónica..." />
                </div>
                <div>
                  <label>Color</label>
                  <input className="input" value={form.color}
                    onChange={e => setForm(f => ({ ...f, color: e.target.value }))} placeholder="Negro, Rojo..." />
                </div>
                <div>
                  <label>Condición</label>
                  <select className="input" value={form.condition}
                    onChange={e => setForm(f => ({ ...f, condition: e.target.value }))}>
                    {CONDITIONS.map(c => <option key={c} value={c}>{COND_LABELS[c]}</option>)}
                  </select>
                </div>
                <div>
                  <label>Precio compra</label>
                  <input className="input" type="number" step="0.01" min="0" value={form.purchase_price}
                    onChange={e => setForm(f => ({ ...f, purchase_price: e.target.value }))} placeholder="0.00" />
                </div>
                <div>
                  <label>Moneda compra</label>
                  <select className="input" value={form.purchase_currency}
                    onChange={e => setForm(f => ({ ...f, purchase_currency: e.target.value }))}>
                    <option value="USD">USD</option>
                    <option value="MXN">MXN</option>
                  </select>
                </div>
                <div>
                  <label>Precio venta</label>
                  <input className="input" type="number" step="0.01" min="0" value={form.sale_price}
                    onChange={e => setForm(f => ({ ...f, sale_price: e.target.value }))} placeholder="0.00" />
                </div>
                <div>
                  <label>Moneda venta</label>
                  <select className="input" value={form.sale_currency}
                    onChange={e => setForm(f => ({ ...f, sale_currency: e.target.value }))}>
                    <option value="MXN">MXN</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
                <div>
                  <label>Cantidad</label>
                  <input className="input" type="number" min="0" value={form.quantity}
                    onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <label>Notas del producto</label>
                  <textarea className="input" rows={3} value={form.notes}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="Sin cable HDMI, funciona perfecto, incluye caja..." />
                </div>
              </div>

              {/* Profit preview — only shown when both prices are valid numbers */}
              {previewProfit !== null && (
                <div className="mt-4 p-3 rounded-lg" style={{ background: '#0f172a', border: '1px solid #2d3f58' }}>
                  <p className="text-xs text-slate-400 mb-1">Vista previa de ganancia:</p>
                  <div className="flex items-center gap-2 text-sm flex-wrap">
                    <span className="text-slate-300">
                      Compra: <span className="text-white">${form.purchase_price || 0} {form.purchase_currency}</span>
                      {form.purchase_currency === 'USD' && (
                        <span className="text-slate-500 text-xs"> ≈ {fmt(safeFloat(form.purchase_price) * rate)}</span>
                      )}
                    </span>
                    <span className="text-slate-500">→</span>
                    <span className="text-slate-300">
                      Venta: <span className="text-white">${form.sale_price || 0} {form.sale_currency}</span>
                      {form.sale_currency === 'USD' && (
                        <span className="text-slate-500 text-xs"> ≈ {fmt(safeFloat(form.sale_price) * rate)}</span>
                      )}
                    </span>
                    <span className="text-slate-500">=</span>
                    <span className={`font-bold ${profitClass(previewProfit)}`}>{fmt(previewProfit)}</span>
                  </div>
                </div>
              )}

              <div className="flex gap-3 mt-5">
                <button onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancelar</button>
                <button onClick={handleSave} disabled={saving} className="btn-primary flex-1 justify-center">
                  {saving ? 'Guardando...' : editing ? 'Actualizar' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FB Post Modal */}
      {showFBModal && selected && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowFBModal(false)}>
          <div className="w-full max-w-md rounded-xl" style={{ background: '#1e293b', border: '1px solid #2d3f58' }}>
            <div className="p-5">
              <h2 className="text-lg font-bold text-white mb-1">Post para Facebook Marketplace</h2>
              <p className="text-xs text-slate-400 mb-4">{selected.name}</p>
              <textarea className="input font-mono text-sm" rows={12} value={fbPost}
                onChange={e => setFBPost(e.target.value)} />
              <div className="flex gap-3 mt-4">
                <button onClick={() => setShowFBModal(false)} className="btn-secondary flex-1">Cerrar</button>
                <button onClick={handleCopy} className="btn-primary flex-1 justify-center">
                  {copied ? <><Check size={14} />Copiado!</> : <><Copy size={14} />Copiar</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sell Modal */}
      {showSellModal && selected && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowSellModal(false)}>
          <div className="w-full max-w-sm rounded-xl" style={{ background: '#1e293b', border: '1px solid #2d3f58' }}>
            <div className="p-5">
              <h2 className="text-lg font-bold text-white mb-1">Registrar venta</h2>
              <p className="text-sm text-slate-400 mb-5">{selected.name}</p>
              <div className="space-y-3">
                <div>
                  <label>Cantidad vendida</label>
                  <input className="input" type="number" min="1" max={selected.quantity}
                    value={sellForm.quantity_sold}
                    onChange={e => setSellForm(f => ({ ...f, quantity_sold: e.target.value }))} />
                </div>
                <div>
                  <label>Precio de venta ({selected.sale_currency})</label>
                  <input className="input" type="number" step="0.01" value={sellForm.sale_price}
                    onChange={e => setSellForm(f => ({ ...f, sale_price: e.target.value }))} />
                </div>
                <div>
                  <label>Comprador (opcional)</label>
                  <input className="input" value={sellForm.buyer_name}
                    onChange={e => setSellForm(f => ({ ...f, buyer_name: e.target.value }))} />
                </div>
                <div>
                  <label>Método de pago</label>
                  <select className="input" value={sellForm.payment_method}
                    onChange={e => setSellForm(f => ({ ...f, payment_method: e.target.value }))}>
                    <option value="efectivo">Efectivo</option>
                    <option value="transferencia">Transferencia</option>
                    <option value="paypal">PayPal</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>
                <div>
                  <label>Notas</label>
                  <input className="input" value={sellForm.notes}
                    onChange={e => setSellForm(f => ({ ...f, notes: e.target.value }))} />
                </div>
              </div>
              <div className="flex gap-3 mt-5">
                <button onClick={() => setShowSellModal(false)} className="btn-secondary flex-1">Cancelar</button>
                <button onClick={handleSell} disabled={saving} className="btn-success flex-1 justify-center">
                  {saving ? 'Guardando...' : 'Registrar venta'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
