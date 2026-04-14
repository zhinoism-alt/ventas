import { useEffect, useState } from 'react'
import { Plus, Search, Edit2, Trash2, ShoppingCart, Copy, Check, Tag, Filter } from 'lucide-react'
import {
  getProducts, createProduct, updateProduct, deleteProduct,
  sellProduct, getFBPost, getProductStats, getExchangeRate, formatMXN, toMXN
} from '../lib/api'

interface Product {
  id: number; name: string; brand: string; category: string; color: string;
  condition: string; notes: string; purchase_price: number; purchase_currency: string;
  sale_price: number; sale_currency: string; quantity: number; quantity_sold: number;
  status: string; fb_post: string; created_at: string;
}

const CONDITIONS = ['nuevo', 'como_nuevo', 'buen_estado', 'regular']
const COND_LABELS: Record<string, string> = {
  nuevo: 'Nuevo', como_nuevo: 'Como nuevo', buen_estado: 'Buen estado', regular: 'Regular'
}
const COND_COLORS: Record<string, string> = {
  nuevo: 'badge-blue', como_nuevo: 'badge-green', buen_estado: 'badge-yellow', regular: 'badge-gray'
}
const STATUS_COLORS: Record<string, string> = {
  disponible: 'badge-green', vendido: 'badge-gray', reservado: 'badge-yellow'
}

const EMPTY_FORM = {
  name: '', brand: '', category: '', color: '', condition: 'buen_estado',
  notes: '', purchase_price: '', purchase_currency: 'USD',
  sale_price: '', sale_currency: 'MXN', quantity: '1'
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

  const load = async () => {
    const [p, s, r] = await Promise.all([
      getProducts({ status: filterStatus, search }),
      getProductStats(),
      getExchangeRate()
    ])
    setProducts(p.data)
    setStats(s.data)
    setRate(r.data.usd_to_mxn)
    setLoading(false)
  }

  useEffect(() => { load() }, [search, filterStatus])

  const openAdd = () => { setEditing(null); setForm({ ...EMPTY_FORM }); setShowModal(true) }
  const openEdit = (p: Product) => {
    setEditing(p)
    setForm({
      name: p.name, brand: p.brand, category: p.category, color: p.color,
      condition: p.condition, notes: p.notes,
      purchase_price: String(p.purchase_price), purchase_currency: p.purchase_currency,
      sale_price: String(p.sale_price), sale_currency: p.sale_currency,
      quantity: String(p.quantity)
    })
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
    if (!form.name) return alert('El nombre es requerido')
    setSaving(true)
    try {
      const data = {
        ...form,
        purchase_price: parseFloat(form.purchase_price) || 0,
        sale_price: parseFloat(form.sale_price) || 0,
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
        sale_price: parseFloat(sellForm.sale_price) || selected.sale_price,
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

  const profit = (p: Product) => {
    const sp = toMXN(p.sale_price, p.sale_currency, rate)
    const pp = toMXN(p.purchase_price, p.purchase_currency, rate)
    return sp - pp
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full" />
    </div>
  )

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      {/* Header */}
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
          { label: 'Total artículos', value: stats.total || 0, color: '#6366f1' },
          { label: 'Disponibles', value: stats.disponibles || 0, color: '#22c55e' },
          { label: 'Vendidos', value: stats.vendidos || 0, color: '#94a3b8' },
          { label: 'Invertido', value: formatMXN(stats.total_invertido || 0), color: '#f59e0b' },
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
      </div>

      {/* Product grid */}
      {products.length === 0 ? (
        <div className="card text-center py-16 text-slate-500">
          <Package size={48} className="mx-auto mb-3 opacity-30" />
          <p>No hay artículos. ¡Agrega el primero!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {products.map(p => {
            const gain = profit(p)
            return (
              <div key={p.id} className="card flex flex-col gap-3 hover:border-indigo-500/40 transition-colors">
                {/* Title row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-white truncate">{p.name}</h3>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {p.brand && <span className="text-xs text-slate-400">{p.brand}</span>}
                      {p.color && <span className="text-xs text-slate-500">· {p.color}</span>}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className={`badge ${COND_COLORS[p.condition] || 'badge-gray'}`}>
                      {COND_LABELS[p.condition] || p.condition}
                    </span>
                    <span className={`badge ${STATUS_COLORS[p.status] || 'badge-gray'}`}>
                      {p.status}
                    </span>
                  </div>
                </div>

                {/* Prices */}
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-lg p-2" style={{ background: '#0f172a' }}>
                    <p className="text-xs text-slate-500 mb-0.5">Compré</p>
                    <p className="font-medium text-slate-300">
                      {p.purchase_currency === 'USD' ? '$' : ''}
                      {p.purchase_price} {p.purchase_currency}
                    </p>
                    {p.purchase_currency === 'USD' && (
                      <p className="text-xs text-slate-500">≈ {formatMXN(p.purchase_price * rate)}</p>
                    )}
                  </div>
                  <div className="rounded-lg p-2" style={{ background: '#0f172a' }}>
                    <p className="text-xs text-slate-500 mb-0.5">Vendo</p>
                    <p className="font-medium text-white">
                      ${p.sale_price} {p.sale_currency}
                    </p>
                    {p.sale_currency === 'USD' && (
                      <p className="text-xs text-slate-500">≈ {formatMXN(p.sale_price * rate)}</p>
                    )}
                  </div>
                </div>

                {/* Profit */}
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Ganancia: <span className={gain >= 0 ? 'text-green-400 font-semibold' : 'text-red-400 font-semibold'}>
                    {formatMXN(gain)}
                  </span></span>
                  <span className="text-slate-400">Stock: <span className="text-white font-medium">{p.quantity}</span>
                    {p.quantity_sold > 0 && <span className="text-slate-500"> ({p.quantity_sold} vendidos)</span>}
                  </span>
                </div>

                {p.notes && (
                  <p className="text-xs text-slate-500 italic border-t pt-2" style={{ borderColor: '#2d3f58' }}>{p.notes}</p>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-1 border-t" style={{ borderColor: '#2d3f58' }}>
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
          <div className="w-full max-w-lg rounded-xl overflow-hidden" style={{ background: '#1e293b', border: '1px solid #2d3f58', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="p-5">
              <h2 className="text-lg font-bold text-white mb-5">{editing ? 'Editar artículo' : 'Agregar artículo'}</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label>Nombre *</label>
                  <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ej: Audífonos Razer" />
                </div>
                <div>
                  <label>Marca</label>
                  <input className="input" value={form.brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))} placeholder="Razer, Samsung..." />
                </div>
                <div>
                  <label>Categoría</label>
                  <input className="input" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="Electrónica, Ropa..." />
                </div>
                <div>
                  <label>Color</label>
                  <input className="input" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} placeholder="Negro, Rojo..." />
                </div>
                <div>
                  <label>Condición</label>
                  <select className="input" value={form.condition} onChange={e => setForm(f => ({ ...f, condition: e.target.value }))}>
                    {CONDITIONS.map(c => <option key={c} value={c}>{COND_LABELS[c]}</option>)}
                  </select>
                </div>
                <div>
                  <label>Precio compra</label>
                  <input className="input" type="number" step="0.01" value={form.purchase_price} onChange={e => setForm(f => ({ ...f, purchase_price: e.target.value }))} placeholder="0.00" />
                </div>
                <div>
                  <label>Moneda compra</label>
                  <select className="input" value={form.purchase_currency} onChange={e => setForm(f => ({ ...f, purchase_currency: e.target.value }))}>
                    <option value="USD">USD</option>
                    <option value="MXN">MXN</option>
                  </select>
                </div>
                <div>
                  <label>Precio venta</label>
                  <input className="input" type="number" step="0.01" value={form.sale_price} onChange={e => setForm(f => ({ ...f, sale_price: e.target.value }))} placeholder="0.00" />
                </div>
                <div>
                  <label>Moneda venta</label>
                  <select className="input" value={form.sale_currency} onChange={e => setForm(f => ({ ...f, sale_currency: e.target.value }))}>
                    <option value="MXN">MXN</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
                <div>
                  <label>Cantidad</label>
                  <input className="input" type="number" min="0" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <label>Notas / detalles del producto</label>
                  <textarea className="input" rows={3} value={form.notes}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="Sin cable HDMI, funciona perfecto, incluye caja..." />
                </div>
              </div>

              {/* Preview */}
              {form.purchase_price && form.sale_price && (
                <div className="mt-4 p-3 rounded-lg" style={{ background: '#0f172a', border: '1px solid #2d3f58' }}>
                  <p className="text-xs text-slate-400 mb-1">Vista previa de ganancia:</p>
                  <p className="text-sm">
                    <span className="text-slate-300">Compra: </span>
                    <span className="text-white">{form.purchase_currency === 'USD' ? '$' : ''}{form.purchase_price} {form.purchase_currency}</span>
                    {form.purchase_currency === 'USD' && <span className="text-slate-500"> ≈ {formatMXN(parseFloat(form.purchase_price) * rate)}</span>}
                    <span className="text-slate-400 mx-2">→</span>
                    <span className="text-slate-300">Venta: </span>
                    <span className="text-white">${form.sale_price} {form.sale_currency}</span>
                    {form.sale_currency === 'USD' && <span className="text-slate-500"> ≈ {formatMXN(parseFloat(form.sale_price) * rate)}</span>}
                    <span className="text-slate-400 mx-2">=</span>
                    <span className={`font-bold ${toMXN(parseFloat(form.sale_price) || 0, form.sale_currency, rate) - toMXN(parseFloat(form.purchase_price) || 0, form.purchase_currency, rate) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {formatMXN(toMXN(parseFloat(form.sale_price) || 0, form.sale_currency, rate) - toMXN(parseFloat(form.purchase_price) || 0, form.purchase_currency, rate))}
                    </span>
                  </p>
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
          <div className="w-full max-w-md rounded-xl overflow-hidden" style={{ background: '#1e293b', border: '1px solid #2d3f58' }}>
            <div className="p-5">
              <h2 className="text-lg font-bold text-white mb-2">Post para Facebook Marketplace</h2>
              <p className="text-xs text-slate-400 mb-4">{selected.name}</p>
              <textarea
                className="input font-mono text-sm"
                rows={12}
                value={fbPost}
                onChange={e => setFBPost(e.target.value)}
              />
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
          <div className="w-full max-w-sm rounded-xl overflow-hidden" style={{ background: '#1e293b', border: '1px solid #2d3f58' }}>
            <div className="p-5">
              <h2 className="text-lg font-bold text-white mb-1">Registrar venta</h2>
              <p className="text-sm text-slate-400 mb-5">{selected.name}</p>
              <div className="space-y-3">
                <div>
                  <label>Cantidad vendida</label>
                  <input className="input" type="number" min="1" max={selected.quantity}
                    value={sellForm.quantity_sold} onChange={e => setSellForm(f => ({ ...f, quantity_sold: e.target.value }))} />
                </div>
                <div>
                  <label>Precio de venta ({selected.sale_currency})</label>
                  <input className="input" type="number" step="0.01"
                    value={sellForm.sale_price} onChange={e => setSellForm(f => ({ ...f, sale_price: e.target.value }))} />
                </div>
                <div>
                  <label>Comprador (opcional)</label>
                  <input className="input" value={sellForm.buyer_name} onChange={e => setSellForm(f => ({ ...f, buyer_name: e.target.value }))} />
                </div>
                <div>
                  <label>Método de pago</label>
                  <select className="input" value={sellForm.payment_method} onChange={e => setSellForm(f => ({ ...f, payment_method: e.target.value }))}>
                    <option value="efectivo">Efectivo</option>
                    <option value="transferencia">Transferencia</option>
                    <option value="paypal">PayPal</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>
                <div>
                  <label>Notas</label>
                  <input className="input" value={sellForm.notes} onChange={e => setSellForm(f => ({ ...f, notes: e.target.value }))} />
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
