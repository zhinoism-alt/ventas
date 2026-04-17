import { useState } from 'react'
import { ExternalLink, RefreshCw, Maximize2, ChevronDown } from 'lucide-react'

interface Section {
  key: string
  label: string
  emoji: string
  description: string
  url?: string
  type: 'iframe' | 'placeholder'
  color: string
}

const SECTIONS: Section[] = [
  {
    key: 'mudanza',
    label: 'Plan de Mudanza',
    emoji: '🏠',
    description: 'Checklist y organizacion para la mudanza',
    type: 'placeholder',
    color: '#6366f1',
  },
  {
    key: 'peso-yo',
    label: 'Mejora de Peso - Brandon',
    emoji: '💪',
    description: 'Seguimiento de ejercicio, dieta y progreso personal',
    type: 'placeholder',
    color: '#22c55e',
  },
  {
    key: 'peso-itzel',
    label: 'Mejora de Peso - Itzel',
    emoji: '🌸',
    description: 'Seguimiento de ejercicio, dieta y progreso de Itzel',
    type: 'placeholder',
    color: '#ec4899',
  },
  {
    key: 'terapia',
    label: 'Terapia',
    emoji: '🧠',
    description: 'Notas, reflexiones y seguimiento de terapia',
    type: 'placeholder',
    color: '#f59e0b',
  },
  {
    key: 'presupuesto',
    label: 'Presupuesto Personal',
    emoji: '💰',
    description: 'Dashboard financiero desde Google Sheets',
    url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT2YTKIDdQ4aW22utLTZFGw0ZNvCMSz5Eh9fx4JSMsRQSvAoXNpA2bSRFs2VESqhe_m2nLjApHaM3vr/pubhtml',
    type: 'iframe',
    color: '#06b6d4',
  },
]

function PlaceholderCard({ section, onSetUrl }: { section: Section; onSetUrl: (key: string, url: string) => void }) {
  const [input, setInput] = useState('')
  const [editing, setEditing] = useState(false)

  return (
    <div className="rounded-xl p-6 text-center space-y-4"
      style={{ background: '#1e293b', border: `1px solid ${section.color}44` }}>
      <div className="text-4xl">{section.emoji}</div>
      <div>
        <h3 className="text-white font-semibold text-lg">{section.label}</h3>
        <p className="text-slate-400 text-sm mt-1">{section.description}</p>
      </div>
      <div className="space-y-2">
        <p className="text-slate-500 text-xs">Pega el link de tu Google Doc, Notion, o cualquier URL embebible:</p>
        {editing ? (
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="https://docs.google.com/..."
              className="flex-1 text-xs rounded-lg px-3 py-2 text-white bg-slate-900 border border-slate-600 focus:border-indigo-500 outline-none"
            />
            <button
              onClick={() => { if (input.trim()) { onSetUrl(section.key, input.trim()); setEditing(false) } }}
              className="px-3 py-2 rounded-lg text-xs font-medium text-white"
              style={{ background: section.color }}
            >Guardar</button>
            <button onClick={() => setEditing(false)} className="px-3 py-2 rounded-lg text-xs text-slate-400 bg-slate-700">X</button>
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="px-4 py-2 rounded-lg text-xs font-medium text-white transition-opacity hover:opacity-80"
            style={{ background: section.color + 'cc' }}
          >
            + Agregar URL
          </button>
        )}
      </div>
    </div>
  )
}

function IframeCard({ section, url }: { section: Section; url: string }) {
  const [key, setKey] = useState(0)
  const [fullscreen, setFullscreen] = useState(false)

  return (
    <div className={fullscreen ? 'fixed inset-0 z-50 flex flex-col' : 'space-y-3'}
      style={fullscreen ? { background: '#0f172a', padding: '12px' } : {}}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xl">{section.emoji}</span>
          <div>
            <h3 className="text-white font-semibold text-sm">{section.label}</h3>
            <p className="text-slate-500 text-xs">{section.description}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setKey(k => k + 1)} className="btn-secondary text-xs">
            <RefreshCw size={12} /> Recargar
          </button>
          <button onClick={() => setFullscreen(f => !f)} className="btn-secondary text-xs">
            <Maximize2 size={12} /> {fullscreen ? 'Reducir' : 'Expandir'}
          </button>
          <a href={url} target="_blank" rel="noopener noreferrer" className="btn-secondary text-xs">
            <ExternalLink size={12} /> Abrir
          </a>
        </div>
      </div>
      <div className="rounded-xl overflow-hidden" style={{
        border: `1px solid ${section.color}44`,
        height: fullscreen ? 'calc(100vh - 80px)' : '480px',
      }}>
        <iframe key={key} src={url} width="100%" height="100%" frameBorder="0" title={section.label} style={{ background: '#fff' }} />
      </div>
    </div>
  )
}

export default function Personal() {
  const [active, setActive] = useState<string | null>(null)
  const [customUrls, setCustomUrls] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem('personal_urls') || '{}') } catch { return {} }
  })

  const setUrl = (key: string, url: string) => {
    const next = { ...customUrls, [key]: url }
    setCustomUrls(next)
    try { localStorage.setItem('personal_urls', JSON.stringify(next)) } catch {}
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="px-1">
        <h1 className="text-2xl font-bold text-white">Personal</h1>
        <p className="text-slate-400 text-sm mt-0.5">Planes personales, bienestar y finanzas</p>
      </div>

      <div className="space-y-3">
        {SECTIONS.map(section => {
          const url = section.url || customUrls[section.key]
          const isOpen = active === section.key

          return (
            <div key={section.key} className="rounded-xl overflow-hidden"
              style={{ background: '#1e293b', border: '1px solid #2d3f58' }}>
              {/* Header colapsable */}
              <button
                className="w-full flex items-center justify-between p-4 text-left transition-colors hover:bg-white/5"
                onClick={() => setActive(isOpen ? null : section.key)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center text-lg"
                    style={{ background: section.color + '22' }}>
                    {section.emoji}
                  </div>
                  <div>
                    <p className="text-white font-medium text-sm">{section.label}</p>
                    <p className="text-slate-500 text-xs">{section.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {url && <span className="text-xs text-green-400">● Activo</span>}
                  <ChevronDown size={16} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </div>
              </button>

              {/* Contenido */}
              {isOpen && (
                <div className="border-t border-slate-700 p-4">
                  {url ? (
                    <IframeCard section={section} url={url} />
                  ) : (
                    <PlaceholderCard section={section} onSetUrl={setUrl} />
                  )}
                  {url && section.type !== 'iframe' && (
                    <button
                      onClick={() => setUrl(section.key, '')}
                      className="mt-3 text-xs text-slate-500 hover:text-red-400 transition-colors"
                    >
                      ✕ Quitar URL
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
