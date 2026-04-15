import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL ?? ''

const api = axios.create({ baseURL: `${BASE_URL}/api` })

// Si el servidor devuelve 401, redirigir al login
api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401 && window.location.pathname !== '/login') {
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authLogin = (username: string, password: string) =>
  api.post('/auth/login', { username, password })
export const authLogout = () => api.post('/auth/logout')
export const authMe = () => api.get('/auth/me')

// ── Productos ─────────────────────────────────────────────────────────────────
export const getProducts = (params?: object) => api.get('/products', { params })
export const createProduct = (data: object) => api.post('/products', data)
export const updateProduct = (id: number, data: object) => api.put(`/products/${id}`, data)
export const deleteProduct = (id: number) => api.delete(`/products/${id}`)
export const sellProduct = (id: number, data: object) => api.post(`/products/${id}/sell`, data)
export const getFBPost = (id: number) => api.get(`/products/${id}/fb-post`)
export const getProductStats = () => api.get('/products/meta/stats')
export const getCategories = () => api.get('/products/meta/categories')

// ── Ventas ────────────────────────────────────────────────────────────────────
export const getSales = (params?: object) => api.get('/sales', { params })
export const getSalesStats = () => api.get('/sales/stats')
export const getMonthlySales = () => api.get('/sales/monthly')
export const deleteSale = (id: number) => api.delete(`/sales/${id}`)

// ── IPTV ──────────────────────────────────────────────────────────────────────
export const getIPTVPackages = () => api.get('/iptv/packages')
export const getIPTVBalance = () => api.get('/iptv/packages/balance')
export const createIPTVPackage = (data: object) => api.post('/iptv/packages', data)
export const deleteIPTVPackage = (id: number) => api.delete(`/iptv/packages/${id}`)

export const getIPTVClients = () => api.get('/iptv/clients')
export const createIPTVClient = (data: object) => api.post('/iptv/clients', data)
export const updateIPTVClient = (id: number, data: object) => api.put(`/iptv/clients/${id}`, data)
export const deleteIPTVClient = (id: number) => api.delete(`/iptv/clients/${id}`)

export const getIPTVSubscriptions = (params?: object) => api.get('/iptv/subscriptions', { params })
export const getExpiringSubscriptions = (days?: number) => api.get('/iptv/subscriptions/expiring', { params: { days } })
export const createIPTVSubscription = (data: object) => api.post('/iptv/subscriptions', data)
export const updateSubscriptionStatus = (id: number, status: string) => api.put(`/iptv/subscriptions/${id}/status`, { status })
export const deleteIPTVSubscription = (id: number) => api.delete(`/iptv/subscriptions/${id}`)

export const getIPTVStats = () => api.get('/iptv/stats')
export const getIPTVPricing = () => api.get('/iptv/pricing')

// ── Reportes ──────────────────────────────────────────────────────────────────
export const getSummary = () => api.get('/reports/summary')
export const getMonthlyReport = (year?: number) => api.get('/reports/monthly', { params: { year } })
export const exportExcel = (from?: string, to?: string) => {
  const params = new URLSearchParams()
  if (from) params.append('from', from)
  if (to) params.append('to', to)
  window.open(`${BASE_URL}/api/reports/export?${params.toString()}`, '_blank')
}

// ── Tipo de cambio ─────────────────────────────────────────────────────────────
export const getExchangeRate = () => api.get('/exchange-rate')
export const refreshExchangeRate = () => api.post('/exchange-rate/refresh')

// ── WhatsApp ──────────────────────────────────────────────────────────────────
export const getWhatsAppStatus = () => api.get('/whatsapp/status')
export const getWhatsAppQR = () => api.get('/whatsapp/qr')
export const sendWhatsApp = (phone: string, message: string) => api.post('/whatsapp/send', { phone, message })
export const getPreviewRenewals = (days?: number) => api.get('/whatsapp/preview-renewals', { params: { days } })
export const sendRenewalReminders = (days?: number) => api.post('/whatsapp/send-renewals', { days })

// ── Helpers de formato ────────────────────────────────────────────────────────
export const formatMXN = (amount: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount || 0)

export const formatUSD = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount || 0)

export const toMXN = (price: number, currency: string, rate: number) =>
  currency === 'USD' ? price * rate : price
