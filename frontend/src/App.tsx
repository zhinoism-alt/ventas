import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Package, Tv, BarChart3, Menu, X,
  DollarSign, RefreshCw, Wifi, WifiOff
} from 'lucide-react'
import Dashboard from './pages/Dashboard'
import Inventory from './pages/Inventory'
import IPTV from './pages/IPTV'
import Reports from './pages/Reports'
import { getExchangeRate, refreshExchangeRate, getWhatsAppStatus } from './lib/api'

function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [rate, setRate] = useState<number>(17.5)
  const [rateDate, setRateDate] = useState('')
  const [waStatus, setWaStatus] = useState('checking')
  const location = useLocation()

  useEffect(() => {
    getExchangeRate().then(r => {
      setRate(r.data.usd_to_mxn)
      setRateDate(r.data.updated_at?.split('T')[0] || '')
    }).catch(() => {})
    getWhatsAppStatus().then(r => setWaStatus(r.data.status)).catch(() => setWaStatus('disabled'))
  }, [])

  const handleRefreshRate = async () => {
    try {
      const r = await refreshExchangeRate()
      setRate(r.data.usd_to_mxn)
      setRateDate(new Date().toISOString().split('T')[0])
    } catch { alert('No se pudo actualizar el tipo de cambio') }
  }

  const navItems = [
    { to: '/', icon: <LayoutDashboard size={18} />, label: 'Dashboard' },
    { to: '/inventario', icon: <Package size={18} />, label: 'Inventario' },
    { to: '/iptv', icon: <Tv size={18} />, label: 'IPTV' },
    { to: '/reportes', icon: <BarChart3 size={18} />, label: 'Reportes' },
  ]

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#0f172a' }}>
      {/* Sidebar overlay on mobile */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed md:static z-50 h-full flex flex-col transition-all duration-300
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        w-64`} style={{ background: '#0a0f1e', borderRight: '1px solid #1e293b' }}>

        {/* Logo */}
        <div className="p-4 flex items-center justify-between" style={{ borderBottom: '1px solid #1e293b' }}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>VP</div>
            <span className="font-bold text-white text-sm">VentasPro</span>
          </div>
          <button className="md:hidden text-slate-400" onClick={() => setSidebarOpen(false)}>
            <X size={18} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map(item => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150
                ${isActive
                  ? 'bg-indigo-600 text-white font-medium'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`
              }>
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Bottom info */}
        <div className="p-3 space-y-2" style={{ borderTop: '1px solid #1e293b' }}>
          {/* Exchange rate */}
          <div className="rounded-lg p-2.5" style={{ background: '#1e293b' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <DollarSign size={12} className="text-green-400" />
                <span>1 USD = <span className="text-green-400 font-semibold">${rate.toFixed(2)}</span> MXN</span>
              </div>
              <button onClick={handleRefreshRate} className="text-slate-500 hover:text-indigo-400 transition-colors">
                <RefreshCw size={12} />
              </button>
            </div>
            {rateDate && <div className="text-xs text-slate-600 mt-0.5">Act. {rateDate}</div>}
          </div>
          {/* WhatsApp status */}
          <div className="flex items-center gap-2 px-1">
            {waStatus === 'connected'
              ? <><Wifi size={12} className="text-green-400" /><span className="text-xs text-green-400">WhatsApp activo</span></>
              : <><WifiOff size={12} className="text-slate-500" /><span className="text-xs text-slate-500">WhatsApp sin conectar</span></>
            }
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile top bar */}
        <header className="md:hidden flex items-center gap-3 p-4" style={{ background: '#0a0f1e', borderBottom: '1px solid #1e293b' }}>
          <button onClick={() => setSidebarOpen(true)} className="text-slate-400">
            <Menu size={20} />
          </button>
          <span className="font-bold text-white text-sm">VentasPro</span>
        </header>

        <main className="flex-1 overflow-auto p-4 md:p-6">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/inventario" element={<Inventory />} />
            <Route path="/iptv" element={<IPTV />} />
            <Route path="/reportes" element={<Reports />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Layout />
    </BrowserRouter>
  )
}
