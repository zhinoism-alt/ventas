import { useState, useEffect, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ClerkProvider } from '@clerk/clerk-react'
import { navLinkClass } from './lib/utils'
import {
  LayoutDashboard, Package, Tv, BarChart3, Menu, X,
  DollarSign, RefreshCw, Wifi, WifiOff, LogOut, ChevronDown,
  Wallet, PiggyBank, FileSpreadsheet, Briefcase, Sun, Moon, Search,
  Calendar as CalendarIcon, ShoppingCart, Sparkles,
} from 'lucide-react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Login from './pages/Login'
import { LimiteDeError } from './components/LimiteDeError'

// Cargadas bajo demanda: el bundle era un solo chunk de 1.6 MB, y nadie
// abre las doce paginas en una sesion.
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Inventory = lazy(() => import('./pages/Inventory'))
const IPTV = lazy(() => import('./pages/IPTV'))
const Reports = lazy(() => import('./pages/Reports'))
const Presupuesto = lazy(() => import('./pages/Presupuesto'))
const Personal = lazy(() => import('./pages/Personal'))
const Ahorros = lazy(() => import('./pages/Ahorros'))
const SheetsSync = lazy(() => import('./pages/SheetsSync'))
const Empleo = lazy(() => import('./pages/Empleo'))
const Consulta = lazy(() => import('./pages/Consulta'))
const Calendario = lazy(() => import('./pages/Calendario'))
const ListaSuper = lazy(() => import('./pages/ListaSuper'))
const Limpieza = lazy(() => import('./pages/Limpieza'))
import { getExchangeRate, refreshExchangeRate, getWhatsAppStatus } from './lib/api'

// ─── Tema ─────────────────────────────────────────────────────────────────────
// Sin eleccion guardada seguimos al sistema: no estampamos data-theme y el
// media query de index.css decide. Al elegir, el atributo gana sobre el media.
type Tema = 'light' | 'dark' | 'system'

function useTema() {
  const [tema, setTema] = useState<Tema>(() => {
    try { return (localStorage.getItem('vp-tema') as Tema) || 'system' } catch { return 'system' }
  })

  useEffect(() => {
    const raiz = document.documentElement
    if (tema === 'system') raiz.removeAttribute('data-theme')
    else raiz.setAttribute('data-theme', tema)
    try { localStorage.setItem('vp-tema', tema) } catch { /* modo privado */ }
  }, [tema])

  return { tema, setTema }
}

// ─── Layout protegido ─────────────────────────────────────────────────────────
function Layout() {
  const { usuario, logout } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [rate, setRate] = useState<number>(17.5)
  const [rateDate, setRateDate] = useState('')
  const [waStatus, setWaStatus] = useState('checking')
  const [menuUsuario, setMenuUsuario] = useState(false)
  const { tema, setTema } = useTema()
  const location = useLocation()
  const navegar = useNavigate()

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
    { to: '/presupuesto', icon: <Wallet size={18} />,           label: 'Presupuesto',  group: 'negocio' },
    { to: '/reportes',    icon: <BarChart3 size={18} />,        label: 'Reportes',     group: 'negocio' },
    { to: '/sheets',      icon: <FileSpreadsheet size={18} />,  label: 'Sheets Sync',  group: 'negocio' },
    { to: '/ahorros',     icon: <PiggyBank size={18} />,       label: 'Ahorros',      group: 'vida' },
    { to: '/personal',    icon: <LayoutDashboard size={18} />, label: 'Personal',     group: 'vida' },
    { to: '/calendario',  icon: <CalendarIcon size={18} />,    label: 'Calendario',   group: 'vida' },
    { to: '/super',       icon: <ShoppingCart size={18} />,    label: 'Lista de Super', group: 'vida' },
    { to: '/limpieza',    icon: <Sparkles size={18} />,        label: 'Limpieza',     group: 'vida' },
    { to: '/empleo',      icon: <Briefcase size={18} />,       label: 'Empleo',       group: 'vida' },
    { to: '/consulta',    icon: <Search size={18} />,          label: 'Consulta',     group: 'vida' },
  ]

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg)' }}>
      {/* Overlay mobile */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed md:static z-50 h-full flex flex-col transition-all duration-300
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'} w-64`}
        style={{ background: 'var(--bg-deep)', borderRight: '1px solid var(--border)' }}>

        {/* Logo */}
        <div className="p-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
              style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-2))' }}>VP</div>
            <span className="font-bold text-white text-sm">VentasPro</span>
          </div>
          <button className="md:hidden text-muted" onClick={() => setSidebarOpen(false)}>
            <X size={18} />
          </button>
        </div>

        {/* Navegacion */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          <p className="text-xs text-faint font-medium px-2 mb-1 mt-1 uppercase tracking-wider">Negocio</p>
          {navItems.filter(i => i.group === 'negocio').map(item => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'}
              className={({ isActive }) => navLinkClass(isActive)}>
              {item.icon}
              {item.label}
            </NavLink>
          ))}
          <p className="text-xs text-faint font-medium px-2 mb-1 mt-3 uppercase tracking-wider">Vida Personal</p>
          {navItems.filter(i => i.group === 'vida').map(item => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'}
              className={({ isActive }) => navLinkClass(isActive)}>
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Info inferior */}
        <div className="p-3 space-y-2" style={{ borderTop: '1px solid var(--border)' }}>
          {/* Tipo de cambio */}
          <div className="rounded-lg p-2.5" style={{ background: 'var(--surface-2)' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs text-muted">
                <DollarSign size={12} className="text-green-400" />
                <span>1 USD = <span className="text-green-400 font-semibold">${rate.toFixed(2)}</span> MXN</span>
              </div>
              <button onClick={handleRefreshRate} className="text-dim hover:text-indigo-400 transition-colors">
                <RefreshCw size={12} />
              </button>
            </div>
            {rateDate && <div className="text-xs text-faint mt-0.5">Act. {rateDate}</div>}
          </div>

          {/* Tema */}
          <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'var(--surface-2)' }}>
            {([['light', Sun, 'Claro'], ['system', null, 'Auto'], ['dark', Moon, 'Oscuro']] as const).map(
              ([valor, Icono, etiqueta]) => (
                <button key={valor} onClick={() => setTema(valor)} title={etiqueta}
                  aria-pressed={tema === valor}
                  className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-xs font-medium transition-colors"
                  style={tema === valor
                    ? { background: 'var(--bg-card)', color: 'var(--text)', boxShadow: 'var(--sh-sm)' }
                    : { color: 'var(--text-muted)' }}>
                  {Icono ? <Icono size={12} /> : null}{etiqueta}
                </button>
              ))}
          </div>

          {/* Estado WhatsApp */}
          <div className="flex items-center gap-2 px-1">
            {waStatus === 'connected'
              ? <><Wifi size={12} className="text-green-400" /><span className="text-xs text-green-400">WhatsApp activo</span></>
              : <><WifiOff size={12} className="text-dim" /><span className="text-xs text-dim">WhatsApp sin conectar</span></>
            }
          </div>

          {/* Menu de usuario */}
          <div className="relative">
            <button
              onClick={() => setMenuUsuario(m => !m)}
              className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs transition-colors hover:surface-2"
              style={{ border: '1px solid var(--border-hi)' }}
            >
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-white font-bold text-xs"
                  style={{ background: usuario?.rol === 'admin' ? 'var(--accent)' : '#0891b2' }}>
                  {usuario?.nombre?.[0] || '?'}
                </div>
                <div className="text-left">
                  <p className="text-strong font-medium">{usuario?.nombre}</p>
                  <p className="text-dim" style={{ fontSize: '10px' }}>
                    {usuario?.rol === 'admin' ? 'Administrador' : 'Editor'}
                  </p>
                </div>
              </div>
              <ChevronDown size={12} className={`text-muted transition-transform ${menuUsuario ? 'rotate-180' : ''}`} />
            </button>

            {menuUsuario && (
              <div className="absolute bottom-full left-0 right-0 mb-1 rounded-lg overflow-hidden shadow-lg"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border-hi)' }}>
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
        {/* El boton de menu y el titulo viven fuera de las rutas y ahora
            sobreviven a que una pagina falle: el limite de error esta dentro
            del <main>. Antes se caia todo junto y solo quedaba recargar. */}
        <header className="md:hidden flex items-center gap-3 p-4"
          style={{ background: 'var(--bg-deep)', borderBottom: '1px solid var(--border)' }}>
          <button onClick={() => setSidebarOpen(true)} className="text-muted"
                  aria-label="Abrir menú">
            <Menu size={20} />
          </button>
          <NavLink to="/" className="font-bold text-strong text-sm">VentasPro</NavLink>
        </header>

        <main className="flex-1 overflow-auto p-4 md:p-6">
          <LimiteDeError claveReinicio={location.pathname} onIrAlInicio={() => navegar('/')}>
          <Suspense fallback={
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin w-8 h-8 border-2 rounded-full"
                style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
            </div>
          }>
          <Routes>
            <Route path="/"            element={<Dashboard />} />
            <Route path="/inventario"  element={<Inventory />} />
            <Route path="/iptv"        element={<IPTV />} />
            <Route path="/presupuesto" element={<Presupuesto />} />
            <Route path="/reportes"    element={<Reports />} />
            <Route path="/ahorros"     element={<Ahorros />} />
            <Route path="/personal"    element={<Personal />} />
            <Route path="/calendario"  element={<Calendario />} />
            <Route path="/super"       element={<ListaSuper />} />
            <Route path="/limpieza"    element={<Limpieza />} />
            <Route path="/empleo"      element={<Empleo />} />
            <Route path="/consulta"    element={<Consulta />} />
            <Route path="/sheets"      element={<SheetsSync />} />
            <Route path="*"            element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
          </LimiteDeError>
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
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted text-sm">Verificando sesion...</p>
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
