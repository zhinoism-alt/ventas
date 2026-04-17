import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom'
import { ClerkProvider } from '@clerk/clerk-react'
import { navLinkClass } from './lib/utils'
import {
  LayoutDashboard, Package, Tv, BarChart3, Menu, X,
  DollarSign, RefreshCw, Wifi, WifiOff, LogOut, ChevronDown,
  Wallet, Heart, PiggyBank, Truck, Leaf
} from 'lucide-react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Inventory from './pages/Inventory'
import IPTV from './pages/IPTV'
import Reports from './pages/Reports'
import Presupuesto from './pages/Presupuesto'
import Personal from './pages/Personal'
import Ahorros from './pages/Ahorros'
import Mudanza from './pages/Mudanza'
import Pareja from './pages/Pareja'
import Bienestar from './pages/Bienestar'
import { getExchangeRate, refreshExchangeRate, getWhatsAppStatus } from './lib/api'

// ─── Layout protegido ─────────────────────────────────────────────────────────
function Layout() {
  const { usuario, logout } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [rate, setRate] = useState<number>(17.5)
  const [rateDate, setRateDate] = useState('')
  const [waStatus, setWaStatus] = useState('checking')
  const [menuUsuario, setMenuUsuario] = useState(false)
  const location = useLocation()

  // Cerrar sidebar al cambiar de ruta
  useEffect(() => { setSidebarOpen(false) }, [location.pathname])

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
    { to: '/',            icon: <LayoutDashboard size={18} />, label: 'Dashboard',    group: 'negocio' },
    { to: '/inventario',  icon: <Package size={18} />,         label: 'Inventario',   group: 'negocio' },
    { to: '/iptv',        icon: <Tv size={18} />,              label: 'IPTV',         group: 'negocio' },
    { to: '/presupuesto', icon: <Wallet size={18} />,          label: 'Presupuesto',  group: 'negocio' },
    { to: '/reportes',    icon: <BarChart3 size={18} />,       label: 'Reportes',     group: 'negocio' },
    { to: '/ahorros',     icon: <PiggyBank size={18} />,       label: 'Ahorros',      group: 'vida' },
    { to: '/mudanza',     icon: <Truck size={18} />,           label: 'Mudanza',      group: 'vida' },
    { to: '/pareja',      icon: <Heart size={18} />,           label: 'Pareja',       group: 'vida' },
    { to: '/bienestar',   icon: <Leaf size={18} />,            label: 'Bienestar',    group: 'vida' },
    { to: '/personal',    icon: <LayoutDashboard size={18} />, label: 'Personal',     group: 'vida' },
  ]

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#0f172a' }}>
      {/* Overlay mobile */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed md:static z-50 h-full flex flex-col transition-all duration-300
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'} w-64`}
        style={{ background: '#0a0f1e', borderRight: '1px solid #1e293b' }}>

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

        {/* Navegacion */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          <p className="text-xs text-slate-600 font-medium px-2 mb-1 mt-1 uppercase tracking-wider">Negocio</p>
          {navItems.filter(i => i.group === 'negocio').map(item => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'}
              className={({ isActive }) => navLinkClass(isActive)}>
              {item.icon}
              {item.label}
            </NavLink>
          ))}
          <p className="text-xs text-slate-600 font-medium px-2 mb-1 mt-3 uppercase tracking-wider">Vida Personal</p>
          {navItems.filter(i => i.group === 'vida').map(item => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'}
              className={({ isActive }) => navLinkClass(isActive)}>
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Info inferior */}
        <div className="p-3 space-y-2" style={{ borderTop: '1px solid #1e293b' }}>
          {/* Tipo de cambio */}
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

          {/* Estado WhatsApp */}
          <div className="flex items-center gap-2 px-1">
            {waStatus === 'connected'
              ? <><Wifi size={12} className="text-green-400" /><span className="text-xs text-green-400">WhatsApp activo</span></>
              : <><WifiOff size={12} className="text-slate-500" /><span className="text-xs text-slate-500">WhatsApp sin conectar</span></>
            }
          </div>

          {/* Menu de usuario */}
          <div className="relative">
            <button
              onClick={() => setMenuUsuario(m => !m)}
              className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs transition-colors hover:bg-slate-800"
              style={{ border: '1px solid #2d3f58' }}
            >
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-white font-bold text-xs"
                  style={{ background: usuario?.rol === 'admin' ? '#6366f1' : '#0891b2' }}>
                  {usuario?.nombre?.[0] || '?'}
                </div>
                <div className="text-left">
                  <p className="text-white font-medium">{usuario?.nombre}</p>
                  <p className="text-slate-500" style={{ fontSize: '10px' }}>
                    {usuario?.rol === 'admin' ? 'Administrador' : 'Editor'}
                  </p>
                </div>
              </div>
              <ChevronDown size={12} className={`text-slate-400 transition-transform ${menuUsuario ? 'rotate-180' : ''}`} />
            </button>

            {menuUsuario && (
              <div className="absolute bottom-full left-0 right-0 mb-1 rounded-lg overflow-hidden shadow-lg"
                style={{ background: '#1e293b', border: '1px solid #2d3f58' }}>
                <button
                  onClick={() => { setMenuUsuario(false); logout() }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-red-400 hover:bg-red-900/30 transition-colors"
                >
                  <LogOut size={13} /> Cerrar sesion
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Contenido principal */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Barra superior mobile */}
        <header className="md:hidden flex items-center gap-3 p-4"
          style={{ background: '#0a0f1e', borderBottom: '1px solid #1e293b' }}>
          <button onClick={() => setSidebarOpen(true)} className="text-slate-400">
            <Menu size={20} />
          </button>
          <span className="font-bold text-white text-sm">VentasPro</span>
        </header>

        <main className="flex-1 overflow-auto p-4 md:p-6">
          <Routes>
            <Route path="/"            element={<Dashboard />} />
            <Route path="/inventario"  element={<Inventory />} />
            <Route path="/iptv"        element={<IPTV />} />
            <Route path="/presupuesto" element={<Presupuesto />} />
            <Route path="/reportes"    element={<Reports />} />
            <Route path="/ahorros"     element={<Ahorros />} />
            <Route path="/mudanza"     element={<Mudanza />} />
            <Route path="/pareja"      element={<Pareja />} />
            <Route path="/bienestar"   element={<Bienestar />} />
            <Route path="/personal"    element={<Personal />} />
            <Route path="*"            element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

// ─── Ruta protegida ───────────────────────────────────────────────────────────
function LayoutProtegido() {
  const { usuario, cargando } = useAuth()

  if (cargando) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0f172a' }}>
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-slate-400 text-sm">Verificando sesion...</p>
        </div>
      </div>
    )
  }

  if (!usuario) return <Navigate to="/login" replace />
  return <Layout />
}

// Si ya tienes sesion y vas a /login, redirige al dashboard
function LoginGuard() {
  const { usuario, cargando } = useAuth()
  if (cargando) return null
  if (usuario) return <Navigate to="/" replace />
  return <Login />
}

// ─── App raiz ─────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <ClerkProvider publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginGuard />} />
            <Route path="/*"     element={<LayoutProtegido />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ClerkProvider>
  )
}
