import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { sentryVitePlugin } from '@sentry/vite-plugin'

export default defineConfig({
  plugins: [
    react(),
    // Sentry source maps — only active when SENTRY_AUTH_TOKEN is set
    ...(process.env.SENTRY_AUTH_TOKEN ? [
      sentryVitePlugin({
        org: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
        authToken: process.env.SENTRY_AUTH_TOKEN,
      })
    ] : []),
  ],
  build: {
    sourcemap: true,
  },
  server: {
    port: 5173,
    host: true,
    // In dev, proxy /api to the local Vercel dev server (vercel dev) or Express
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      }
    }
  }
})
