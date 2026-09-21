import { useEffect, useRef, useState } from 'react'
import {
  Briefcase, Plus, Trash2, ExternalLink, GraduationCap, Award,
  SlidersHorizontal, X, AlertTriangle, Info, RotateCcw, Sparkles
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { CampoNumero } from '../components/CampoNumero'

/* ═══════════════════════════════════════════════════════════════
   Empleo — seguimiento de vacantes, certificaciones y escuela.

   Todo se compara llevándolo a "disponible anual": el paquete
   completo menos lo que se va en trasladarte y en vivir. Es la
   única cifra comparable entre remoto, híbrido, presencial y
   reubicación — un sueldo nominal mayor en otra ciudad puede
   dejarte con menos.
   ═══════════════════════════════════════════════════════════════ */

// ─── Tipos ────────────────────────────────────────────────────
interface Perfil {
  id: number
  empresa_actual: string | null
  puesto_actual: string | null
  ciudad: string | null
  sueldo_bruto: number
  aguinaldo_dias: number
  vacaciones_dias: number
  prima_vacacional_pct: number
  vales_mensual: number
  fondo_ahorro_pct: number
  bono_anual: number
  ptu_anual: number
  valor_seguros: number
  deuda_colegiatura: number
  modalidad: string
  dias_oficina: number
  traslado_mensual: number
  horas_traslado_semana: number
  renta_mensual: number
  otros_gastos_mensual: number
  umbral_pct: number
  tipo_cambio: number
  escuela: string | null
  carrera: string | null
  modalidad_escuela: string
  cuatri_actual: number
  cuatri_total: number
  fin_cuatri_actual: string | null
  dias_clase: string | null
  colegiatura_mensual: number
  servicio_social: boolean
  ingles: boolean
  practicas: boolean
  titulacion: boolean
}

interface Vacante {
  id: number
  empresa: string
  puesto: string
  /** 'manual' la pusiste tu; 'auto' la trajo la busqueda diaria. */
  origen?: string
  /** Lo automatico entra sin revisar y espera tu visto bueno. */
  revisada?: boolean
  /** Texto del anuncio, para no tener que volver a abrir el enlace. */
  resumen?: string | null
  fuente: string | null
  link: string | null
  estado: string
  fecha_aplicacion: string | null
  proximo_paso: string | null
  proxima_fecha: string | null
  moneda: string
  periodo: string
  sueldo_min: number
  sueldo_max: number
  aguinaldo_dias: number
  vacaciones_dias: number
  prima_vacacional_pct: number
  vales_mensual: number
  fondo_ahorro_pct: number
  bono_anual: number
  ptu_anual: number
  valor_seguros: number
  bono_firma: number
  modalidad: string
  dias_oficina: number
  ciudad: string | null
  traslado_mensual: number
  horas_traslado_semana: number
  apoyo_home_office: number
  reubicacion: boolean
  apoyo_reubicacion: number
  renta_nueva: number
  ajuste_costo_vida: number
  requisitos: string | null
  notas: string | null
}

interface Materia {
  numero: number
  nombre: string
  creditos: number
  cuatrimestre_plan: number | null
  seriacion: number | null
  estado: string            // aprobada | cursando | pendiente
  ciclo_sugerido: string | null
}

interface Cert {
  id: number
  nombre: string
  proveedor: string | null
  estado: string
  avance: number
  fecha_objetivo: string | null
  fecha_examen: string | null
  costo: number
  vigencia_anios: number
  obtenida_el: string | null
  notas: string | null
}

// ─── Catálogos ────────────────────────────────────────────────
const ETAPAS = [
  { k: 'interes',   n: 'Me interesa',         badge: 'badge-gray',   viva: true },
  { k: 'aplicado',  n: 'Aplicado',            badge: 'badge-blue',   viva: true },
  { k: 'screening', n: 'Screening / RH',      badge: 'badge-cyan',   viva: true },
  { k: 'tecnica',   n: 'Entrevista técnica',  badge: 'badge-cyan',   viva: true },
  { k: 'final',     n: 'Entrevista final',    badge: 'badge-indigo', viva: true },
  { k: 'oferta',    n: 'Oferta sobre la mesa', badge: 'badge-yellow', viva: true },
  { k: 'aceptada',  n: 'Aceptada',            badge: 'badge-green',  viva: false },
  { k: 'rechazada', n: 'Me rechazaron',       badge: 'badge-red',    viva: false },
  { k: 'declinada', n: 'La decliné',          badge: 'badge-gray',   viva: false },
]
const etapa = (k: string) => ETAPAS.find(e => e.k === k) ?? ETAPAS[0]

const MODALIDADES: Record<string, string> = {
  remoto: 'Remoto', hibrido: 'Híbrido', presencial: 'Presencial',
}
const CERT_ESTADOS: Record<string, { n: string; badge: string }> = {
  planeada:   { n: 'Planeada',        badge: 'badge-gray' },
  estudiando: { n: 'Estudiando',      badge: 'badge-indigo' },
  agendada:   { n: 'Examen agendado', badge: 'badge-yellow' },
  obtenida:   { n: 'Obtenida',        badge: 'badge-green' },
  expirada:   { n: 'Expirada',        badge: 'badge-red' },
}

// ─── Helpers ──────────────────────────────────────────────────
const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''))
  return Number.isFinite(n) ? n : 0
}
const fmt = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })
    .format(Math.round(n || 0))
const fmtK = (n: number) =>
  Math.abs(n) >= 1000
    ? `${n < 0 ? '−' : ''}$${Math.round(Math.abs(n) / 1000).toLocaleString('es-MX')}k`
    : fmt(n)
const pctTxt = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(1)}%`
const hoy = () => new Date(new Date().toDateString())
const dParse = (s: string | null) => {
  if (!s) return null
  const p = s.split('-')
  if (p.length !== 3) return null
  const d = new Date(+p[0], +p[1] - 1, +p[2])
  return isNaN(d.getTime()) ? null : d
}
const dFmt = (s: string | null) => {
  const d = dParse(s)
  return d ? d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }) : '—'
}
const diasDesde = (s: string | null) => {
  const d = dParse(s)
  return d ? Math.round((d.getTime() - hoy().getTime()) / 864e5) : null
}
const addMeses = (d: Date, m: number) => { const x = new Date(d); x.setMonth(x.getMonth() + m); return x }
const listaReq = (s: string | null) =>
  String(s ?? '').split(/[,;\n]/).map(t => t.trim()).filter(Boolean)

// ─── El cálculo ───────────────────────────────────────────────
function factorOficina(modalidad: string, dias: number) {
  if (modalidad === 'remoto') return 0
  if (modalidad === 'hibrido') return Math.min(5, Math.max(0, dias)) / 5
  return 1
}

interface PaqueteIn {
  mensual: number; aguinaldoDias: number; vacacionesDias: number; primaPct: number
  valesMensual: number; fondoPct: number; bonoAnual: number; ptuAnual: number; seguros: number
}
function paqueteAnual(o: PaqueteIn) {
  const diario = o.mensual / 30
  return o.mensual * 12
    + o.mensual * (o.aguinaldoDias / 30)
    + diario * o.vacacionesDias * (o.primaPct / 100)
    + o.valesMensual * 12
    + o.mensual * 12 * (o.fondoPct / 100)
    + o.bonoAnual + o.ptuAnual + o.seguros
}

function evalBase(p: Perfil) {
  const f = factorOficina(p.modalidad, num(p.dias_oficina))
  const paquete = paqueteAnual({
    mensual: num(p.sueldo_bruto), aguinaldoDias: num(p.aguinaldo_dias),
    vacacionesDias: num(p.vacaciones_dias), primaPct: num(p.prima_vacacional_pct),
    valesMensual: num(p.vales_mensual), fondoPct: num(p.fondo_ahorro_pct),
    bonoAnual: num(p.bono_anual), ptuAnual: num(p.ptu_anual), seguros: num(p.valor_seguros),
  })
  const traslado = num(p.traslado_mensual) * 12 * f
  const vida = (num(p.renta_mensual) + num(p.otros_gastos_mensual)) * 12
  const horas = num(p.horas_traslado_semana) * 48 * f
  return { paquete, traslado, vida, horas, disponible: paquete - traslado - vida }
}

/**
 * Quita las columnas que calcula la base antes de mandarle la fila de vuelta.
 *
 * El formulario carga la vacante completa con select('*'), asi que trae tambien
 * link_norm — la columna generada que usamos para no duplicar vacantes. Al
 * guardar se la devolviamos y Postgres respondia:
 *
 *   column "link_norm" can only be updated to DEFAULT
 *
 * que es correcto: una columna generada la escribe el, no nosotros.
 */
function paraGuardar(v: Record<string, unknown>): Record<string, unknown> {
  const campos: Record<string, unknown> = { ...v, updated_at: new Date().toISOString() }
  for (const k of ['id', 'link_norm', 'created_at']) delete campos[k]
  return campos
}

function evalVacante(v: Vacante, p: Perfil) {
  const base = evalBase(p)
  const tc = num(p.tipo_cambio) || 1

  const min = num(v.sueldo_min), max = num(v.sueldo_max)
  let mensual = max > 0 ? (min > 0 ? (min + max) / 2 : max) : min
  if (v.periodo === 'anual') mensual /= 12
  if (v.moneda === 'USD') mensual *= tc

  const f = factorOficina(v.modalidad, num(v.dias_oficina))
  const paquete = paqueteAnual({
    mensual, aguinaldoDias: num(v.aguinaldo_dias),
    vacacionesDias: num(v.vacaciones_dias), primaPct: num(v.prima_vacacional_pct),
    valesMensual: num(v.vales_mensual), fondoPct: num(v.fondo_ahorro_pct),
    bonoAnual: num(v.bono_anual), ptuAnual: num(v.ptu_anual), seguros: num(v.valor_seguros),
  }) + num(v.apoyo_home_office) * 12

  const traslado = num(v.traslado_mensual) * 12 * f
  const horas = num(v.horas_traslado_semana) * 48 * f

  // Si te reubicas, la renta y el costo de vida cambian; si no, vives igual que hoy.
  let vida: number
  if (v.reubicacion) {
    const renta = num(v.renta_nueva) || num(p.renta_mensual)
    const otros = num(p.otros_gastos_mensual) * (1 + num(v.ajuste_costo_vida) / 100)
    vida = (renta + otros) * 12
  } else {
    vida = base.vida
  }

  const disponible = paquete - traslado - vida
  const unicos = (v.reubicacion ? num(v.apoyo_reubicacion) : 0) + num(v.bono_firma)
  const disponibleAno1 = disponible + unicos

  // Dos lecturas, a propósito:
  // · deltaPaquetePct = "¿cuánto más me pagan?" — decide el veredicto.
  // · deltaMensual = pesos libres extra al mes — ordena la lista.
  // El % sobre el disponible se omite como titular: al ser un residual
  // pequeño, un aumento modesto se ve como +150% y deja de informar.
  const deltaPaquetePct = base.paquete ? (paquete - base.paquete) / Math.abs(base.paquete) * 100 : 0
  const deltaAnual = disponible - base.disponible
  const deltaMensual = deltaAnual / 12
  const horasLibres = base.horas - horas

  const umbral = num(p.umbral_pct)
  let veredicto: { t: string; badge: string }
  if (!mensual)                       veredicto = { t: 'Falta el sueldo', badge: 'badge-gray' }
  else if (deltaAnual <= 0)           veredicto = { t: 'Retroceso',       badge: 'badge-red' }
  else if (deltaPaquetePct >= umbral) veredicto = { t: 'Vale la pena',    badge: 'badge-green' }
  else                                veredicto = { t: 'Marginal',        badge: 'badge-yellow' }

  return {
    mensual, paquete, traslado, vida, disponible, disponibleAno1, unicos,
    deltaPaquetePct, deltaAnual, deltaMensual, horas, horasLibres, veredicto, base,
  }
}

// ─── Defaults para formularios nuevos ─────────────────────────
const VACANTE_NUEVA: Omit<Vacante, 'id'> = {
  empresa: '', puesto: '', fuente: '', link: '', estado: 'interes',
  fecha_aplicacion: null, proximo_paso: '', proxima_fecha: null,
  moneda: 'MXN', periodo: 'mensual', sueldo_min: 0, sueldo_max: 0,
  aguinaldo_dias: 15, vacaciones_dias: 12, prima_vacacional_pct: 25,
  vales_mensual: 0, fondo_ahorro_pct: 0, bono_anual: 0, ptu_anual: 0,
  valor_seguros: 0, bono_firma: 0,
  modalidad: 'presencial', dias_oficina: 5, ciudad: '',
  traslado_mensual: 0, horas_traslado_semana: 0, apoyo_home_office: 0,
  reubicacion: false, apoyo_reubicacion: 0, renta_nueva: 0, ajuste_costo_vida: 0,
  requisitos: '', notas: '',
}
const CERT_NUEVA: Omit<Cert, 'id'> = {
  nombre: '', proveedor: '', estado: 'planeada', avance: 0,
  fecha_objetivo: null, fecha_examen: null, costo: 0, vigencia_anios: 3,
  obtenida_el: null, notas: '',
}

// ═══════════════════════════════════════════════════════════════
export default function Empleo() {
  const [perfil, setPerfil]     = useState<Perfil | null>(null)
  const [vacantes, setVacantes] = useState<Vacante[]>([])
  const [certs, setCerts]       = useState<Cert[]>([])
  const [materias, setMaterias] = useState<Materia[]>([])
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [diagnostico, setDiagnostico] = useState<'falta-tabla' | 'sin-fila' | null>(null)
  const [tab, setTab]           = useState<'vacantes' | 'certs' | 'escuela' | 'base'>('vacantes')
  const [expandida, setExpandida] = useState<number | null>(null)
  const [filtro, setFiltro]     = useState('todas')

  const [formVac, setFormVac]   = useState<(Omit<Vacante, 'id'> & { id?: number }) | null>(null)
  const [formCert, setFormCert] = useState<(Omit<Cert, 'id'> & { id?: number }) | null>(null)
  const [borrador, setBorrador] = useState<Perfil | null>(null)
  const [avisoForm, setAvisoForm] = useState<string | null>(null)

  // El formulario de vacante vive en un modal, y un modal desmontado no deja
  // rastro. Si la pagina se vuelve a montar a media captura (revalidacion de
  // sesion, recarga, cambio de pestana en el movil) lo escrito se iba. Ahora se
  // espeja en localStorage mientras esta abierto y se ofrece retomarlo.
  const [rescate, setRescate] = useState<(Omit<Vacante, 'id'> & { id?: number }) | null>(() => {
    try {
      const crudo = localStorage.getItem('vp-borrador:empleo-vacante')
      return crudo ? JSON.parse(crudo) : null
    } catch { return null }
  })

  useEffect(() => {
    try {
      if (formVac) localStorage.setItem('vp-borrador:empleo-vacante', JSON.stringify(formVac))
      else localStorage.removeItem('vp-borrador:empleo-vacante')
    } catch { /* sin almacenamiento: el formulario funciona igual */ }
  }, [formVac])

  // El finally es obligatorio: sin él, una consulta que rechaza (red caída,
  // Supabase sin responder) deja el spinner girando para siempre.
  async function load() {
    setErrorCarga(null)
    try {
      const [p, v, c, m] = await Promise.all([
        supabase.from('empleo_perfil').select('*').eq('id', 1).maybeSingle(),
        supabase.from('empleo_vacantes').select('*').eq('activo', true).order('created_at', { ascending: false }),
        supabase.from('empleo_certificaciones').select('*').eq('activo', true).order('created_at', { ascending: false }),
        supabase.from('empleo_materias').select('*').order('numero'),
      ])
      // "tabla no existe" es el estado normal antes de la migración, no un error
      // que valga la pena mostrar como falla. Cualquier otra cosa sí.
      const fallo = p.error ?? v.error ?? c.error
      const faltaTabla = /does not exist|schema cache|PGRST205|42P01/i.test(
        `${fallo?.message ?? ''} ${fallo?.code ?? ''}`)
      if (fallo && !faltaTabla) setErrorCarga(fallo.message || String(fallo))

      // Con RLS activado y sin políticas, PostgREST devuelve 200 y una lista
      // vacía en vez de un error — indistinguible de "no hay datos" si no se
      // separa aquí. Es el caso que más tiempo cuesta diagnosticar.
      setDiagnostico(faltaTabla ? 'falta-tabla' : (!p.data && !fallo) ? 'sin-fila' : null)

      if (p.data) { setPerfil(p.data as Perfil); setBorrador(p.data as Perfil) }
      setVacantes((v.data ?? []) as Vacante[])
      setCerts((c.data ?? []) as Cert[])
      setMaterias((m.data ?? []) as Materia[])
    } catch (e) {
      setErrorCarga(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  function reintentar() { setLoading(true); load() }

  useEffect(() => { load() }, [])

  // ─── Guardado ───────────────────────────────────────────────
  async function guardarPerfil() {
    if (!borrador) return
    setSaving(true)
    const { id, ...campos } = borrador
    await supabase.from('empleo_perfil')
      .update({ ...campos, updated_at: new Date().toISOString() })
      .eq('id', id)
    setSaving(false)
    await load()
  }

  async function guardarVacante() {
    if (!formVac) return
    // Antes hacia `return` en silencio y el boton parecia roto.
    if (!formVac.puesto.trim()) {
      setAvisoForm('Ponle un puesto a la vacante: es lo unico obligatorio.')
      return
    }
    setAvisoForm(null)
    setSaving(true)
    try {
      const campos = paraGuardar(formVac)
      const id = formVac.id
      // Antes nadie miraba el error: si la insercion fallaba, el modal se
      // cerraba igual y parecia guardado.
      const { error } = id
        ? await supabase.from('empleo_vacantes')
            .update(campos).eq('id', id)
        : await supabase.from('empleo_vacantes').insert(campos)
      if (error) { setAvisoForm(`No se guardo: ${error.message}`); return }
      setFormVac(null)
      setRescate(null)
      try { localStorage.removeItem('vp-borrador:empleo-vacante') } catch { /* ignorar */ }
      await load()
    } catch (e) {
      setAvisoForm(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  /**
   * Triaje de lo que trae la busqueda diaria. Son dos gestos y nada mas:
   * interesa (queda como cualquier otra) o no (se archiva). Pedir mas que eso
   * para una vacante que todavia no has leido convierte la ayuda en tarea.
   */
  async function triarVacante(id: number, interesa: boolean) {
    const cambios = interesa
      ? { revisada: true }
      : { revisada: true, activo: false }
    const { error } = await supabase.from('empleo_vacantes')
      .update({ ...cambios, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) { setAvisoForm(`No se guardo: ${error.message}`); return }
    await load()
  }

  async function borrarVacante(id: number) {
    if (!confirm('¿Quitar esta vacante del seguimiento?')) return
    await supabase.from('empleo_vacantes').update({ activo: false }).eq('id', id)
    setFormVac(null); await load()
  }

  async function guardarCert() {
    if (!formCert) return
    if (!formCert.nombre.trim()) {
      setAvisoForm('Ponle un nombre a la certificacion.')
      return
    }
    setAvisoForm(null)
    setSaving(true)
    const { id, ...campos } = formCert
    if (id) {
      await supabase.from('empleo_certificaciones')
        .update({ ...campos, updated_at: new Date().toISOString() }).eq('id', id)
    } else {
      await supabase.from('empleo_certificaciones').insert(campos)
    }
    setSaving(false); setFormCert(null); await load()
  }

  async function borrarCert(id: number) {
    if (!confirm('¿Quitar esta certificación?')) return
    await supabase.from('empleo_certificaciones').update({ activo: false }).eq('id', id)
    setFormCert(null); await load()
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full" />
    </div>
  )

  if (!perfil || !borrador) return (
    <div className="card max-w-2xl mx-auto text-center py-10">
      <AlertTriangle className={`mx-auto mb-3 ${errorCarga ? 'text-red-400' : 'text-yellow-400'}`} size={32} />
      {errorCarga ? (
        <>
          <p className="text-strong font-semibold mb-1">No se pudo conectar con Supabase</p>
          <p className="text-muted text-sm mb-1">
            No es la migración — la base respondió con un error.
          </p>
          <p className="text-xs text-red-300 font-mono mb-4 break-words px-4">{errorCarga}</p>
        </>
      ) : diagnostico === 'sin-fila' ? (
        <>
          <p className="text-strong font-semibold mb-1">Las tablas existen, pero no llega tu perfil</p>
          <p className="text-muted text-sm mb-4 max-w-md mx-auto">
            Casi siempre es <strong className="text-strong">RLS activado sin políticas</strong>: la base
            responde bien pero devuelve cero filas. Corre en el SQL Editor{' '}
            <code className="text-indigo-300 block mt-2 text-xs">
              ALTER TABLE empleo_perfil DISABLE ROW LEVEL SECURITY;
            </code>
          </p>
        </>
      ) : (
        <>
          <p className="text-strong font-semibold mb-1">Falta correr la migración</p>
          <p className="text-muted text-sm mb-4">
            Aplica <code className="text-indigo-300">supabase/migrations/20260919000000_empleo.sql</code> en
            el SQL Editor de Supabase y vuelve a cargar.
          </p>
        </>
      )}
      <button className="btn-secondary text-sm" onClick={reintentar}>Reintentar</button>
    </div>
  )

  // ─── Derivados ──────────────────────────────────────────────
  const base = evalBase(perfil)
  // Solo lo revisado entra a las cuentas. Ver arriba por que.
  const evals = vacantes.filter(v => v.revisada !== false).map(v => ({ v, e: evalVacante(v, perfil) }))
  const vivas = evals.filter(x => etapa(x.v.estado).viva)

  // Lo que trajo la busqueda diaria y todavia no has mirado. Va aparte: si
  // entrara a las evaluaciones, tus promedios y tu "mejor oferta" cambiarian
  // por vacantes que ni siquiera has leido.
  const sinRevisar = vacantes.filter(v => v.revisada === false)

  let lista = filtro === 'vivas' ? vivas
            : filtro === 'todas' ? evals
            : evals.filter(x => x.v.estado === filtro)
  lista = [...lista].sort((a, b) => b.e.disponible - a.e.disponible)

  const mejor = [...vivas].filter(x => x.e.mensual > 0)
    .sort((a, b) => b.e.disponible - a.e.disponible)[0]

  const pasos = vacantes
    .filter(v => v.proxima_fecha && etapa(v.estado).viva)
    .map(v => ({ v, d: diasDesde(v.proxima_fecha) }))
    .sort((a, b) => (a.d ?? 999) - (b.d ?? 999)).slice(0, 5)

  const misCerts = certs.filter(c => c.estado === 'obtenida').map(c => c.nombre.toLowerCase())
  const demanda = (() => {
    const m = new Map<string, { n: string; c: number }>()
    for (const { v } of vivas) for (const r of listaReq(v.requisitos)) {
      const k = r.toLowerCase()
      m.set(k, { n: r, c: (m.get(k)?.c ?? 0) + 1 })
    }
    return [...m.values()]
      .map(d => ({ ...d, tengo: misCerts.some(c => c.includes(d.n.toLowerCase()) || d.n.toLowerCase().includes(c)) }))
      .sort((a, b) => b.c - a.c).slice(0, 6)
  })()

  const egreso = (() => {
    const act = num(perfil.cuatri_actual), tot = num(perfil.cuatri_total)
    if (!act || !tot || act > tot) return { fecha: null as Date | null, restantes: null as number | null, avance: 0 }
    const restantes = tot - act
    const fin = dParse(perfil.fin_cuatri_actual)
    return { fecha: fin ? addMeses(fin, restantes * 4) : null, restantes, avance: act / tot * 100 }
  })()

  const bp = (k: keyof Perfil, v: unknown) => setBorrador({ ...borrador, [k]: v } as Perfil)

  return (
    <div className="space-y-6 max-w-5xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-strong flex items-center gap-2">
            <Briefcase className="text-indigo-400" size={24} /> Empleo
          </h1>
          <p className="text-muted text-sm mt-1">
            Vacantes, certificaciones y escuela — comparadas contra lo que ganas hoy
          </p>
        </div>
        {tab === 'vacantes' && (
          <button onClick={() => { setAvisoForm(null); setFormVac({ ...VACANTE_NUEVA }) }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-2))' }}>
            <Plus size={16} /> Nueva vacante
          </button>
        )}
        {tab === 'certs' && (
          <button onClick={() => { setAvisoForm(null); setFormCert({ ...CERT_NUEVA }) }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-2))' }}>
            <Plus size={16} /> Nueva certificación
          </button>
        )}
      </div>

      {tab === 'vacantes' && !!sinRevisar.length && (
        <div className="card" style={{ borderColor: 'var(--accent)' }}>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={16} className="accent" />
            <h2 className="text-strong font-semibold">
              {sinRevisar.length} vacante{sinRevisar.length > 1 ? 's' : ''} que encontró tu búsqueda diaria
            </h2>
          </div>
          <p className="text-xs text-dim mb-4">
            Todavía no cuentan en tus números. Decide cuáles te interesan.
          </p>
          <div className="space-y-2">
            {sinRevisar.map(v => (
              <div key={v.id} className="rounded-xl p-3 flex items-start gap-3 flex-wrap"
                   style={{ background: 'var(--surface-2)' }}>
                <div className="flex-1 min-w-0" style={{ minWidth: 220 }}>
                  <p className="text-sm font-medium text-strong">{v.puesto}</p>
                  <p className="text-xs text-muted">
                    {v.empresa}
                    {v.ciudad ? ` · ${v.ciudad}` : ''}
                    {v.fuente ? ` · ${v.fuente}` : ''}
                  </p>
                  {v.resumen && (
                    <p className="text-xs text-dim mt-1 line-clamp-2">{v.resumen}</p>
                  )}
                  {v.link && (
                    <a href={v.link} target="_blank" rel="noreferrer"
                       className="text-xs accent inline-flex items-center gap-1 mt-1">
                      Ver el anuncio <ExternalLink size={10} />
                    </a>
                  )}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button className="btn-primary text-xs"
                          onClick={() => triarVacante(v.id, true)}>Me interesa</button>
                  <button className="btn-secondary text-xs"
                          onClick={() => triarVacante(v.id, false)}>Descartar</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {rescate && !formVac && tab === 'vacantes' && (
        <div className="card flex items-center gap-3 py-3 flex-wrap"
             style={{ background: 'var(--cyan-soft)', borderColor: 'var(--cyan)' }}>
          <RotateCcw size={15} style={{ color: 'var(--cyan)' }} />
          <p className="text-sm flex-1" style={{ color: 'var(--cyan)' }}>
            Dejaste una vacante a medio llenar{rescate.puesto ? `: ${rescate.puesto}` : ''}.
          </p>
          <button className="btn-secondary text-xs"
            onClick={() => { setAvisoForm(null); setFormVac({ ...rescate }) }}>Retomarla</button>
          <button className="btn-secondary text-xs"
            onClick={() => {
              setRescate(null)
              try { localStorage.removeItem('vp-borrador:empleo-vacante') } catch { /* ignorar */ }
            }}>Descartar</button>
        </div>
      )}

      {/* ── Resumen ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card">
          <p className="text-xs text-muted mb-1">Disponible hoy</p>
          <p className="text-xl font-bold text-strong">{fmtK(base.disponible)}</p>
          <p className="text-xs text-muted mt-1">de {fmtK(base.paquete)} de paquete</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-muted mb-1">Vacantes vivas</p>
          <p className="text-xl font-bold text-strong">{vivas.length}</p>
          <p className="text-xs text-muted mt-1">
            {vivas.filter(x => ['screening', 'tecnica', 'final', 'oferta'].includes(x.v.estado)).length} en proceso
          </p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-muted mb-1">Mejor opción</p>
          {mejor ? (
            <>
              <p className={`text-xl font-bold ${mejor.e.deltaMensual > 0 ? 'text-green-400' : 'text-red-400'}`}>
                {mejor.e.deltaMensual > 0 ? '+' : '−'}{fmt(Math.abs(mejor.e.deltaMensual))}
              </p>
              <p className="text-xs text-muted mt-1">
                {mejor.v.empresa} · {pctTxt(mejor.e.deltaPaquetePct)} paquete
              </p>
            </>
          ) : (
            <>
              <p className="text-xl font-bold text-dim">—</p>
              <p className="text-xs text-muted mt-1">captura sueldos</p>
            </>
          )}
        </div>
        <div className="stat-card">
          <p className="text-xs text-muted mb-1">Egreso estimado</p>
          <p className="text-xl font-bold text-strong">
            {egreso.fecha
              ? egreso.fecha.toLocaleDateString('es-MX', { month: 'short', year: 'numeric' })
              : '—'}
          </p>
          <p className="text-xs text-muted mt-1">
            {egreso.restantes != null ? `faltan ${egreso.restantes} cuatri` : 'captura tu avance'}
          </p>
        </div>
      </div>

      {/* ── Próximos pasos ── */}
      {pasos.length > 0 && (
        <div className="card">
          <p className="text-xs text-muted uppercase tracking-wider mb-3">Lo que sigue</p>
          <div className="space-y-2">
            {pasos.map(({ v, d }) => (
              <div key={v.id} className="flex items-baseline gap-3 text-sm">
                <span className={`font-mono text-xs w-20 flex-shrink-0 ${d != null && d < 0 ? 'text-red-400 font-semibold' : 'text-dim'}`}>
                  {d == null ? '—' : d < 0 ? `hace ${-d}d` : d === 0 ? 'hoy' : `en ${d}d`}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="text-strong">{v.proximo_paso || 'Dar seguimiento'}</span>
                  <span className="text-dim block text-xs">
                    {v.empresa} · {v.puesto} · {dFmt(v.proxima_fecha)}
                  </span>
                </span>
                <span className={`badge ${etapa(v.estado).badge} flex-shrink-0`}>{etapa(v.estado).n}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="flex gap-1 p-1 rounded-xl overflow-x-auto" style={{ background: 'var(--surface-2)' }}>
        {([
          ['vacantes', `💼 Vacantes (${vivas.length})`],
          ['certs',    `🎓 Certificaciones (${certs.length})`],
          ['escuela',  '📚 Escuela'],
          ['base',     '⚙️ Mi base'],
        ] as const).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className="flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all whitespace-nowrap"
            style={tab === t ? { background: 'var(--accent)', color: '#fff' } : { color: 'var(--text-muted)' }}>
            {label}
          </button>
        ))}
      </div>

      {/* ═══ VACANTES ═══ */}
      {tab === 'vacantes' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <select className="input w-auto" value={filtro} onChange={e => setFiltro(e.target.value)}>
              <option value="vivas">Vivas</option>
              <option value="todas">Todas</option>
              {ETAPAS.map(e => <option key={e.k} value={e.k}>{e.n}</option>)}
            </select>
            <p className="text-xs text-dim">
              Ordenadas por lo que te quedaría libre, no por sueldo nominal ·
              umbral mínimo <span className="text-body">+{num(perfil.umbral_pct)}%</span> de paquete
            </p>
          </div>

          {lista.length === 0 && (
            <div className="card text-center py-10">
              <Briefcase className="mx-auto text-faint mb-3" size={32} />
              <p className="text-muted text-sm">Sin vacantes con ese filtro.</p>
            </div>
          )}

          {lista.map(({ v, e }) => {
            const st = etapa(v.estado)
            const faltantes = listaReq(v.requisitos).filter(
              r => !misCerts.some(c => c.includes(r.toLowerCase()) || r.toLowerCase().includes(c)))
            const abierta = expandida === v.id
            return (
              <div key={v.id} className="card">
                <div className="flex justify-between items-start gap-4 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-strong font-semibold">{v.puesto}</h3>
                    <p className="text-sm text-muted">
                      {v.empresa}{v.ciudad ? ` · ${v.ciudad}` : ''}{v.fuente ? ` · vía ${v.fuente}` : ''}
                    </p>
                    <div className="flex gap-2 flex-wrap mt-2">
                      <span className={`badge ${st.badge}`}>{st.n}</span>
                      <span className="badge badge-gray">
                        {v.modalidad === 'hibrido' ? `Híbrido ${num(v.dias_oficina)}d` : MODALIDADES[v.modalidad]}
                      </span>
                      {v.reubicacion && <span className="badge badge-yellow">Reubicación</span>}
                      <span className={`badge ${e.veredicto.badge}`}>{e.veredicto.t}</span>
                      {e.horasLibres > 0 && (
                        <span className="badge badge-green">+{Math.round(e.horasLibres)} h/año libres</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`font-mono font-bold ${e.deltaMensual > 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {e.mensual
                        ? `${e.deltaMensual > 0 ? '+' : '−'}${fmt(Math.abs(e.deltaMensual))}`
                        : '—'}
                    </p>
                    <p className="text-xs text-dim">al mes libres</p>
                    <p className="text-xs font-mono text-muted mt-1">
                      {e.mensual ? `${pctTxt(e.deltaPaquetePct)} paquete` : 'sin sueldo'}
                    </p>
                  </div>
                </div>

                {faltantes.length > 0 && (
                  <p className="text-xs text-yellow-500 mt-3 flex gap-2">
                    <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
                    <span>Te piden: {faltantes.join(' · ')}</span>
                  </p>
                )}
                {v.reubicacion && perfil.modalidad_escuela === 'presencial' && (
                  <p className="text-xs text-yellow-500 mt-2 flex gap-2">
                    <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
                    <span>Mudarte implica cambiar de campus o pasarte a modalidad en línea.</span>
                  </p>
                )}
                {v.modalidad === 'remoto' && (
                  <p className="text-xs text-dim mt-2 flex gap-2">
                    <Info size={13} className="flex-shrink-0 mt-0.5" />
                    <span>Remoto: sin traslado y compatible con cualquier horario de clases.</span>
                  </p>
                )}

                <div className="flex gap-2 mt-4 flex-wrap items-center">
                  <button className="btn-secondary text-xs" onClick={() => setExpandida(abierta ? null : v.id)}>
                    {abierta ? 'Ocultar números' : 'Ver números'}
                  </button>
                  <button className="btn-secondary text-xs" onClick={() => { setAvisoForm(null); setFormVac({ ...v }) }}>Editar</button>
                  {v.link && (
                    <a href={v.link} target="_blank" rel="noopener noreferrer"
                      className="btn-secondary text-xs flex items-center gap-1">
                      Vacante <ExternalLink size={12} />
                    </a>
                  )}
                  <span className="flex-1" />
                  {v.proxima_fecha && (
                    <span className="text-xs text-dim font-mono">
                      {v.proximo_paso || 'siguiente'} · {dFmt(v.proxima_fecha)}
                    </span>
                  )}
                </div>

                {abierta && (
                  <div className="grid md:grid-cols-3 gap-5 mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
                    <Desglose titulo="Ingreso anual" filas={[
                      [`Sueldo (${v.moneda} ${v.periodo})`, fmt(e.mensual * 12)],
                      [`Aguinaldo ${num(v.aguinaldo_dias)} días`, fmt(e.mensual * num(v.aguinaldo_dias) / 30)],
                      [`Prima vac. ${num(v.prima_vacacional_pct)}%`,
                        fmt(e.mensual / 30 * num(v.vacaciones_dias) * num(v.prima_vacacional_pct) / 100)],
                      ['Vales', fmt(num(v.vales_mensual) * 12)],
                      [`Fondo de ahorro ${num(v.fondo_ahorro_pct)}%`, fmt(e.mensual * 12 * num(v.fondo_ahorro_pct) / 100)],
                      ['Bono', fmt(num(v.bono_anual))],
                      ['PTU', fmt(num(v.ptu_anual))],
                      ['Seguros', fmt(num(v.valor_seguros))],
                      ...(num(v.apoyo_home_office) ? [['Apoyo home office', fmt(num(v.apoyo_home_office) * 12)] as [string, string]] : []),
                    ]} total={['Paquete', fmt(e.paquete)]} />

                    <Desglose titulo="Lo que se va" filas={[
                      ['Traslado', `−${fmt(e.traslado)}`],
                      [`Renta + gastos${v.reubicacion ? ' (nueva ciudad)' : ''}`, `−${fmt(e.vida)}`],
                    ]} total={['Disponible', fmt(e.disponible)]}
                      extra={e.unicos ? [
                        ['+ pagos únicos (firma / reubicación)', `+${fmt(e.unicos)}`],
                        ['Disponible año 1', fmt(e.disponibleAno1)],
                      ] : undefined} />

                    <Desglose titulo="Contra hoy" filas={[
                      ['Paquete hoy', fmt(e.base.paquete)],
                      ['Diferencia de paquete', pctTxt(e.deltaPaquetePct)],
                      ['Disponible hoy', fmt(e.base.disponible)],
                      ['Diferencia al año', `${e.deltaAnual > 0 ? '+' : '−'}${fmt(Math.abs(e.deltaAnual))}`],
                      ['Horas de traslado al año', `${Math.round(e.horas)} h`],
                    ]} total={['Veredicto', e.veredicto.t]} nota={v.notas} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ═══ CERTIFICACIONES ═══ */}
      {tab === 'certs' && (
        <div className="space-y-4">
          {demanda.length > 0 && (
            <div className="card">
              <p className="text-xs text-muted uppercase tracking-wider mb-1">Qué te están pidiendo</p>
              <p className="text-xs text-dim mb-3">
                Contado sobre tus vacantes vivas. Lo que más se repite y no tienes es tu siguiente certificación.
              </p>
              <div className="space-y-2">
                {demanda.map(d => (
                  <div key={d.n} className="flex items-center gap-3 text-sm">
                    <span className="flex-1 text-body">{d.n}</span>
                    <span className={`badge ${d.tengo ? 'badge-green' : 'badge-yellow'}`}>
                      {d.tengo ? 'la tienes' : 'te falta'}
                    </span>
                    <span className="text-xs text-dim font-mono w-20 text-right">
                      {d.c} vacante{d.c === 1 ? '' : 's'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {certs.length === 0 && (
            <div className="card text-center py-10">
              <Award className="mx-auto text-faint mb-3" size={32} />
              <p className="text-muted text-sm">Sin certificaciones registradas.</p>
            </div>
          )}

          {certs.map(c => {
            const est = CERT_ESTADOS[c.estado] ?? CERT_ESTADOS.planeada
            const d = dParse(c.obtenida_el)
            const vence = c.estado === 'obtenida' && d && num(c.vigencia_anios) > 0
              ? addMeses(d, num(c.vigencia_anios) * 12) : null
            const diasVence = vence ? Math.round((vence.getTime() - hoy().getTime()) / 864e5) : null
            return (
              <div key={c.id} className="card flex items-center gap-4 flex-wrap">
                <div className="min-w-0 flex-1">
                  <p className="text-strong font-medium">{c.nombre}</p>
                  <p className="text-xs text-dim">{c.proveedor}</p>
                </div>
                <span className={`badge ${est.badge}`}>{est.n}</span>
                <div className="flex items-center gap-2">
                  <div className="w-20 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, num(c.avance))}%`, background: 'var(--accent)' }} />
                  </div>
                  <span className="text-xs text-dim font-mono w-9">{num(c.avance)}%</span>
                </div>
                <span className="text-xs text-muted font-mono w-24 text-right">
                  {c.fecha_examen ? `exam ${dFmt(c.fecha_examen)}` : dFmt(c.fecha_objetivo)}
                </span>
                <span className="text-xs font-mono w-20 text-right text-muted">
                  {num(c.costo) ? fmt(c.costo) : '—'}
                </span>
                {diasVence != null && diasVence < 365 && (
                  <span className="badge badge-yellow">vence en {diasVence}d</span>
                )}
                <button className="btn-secondary text-xs" onClick={() => { setAvisoForm(null); setFormCert({ ...c }) }}>Editar</button>
              </div>
            )
          })}
        </div>
      )}

      {/* ═══ ESCUELA ═══ */}
      {tab === 'escuela' && (
        <div className="space-y-4">
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <GraduationCap className="text-indigo-400" size={18} />
              <h2 className="text-strong font-semibold">
                {perfil.escuela || 'Escuela'} — avance
              </h2>
            </div>
            <div className="h-2.5 rounded-full overflow-hidden mb-3" style={{ background: 'var(--surface-2)' }}>
              <div className="h-full rounded-full" style={{ width: `${egreso.avance}%`, background: 'var(--accent)' }} />
            </div>
            <div className="flex gap-1 flex-wrap">
              {Array.from({ length: Math.min(num(perfil.cuatri_total), 16) }, (_, i) => {
                const n = i + 1, act = num(perfil.cuatri_actual)
                return (
                  <span key={n}
                    className="flex-1 min-w-[30px] h-8 rounded flex items-center justify-center text-xs font-mono"
                    style={n < act ? { background: 'var(--accent)', color: '#fff' }
                      : n === act ? { background: 'var(--accent-soft)', color: 'var(--accent)', fontWeight: 600 }
                      : { background: 'var(--surface-2)', color: 'var(--text-dim)' }}>
                    {n}
                  </span>
                )
              })}
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-5">
              <Dato k="Cuatrimestre" v={`${num(perfil.cuatri_actual)} / ${num(perfil.cuatri_total)}`} />
              <Dato k="Meses restantes" v={egreso.restantes != null ? `${egreso.restantes * 4}` : '—'} />
              <Dato k="Colegiatura pendiente" v={egreso.restantes != null
                ? fmtK(egreso.restantes * 4 * num(perfil.colegiatura_mensual)) : '—'} />
              <Dato k="Deuda con la empresa" v={num(perfil.deuda_colegiatura) ? fmt(perfil.deuda_colegiatura) : '—'} />
            </div>
          </div>

          {materias.length > 0 && <RutaMasRapida materias={materias} />}

          <div className="card">
            <p className="text-xs text-muted uppercase tracking-wider mb-1">Requisitos de titulación</p>
            <p className="text-xs text-dim mb-3">
              Egresar no es titularte, y muchas vacantes piden título, no constancia.
            </p>
            <div className="space-y-1">
              {([
                ['servicio_social', 'Servicio social liberado'],
                ['ingles', 'Requisito de inglés cubierto'],
                ['practicas', 'Prácticas profesionales'],
                ['titulacion', 'Modalidad de titulación elegida'],
              ] as const).map(([k, label]) => (
                <label key={k} className="flex items-center gap-3 p-2 rounded-lg cursor-pointer hover:surface-2">
                  <input type="checkbox" checked={borrador[k] as boolean}
                    onChange={async e => {
                      const nuevo = { ...borrador, [k]: e.target.checked } as Perfil
                      setBorrador(nuevo); setPerfil(nuevo)
                      await supabase.from('empleo_perfil').update({ [k]: e.target.checked }).eq('id', 1)
                    }} />
                  <span className={perfil[k] ? 'text-dim line-through text-sm' : 'text-body text-sm'}>
                    {label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="card">
            <p className="text-xs text-muted uppercase tracking-wider mb-4">Datos de la escuela</p>
            <div className="grid md:grid-cols-2 gap-4">
              <Campo label="Escuela" value={borrador.escuela ?? ''} onChange={v => bp('escuela', v)} />
              <Campo label="Carrera" value={borrador.carrera ?? ''} onChange={v => bp('carrera', v)} />
              <Select label="Modalidad" value={borrador.modalidad_escuela} onChange={v => bp('modalidad_escuela', v)}
                opciones={[['linea', 'En línea'], ['ejecutiva', 'Ejecutiva / fin de semana'], ['presencial', 'Presencial']]} />
              <Campo label="Días y horario de clase" value={borrador.dias_clase ?? ''}
                onChange={v => bp('dias_clase', v)} placeholder="Sábados 8:00–14:00" />
              <CampoNum label="Cuatrimestre actual" value={borrador.cuatri_actual} onChange={v => bp('cuatri_actual', v)} />
              <CampoNum label="Cuatrimestres totales" value={borrador.cuatri_total} onChange={v => bp('cuatri_total', v)} />
              <Campo label="Fin del cuatrimestre actual" type="date" value={borrador.fin_cuatri_actual ?? ''}
                onChange={v => bp('fin_cuatri_actual', v || null)} hint="De aquí sale la fecha de egreso." />
              <CampoNum label="Colegiatura mensual" value={borrador.colegiatura_mensual} onChange={v => bp('colegiatura_mensual', v)} />
              <CampoNum label="Deuda de colegiatura con tu empresa" value={borrador.deuda_colegiatura}
                onChange={v => bp('deuda_colegiatura', v)} hint="Lo que te descontarían del finiquito si sales." />
            </div>
            <button className="btn-primary mt-5" onClick={guardarPerfil} disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      )}

      {/* ═══ MI BASE ═══ */}
      {tab === 'base' && (
        <div className="card">
          <div className="flex items-center gap-2 mb-1">
            <SlidersHorizontal className="text-indigo-400" size={18} />
            <h2 className="text-strong font-semibold">Tu situación actual</h2>
          </div>
          <p className="text-sm text-muted mb-5 max-w-2xl">
            Todo lo demás se compara contra esto. Captura el <strong className="text-strong">bruto mensual</strong>,
            como viene en tu recibo — el cálculo ya suma aguinaldo, prima vacacional, vales y fondo por separado.
          </p>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Dato k="Paquete anual" v={fmtK(base.paquete)} />
            <Dato k="Se va en vivir" v={fmtK(base.vida)} />
            <Dato k="Se va en traslado" v={fmtK(base.traslado)} sub={`${Math.round(base.horas)} h/año`} />
            <Dato k="Disponible" v={fmtK(base.disponible)} sub={`${fmt(base.disponible / 12)}/mes`} />
          </div>

          <Seccion titulo="Puesto actual">
            <Campo label="Empresa" value={borrador.empresa_actual ?? ''} onChange={v => bp('empresa_actual', v)} />
            <Campo label="Puesto" value={borrador.puesto_actual ?? ''} onChange={v => bp('puesto_actual', v)} />
            <Campo label="Ciudad" value={borrador.ciudad ?? ''} onChange={v => bp('ciudad', v)} />
          </Seccion>

          <Seccion titulo="Sueldo y prestaciones">
            <CampoNum label="Sueldo bruto mensual" value={borrador.sueldo_bruto} onChange={v => bp('sueldo_bruto', v)} />
            <CampoNum label="Aguinaldo (días)" value={borrador.aguinaldo_dias} onChange={v => bp('aguinaldo_dias', v)} hint="La ley marca 15." />
            <CampoNum label="Vacaciones (días)" value={borrador.vacaciones_dias} onChange={v => bp('vacaciones_dias', v)} />
            <CampoNum label="Prima vacacional (%)" value={borrador.prima_vacacional_pct} onChange={v => bp('prima_vacacional_pct', v)} hint="La ley marca 25%." />
            <CampoNum label="Vales de despensa / mes" value={borrador.vales_mensual} onChange={v => bp('vales_mensual', v)} />
            <CampoNum label="Fondo de ahorro (%)" value={borrador.fondo_ahorro_pct} onChange={v => bp('fondo_ahorro_pct', v)} hint="Aportación patronal." />
            <CampoNum label="Bono anual" value={borrador.bono_anual} onChange={v => bp('bono_anual', v)} />
            <CampoNum label="PTU" value={borrador.ptu_anual} onChange={v => bp('ptu_anual', v)} />
            <CampoNum label="Valor de seguros / año" value={borrador.valor_seguros} onChange={v => bp('valor_seguros', v)} hint="GMM + vida + dental." />
          </Seccion>

          <Seccion titulo="Cómo trabajas">
            <Select label="Modalidad" value={borrador.modalidad} onChange={v => bp('modalidad', v)}
              opciones={Object.entries(MODALIDADES)} />
            <CampoNum label="Días en oficina" value={borrador.dias_oficina} onChange={v => bp('dias_oficina', v)} />
            <CampoNum label="Traslado / mes" value={borrador.traslado_mensual} onChange={v => bp('traslado_mensual', v)} hint="Gasolina, casetas, transporte." />
            <CampoNum label="Horas de traslado / semana" value={borrador.horas_traslado_semana} onChange={v => bp('horas_traslado_semana', v)} />
          </Seccion>

          <Seccion titulo="Cómo vives">
            <CampoNum label="Renta o hipoteca / mes" value={borrador.renta_mensual} onChange={v => bp('renta_mensual', v)} />
            <CampoNum label="Otros gastos fijos / mes" value={borrador.otros_gastos_mensual} onChange={v => bp('otros_gastos_mensual', v)} hint="Comida, servicios, deudas." />
          </Seccion>

          <Seccion titulo="Reglas de comparación">
            <CampoNum label="Umbral mínimo (%)" value={borrador.umbral_pct} onChange={v => bp('umbral_pct', v)}
              hint="Mejora de paquete debajo de la cual cambiar no compensa el riesgo." />
            <CampoNum label="Tipo de cambio USD → MXN" value={borrador.tipo_cambio} onChange={v => bp('tipo_cambio', v)} />
          </Seccion>

          <button className="btn-primary mt-6" onClick={guardarPerfil} disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar mi base'}
          </button>
        </div>
      )}

      {/* ═══ MODAL VACANTE ═══ */}
      {formVac && (
        <Modal titulo={formVac.id ? 'Editar vacante' : 'Nueva vacante'}
          onClose={() => setFormVac(null)}
          onGuardar={guardarVacante} saving={saving} aviso={avisoForm}
          onBorrar={formVac.id ? () => borrarVacante(formVac.id!) : undefined}>

          <Seccion titulo="La vacante">
            <Campo label="Puesto" value={formVac.puesto} onChange={v => setFormVac({ ...formVac, puesto: v })} />
            <Campo label="Empresa" value={formVac.empresa} onChange={v => setFormVac({ ...formVac, empresa: v })} />
            <Campo label="Fuente" value={formVac.fuente ?? ''} onChange={v => setFormVac({ ...formVac, fuente: v })}
              placeholder="LinkedIn, Indeed, OCC, referido" />
            <Campo label="Liga" value={formVac.link ?? ''} onChange={v => setFormVac({ ...formVac, link: v })} placeholder="https://" />
            <Select label="Etapa" value={formVac.estado} onChange={v => setFormVac({ ...formVac, estado: v })}
              opciones={ETAPAS.map(e => [e.k, e.n])} />
            <Campo label="Fecha en que apliqué" type="date" value={formVac.fecha_aplicacion ?? ''}
              onChange={v => setFormVac({ ...formVac, fecha_aplicacion: v || null })} />
            <Campo label="Próximo paso" value={formVac.proximo_paso ?? ''}
              onChange={v => setFormVac({ ...formVac, proximo_paso: v })} placeholder="Enviar examen técnico" />
            <Campo label="Para cuándo" type="date" value={formVac.proxima_fecha ?? ''}
              onChange={v => setFormVac({ ...formVac, proxima_fecha: v || null })} />
          </Seccion>

          <Seccion titulo="Oferta económica">
            <Select label="Moneda" value={formVac.moneda} onChange={v => setFormVac({ ...formVac, moneda: v })}
              opciones={[['MXN', 'MXN'], ['USD', 'USD']]} />
            <Select label="Periodo" value={formVac.periodo} onChange={v => setFormVac({ ...formVac, periodo: v })}
              opciones={[['mensual', 'Mensual'], ['anual', 'Anual']]} />
            <CampoNum label="Sueldo mínimo" value={formVac.sueldo_min} onChange={v => setFormVac({ ...formVac, sueldo_min: v })} />
            <CampoNum label="Sueldo máximo" value={formVac.sueldo_max} onChange={v => setFormVac({ ...formVac, sueldo_max: v })}
              hint="Si solo sabes un número, ponlo en los dos." />
            <CampoNum label="Aguinaldo (días)" value={formVac.aguinaldo_dias} onChange={v => setFormVac({ ...formVac, aguinaldo_dias: v })} />
            <CampoNum label="Vacaciones (días)" value={formVac.vacaciones_dias} onChange={v => setFormVac({ ...formVac, vacaciones_dias: v })} />
            <CampoNum label="Prima vacacional (%)" value={formVac.prima_vacacional_pct} onChange={v => setFormVac({ ...formVac, prima_vacacional_pct: v })} />
            <CampoNum label="Vales / mes" value={formVac.vales_mensual} onChange={v => setFormVac({ ...formVac, vales_mensual: v })} />
            <CampoNum label="Fondo de ahorro (%)" value={formVac.fondo_ahorro_pct} onChange={v => setFormVac({ ...formVac, fondo_ahorro_pct: v })} />
            <CampoNum label="Bono anual" value={formVac.bono_anual} onChange={v => setFormVac({ ...formVac, bono_anual: v })} />
            <CampoNum label="PTU estimada" value={formVac.ptu_anual} onChange={v => setFormVac({ ...formVac, ptu_anual: v })} />
            <CampoNum label="Valor de seguros / año" value={formVac.valor_seguros} onChange={v => setFormVac({ ...formVac, valor_seguros: v })} />
            <CampoNum label="Bono de firma" value={formVac.bono_firma} onChange={v => setFormVac({ ...formVac, bono_firma: v })}
              hint="Pago único. Solo cuenta en el año 1." />
          </Seccion>

          <Seccion titulo="Modalidad y ubicación">
            <Select label="Modalidad" value={formVac.modalidad} onChange={v => setFormVac({ ...formVac, modalidad: v })}
              opciones={Object.entries(MODALIDADES)} />
            <CampoNum label="Días en oficina" value={formVac.dias_oficina} onChange={v => setFormVac({ ...formVac, dias_oficina: v })} />
            <Campo label="Ciudad" value={formVac.ciudad ?? ''} onChange={v => setFormVac({ ...formVac, ciudad: v })} />
            <CampoNum label="Traslado / mes" value={formVac.traslado_mensual} onChange={v => setFormVac({ ...formVac, traslado_mensual: v })} />
            <CampoNum label="Horas de traslado / semana" value={formVac.horas_traslado_semana} onChange={v => setFormVac({ ...formVac, horas_traslado_semana: v })} />
            <CampoNum label="Apoyo de home office / mes" value={formVac.apoyo_home_office} onChange={v => setFormVac({ ...formVac, apoyo_home_office: v })}
              hint="Internet y luz. La LFT lo obliga si trabajas +40% en casa." />
          </Seccion>

          <Seccion titulo="Si implica mudarte">
            <label className="flex items-center gap-2 text-sm text-body md:col-span-2">
              <input type="checkbox" checked={formVac.reubicacion}
                onChange={e => setFormVac({ ...formVac, reubicacion: e.target.checked })} />
              Tendría que reubicarme
            </label>
            <CampoNum label="Apoyo de reubicación" value={formVac.apoyo_reubicacion} onChange={v => setFormVac({ ...formVac, apoyo_reubicacion: v })}
              hint="Pago único. Solo cuenta en el año 1." />
            <CampoNum label="Renta en la nueva ciudad" value={formVac.renta_nueva} onChange={v => setFormVac({ ...formVac, renta_nueva: v })} />
            <CampoNum label="Ajuste de costo de vida (%)" value={formVac.ajuste_costo_vida} onChange={v => setFormVac({ ...formVac, ajuste_costo_vida: v })}
              hint="Cuánto más caro es todo lo demás. −10 si es más barato." />
          </Seccion>

          <Seccion titulo="Requisitos y notas">
            <div className="md:col-span-2">
              <Campo label="Lo que piden" value={formVac.requisitos ?? ''}
                onChange={v => setFormVac({ ...formVac, requisitos: v })}
                placeholder="AWS SAA, inglés C1, SAP"
                hint="Separado por comas. Se cruza con tus certificaciones." />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-muted block mb-1.5">Notas</label>
              <textarea className="input min-h-[80px]" value={formVac.notas ?? ''}
                onChange={e => setFormVac({ ...formVac, notas: e.target.value })}
                placeholder="Nombre del reclutador, qué te dijeron, con qué te quedaste dudando…" />
            </div>
          </Seccion>
        </Modal>
      )}

      {/* ═══ MODAL CERTIFICACIÓN ═══ */}
      {formCert && (
        <Modal titulo={formCert.id ? 'Editar certificación' : 'Nueva certificación'}
          onClose={() => setFormCert(null)}
          onGuardar={guardarCert} saving={saving} aviso={avisoForm}
          onBorrar={formCert.id ? () => borrarCert(formCert.id!) : undefined}>
          <Seccion titulo="Certificación">
            <Campo label="Nombre" value={formCert.nombre} onChange={v => setFormCert({ ...formCert, nombre: v })}
              placeholder="AWS Solutions Architect Associate" />
            <Campo label="Proveedor" value={formCert.proveedor ?? ''} onChange={v => setFormCert({ ...formCert, proveedor: v })}
              placeholder="AWS, Microsoft, Cisco, CompTIA" />
            <Select label="Estado" value={formCert.estado} onChange={v => setFormCert({ ...formCert, estado: v })}
              opciones={Object.entries(CERT_ESTADOS).map(([k, v]) => [k, v.n])} />
            <CampoNum label="Avance (%)" value={formCert.avance} onChange={v => setFormCert({ ...formCert, avance: v })} />
            <Campo label="Fecha objetivo" type="date" value={formCert.fecha_objetivo ?? ''}
              onChange={v => setFormCert({ ...formCert, fecha_objetivo: v || null })} />
            <Campo label="Examen agendado" type="date" value={formCert.fecha_examen ?? ''}
              onChange={v => setFormCert({ ...formCert, fecha_examen: v || null })} />
            <CampoNum label="Costo del examen" value={formCert.costo} onChange={v => setFormCert({ ...formCert, costo: v })} />
            <CampoNum label="Vigencia (años)" value={formCert.vigencia_anios} onChange={v => setFormCert({ ...formCert, vigencia_anios: v })} />
            <Campo label="La obtuve el" type="date" value={formCert.obtenida_el ?? ''}
              onChange={v => setFormCert({ ...formCert, obtenida_el: v || null })}
              hint="De aquí se calcula cuándo vence." />
          </Seccion>
        </Modal>
      )}
    </div>
  )
}

/* ═══ Subcomponentes ═══════════════════════════════════════════ */

/**
 * Ruta mas rapida para egresar.
 *
 * El orden no es cosmetico: las materias con seriacion solo se pueden
 * inscribir si su prerrequisito ya esta aprobado. Meter un eslabon antes
 * que su cabeza de cadena cuesta un cuatrimestre completo.
 */
function RutaMasRapida({ materias }: { materias: Materia[] }) {
  const porNumero = new Map(materias.map(m => [m.numero, m]))
  const pendientes = materias.filter(m => m.estado === 'pendiente')
  const ciclos = [...new Set(pendientes.map(m => m.ciclo_sugerido).filter(Boolean))].sort() as string[]

  const aprobadas = materias.filter(m => m.estado === 'aprobada')
  const cursando  = materias.filter(m => m.estado === 'cursando')
  const credTotal = materias.reduce((s, m) => s + num(m.creditos), 0)
  const credHechos = aprobadas.reduce((s, m) => s + num(m.creditos), 0)

  return (
    <div className="card">
      <p className="text-xs text-muted uppercase tracking-wider mb-1">Ruta más rápida para egresar</p>
      <p className="text-xs text-dim mb-4 max-w-2xl">
        {pendientes.length} materias pendientes en {ciclos.length} cuatrimestres. El orden importa:
        las marcadas con cadena solo se inscriben si su prerrequisito ya está aprobado.
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <Dato k="Aprobadas"  v={`${aprobadas.length}/${materias.length}`} sub={`${credHechos.toFixed(1)} de ${credTotal.toFixed(1)} cr`} />
        <Dato k="Cursando"   v={String(cursando.length)} sub="este ciclo" />
        <Dato k="Pendientes" v={String(pendientes.length)} sub={`${ciclos.length} cuatrimestres`} />
        <Dato k="Inglés"     v="fuera" sub="optativa no curricular" />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {ciclos.map(ciclo => {
          const delCiclo = pendientes.filter(m => m.ciclo_sugerido === ciclo)
          const cr = delCiclo.reduce((s, m) => s + num(m.creditos), 0)
          return (
            <div key={ciclo} className="rounded-xl p-4" style={{ background: 'var(--surface-2)' }}>
              <div className="flex items-baseline justify-between mb-3">
                <span className="text-strong font-semibold">Cuatrimestre {ciclo}</span>
                <span className="text-xs text-dim font-mono">{delCiclo.length} materias · {cr.toFixed(1)} cr</span>
              </div>
              <div className="space-y-2">
                {delCiclo.map(m => {
                  const req = m.seriacion ? porNumero.get(m.seriacion) : null
                  return (
                    <div key={m.numero} className="flex items-start gap-2 text-sm">
                      <span className="text-dim font-mono text-xs mt-0.5 w-6 flex-shrink-0">{m.numero}</span>
                      <div className="flex-1 min-w-0">
                        <span className="text-body">{m.nombre}</span>
                        {req && (
                          <span className="block text-xs text-dim mt-0.5">
                            🔗 requiere {req.numero} · {req.nombre}
                            {req.estado !== 'aprobada' && ` (${req.estado})`}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-dim font-mono flex-shrink-0">{num(m.creditos).toFixed(1)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Dato({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div className="stat-card">
      <p className="text-xs text-muted mb-1">{k}</p>
      <p className="text-lg font-bold text-strong font-mono">{v}</p>
      {sub && <p className="text-xs text-muted mt-1">{sub}</p>}
    </div>
  )
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <p className="text-xs uppercase tracking-wider text-indigo-400 mb-3">{titulo}</p>
      <div className="grid md:grid-cols-2 gap-4">{children}</div>
    </div>
  )
}

function Campo({ label, value, onChange, type = 'text', placeholder, hint }: {
  label: string; value: string; onChange: (v: string) => void
  type?: string; placeholder?: string; hint?: string
}) {
  return (
    <div>
      <label className="text-xs text-muted block mb-1.5">{label}</label>
      <input className="input" type={type} value={value} placeholder={placeholder}
        onChange={e => onChange(e.target.value)} />
      {hint && <p className="text-xs text-faint mt-1">{hint}</p>}
    </div>
  )
}

// El campo numerico vive en components/CampoNumero.tsx, compartido con los
// simuladores: la version local no dejaba borrar un cero. Este adaptador existe
// solo para conservar los nombres de prop que ya usan los 42 llamados de esta
// pagina; renombrarlos uno por uno seria ruido sin beneficio.
function CampoNum({ label, value, onChange, hint }: {
  label: string; value: number; onChange: (v: number) => void; hint?: string
}) {
  return <CampoNumero label={label} valor={value} onChange={onChange} ayuda={hint} />
}

function Select({ label, value, onChange, opciones }: {
  label: string; value: string; onChange: (v: string) => void
  opciones: Array<[string, string]> | Array<string[]>
}) {
  return (
    <div>
      <label className="text-xs text-muted block mb-1.5">{label}</label>
      <select className="input" value={value} onChange={e => onChange(e.target.value)}>
        {opciones.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
      </select>
    </div>
  )
}

function Desglose({ titulo, filas, total, extra, nota }: {
  titulo: string
  filas: Array<[string, string]>
  total: [string, string]
  extra?: Array<[string, string]>
  nota?: string | null
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-dim mb-2">{titulo}</p>
      <dl className="space-y-1 text-sm">
        {filas.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3">
            <dt className="text-muted min-w-0">{k}</dt>
            <dd className="font-mono text-body flex-shrink-0">{v}</dd>
          </div>
        ))}
        <div className="flex justify-between gap-3 pt-1.5 mt-1.5 font-semibold"
          style={{ borderTop: '1px solid var(--border)' }}>
          <dt className="text-body">{total[0]}</dt>
          <dd className="font-mono text-strong">{total[1]}</dd>
        </div>
        {extra?.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3">
            <dt className="text-muted min-w-0">{k}</dt>
            <dd className="font-mono text-green-400 flex-shrink-0">{v}</dd>
          </div>
        ))}
      </dl>
      {nota && <p className="text-xs text-dim mt-3 leading-relaxed">{nota}</p>}
    </div>
  )
}

function Modal({ titulo, children, onClose, onGuardar, onBorrar, saving, aviso }: {
  titulo: string; children: React.ReactNode
  onClose: () => void; onGuardar: () => void; onBorrar?: () => void
  saving: boolean; aviso?: string | null
}) {
  // Sin cierre al hacer clic en el fondo, a proposito: el formulario es largo,
  // el fondo queda expuesto alrededor, y un clic en el margen -- o un arrastre
  // al seleccionar texto que termine fuera -- borraba todo lo capturado sin
  // avisar. Para salir estan la X, Cancelar y Escape, gestos deliberados los
  // tres.
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto"
      style={{ background: 'rgba(20,22,26,.55)' }}>
      <div className="rounded-xl w-full max-w-3xl my-8"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: 'var(--sh-lg)' }}>
        <div className="flex items-center justify-between p-4 sticky top-0 rounded-t-xl"
          style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}>
          <h2 className="text-strong font-semibold">{titulo}</h2>
          <button onClick={onClose} className="text-muted hover:text-strong"><X size={18} /></button>
        </div>
        <div className="p-5">{children}</div>
        <div className="flex items-center gap-2 p-4 sticky bottom-0 rounded-b-xl flex-wrap"
          style={{ background: 'var(--bg-card)', borderTop: '1px solid var(--border)' }}>
          {aviso && <p className="w-full text-sm" style={{ color: 'var(--red)' }}>{aviso}</p>}
          {onBorrar && (
            <button className="btn-danger text-sm flex items-center gap-1.5" onClick={onBorrar}>
              <Trash2 size={14} /> Eliminar
            </button>
          )}
          <span className="flex-1" />
          <button className="btn-secondary text-sm" onClick={onClose}>Cancelar</button>
          <button className="btn-primary text-sm" onClick={onGuardar} disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
