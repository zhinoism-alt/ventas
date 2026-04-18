import React from 'react'
import ReactDOM from 'react-dom/client'
import * as Sentry from '@sentry/react'
import posthog from 'posthog-js'
import App from './App'
import './index.css'

// ── Sentry ────────────────────────────────────────────────────────────────────
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.1,
    environment: import.meta.env.MODE,
  })
}

// ── PostHog ───────────────────────────────────────────────────────────────────
if (import.meta.env.VITE_POSTHOG_KEY) {
  posthog.init(import.meta.env.VITE_POSTHOG_KEY, {
    api_host: import.meta.env.VITE_POSTHOG_HOST ?? 'https://app.posthog.com',
    capture_pageview: true,
    persistence: 'localStorage',
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0f172a' }}>
        <div className="text-center space-y-3">
          <p className="text-red-400 font-medium">Algo salió mal.</p>
          <button onClick={() => window.location.reload()} className="text-sm text-indigo-400 underline">
            Recargar página
          </button>
        </div>
      </div>
    }>
      <App />
    </Sentry.ErrorBoundary>
  </React.StrictMode>,
)
