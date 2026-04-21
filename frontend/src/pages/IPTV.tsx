import { useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line
} from 'recharts'
import {
  Plus, Trash2, Edit2, Users, CreditCard, Tv, TrendingUp,
  MessageCircle, Copy, Check, AlertTriangle, RefreshCw
} from 'lucide-react'
import {
  getIPTVStats, getIPTVPackages, createIPTVPackage, deleteIPTVPackage,
  getIPTVClients, createIPTVClient, updateIPTVClient, deleteIPTVClient,
  getIPTVSubscriptions, createIPTVSubscription, deleteIPTVSubscription,
  updateSubscriptionStatus, updateIPTVSubscription,
  getIPTVPricing, getPreviewRenewals, sendRenewalReminders,
  getExchangeRate, formatMXN, toMXN
} from '../lib/api'
import { TOOLTIP_STYLE, PANEL_PRICES, SELL_PRICES, formatMonth } from '../lib/constants'
import { safeDiv, fmt, profitClass } from '../lib/utils'

export default function IPTV() {
  const [tab, setTab] = useState('overview')
  const [stats, setStats] = useState<any>(null)
  const [packages, setPackages] = useState<any[]>([])
  const [clients, setClients] = useState<any[]>([])
  const [subs, setSubs] = useState<any[]>([])
  const [pricing, setPricing] = useState<any>(null)
  const [renewals, setRenewals] = useState<any[]>([])
  const [rate, setRate] = useState(17.5)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState<number | null>(null)
  const [sendingRenewals, setSendingRenewals] = useState(false)
  const [filterStatus, setFilterStatus] = useState('todos')

  // Modals
  const [showPkgModal, setShowPkgModal] = useState(false)
  const [showClientModal, setShowClientModal] = useState(false)
  const [showSubModal, setShowSubModal] = useState(false)
  const [editingClient, setEditingClient] = useState<any>(null)
  const [editingSub, setEditingSub] = useState<any>(null)
  const [saving, setSaving] = useState(false)

  const [pkgForm, setPkgForm] = useState({ connections: '1', credits: '', price_paid: '', price_currency: 'MXN', purchase_date: new Date().toISOString().split('T')[0], notes: '' })
  const [clientForm, setClientForm] = useState({ name: '', phone: '', country: 'MX', email: '', notes: '' })
  const [subForm, setSubForm] = useState({
    client_id: '', package_id: '', connections: '1', months: '1',
    price_charged: '', price_currency: 'MXN', costo_token: '',
    cuenta_codigo: '',
    segundo_cliente_id: '', segundo_precio: '', segundo_es_propio: false,
    start_date: new Date().toISOString().split('T')[0], notes: '',
  })
  const [editSubForm, setEditSubForm] = useState({ price_charged: '', price_currency: 'MXN', costo_token: '', start_date: '', end_date: '', status: 'activo', notes: '' })

  const loadAll = async () => {
    const [s, p, c, sb, pr, r, ex] = await Promise.all([
      getIPTVStats(), getIPTVPackages(), getIPTVClients(),
      getIPTVSubscriptions(), getIPTVPricing(),
      getPreviewRenewals(7), getExchangeRate()
    ])
    setStats(s.data); setPackages(p.data); setClients(c.data)
    setSubs(sb.data); setPricing(pr.data); setRenewals(r.data)
    setRate(ex.data.usd_to_mxn); setLoading(false)
  }

  useEffect(() => { loadAll() }, [])

  const handlePkgSave = async () => {
    if (!pkgForm.credits || !pkgForm.price_paid) return alert('Créditos y precio son requeridos')
    setSaving(true)
    try {
      await createIPTVPackage({ ...pkgForm, credits: parseInt(pkgForm.credits), price_paid: parseFloat(pkgForm.price_paid), connections: parseInt(pkgForm.connections) })
      setShowPkgModal(false)
      loadAll()
    } finally { setSaving(false) }
  }

  const handleClientSave = async () => {
    if (!clientForm.name) return alert('El nombre es requerido')
    setSaving(true)
    try {
      if (editingClient) await updateIPTVClient(editingClient.id, clientForm)
      else await createIPTVClient(clientForm)
      setShowClientModal(false)
      loadAll()
    } finally { setSaving(false) }
  }

  const handleSubSave = async () => {
    if (!subForm.client_id || !subForm.price_charged || !subForm.start_date) {
      return alert('Cliente, precio y fecha son requeridos')
    }
    setSaving(true)
    try {
      await createIPTVSubscription({
        ...subForm,
        client_id:          parseInt(subForm.client_id),
        package_id:         subForm.package_id ? parseInt(subForm.package_id) : undefined,
        months:             parseInt(subForm.months),
        connections:        parseInt(subForm.connections),
        price_charged:      parseFloat(subForm.price_charged),
        segundo_cliente_id: subForm.segundo_cliente_id ? parseInt(subForm.segundo_cliente_id) : undefined,
        segundo_precio:     subForm.segundo_precio ? parseFloat(subForm.segundo_precio) : 0,
        cuenta_codigo:      subForm.cuenta_codigo || undefined,
      })
      setShowSubModal(false)
      setSubForm({
        client_id: '', package_id: '', connections: '1', months: '1',
        price_charged: '', price_currency: 'MXN', costo_token: '',
        cuenta_codigo: '',
        segundo_cliente_id: '', segundo_precio: '', segundo_es_propio: false,
        start_date: new Date().toISOString().split('T')[0], notes: '',
      })
      loadAll()
    } finally { setSaving(false) }
  }

  const openEditSub = (sub: any) => {
    const costoToken = (sub.cost_per_credit || 0) * (sub.credits_used || 1)
    setEditingSub(sub)
    setEditSubForm({
      price_charged:  String(sub.price_charged || ''),
      price_currency: sub.price_currency || 'MXN',
      costo_token:    costoToken > 0 ? String(costoToken) : '',
      start_date:     sub.start_date || '',
      end_date:       sub.end_date || '',
      status:         sub.status || 'activo',
      notes:          sub.notes || '',
    })
  }

  const handleEditSubSave = async () => {
    if (!editingSub) return
    setSaving(true)
    try {
      const costoToken = parseFloat(editSubForm.costo_token) || 0
      await updateIPTVSubscription(editingSub.id, {
        price_charged:  parseFloat(editSubForm.price_charged),
        price_currency: editSubForm.price_currency,
        cost_per_credit: costoToken,
        credits_used:   costoToken > 0 ? 1 : 0,
        start_date:     editSubForm.start_date,
        end_date:       editSubForm.end_date,
        status:         editSubForm.status,
        notes:          editSubForm.notes,
      })
      setEditingSub(null)
      loadAll()
    } finally { setSaving(false) }
  }

  const handleSendRenewals = async () => {
    setSendingRenewals(true)
    try {
      const r = await sendRenewalReminders(7)
      const d = r.data as { manual_mode?: boolean; count?: number; sent?: number }
      if (d.manual_mode) {
        alert(`WhatsApp no conectado. Aquí están ${d.count} mensajes listos para copiar.`)
      } else {
        alert(`Enviados: ${d.sent ?? d.count} mensajes de renovación`)
      }
      loadAll()
    } finally { setSendingRenewals(false) }
  }

  const handleCopyMsg = (msg: string, idx: number) => {
    navigator.clipboard.writeText(msg)
    setCopied(idx)
    setTimeout(() => setCopied(null), 2000)
  }

  const filteredSubs = filterStatus === 'todos' ? subs : subs.filter(s => s.status === filterStatus)

  const chartData = (stats?.monthly_revenue ?? []).map((m: any) => ({
    name: formatMonth(m.month),
    Ingresos: Math.round(m.revenue_mxn || 0),
    Costo: Math.round(m.cost_mxn || 0),
    Ganancia: Math.round((m.revenue_mxn || 0) - (m.cost_mxn || 0)),
  }))

  const balance1 = stats?.credits?.find((c: any) => c.connections === 1)
  const balance2 = stats?.credits?.find((c: any) => c.connections === 2)

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full" />
    </div>
  )

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">IPTV - Elite TV Plus</h1>
          <p className="text-slate-400 text-sm mt-0.5">Control de créditos, clientes y suscripciones</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap p-1 rounded-lg" style={{ background: '#0f172a' }}>
        {[
          { id: 'overview', label: 'Resumen', icon: <TrendingUp size={14} /> },
          { id: 'credits', label: 'Créditos', icon: <CreditCard size={14} /> },
          { id: 'clients', label: 'Clientes', icon: <Users size={14} /> },
          { id: 'subscriptions', label: 'Suscripciones', icon: <Tv size={14} /> },
          { id: 'pricing', label: 'Precios', icon: <TrendingUp size={14} /> },
          { id: 'whatsapp', label: 'WhatsApp', icon: <MessageCircle size={14} /> },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`tab-btn flex items-center gap-1.5 ${tab === t.id ? 'active' : ''}`}>
            {t.icon}{t.label}
            {t.id === 'whatsapp' && renewals.length > 0 && (
              <span className="ml-1 bg-yellow-500 text-black text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {renewals.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {tab === 'overview' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="card"><p className="text-xs text-slate-400">Clientes activos</p><p className="text-2xl font-bold text-indigo-400 mt-1">{stats?.subscriptions?.activas || 0}</p></div>
            <div className="card"><p className="text-xs text-slate-400">Créditos 1-conn</p><p className="text-2xl font-bold text-green-400 mt-1">{balance1?.disponibles || 0}</p><p className="text-xs text-slate-500">de {balance1?.total_comprados || 0}</p></div>
            <div className="card"><p className="text-xs text-slate-400">Créditos 2-conn</p><p className="text-2xl font-bold text-cyan-400 mt-1">{balance2?.disponibles || 0}</p><p className="text-xs text-slate-500">de {balance2?.total_comprados || 0}</p></div>
            <div className="card">
              <p className="text-xs text-slate-400">Por vencer (7d)</p>
              <p className={`text-2xl font-bold mt-1 ${stats?.expiring_soon > 0 ? 'text-yellow-400' : 'text-slate-400'}`}>
                {stats?.expiring_soon || 0}
              </p>
            </div>
          </div>

          {/* Ingresos totales */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="card">
              <p className="text-xs text-slate-400 mb-1">Ingresos totales IPTV</p>
              <p className="text-2xl font-bold text-green-400">{formatMXN(stats?.subscriptions?.ingresos_activos_mxn || 0)}</p>
              <p className="text-xs text-slate-500 mt-1">Solo suscripciones activas</p>
            </div>
            <div className="card">
              <p className="text-xs text-slate-400 mb-1">Suscripciones vencidas</p>
              <p className="text-2xl font-bold text-slate-400">{stats?.subscriptions?.vencidas || 0}</p>
              <p className="text-xs text-slate-500 mt-1">de {stats?.subscriptions?.total || 0} totales</p>
            </div>
          </div>

          {chartData.length > 0 && (
            <div className="card">
              <h3 className="text-sm font-semibold text-white mb-4">Ingresos vs Costos (últimos 12 meses)</h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2d3f58" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => formatMXN(v)} />
                  <Bar dataKey="Ingresos" fill="#22c55e" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Costo" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Ganancia" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* ── CREDITS ── */}
      {tab === 'credits' && (
        <div className="space-y-5">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-white">Paquetes de créditos</h2>
            <button onClick={() => { setPkgForm({ connections: '1', credits: '', price_paid: '', price_currency: 'MXN', purchase_date: new Date().toISOString().split('T')[0], notes: '' }); setShowPkgModal(true) }} className="btn-primary">
              <Plus size={14} />Comprar paquete
            </button>
          </div>

          {/* Balance cards */}
          <div className="grid grid-cols-2 gap-4">
            {[{ conn: 1, data: balance1 }, { conn: 2, data: balance2 }].map(({ conn, data }) => (
              <div key={conn} className="card">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium text-white">{conn} conexión{conn > 1 ? 'es' : ''}</p>
                  <span className="badge badge-blue">{data?.disponibles || 0} disponibles</span>
                </div>
                <div className="w-full rounded-full h-2" style={{ background: '#0f172a' }}>
                  <div className="h-2 rounded-full" style={{
                    background: 'linear-gradient(90deg, #6366f1, #22c55e)',
                    width: `${Math.min(100, safeDiv(data?.disponibles || 0, data?.total_comprados || 0) * 100).toFixed(1)}%`
                  }} />
                </div>
                <p className="text-xs text-slate-400 mt-2">
                  {data?.usados || 0} usados de {data?.total_comprados || 0} comprados
                </p>
              </div>
            ))}
          </div>

          {/* Panel prices reference */}
          <div className="card">
            <h3 className="text-sm font-semibold text-white mb-4">Precios del panel Elite TV Plus (referencia)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(PANEL_PRICES).map(([conn, prices]) => (
                <div key={conn}>
                  <p className="text-xs text-slate-400 mb-2">{conn} conexión{parseInt(conn) > 1 ? 'es' : ''}</p>
                  <div className="space-y-1.5">
                    {prices.map(p => (
                      <div key={p.credits} className="flex items-center justify-between text-sm py-1.5 px-3 rounded-lg" style={{ background: '#0f172a' }}>
                        <span className="text-slate-300">{p.credits} créditos</span>
                        <div className="text-right">
                          <span className="text-white font-medium">{formatMXN(p.price_mxn)}</span>
                          <span className="text-slate-500 text-xs ml-2">/ ${p.price_usd} USD</span>
                        </div>
                        <span className="text-xs text-slate-500">${(p.price_mxn / p.credits).toFixed(0)}/créd</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Packages list */}
          <div className="space-y-2">
            {packages.map(pkg => {
              const pct = Math.min(100, safeDiv(pkg.credits_remaining || 0, pkg.credits || 0) * 100)
              return (
                <div key={pkg.id} className="card flex items-center gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-white font-medium">{pkg.credits} créditos</span>
                      <span className="badge badge-blue">{pkg.connections} conn</span>
                      <span className={`badge ${pkg.credits_remaining > 0 ? 'badge-green' : 'badge-gray'}`}>
                        {pkg.credits_remaining} restantes
                      </span>
                    </div>
                    <div className="w-full rounded-full h-1.5" style={{ background: '#0f172a' }}>
                      <div className="h-1.5 rounded-full bg-indigo-500" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      {formatMXN(pkg.price_paid)} {pkg.price_currency !== 'MXN' ? pkg.price_currency : ''} · {pkg.purchase_date}
                      {pkg.notes && ` · ${pkg.notes}`}
                    </p>
                  </div>
                  <button onClick={async () => { if (confirm('¿Eliminar paquete?')) { await deleteIPTVPackage(pkg.id); loadAll() } }} className="btn-danger px-2 py-1.5">
                    <Trash2 size={12} />
                  </button>
                </div>
              )
            })}
            {packages.length === 0 && (
              <div className="card text-center py-10 text-slate-500">
                <CreditCard size={32} className="mx-auto mb-2 opacity-30" />
                <p>Sin paquetes. Compra tu primer paquete de créditos.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── CLIENTS ── */}
      {tab === 'clients' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-white">Clientes ({clients.length})</h2>
            <button onClick={() => { setEditingClient(null); setClientForm({ name: '', phone: '', country: 'MX', email: '', notes: '' }); setShowClientModal(true) }} className="btn-primary">
              <Plus size={14} />Agregar cliente
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {clients.map(c => (
              <div key={c.id} className="card">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-white">{c.name}</p>
                    {c.phone && <p className="text-sm text-slate-400 mt-0.5">{c.phone}</p>}
                    <div className="flex gap-2 mt-2">
                      <span className="badge badge-blue">{c.country}</span>
                      {c.active_subs > 0
                        ? <span className="badge badge-green">Activo</span>
                        : <span className="badge badge-gray">Sin sub activa</span>
                      }
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={() => { setEditingClient(c); setClientForm({ name: c.name, phone: c.phone, country: c.country, email: c.email, notes: c.notes }); setShowClientModal(true) }} className="btn-secondary px-2 py-1.5">
                      <Edit2 size={12} />
                    </button>
                    <button onClick={async () => { if (confirm(`¿Eliminar cliente "${c.name}"?`)) { await deleteIPTVClient(c.id); loadAll() } }} className="btn-danger px-2 py-1.5">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
                {c.next_expiry && (
                  <p className="text-xs text-slate-500 mt-2 pt-2 border-t" style={{ borderColor: '#2d3f58' }}>
                    Vence: <span className="text-slate-300">{c.next_expiry}</span>
                  </p>
                )}
                {c.notes && <p className="text-xs text-slate-500 mt-1 italic">{c.notes}</p>}
              </div>
            ))}
            {clients.length === 0 && (
              <div className="col-span-3 card text-center py-10 text-slate-500">
                <Users size={32} className="mx-auto mb-2 opacity-30" />
                <p>Sin clientes registrados aún.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── SUBSCRIPTIONS ── */}
      {tab === 'subscriptions' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h2 className="text-lg font-semibold text-white">Suscripciones ({subs.length})</h2>
            <div className="flex gap-2">
              <select className="input w-auto" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                <option value="todos">Todas</option>
                <option value="activo">Activas</option>
                <option value="vencido">Vencidas</option>
                <option value="cancelado">Canceladas</option>
              </select>
              <button onClick={() => { setSubForm({ client_id: '', package_id: '', connections: '1', months: '1', price_charged: '', price_currency: 'MXN', costo_token: '', cuenta_codigo: '', segundo_cliente_id: '', segundo_precio: '', segundo_es_propio: false, start_date: new Date().toISOString().split('T')[0], notes: '' }); setShowSubModal(true) }} className="btn-primary">
                <Plus size={14} />Nueva suscripción
              </button>
            </div>
          </div>
          <div className="space-y-2">
            {filteredSubs.map(sub => {
              const daysLeft     = Math.ceil((new Date(sub.end_date).getTime() - Date.now()) / 86400000)
              const ingreso1     = toMXN(sub.price_charged || 0, sub.price_currency, rate)
              const ingreso2     = sub.segundo_es_propio ? 0 : (sub.segundo_precio || 0)
              const ingresoTotal = ingreso1 + ingreso2
              const costoToken   = (sub.cost_per_credit || 0) * (sub.credits_used || 0)
              const gainMXN      = ingresoTotal - costoToken
              const sinCosto     = costoToken === 0
              return (
                <div key={sub.id} className="card flex items-center gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      {/* Cliente principal */}
                      <span className="font-semibold text-white">{sub.client_name}</span>
                      {/* Segundo cliente */}
                      {sub.segundo_cliente_nombre && (
                        <>
                          <span className="text-slate-500 text-xs">+</span>
                          <span className="font-semibold text-slate-300">{sub.segundo_cliente_nombre}</span>
                          {sub.segundo_es_propio && <span className="badge badge-gray">uso propio</span>}
                        </>
                      )}
                      {sub.cuenta_codigo && (
                        <span className="badge badge-blue font-mono">{sub.cuenta_codigo}</span>
                      )}
                      <span className="badge badge-blue">{sub.connections} equipo{sub.connections > 1 ? 's' : ''}</span>
                      <span className={`badge ${sub.status === 'activo' ? 'badge-green' : sub.status === 'vencido' ? 'badge-red' : 'badge-gray'}`}>
                        {sub.status}
                      </span>
                      {sub.status === 'activo' && daysLeft <= 7 && daysLeft >= 0 && (
                        <span className="badge badge-yellow">Vence en {daysLeft}d</span>
                      )}
                    </div>
                    <div className="flex gap-3 text-xs text-slate-400 flex-wrap items-center">
                      <span>{sub.months} mes{sub.months > 1 ? 'es' : ''}</span>
                      <span>{sub.start_date} → {sub.end_date}</span>
                      <span className="text-white font-medium">
                        {formatMXN(ingreso1)}{ingreso2 > 0 ? ` + ${formatMXN(ingreso2)}` : ''}
                        {ingreso2 > 0 && <span className="text-slate-500"> = {formatMXN(ingresoTotal)}</span>}
                      </span>
                      {costoToken > 0 && <span className="text-red-400">−{fmt(costoToken)} token</span>}
                      <span className={sinCosto ? 'text-yellow-400' : profitClass(gainMXN)}>
                        {sinCosto ? '⚠ sin costo' : `= ${fmt(gainMXN)} ganancia`}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={() => openEditSub(sub)} className="btn-secondary px-2 py-1.5" title="Editar">
                      <Edit2 size={12} />
                    </button>
                    {sub.status === 'activo' && (
                      <button onClick={async () => { await updateSubscriptionStatus(sub.id, 'cancelado'); loadAll() }} className="btn-secondary px-2 py-1.5 text-xs">
                        Cancelar
                      </button>
                    )}
                    <button onClick={async () => { if (confirm('¿Eliminar suscripción? Se restaurarán los créditos.')) { await deleteIPTVSubscription(sub.id); loadAll() } }} className="btn-danger px-2 py-1.5">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              )
            })}
            {filteredSubs.length === 0 && (
              <div className="card text-center py-10 text-slate-500">
                <Tv size={32} className="mx-auto mb-2 opacity-30" />
                <p>Sin suscripciones. ¡Agrega la primera!</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── PRICING OPTIMIZER ── */}
      {tab === 'pricing' && pricing && (
        <div className="space-y-5">
          <h2 className="text-lg font-semibold text-white">Optimizador de precios</h2>

          {/* Quick comparison */}
          <div className="card">
            <h3 className="text-sm font-semibold text-white mb-1">¿Cuánto ganas por cliente al mes?</h3>
            <p className="text-xs text-slate-400 mb-4">Basado en paquete de 30 créditos 1-conn (${(2100/30).toFixed(0)}/crédito)</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {pricing.custom_comparison.map((p: any) => (
                <div key={p.price_mxn} className="rounded-lg p-3 text-center" style={{
                  background: '#0f172a',
                  border: p.price_mxn === 200 ? '2px solid #6366f1' : '1px solid #2d3f58'
                }}>
                  {p.price_mxn === 200 && <p className="text-xs text-indigo-400 mb-1">▲ Recomendado</p>}
                  <p className="text-xl font-bold text-white">{formatMXN(p.price_mxn)}</p>
                  <p className="text-xs text-slate-400">por mes</p>
                  <div className="mt-2 pt-2" style={{ borderTop: '1px solid #2d3f58' }}>
                    <p className="text-green-400 font-semibold">{formatMXN(parseFloat(p.profit_per_client))}</p>
                    <p className="text-xs text-slate-500">ganancia</p>
                    <p className="text-xs text-indigo-300 mt-1">{p.margin}% margen</p>
                  </div>
                  <div className="mt-2 pt-2" style={{ borderTop: '1px solid #2d3f58' }}>
                    <p className="text-yellow-400 font-semibold text-sm">{formatMXN(parseFloat(p.monthly_18_clients))}</p>
                    <p className="text-xs text-slate-500">con 18 clientes/mes</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Sell prices reference */}
          <div className="card">
            <h3 className="text-sm font-semibold text-white mb-4">Tus precios de venta (Elite TV Plus)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(SELL_PRICES).map(([conn, prices]) => (
                <div key={conn}>
                  <p className="text-xs text-slate-400 mb-2 font-medium">{conn} conexión{parseInt(conn) > 1 ? 'es' : ''}</p>
                  <div className="space-y-1.5">
                    {prices.map(p => (
                      <div key={p.months} className="flex items-center justify-between text-sm py-1.5 px-3 rounded" style={{ background: '#0f172a' }}>
                        <span className="text-slate-300">{p.months} mes{p.months > 1 ? 'es' : ''}</span>
                        <div className="flex gap-3">
                          <span className="text-white font-medium">{formatMXN(p.price_mxn)}</span>
                          <span className="text-slate-500">${p.price_usd} USD</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Analysis table */}
          <div className="card overflow-x-auto">
            <h3 className="text-sm font-semibold text-white mb-4">Análisis completo de rentabilidad</h3>
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: '1px solid #2d3f58' }}>
                  {['Conn', 'Paquete', 'Costo/créd', 'Meses venta', 'Precio venta', 'Ganancia', 'Margen'].map(h => (
                    <th key={h} className="text-left py-2 px-2 text-slate-400 font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pricing.analysis.map((a: any, i: number) => (
                  <tr key={i} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td className="py-1.5 px-2 text-slate-300">{a.connections}</td>
                    <td className="py-1.5 px-2 text-slate-300">{a.package_credits} créd</td>
                    <td className="py-1.5 px-2 text-slate-400">{formatMXN(parseFloat(a.cost_per_credit_mxn))}</td>
                    <td className="py-1.5 px-2 text-slate-300">{a.sell_months}m</td>
                    <td className="py-1.5 px-2 text-white">{formatMXN(a.sell_price_mxn)}</td>
                    <td className={`py-1.5 px-2 font-semibold ${parseFloat(a.profit_per_credit_mxn) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {formatMXN(parseFloat(a.profit_per_credit_mxn))}
                    </td>
                    <td className="py-1.5 px-2">
                      <span className={`badge ${parseFloat(a.margin_percent) >= 60 ? 'badge-green' : parseFloat(a.margin_percent) >= 40 ? 'badge-yellow' : 'badge-red'}`}>
                        {a.margin_percent}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── WHATSAPP ── */}
      {tab === 'whatsapp' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Mensajes de renovación</h2>
            <button onClick={handleSendRenewals} disabled={sendingRenewals || renewals.length === 0} className="btn-primary">
              {sendingRenewals ? <RefreshCw size={14} className="animate-spin" /> : <MessageCircle size={14} />}
              Enviar recordatorios ({renewals.length})
            </button>
          </div>

          {renewals.length === 0 ? (
            <div className="card text-center py-12 text-slate-500">
              <MessageCircle size={32} className="mx-auto mb-2 opacity-30" />
              <p className="font-medium text-slate-400">Sin vencimientos en los próximos 7 días</p>
              <p className="text-sm mt-1">Todos tus clientes están al día</p>
            </div>
          ) : (
            <div className="space-y-3">
              {renewals.map((r, idx) => {
                const daysLeft = Math.ceil((new Date(r.end_date).getTime() - Date.now()) / 86400000)
                return (
                  <div key={r.id} className="card space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white">{r.client}</span>
                        <span className="badge badge-blue">{r.connections} conn</span>
                        <span className={`badge ${daysLeft <= 2 ? 'badge-red' : 'badge-yellow'}`}>
                          Vence en {daysLeft}d
                        </span>
                        {r.renewal_sent ? <span className="badge badge-green">Enviado</span> : null}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400">{r.phone}</span>
                        <button onClick={() => handleCopyMsg(r.message, idx)} className="btn-secondary px-2 py-1.5 text-xs">
                          {copied === idx ? <><Check size={12} />Copiado</> : <><Copy size={12} />Copiar</>}
                        </button>
                      </div>
                    </div>
                    <pre className="text-xs text-slate-300 whitespace-pre-wrap rounded-lg p-3" style={{ background: '#0f172a', fontFamily: 'inherit' }}>
                      {r.message}
                    </pre>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── MODALS ── */}
      {showPkgModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowPkgModal(false)}>
          <div className="w-full max-w-sm rounded-xl overflow-hidden" style={{ background: '#1e293b', border: '1px solid #2d3f58' }}>
            <div className="p-5">
              <h2 className="text-lg font-bold text-white mb-5">Registrar compra de créditos</h2>
              <div className="space-y-3">
                <div>
                  <label>Conexiones por crédito</label>
                  <select className="input" value={pkgForm.connections} onChange={e => setPkgForm(f => ({ ...f, connections: e.target.value }))}>
                    <option value="1">1 conexión</option>
                    <option value="2">2 conexiones</option>
                  </select>
                </div>
                <div>
                  <label>Créditos comprados</label>
                  <div className="flex gap-2 flex-wrap mb-2">
                    {PANEL_PRICES[pkgForm.connections as '1' | '2'].map(p => (
                      <button key={p.credits} onClick={() => setPkgForm(f => ({ ...f, credits: String(p.credits), price_paid: String(p.price_mxn), price_currency: 'MXN' }))}
                        className={`px-3 py-1.5 rounded text-xs border transition-all ${pkgForm.credits === String(p.credits) ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-600 text-slate-400 hover:border-indigo-500'}`}>
                        {p.credits} ({formatMXN(p.price_mxn)})
                      </button>
                    ))}
                  </div>
                  <input className="input" type="number" placeholder="O ingresa cantidad" value={pkgForm.credits} onChange={e => setPkgForm(f => ({ ...f, credits: e.target.value }))} />
                </div>
                <div>
                  <label>Precio pagado</label>
                  <div className="flex gap-2">
                    <input className="input" type="number" step="0.01" value={pkgForm.price_paid} onChange={e => setPkgForm(f => ({ ...f, price_paid: e.target.value }))} />
                    <select className="input w-24" value={pkgForm.price_currency} onChange={e => setPkgForm(f => ({ ...f, price_currency: e.target.value }))}>
                      <option>MXN</option><option>USD</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label>Fecha de compra</label>
                  <input className="input" type="date" value={pkgForm.purchase_date} onChange={e => setPkgForm(f => ({ ...f, purchase_date: e.target.value }))} />
                </div>
                <div>
                  <label>Notas</label>
                  <input className="input" value={pkgForm.notes} onChange={e => setPkgForm(f => ({ ...f, notes: e.target.value }))} placeholder="Opcional" />
                </div>
              </div>
              <div className="flex gap-3 mt-5">
                <button onClick={() => setShowPkgModal(false)} className="btn-secondary flex-1">Cancelar</button>
                <button onClick={handlePkgSave} disabled={saving} className="btn-primary flex-1 justify-center">{saving ? 'Guardando...' : 'Guardar'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showClientModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowClientModal(false)}>
          <div className="w-full max-w-sm rounded-xl overflow-hidden" style={{ background: '#1e293b', border: '1px solid #2d3f58' }}>
            <div className="p-5">
              <h2 className="text-lg font-bold text-white mb-5">{editingClient ? 'Editar cliente' : 'Nuevo cliente'}</h2>
              <div className="space-y-3">
                <div><label>Nombre *</label><input className="input" value={clientForm.name} onChange={e => setClientForm(f => ({ ...f, name: e.target.value }))} /></div>
                <div><label>Teléfono (WhatsApp)</label><input className="input" type="tel" value={clientForm.phone} onChange={e => setClientForm(f => ({ ...f, phone: e.target.value }))} placeholder="+52 xxx xxx xxxx" /></div>
                <div>
                  <label>País</label>
                  <select className="input" value={clientForm.country} onChange={e => setClientForm(f => ({ ...f, country: e.target.value }))}>
                    <option value="MX">México (MXN)</option>
                    <option value="US">Estados Unidos (USD)</option>
                    <option value="OTHER">Otro</option>
                  </select>
                </div>
                <div><label>Email</label><input className="input" type="email" value={clientForm.email} onChange={e => setClientForm(f => ({ ...f, email: e.target.value }))} /></div>
                <div><label>Notas</label><textarea className="input" rows={2} value={clientForm.notes} onChange={e => setClientForm(f => ({ ...f, notes: e.target.value }))} /></div>
              </div>
              <div className="flex gap-3 mt-5">
                <button onClick={() => setShowClientModal(false)} className="btn-secondary flex-1">Cancelar</button>
                <button onClick={handleClientSave} disabled={saving} className="btn-primary flex-1 justify-center">{saving ? 'Guardando...' : editingClient ? 'Actualizar' : 'Guardar'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showSubModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowSubModal(false)}>
          <div className="w-full max-w-sm rounded-xl overflow-hidden" style={{ background: '#1e293b', border: '1px solid #2d3f58' }}>
            <div className="p-5">
              <h2 className="text-lg font-bold text-white mb-5">Nueva suscripción</h2>
              <div className="space-y-3">
                <div>
                  <label>Cliente *</label>
                  <select className="input" value={subForm.client_id} onChange={e => setSubForm(f => ({ ...f, client_id: e.target.value }))}>
                    <option value="">Selecciona cliente</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label>Paquete de créditos (opcional)</label>
                  <select className="input" value={subForm.package_id} onChange={e => {
                    const pkgId = e.target.value
                    const pkg = packages.find(p => String(p.id) === pkgId)
                    // Auto-calcular costo del token si se selecciona paquete
                    const costoPorToken = pkg ? (pkg.price_paid / pkg.credits).toFixed(2) : ''
                    setSubForm(f => ({ ...f, package_id: pkgId, costo_token: costoPorToken || f.costo_token }))
                  }}>
                    <option value="">Sin descontar de paquete</option>
                    {packages.filter(p => p.credits_remaining > 0).map(p => (
                      <option key={p.id} value={p.id}>
                        {p.connections} conn · {p.credits_remaining} créd · {formatMXN(p.price_paid / p.credits)}/token
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>Conexiones</label>
                  <select className="input" value={subForm.connections} onChange={e => {
                    const c = e.target.value
                    const sp = SELL_PRICES[c as '1' | '2']?.find(p => p.months === parseInt(subForm.months))
                    setSubForm(f => ({ ...f, connections: c, price_charged: sp ? String(sp.price_mxn) : f.price_charged }))
                  }}>
                    <option value="1">1 equipo</option>
                    <option value="2">2 equipos</option>
                  </select>
                </div>
                <div>
                  <label>Meses</label>
                  <div className="flex gap-1.5 flex-wrap mb-2">
                    {[1, 3, 6].map(m => {
                      const sp = SELL_PRICES[subForm.connections as '1' | '2']?.find(p => p.months === m)
                      return (
                        <button key={m} onClick={() => setSubForm(f => ({ ...f, months: String(m), price_charged: sp ? String(sp.price_mxn) : f.price_charged }))}
                          className={`px-3 py-1.5 rounded text-xs border transition-all ${subForm.months === String(m) ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-600 text-slate-400 hover:border-indigo-500'}`}>
                          {m}m {sp ? `· ${formatMXN(sp.price_mxn)}` : ''}
                        </button>
                      )
                    })}
                  </div>
                  <input className="input" type="number" min="1" value={subForm.months} onChange={e => setSubForm(f => ({ ...f, months: e.target.value }))} />
                </div>
                <div>
                  <label>Precio cobrado *</label>
                  <div className="flex gap-2">
                    <input className="input" type="number" step="0.01" value={subForm.price_charged} onChange={e => setSubForm(f => ({ ...f, price_charged: e.target.value }))} />
                    <select className="input w-24" value={subForm.price_currency} onChange={e => setSubForm(f => ({ ...f, price_currency: e.target.value }))}>
                      <option>MXN</option><option>USD</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label>Fecha inicio *</label>
                  <input className="input" type="date" value={subForm.start_date} onChange={e => setSubForm(f => ({ ...f, start_date: e.target.value }))} />
                </div>
                {/* Código de cuenta */}
                <div>
                  <label>Código de cuenta (opcional)</label>
                  <input className="input" placeholder="Ej: BSCB, MARIO1..."
                    value={subForm.cuenta_codigo}
                    onChange={e => setSubForm(f => ({ ...f, cuenta_codigo: e.target.value.toUpperCase() }))} />
                  <p className="text-xs text-slate-500 mt-1">Identificador de la cuenta en el panel IPTV</p>
                </div>

                {/* Segundo cliente (solo en cuentas dobles) */}
                {subForm.connections === '2' && (
                  <div className="rounded-lg p-3 space-y-2" style={{ background: '#0f172a', border: '1px solid #2d3f58' }}>
                    <p className="text-xs font-medium text-slate-300">Segundo dispositivo (cuenta doble)</p>
                    <div>
                      <label className="text-xs text-slate-400">Cliente del 2do dispositivo</label>
                      <select className="input mt-1" value={subForm.segundo_cliente_id}
                        onChange={e => setSubForm(f => ({ ...f, segundo_cliente_id: e.target.value, segundo_es_propio: false }))}>
                        <option value="">Sin asignar</option>
                        <option value="propio">📱 Uso propio (sin cobro)</option>
                        {clients.filter(c => String(c.id) !== subForm.client_id).map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                    {subForm.segundo_cliente_id && subForm.segundo_cliente_id !== 'propio' && (
                      <div>
                        <label className="text-xs text-slate-400">Precio cobrado al 2do cliente (MXN)</label>
                        <input className="input mt-1" type="number" step="0.01" placeholder="0.00"
                          value={subForm.segundo_precio}
                          onChange={e => setSubForm(f => ({ ...f, segundo_precio: e.target.value }))} />
                      </div>
                    )}
                  </div>
                )}

                {/* Costo del token */}
                <div>
                  <label>Costo del token (MXN)</label>
                  <input className="input" type="number" step="0.01"
                    placeholder="Ej: 90 (2,700÷30 dobles)"
                    value={subForm.costo_token}
                    onChange={e => setSubForm(f => ({ ...f, costo_token: e.target.value }))} />
                  {subForm.price_charged && subForm.costo_token && (
                    <p className="text-xs mt-1" style={{
                      color: (parseFloat(subForm.price_charged) + parseFloat(subForm.segundo_precio || '0') - parseFloat(subForm.costo_token)) >= 0
                        ? '#22c55e' : '#ef4444'
                    }}>
                      Ganancia = {fmt(
                        parseFloat(subForm.price_charged) +
                        parseFloat(subForm.segundo_precio || '0') -
                        parseFloat(subForm.costo_token)
                      )}
                    </p>
                  )}
                </div>
                <div><label>Notas</label><input className="input" value={subForm.notes} onChange={e => setSubForm(f => ({ ...f, notes: e.target.value }))} /></div>
              </div>
              <div className="flex gap-3 mt-5">
                <button onClick={() => setShowSubModal(false)} className="btn-secondary flex-1">Cancelar</button>
                <button onClick={handleSubSave} disabled={saving} className="btn-primary flex-1 justify-center">{saving ? 'Guardando...' : 'Crear suscripción'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* ── MODAL: EDITAR SUSCRIPCIÓN ── */}
      {editingSub && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setEditingSub(null)}>
          <div className="w-full max-w-sm rounded-xl overflow-hidden" style={{ background: '#1e293b', border: '1px solid #2d3f58' }}>
            <div className="p-5">
              <h2 className="text-lg font-bold text-white mb-1">Editar suscripción</h2>
              <p className="text-sm text-slate-400 mb-5">
                {editingSub.client_name} · {editingSub.connections} equipo{editingSub.connections > 1 ? 's' : ''}
              </p>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Precio cobrado *</label>
                  <div className="flex gap-2">
                    <input className="input flex-1" type="number" step="0.01"
                      value={editSubForm.price_charged}
                      onChange={e => setEditSubForm(f => ({ ...f, price_charged: e.target.value }))} />
                    <select className="input w-24"
                      value={editSubForm.price_currency}
                      onChange={e => setEditSubForm(f => ({ ...f, price_currency: e.target.value }))}>
                      <option>MXN</option><option>USD</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Costo del token (MXN)</label>
                  <input className="input w-full" type="number" step="0.01"
                    placeholder="Ej: 90 para 1 doble (2700÷30)"
                    value={editSubForm.costo_token}
                    onChange={e => setEditSubForm(f => ({ ...f, costo_token: e.target.value }))} />
                  <p className="text-xs text-slate-500 mt-1">
                    2700 ÷ 30 dobles = <span className="text-white">$90/token</span>
                  </p>
                </div>
                {/* Vista previa de ganancia */}
                {editSubForm.price_charged && (
                  <div className="rounded-lg p-3" style={{ background: '#0f172a' }}>
                    <div className="flex justify-between text-xs text-slate-400 mb-1">
                      <span>Cobrado</span>
                      <span className="text-white">{fmt(parseFloat(editSubForm.price_charged) || 0)}</span>
                    </div>
                    {editSubForm.costo_token && (
                      <div className="flex justify-between text-xs text-slate-400 mb-1">
                        <span>Costo token</span>
                        <span className="text-red-400">−{fmt(parseFloat(editSubForm.costo_token) || 0)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm font-bold pt-1" style={{ borderTop: '1px solid #2d3f58' }}>
                      <span className="text-slate-300">Ganancia</span>
                      <span className={
                        (parseFloat(editSubForm.price_charged) - (parseFloat(editSubForm.costo_token) || 0)) >= 0
                          ? 'text-green-400' : 'text-red-400'
                      }>
                        {fmt((parseFloat(editSubForm.price_charged) || 0) - (parseFloat(editSubForm.costo_token) || 0))}
                      </span>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Fecha inicio</label>
                    <input className="input w-full" type="date"
                      value={editSubForm.start_date}
                      onChange={e => setEditSubForm(f => ({ ...f, start_date: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Fecha fin</label>
                    <input className="input w-full" type="date"
                      value={editSubForm.end_date}
                      onChange={e => setEditSubForm(f => ({ ...f, end_date: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Estado</label>
                  <select className="input w-full"
                    value={editSubForm.status}
                    onChange={e => setEditSubForm(f => ({ ...f, status: e.target.value }))}>
                    <option value="activo">Activo</option>
                    <option value="vencido">Vencido</option>
                    <option value="cancelado">Cancelado</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Notas</label>
                  <input className="input w-full"
                    value={editSubForm.notes}
                    onChange={e => setEditSubForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="Ej: Mario + uso propio" />
                </div>
              </div>
              <div className="flex gap-3 mt-5">
                <button onClick={() => setEditingSub(null)} className="btn-secondary flex-1">Cancelar</button>
                <button onClick={handleEditSubSave} disabled={saving} className="btn-primary flex-1 justify-center">
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
