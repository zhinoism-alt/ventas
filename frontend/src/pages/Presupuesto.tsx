import { useState } from 'react'
import { ExternalLink, RefreshCw, Maximize2 } from 'lucide-react'

const SHEETS_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT2YTKIDdQ4aW22utLTZFGw0ZNvCMSz5Eh9fx4JSMsRQSvAoXNpA2bSRFs2VESqhe_m2nLjApHaM3vr/pubhtml'

export default function Presupuesto() {
  const [key, setKey] = useState(0)
  const [pantalla, setPantalla] = useState(false)

  return (
    <div className={`space-y-4 ${pantalla ? 'fixed inset-0 z-50 p-0' : 'max-w-7xl mx-auto'}`}
      style={pantalla ? { background: '#0f172a' } : {}}>

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 px-1">
        <div>
          <h1 className="text-2xl font-bold text-white">Presupuesto Personal</h1>
          <p className="text-slate-400 text-sm mt-0.5">Dashboard financiero — datos en tiempo real desde Google Sheets</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setKey(k => k + 1)}
            className="btn-secondary"
            title="Recargar"
          >
            <RefreshCw size={14} /> Recargar
          </button>
          <button
            onClick={() => setPantalla(p => !p)}
            className="btn-secondary"
            title="Pantalla completa"
          >
            <Maximize2 size={14} /> {pantalla ? 'Reducir' : 'Pantalla completa'}
          </button>
          <a
            href={SHEETS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary"
          >
            <ExternalLink size={14} /> Abrir en Google Sheets
          </a>
        </div>
      </div>

      {/* iframe */}
      <div
        className="rounded-xl overflow-hidden"
        style={{
          border: '1px solid #2d3f58',
          height: pantalla ? 'calc(100vh - 80px)' : 'calc(100vh - 180px)',
          minHeight: 500,
        }}
      >
        <iframe
          key={key}
          src={SHEETS_URL}
          width="100%"
          height="100%"
          frameBorder="0"
          title="Presupuesto Personal"
          style={{ background: '#fff' }}
        />
      </div>
    </div>
  )
}
