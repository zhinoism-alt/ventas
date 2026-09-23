import { useEffect, useState } from 'react'
import {
  ExternalLink, RefreshCw, Maximize2, ChevronDown, ChevronUp,
  Calendar, Copy, Check, FileText, Sparkles,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { getCalendarLink } from '../lib/api'
import { fmt } from '../lib/utils'

/* ═══════════════════════════════════════════════════════════════════════════
   Personal: calendario compartido, dieta de la semana, limpieza y eventos.

   El calendario no manda correos: publica un feed .ics
   (/api/calendario/feed) al que Brandon e Itzel se suscriben UNA vez desde
   su Google Calendar o iPhone. Los avisos los da Calendar con sus propias
   notificaciones -- VentasPro nunca decide mandar nada por su cuenta, asi
   que no hay forma de que esto se convierta en 100 correos al dia.

   Las dos dietas de la Dra. Ochoa se alternan solas por semana (ver
   semanaISO en /api/calendario/feed.ts): no hay que acordarse de cambiar de
   menu a mano.
   ═══════════════════════════════════════════════════════════════════════════ */

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const ETIQUETA_TIEMPO: Record<string, string> = {
  desayuno: '🍳 Desayuno', colacion1: '🍎 Colación', comida: '🍽️ Comida',
  colacion2: '🍏 Colación', cena: '🌙 Cena',
}
const ORDEN_TIEMPO = ['desayuno', 'colacion1', 'comida', 'colacion2', 'cena']

interface Menu { id: number; nombre: string }
interface Comida { menu_id: number; dia: number; tiempo: string; hora: string; titulo: string; detalle: string }
interface Archivo { id: number; menu_id: number | null; nombre: string; storage_path: string }
interface TareaLimpieza { id: number; nombre: string; orden: number }
interface EstadoLimpieza { tarea_id: number }
interface Evento {
  id: number; titulo: string; detalle: string | null; fecha: string; hora: string
  recurrencia: 'ninguna' | 'semanal'; monto: number | null
}

/** Misma cuenta que semanaISO() en /api/calendario/feed.ts -- deben coincidir
 *  o la app mostraria un menu distinto al que de verdad manda el calendario. */
function semanaISO(fecha: Date): number {
  const d = new Date(Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()))
  const diaSemana = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - diaSemana)
  const inicioAnio = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - inicioAnio.getTime()) / 86400000 + 1) / 7)
}

/** Próximo sábado (o hoy si hoy es sábado), como YYYY-MM-DD. Identifica la
 *  semana de limpieza: llega el siguiente y los checks de la app se "borran"
 *  solos porque no hay fila para esa fecha todavía. */
function proximoSabadoISO(): string {
  const hoy = new Date()
  const diaHoy = hoy.getDay() === 0 ? 7 : hoy.getDay()
  let delta = 6 - diaHoy
  if (delta < 0) delta += 7
  const f = new Date(hoy)
  f.setDate(hoy.getDate() + delta)
  return f.toISOString().slice(0, 10)
}

const HOY_DIA_ISO = new Date().getDay() === 0 ? 7 : new Date().getDay()
const SEMANA_ACTUAL = proximoSabadoISO()

// ── Calendario ───────────────────────────────────────────────────────────

function TarjetaCalendario() {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)

  useEffect(() => {
    getCalendarLink().then(r => setUrl(r.url)).catch(e => setError(e.message))
  }, [])

  const copiar = () => {
    if (!url) return
    navigator.clipboard?.writeText(url).then(() => {
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    })
  }

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-1">
        <Calendar size={16} className="text-indigo-400" />
        <h2 className="text-strong font-semibold">Calendario compartido</h2>
      </div>
      <p className="text-xs text-muted mb-4">
        Se suscriben una sola vez. Las comidas de la semana, la limpieza del sábado y los
        eventos de abajo aparecen solos en su Google Calendar o iPhone, con los avisos
        normales de Calendar — VentasPro no manda ningún correo por su cuenta.
      </p>

      {error && <p className="text-xs" style={{ color: 'var(--red)' }}>{error}</p>}

      {url && (
        <>
          <div className="flex gap-2 mb-4">
            <input readOnly value={url} className="input flex-1 text-xs font-mono"
              onFocus={e => e.target.select()} />
            <button onClick={copiar} className="btn-secondary text-xs flex-shrink-0">
              {copiado ? <Check size={12} /> : <Copy size={12} />} {copiado ? 'Copiado' : 'Copiar'}
            </button>
          </div>

          <div className="grid md:grid-cols-2 gap-3 text-xs">
            <div className="rounded-lg p-3" style={{ background: 'var(--surface-2)' }}>
              <p className="text-strong font-medium mb-1">Google Calendar</p>
              <p className="text-dim">
                Ajustes → Agregar calendario → Desde URL → pega el enlace de arriba.
              </p>
            </div>
            <div className="rounded-lg p-3" style={{ background: 'var(--surface-2)' }}>
              <p className="text-strong font-medium mb-1">iPhone</p>
              <p className="text-dim">
                Ajustes → Calendario → Cuentas → Agregar cuenta → Otra → Agregar calendario
                suscrito → pega el enlace.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Dieta de la semana ───────────────────────────────────────────────────

function TarjetaDieta() {
  const [menus, setMenus] = useState<Menu[]>([])
  const [comidas, setComidas] = useState<Comida[]>([])
  const [archivos, setArchivos] = useState<Archivo[]>([])
  const [urls, setUrls] = useState<Record<number, string>>({})
  const [diaAbierto, setDiaAbierto] = useState<number | null>(HOY_DIA_ISO)
  const [cargando, setCargando] = useState(true)
  // null = automático (el que de verdad manda el calendario). Si picas el
  // otro botón, ves su vista previa sin que eso cambie lo que se manda.
  const [verMenuId, setVerMenuId] = useState<number | null>(null)

  useEffect(() => {
    (async () => {
      const [{ data: m }, { data: c }, { data: a }] = await Promise.all([
        supabase.from('dietas_menus').select('id,nombre').order('id'),
        supabase.from('dietas_comidas').select('menu_id,dia,tiempo,hora,titulo,detalle'),
        supabase.from('dietas_archivos').select('id,menu_id,nombre,storage_path'),
      ])
      setMenus((m ?? []) as Menu[])
      setComidas((c ?? []) as Comida[])
      setArchivos((a ?? []) as Archivo[])
      setCargando(false)

      // URLs firmadas para "ver PDF" (60s, como pdf_reportes).
      const pares = await Promise.all(
        ((a ?? []) as Archivo[]).map(async arch => {
          const { data } = await supabase.storage.from('dietas').createSignedUrl(arch.storage_path, 60)
          return [arch.id, data?.signedUrl ?? ''] as const
        })
      )
      setUrls(Object.fromEntries(pares))
    })()
  }, [])

  if (cargando) return <div className="card"><p className="text-xs text-dim">Cargando dieta…</p></div>
  if (!menus.length) return null

  const menuOficial = menus[semanaISO(new Date()) % 2 === 1 ? 0 : 1 % menus.length]
  const menuMostrado = menus.find(m => m.id === verMenuId) ?? menuOficial
  const esVistaPrevia = menuMostrado.id !== menuOficial.id
  const comidasMenu = comidas.filter(c => c.menu_id === menuMostrado.id)
  const archivoMenu = archivos.find(a => a.menu_id === menuMostrado.id)
  const tablasEquiv = archivos.find(a => a.menu_id === null)

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-green-400" />
          <h2 className="text-strong font-semibold">Dieta{esVistaPrevia ? '' : ' de esta semana'}</h2>
        </div>
        <div className="flex gap-2 text-xs">
          {archivoMenu && urls[archivoMenu.id] && (
            <a href={urls[archivoMenu.id]} target="_blank" rel="noopener noreferrer" className="btn-secondary">
              <FileText size={12} /> Ver PDF completo
            </a>
          )}
          {tablasEquiv && urls[tablasEquiv.id] && (
            <a href={urls[tablasEquiv.id]} target="_blank" rel="noopener noreferrer" className="btn-secondary">
              <FileText size={12} /> Tablas de equivalentes
            </a>
          )}
        </div>
      </div>

      {/* Cuál semana toca es automático (por fecha); esto solo deja
          adelantarte a ver la otra sin cambiar lo que de verdad se manda. */}
      <div className="flex gap-1.5 mb-3">
        {menus.map(m => {
          const esEsta = m.id === menuMostrado.id
          const esLaOficial = m.id === menuOficial.id
          return (
            <button key={m.id} onClick={() => setVerMenuId(m.id)}
              className="px-3 py-1 rounded-full text-xs font-medium transition-colors"
              style={esEsta
                ? { background: 'var(--accent)', color: '#fff' }
                : { background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
              {m.nombre}{esLaOficial ? ' · esta semana' : ''}
            </button>
          )
        })}
      </div>
      {esVistaPrevia && (
        <p className="text-xs mb-3 px-2.5 py-1.5 rounded-lg" style={{ background: 'var(--yellow-soft, rgba(250,204,21,.12))', color: 'var(--yellow)' }}>
          Vista previa de {menuMostrado.nombre} — esta semana el calendario manda {menuOficial.nombre}.
        </p>
      )}
      {!esVistaPrevia && (
        <p className="text-xs text-muted mb-3">
          Se alterna sola cada semana según la fecha, tal como la recetó la Dra. Ochoa. Las
          comidas del día ya están en el calendario que se suscribieron arriba.
        </p>
      )}

      <div className="space-y-1.5">
        {DIAS.map((nombreDia, i) => {
          const diaISO = i + 1
          const abierto = diaAbierto === diaISO
          const esHoy = !esVistaPrevia && diaISO === HOY_DIA_ISO
          const comidasDia = comidasMenu
            .filter(c => c.dia === diaISO)
            .sort((a, b) => ORDEN_TIEMPO.indexOf(a.tiempo) - ORDEN_TIEMPO.indexOf(b.tiempo))
          return (
            <div key={diaISO} className="rounded-lg overflow-hidden"
              style={{ border: esHoy ? '1px solid var(--accent)' : '1px solid var(--border)' }}>
              <button onClick={() => setDiaAbierto(abierto ? null : diaISO)}
                className="w-full flex items-center justify-between px-3 py-2 text-left"
                style={{ background: esHoy ? 'var(--accent-soft, rgba(99,102,241,.12))' : 'var(--surface-2)' }}>
                <span className="text-sm font-medium text-strong">
                  {nombreDia}{esHoy && <span className="text-accent text-xs ml-2">● hoy</span>}
                </span>
                {abierto ? <ChevronUp size={14} className="text-muted" /> : <ChevronDown size={14} className="text-muted" />}
              </button>
              {abierto && (
                <div className="p-3 space-y-3" style={{ background: 'var(--bg-card)' }}>
                  {comidasDia.map(c => (
                    <div key={c.tiempo}>
                      <p className="text-xs font-semibold text-strong">
                        {ETIQUETA_TIEMPO[c.tiempo] ?? c.tiempo} · <span className="text-dim font-normal">{c.hora?.slice(0, 5)}</span>
                      </p>
                      <p className="text-xs text-body font-medium">{c.titulo}</p>
                      <p className="text-xs text-dim whitespace-pre-line">{c.detalle}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Limpieza (el pizarrón, digitalizado) ────────────────────────────────

function TarjetaLimpieza() {
  const [tareas, setTareas] = useState<TareaLimpieza[]>([])
  const [hechas, setHechas] = useState<Set<number>>(new Set())
  const [cargando, setCargando] = useState(true)

  const cargar = async () => {
    const [{ data: t }, { data: e }] = await Promise.all([
      supabase.from('limpieza_tareas').select('id,nombre,orden').eq('activo', true).order('orden'),
      supabase.from('limpieza_estado').select('tarea_id').eq('semana', SEMANA_ACTUAL),
    ])
    setTareas((t ?? []) as TareaLimpieza[])
    setHechas(new Set(((e ?? []) as EstadoLimpieza[]).map(x => x.tarea_id)))
    setCargando(false)
  }

  useEffect(() => { cargar() }, [])

  const toggle = async (id: number) => {
    const yaHecha = hechas.has(id)
    const siguiente = new Set(hechas)
    if (yaHecha) siguiente.delete(id); else siguiente.add(id)
    setHechas(siguiente) // optimista

    if (yaHecha) {
      await supabase.from('limpieza_estado').delete().eq('tarea_id', id).eq('semana', SEMANA_ACTUAL)
    } else {
      await supabase.from('limpieza_estado').upsert({ tarea_id: id, semana: SEMANA_ACTUAL })
    }
  }

  if (cargando) return <div className="card"><p className="text-xs text-dim">Cargando limpieza…</p></div>

  const total = tareas.length
  const hecho = hechas.size

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-strong font-semibold">🧹 Limpieza del sábado</h2>
        <span className="text-xs text-muted">{hecho} de {total}</span>
      </div>
      <p className="text-xs text-muted mb-3">
        El pizarrón, pero sin borrar con la manga: se marca aquí, y se vacía solo el sábado
        siguiente. Semana: {SEMANA_ACTUAL}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
        {tareas.map(t => {
          const hecha = hechas.has(t.id)
          return (
            <button key={t.id} onClick={() => toggle(t.id)}
              className="flex items-center gap-2 text-left px-2.5 py-2 rounded-lg text-xs transition-colors"
              style={{
                background: hecha ? 'var(--green-soft, rgba(74,222,128,.15))' : 'var(--surface-2)',
                color: hecha ? 'var(--green)' : 'var(--text-body)',
              }}>
              <span className="w-4 h-4 rounded flex-shrink-0 flex items-center justify-center"
                style={{ border: `1px solid ${hecha ? 'var(--green)' : 'var(--border-hi)'}` }}>
                {hecha && <Check size={11} />}
              </span>
              <span className={hecha ? 'line-through' : ''}>{t.nombre}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Eventos (dosis, citas, lo que sea) ──────────────────────────────────

/** Vista chica: los próximos eventos, con link a la pestaña Calendario que
 *  tiene el mes completo y la edición de verdad. */
function TarjetaEventosPreview() {
  const [eventos, setEventos] = useState<Evento[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('calendario_eventos')
        .select('id,titulo,detalle,fecha,hora,recurrencia,monto')
        .eq('activo', true).order('fecha').limit(3)
      setEventos((data ?? []) as Evento[])
      setCargando(false)
    })()
  }, [])

  if (cargando) return <div className="card"><p className="text-xs text-dim">Cargando eventos…</p></div>

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-strong font-semibold">📌 Eventos</h2>
        <a href="/calendario" className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
          Ver calendario →
        </a>
      </div>
      <p className="text-xs text-muted mb-3">
        Citas, dosis, lo que sea — se van al mismo calendario suscrito de arriba.
      </p>
      {!eventos.length ? (
        <p className="text-xs text-dim text-center py-3">Sin eventos todavía.</p>
      ) : (
        <div className="space-y-2">
          {eventos.map(ev => (
            <div key={ev.id} className="flex items-start justify-between gap-3 text-xs px-2.5 py-2 rounded-lg"
              style={{ background: 'var(--surface-2)' }}>
              <div>
                <p className="text-strong font-medium">{ev.titulo}</p>
                <p className="text-dim">
                  {ev.recurrencia === 'semanal' ? 'Cada semana' : ev.fecha} · {ev.hora?.slice(0, 5)}
                </p>
              </div>
              {ev.monto != null && <span className="font-mono text-strong flex-shrink-0">{fmt(ev.monto)}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Secciones viejas (placeholders / iframe) ────────────────────────────

interface Section {
  key: string; label: string; emoji: string; description: string
  url?: string; type: 'iframe' | 'placeholder'; color: string
}

const SECTIONS: Section[] = [
  {
    key: 'peso-yo', label: 'Mejora de Peso - Brandon', emoji: '💪',
    description: 'Seguimiento de ejercicio, dieta y progreso personal',
    type: 'placeholder', color: 'var(--green)',
  },
  {
    key: 'peso-itzel', label: 'Mejora de Peso - Itzel', emoji: '🌸',
    description: 'Seguimiento de ejercicio, dieta y progreso de Itzel',
    type: 'placeholder', color: '#ec4899',
  },
  {
    key: 'terapia', label: 'Terapia', emoji: '🧠',
    description: 'Notas, reflexiones y seguimiento de terapia',
    type: 'placeholder', color: 'var(--yellow)',
  },
  {
    key: 'presupuesto', label: 'Presupuesto Personal', emoji: '💰',
    description: 'Dashboard financiero desde Google Sheets',
    url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT2YTKIDdQ4aW22utLTZFGw0ZNvCMSz5Eh9fx4JSMsRQSvAoXNpA2bSRFs2VESqhe_m2nLjApHaM3vr/pubhtml',
    type: 'iframe', color: 'var(--cyan)',
  },
]

function PlaceholderCard({ section, onSetUrl }: { section: Section; onSetUrl: (key: string, url: string) => void }) {
  const [input, setInput] = useState('')
  const [editing, setEditing] = useState(false)
  return (
    <div className="rounded-xl p-6 text-center space-y-4"
      style={{ background: 'var(--surface-2)', border: `1px solid ${section.color}44` }}>
      <div className="text-4xl">{section.emoji}</div>
      <div>
        <h3 className="text-strong font-semibold text-lg">{section.label}</h3>
        <p className="text-muted text-sm mt-1">{section.description}</p>
      </div>
      <div className="space-y-2">
        <p className="text-dim text-xs">Pega el link de tu Google Doc, Notion, o cualquier URL embebible:</p>
        {editing ? (
          <div className="flex gap-2">
            <input type="text" value={input} onChange={e => setInput(e.target.value)}
              placeholder="https://docs.google.com/..."
              className="flex-1 text-xs rounded-lg px-3 py-2 text-strong surface-3 border bd-hi focus:border-indigo-500 outline-none" />
            <button onClick={() => { if (input.trim()) { onSetUrl(section.key, input.trim()); setEditing(false) } }}
              className="px-3 py-2 rounded-lg text-xs font-medium text-strong" style={{ background: section.color }}>Guardar</button>
            <button onClick={() => setEditing(false)} className="px-3 py-2 rounded-lg text-xs text-muted surface-2">X</button>
          </div>
        ) : (
          <button onClick={() => setEditing(true)}
            className="px-4 py-2 rounded-lg text-xs font-medium text-strong transition-opacity hover:opacity-80"
            style={{ background: section.color + 'cc' }}>+ Agregar URL</button>
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
      style={fullscreen ? { background: 'var(--bg)', padding: '12px' } : {}}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xl">{section.emoji}</span>
          <div>
            <h3 className="text-strong font-semibold text-sm">{section.label}</h3>
            <p className="text-dim text-xs">{section.description}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setKey(k => k + 1)} className="btn-secondary text-xs"><RefreshCw size={12} /> Recargar</button>
          <button onClick={() => setFullscreen(f => !f)} className="btn-secondary text-xs">
            <Maximize2 size={12} /> {fullscreen ? 'Reducir' : 'Expandir'}
          </button>
          <a href={url} target="_blank" rel="noopener noreferrer" className="btn-secondary text-xs"><ExternalLink size={12} /> Abrir</a>
        </div>
      </div>
      <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${section.color}44`, height: fullscreen ? 'calc(100vh - 80px)' : '480px' }}>
        <iframe key={key} src={url} width="100%" height="100%" frameBorder="0" title={section.label} style={{ background: '#fff' }} />
      </div>
    </div>
  )
}

function SeccionesViejas() {
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
    <div className="space-y-3">
      {SECTIONS.map(section => {
        const url = section.url || customUrls[section.key]
        const isOpen = active === section.key
        return (
          <div key={section.key} className="rounded-xl overflow-hidden" style={{ background: 'var(--surface-2)', border: '1px solid var(--border-hi)' }}>
            <button className="w-full flex items-center justify-between p-4 text-left transition-colors hover:bg-white/5"
              onClick={() => setActive(isOpen ? null : section.key)}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center text-lg" style={{ background: section.color + '22' }}>{section.emoji}</div>
                <div>
                  <p className="text-strong font-medium text-sm">{section.label}</p>
                  <p className="text-dim text-xs">{section.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {url && <span className="text-xs text-green-400">● Activo</span>}
                <ChevronDown size={16} className={`text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </div>
            </button>
            {isOpen && (
              <div className="border-t bd p-4">
                {url ? <IframeCard section={section} url={url} /> : <PlaceholderCard section={section} onSetUrl={setUrl} />}
                {url && section.type !== 'iframe' && (
                  <button onClick={() => setUrl(section.key, '')} className="mt-3 text-xs text-dim hover:text-red-400 transition-colors">✕ Quitar URL</button>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Página ───────────────────────────────────────────────────────────────

export default function Personal() {
  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="px-1">
        <h1 className="text-2xl font-bold text-strong">Personal</h1>
        <p className="text-muted text-sm mt-0.5">Calendario, dieta, limpieza y planes personales</p>
      </div>

      <TarjetaCalendario />
      <TarjetaDieta />
      <div className="grid md:grid-cols-2 gap-4">
        <TarjetaLimpieza />
        <TarjetaEventosPreview />
      </div>

      <SeccionesViejas />
    </div>
  )
}
