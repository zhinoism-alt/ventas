import { useEffect, useState } from 'react'
import {
  PiggyBank, Plus, TrendingUp, Target, Trash2,
  ChevronDown, ChevronUp, ArrowUpCircle, ArrowDownCircle,
  Wallet, Percent, Edit2, Check, X, AlertCircle,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { AvisoError } from '../components/AvisoError'
import { Patrimonio } from '../components/Patrimonio'
import { fmt } from '../lib/utils'
import { useDraft } from '../lib/useDraft'
import { AvisoForm, BorradorRecuperado } from '../components/FormAvisos'

// ── Tipos ────────────────────────────────────────────────────────────────────

interface Ahorro {
  id: number
  nombre: string
  meta: number
  acumulado: number
  moneda: string
  fecha_meta: string | null
  descripcion: string
  icono: string
  color: string
  activo: boolean
}

interface Movimiento {
  id: number
  ahorro_id: number
  monto: number
  tipo: 'deposito' | 'retiro'
  nota: string
  fecha: string
}

interface MovFondo {
  id: number
  fondo_id: number
  monto: number
  tipo: 'abono' | 'retiro' | 'ajuste' | 'rendimiento'
  saldo_despues: number | null
  nota: string
  fecha: string
}

/** Lo minimo de finanzas_perfil para poder descontar impuestos e inflacion. */
interface Supuestos {
  isr_retencion_pct: number
  inflacion_pct: number
}

/** Una cuenta de Patrimonio, solo para detectar dinero capturado dos veces. */
interface CuentaPatrimonio {
  institucion: string | null
  saldo: number
}

interface Fondo {
  id: number
  nombre: string
  saldo: number
  moneda: string
  rendimiento: number   // % anual
  descripcion: string
  icono: string
  color: string
  activo: boolean
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="w-full h-2 rounded-full" style={{ background: 'var(--surface-2)' }}>
      <div className="h-2 rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

const num2 = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''))
  return Number.isFinite(n) ? n : 0
}

/** Un renglon del desglose: concepto a la izquierda, monto a la derecha. */
function Renglon({ k, v, tono }: { k: string; v: string; tono?: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-dim truncate">{k}</span>
      <span className="text-xs font-mono flex-shrink-0" style={{ color: tono ?? 'var(--text-body)' }}>{v}</span>
    </div>
  )
}

const ICONOS = ['💰', '🛡️', '📈', '🏦', '🎯', '🏠', '✈️', '🚗', '💻', '📱', '💍', '🏖️', '📚', '💎']

// ── Componente principal ─────────────────────────────────────────────────────

export default function Ahorros() {
  // — Metas —
  const [ahorros, setAhorros]       = useState<Ahorro[]>([])
  const [movimientos, setMovimientos] = useState<Movimiento[]>([])
  const [showMetaForm, setShowMetaForm] = useState(false)
  const [expanded, setExpanded]     = useState<number | null>(null)
  const [movForm, setMovForm]       = useState<{ id: number | null; tipo: 'deposito' | 'retiro'; monto: string; nota: string }>({
    id: null, tipo: 'deposito', monto: '', nota: '',
  })
  // Borrador: lo escrito sobrevive a un remonte, a una recarga o a un Cancelar
  // por error. Antes cualquiera de las tres cosas lo borraba sin aviso.
  const bMeta = useDraft('ahorros-meta', { nombre: '', meta: '', descripcion: '', fecha_meta: '', color: 'var(--accent)', icono: '🎯' })
  const metaForm = bMeta.valor
  const setMetaForm = bMeta.set

  // — Fondos —
  const [fondos, setFondos]         = useState<Fondo[]>([])
  const [showFondoForm, setShowFondoForm] = useState(false)
  const bFondo = useDraft('ahorros-fondo', { nombre: '', saldo: '', rendimiento: '', descripcion: '', color: 'var(--green)', icono: '💰' })
  const fondoForm = bFondo.valor
  const setFondoForm = bFondo.set
  // Antes solo se podia tocar el saldo. El rendimiento, el nombre y el resto
  // quedaban congelados desde el alta, que es justo lo que cambia cuando el
  // banco mueve su tasa o se acaba una promocion.
  const [editFondo, setEditFondo]   = useState<Fondo | null>(null)
  const [editForm, setEditForm]     = useState({ nombre: '', saldo: '', rendimiento: '', descripcion: '', color: '', icono: '' })

  const abrirEdicionFondo = (f: Fondo) => {
    setErrorForm(null)
    setEditFondo(f)
    setEditForm({
      nombre: f.nombre, saldo: String(f.saldo), rendimiento: String(f.rendimiento),
      descripcion: f.descripcion ?? '', color: f.color, icono: f.icono,
    })
  }

  // — General —
  const [movFondos, setMovFondos]   = useState<MovFondo[]>([])
  const [abonoDe, setAbonoDe]       = useState<number | null>(null)
  const [abono, setAbono]           = useState({ monto: '', nota: '' })
  const [supuestos, setSupuestos]   = useState<Supuestos | null>(null)
  const [cuentasPat, setCuentasPat] = useState<CuentaPatrimonio[]>([])
  const [loading, setLoading]       = useState(true)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [saving, setSaving]         = useState(false)
  const [errorForm, setErrorForm]   = useState<string | null>(null)
  const [tab, setTab]               = useState<'fondos' | 'metas' | 'patrimonio'>('fondos')

  // ── Carga de datos ──────────────────────────────────────────────────────────

  const load = async () => {
    setErrorCarga(null)
    // El finally es obligatorio: si una consulta rechaza (base pausada,
    // red caída), sin él el spinner se queda girando para siempre.
    try {
      const [{ data: a }, { data: m }, { data: f }, { data: sup }, { data: cp }, { data: mf }] = await Promise.all([
        supabase.from('ahorros').select('*').eq('activo', true).order('created_at', { ascending: false }),
        supabase.from('ahorros_movimientos').select('*').order('fecha', { ascending: false }),
        supabase.from('fondos_ahorro').select('*').eq('activo', true).order('created_at', { ascending: false }),
        // Los mismos supuestos que usa Patrimonio: si cada pestana inventara
        // los suyos, el mismo dinero daria dos numeros distintos.
        supabase.from('finanzas_perfil').select('isr_retencion_pct,inflacion_pct').eq('id', 1).maybeSingle(),
        supabase.from('ahorros_cuentas').select('institucion,saldo').eq('activo', true),
        supabase.from('fondos_movimientos').select('*').order('fecha', { ascending: false }).limit(200),
      ])
      setAhorros(a ?? [])
      setMovimientos(m ?? [])
      setFondos(f ?? [])
      setSupuestos((sup as Supuestos) ?? null)
      setCuentasPat((cp ?? []) as CuentaPatrimonio[])
      setMovFondos((mf ?? []) as MovFondo[])
    } catch (e) {
      console.error('[Ahorros] no se pudieron cargar los datos', e)
      setErrorCarga(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // ── Fondos: CRUD ────────────────────────────────────────────────────────────

  const createFondo = async () => {
    // Antes esto era un `return` mudo: el boton no hacia nada y no habia manera
    // de saber por que.
    if (!fondoForm.nombre.trim()) return setErrorForm('Falta el nombre del fondo.')
    if (!fondoForm.saldo)         return setErrorForm('Falta el saldo actual.')
    setErrorForm(null)
    setSaving(true)
    try {
      const { error } = await supabase.from('fondos_ahorro').insert({
        nombre:      fondoForm.nombre.trim(),
        saldo:       Number(fondoForm.saldo),
        rendimiento: Number(fondoForm.rendimiento) || 0,
        descripcion: fondoForm.descripcion,
        color:       fondoForm.color,
        icono:       fondoForm.icono,
      })
      // Si falla, el formulario se queda abierto y con todo lo escrito dentro.
      if (error) { setErrorForm(`No se guardo: ${error.message}`); return }
      bFondo.limpiar()
      setShowFondoForm(false)
      load()
    } catch (e) {
      setErrorForm(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  /**
   * Suma o resta del saldo y deja constancia. El calculo se hace aqui sobre el
   * saldo que ya tenemos cargado, no con una suma en la base: si otro
   * dispositivo lo movio mientras tanto, recargar antes de guardar seria mas
   * correcto, pero para un tablero de una sola persona esto sobra.
   */
  const moverFondo = async (fondo: Fondo, signo: 1 | -1) => {
    const monto = Number(abono.monto)
    if (!abono.monto || !Number.isFinite(monto) || monto <= 0)
      return setErrorForm('Escribe cuánto vas a mover, en positivo.')
    const nuevo = fondo.saldo + signo * monto
    if (nuevo < 0) return setErrorForm(`No puedes sacar ${fmt(monto)}: el fondo tiene ${fmt(fondo.saldo)}.`)
    setErrorForm(null)
    setSaving(true)
    try {
      const { error } = await supabase.from('fondos_ahorro')
        .update({ saldo: nuevo, updated_at: new Date().toISOString() }).eq('id', fondo.id)
      if (error) { setErrorForm(`No se guardó: ${error.message}`); return }
      // La bitacora es secundaria: si falla, el saldo ya quedo bien y no vale
      // la pena tirar la operacion entera.
      const { error: errMov } = await supabase.from('fondos_movimientos').insert({
        fondo_id: fondo.id, monto, tipo: signo > 0 ? 'abono' : 'retiro',
        saldo_despues: nuevo, nota: abono.nota,
      })
      if (errMov) console.error('[Ahorros] el saldo se guardó pero no el movimiento', errMov)
      setAbono({ monto: '', nota: '' })
      setAbonoDe(null)
      load()
    } catch (e) {
      setErrorForm(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const guardarFondo = async (fondo: Fondo) => {
    if (!editForm.nombre.trim()) return setErrorForm('El fondo necesita un nombre.')
    const saldo = Number(editForm.saldo)
    if (!Number.isFinite(saldo)) return setErrorForm('El saldo no es un numero.')
    const rendimiento = Number(editForm.rendimiento) || 0
    setErrorForm(null)
    setSaving(true)
    try {
      const { error } = await supabase.from('fondos_ahorro').update({
        nombre:      editForm.nombre.trim(),
        saldo,
        rendimiento,
        descripcion: editForm.descripcion,
        color:       editForm.color,
        icono:       editForm.icono,
        updated_at:  new Date().toISOString(),
      }).eq('id', fondo.id)
      if (error) { setErrorForm(`No se guardo: ${error.message}`); return }
      setEditFondo(null)
      load()
    } catch (e) {
      setErrorForm(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const deleteFondo = async (id: number) => {
    if (!confirm('¿Eliminar este fondo?')) return
    await supabase.from('fondos_ahorro').update({ activo: false }).eq('id', id)
    load()
  }

  // ── Metas: CRUD ─────────────────────────────────────────────────────────────

  const createAhorro = async () => {
    if (!metaForm.nombre.trim()) return setErrorForm('Falta el nombre de la meta.')
    if (!metaForm.meta)          return setErrorForm('Falta cuanto quieres juntar.')
    setErrorForm(null)
    setSaving(true)
    try {
      const { error } = await supabase.from('ahorros').insert({
        nombre:      metaForm.nombre.trim(),
        meta:        Number(metaForm.meta),
        descripcion: metaForm.descripcion,
        fecha_meta:  metaForm.fecha_meta || null,
        color:       metaForm.color,
        icono:       metaForm.icono,
      })
      if (error) { setErrorForm(`No se guardo: ${error.message}`); return }
      bMeta.limpiar()
      setShowMetaForm(false)
      load()
    } catch (e) {
      setErrorForm(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const agregarMovimiento = async () => {
    if (!movForm.id) return
    if (!movForm.monto) return setErrorForm('Escribe el monto del movimiento.')
    setErrorForm(null)
    setSaving(true)
    const monto = Number(movForm.monto)
    await supabase.from('ahorros_movimientos').insert({
      ahorro_id: movForm.id, monto, tipo: movForm.tipo, nota: movForm.nota,
    })
    const ahorro = ahorros.find(a => a.id === movForm.id)
    if (ahorro) {
      const nuevo = movForm.tipo === 'deposito'
        ? ahorro.acumulado + monto
        : Math.max(0, ahorro.acumulado - monto)
      await supabase.from('ahorros').update({ acumulado: nuevo, updated_at: new Date().toISOString() }).eq('id', movForm.id)
    }
    setMovForm({ id: null, tipo: 'deposito', monto: '', nota: '' })
    setSaving(false)
    load()
  }

  const deleteAhorro = async (id: number) => {
    if (!confirm('¿Eliminar esta meta de ahorro?')) return
    await supabase.from('ahorros').update({ activo: false }).eq('id', id)
    load()
  }

  // ── Stats ───────────────────────────────────────────────────────────────────

  const totalFondos    = fondos.reduce((s, f) => s + f.saldo, 0)
  const totalMeta      = ahorros.reduce((s, a) => s + a.meta, 0)
  const totalAcumulado = ahorros.reduce((s, a) => s + a.acumulado, 0)
  const totalGeneral   = totalFondos + totalAcumulado
  const gananciasAnualesEstimadas = fondos.reduce((s, f) => s + f.saldo * (f.rendimiento / 100), 0)

  // La tasa que anuncia el banco no es lo que ganas. El ISR se retiene sobre el
  // CAPITAL (0.90% en 2026, LIF art. 24) tengas rendimiento o no, y la
  // inflacion se lleva el resto. Esta pestana mostraba el bruto y Patrimonio el
  // real: el mismo dinero con dos cifras distintas, y la optimista al frente.
  const isrPct  = num2(supuestos?.isr_retencion_pct) / 100
  const inflPct = num2(supuestos?.inflacion_pct) / 100
  const isrFondos  = totalFondos * isrPct
  const inflFondos = totalFondos * inflPct
  const gananciaReal = gananciasAnualesEstimadas - isrFondos - inflFondos
  const haySupuestos = !!supuestos

  // Aviso de doble captura: el saldo de Patrimonio contra el de esta pestana.
  const totalPatrimonio = cuentasPat.reduce((t, c) => t + num2(c.saldo), 0)
  const saldosRepetidos = cuentasPat.filter(c =>
    fondos.some(f => Math.abs(f.saldo - num2(c.saldo)) < 0.01))

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full" />
    </div>
  )

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <AvisoError mensaje={errorCarga} onReintentar={() => { setLoading(true); load() }} />

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-strong flex items-center gap-2">
            <PiggyBank className="text-indigo-400" size={24} /> Ahorros
          </h1>
          <p className="text-muted text-sm mt-1">Fondos y metas de ahorro</p>
        </div>
        <button
          onClick={() => tab === 'fondos' ? setShowFondoForm(true) : setShowMetaForm(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
          style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-2))' }}>
          <Plus size={16} /> {tab === 'fondos' ? 'Nuevo Fondo' : 'Nueva Meta'}
        </button>
      </div>

      {/* ── Resumen general ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card col-span-2 lg:col-span-1">
          <p className="text-xs text-muted mb-1">Total Ahorrado</p>
          <p className="text-xl font-bold text-strong">{fmt(totalGeneral)}</p>
          <p className="text-xs text-muted mt-1">fondos + metas</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-muted mb-1">En Fondos</p>
          <p className="text-xl font-bold text-green-400">{fmt(totalFondos)}</p>
          <p className="text-xs text-muted mt-1">{fondos.length} apartado{fondos.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-muted mb-1">Rendimiento real</p>
          <p className="text-xl font-bold" style={{ color: gananciaReal >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {haySupuestos ? fmt(gananciaReal) : fmt(gananciasAnualesEstimadas)}
          </p>
          <p className="text-xs text-muted mt-1">
            {haySupuestos
              ? `${fmt(gananciasAnualesEstimadas)} menos ISR e inflación`
              : 'sin descontar impuestos'}
          </p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-muted mb-1">Metas — Progreso</p>
          <p className="text-xl font-bold text-strong">
            {totalMeta > 0 ? ((totalAcumulado / totalMeta) * 100).toFixed(1) : '0'}%
          </p>
          <p className="text-xs text-muted mt-1">{fmt(totalAcumulado)} de {fmt(totalMeta)}</p>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--surface-2)' }}>
        {(['fondos', 'metas', 'patrimonio'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="flex-1 py-2 rounded-lg text-sm font-medium transition-all"
            style={tab === t
              ? { background: 'var(--accent)', color: '#fff' }
              : { color: 'var(--text-muted)' }}>
            {t === 'fondos'   ? `💰 Fondos (${fondos.length})`
           : t === 'metas'    ? `🎯 Metas (${ahorros.length})`
           :                    '🏦 Patrimonio'}
          </button>
        ))}
      </div>

      {/* ══════════════════ TAB: FONDOS ══════════════════ */}
      {tab === 'patrimonio' && <Patrimonio />}

      {tab === 'fondos' && (
        <div className="space-y-4">

          {/* El mismo dinero capturado en dos tablas da dos patrimonios
              distintos, y no hay forma de saber cual creer. Mejor decirlo. */}
          {!!saldosRepetidos.length && (
            <div className="card flex items-start gap-3 py-3"
                 style={{ background: 'var(--yellow-soft)', borderColor: 'var(--yellow)' }}>
              <AlertCircle size={16} style={{ color: 'var(--yellow)' }} className="mt-0.5 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium" style={{ color: 'var(--yellow)' }}>
                  Este dinero está capturado dos veces
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--yellow)' }}>
                  {saldosRepetidos.map(c => c.institucion).filter(Boolean).join(' y ')} aparecen
                  aquí como fondos y también en Patrimonio como cuentas, con el mismo saldo.
                  Aquí suman {fmt(totalFondos)} y allá {fmt(totalPatrimonio)}: son listas
                  distintas del mismo dinero, así que ninguna es tu patrimonio completo.
                </p>
              </div>
            </div>
          )}

          {/* Form nuevo fondo */}
          {showFondoForm && (
            <div className="card">
              <h2 className="text-sm font-semibold text-strong mb-4 flex items-center gap-2">
                <Wallet size={14} className="text-green-400" /> Nuevo Fondo / Apartado
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-muted mb-1 block">Nombre *</label>
                  <input className="input w-full" placeholder="Ej: Fondo de Emergencia…"
                    value={fondoForm.nombre}
                    onChange={e => setFondoForm(f => ({ ...f, nombre: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-muted mb-1 block">Saldo actual (MXN) *</label>
                  <input className="input w-full" type="number" placeholder="0.00"
                    value={fondoForm.saldo}
                    onChange={e => setFondoForm(f => ({ ...f, saldo: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-muted mb-1 block">Rendimiento anual (%)</label>
                  <input className="input w-full" type="number" step="0.1" placeholder="Ej: 8.5"
                    value={fondoForm.rendimiento}
                    onChange={e => setFondoForm(f => ({ ...f, rendimiento: e.target.value }))} />
                  <p className="text-xs text-dim mt-1">Deja en 0 si no genera intereses</p>
                </div>
                <div>
                  <label className="text-xs text-muted mb-1 block">Descripción</label>
                  <input className="input w-full" placeholder="Ej: CETES, cuenta BBVA…"
                    value={fondoForm.descripcion}
                    onChange={e => setFondoForm(f => ({ ...f, descripcion: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-muted mb-1 block">Ícono</label>
                  <div className="flex gap-2 flex-wrap">
                    {ICONOS.map(ic => (
                      <button key={ic} onClick={() => setFondoForm(f => ({ ...f, icono: ic }))}
                        className={`text-xl p-1.5 rounded-lg transition-all ${fondoForm.icono === ic ? 'ring-2 ring-green-500' : ''}`}
                        style={{ background: 'var(--surface-2)' }}>{ic}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted mb-1 block">Color</label>
                  <input type="color" className="w-full h-9 rounded-lg cursor-pointer"
                    value={fondoForm.color}
                    onChange={e => setFondoForm(f => ({ ...f, color: e.target.value }))} />
                </div>
              </div>
              <AvisoForm mensaje={errorForm} />
              <BorradorRecuperado b={bFondo} />
              <div className="flex gap-3 mt-4">
                <button onClick={createFondo} disabled={saving}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-strong"
                  style={{ background: 'var(--green)' }}>
                  {saving ? 'Guardando…' : 'Crear Fondo'}
                </button>
                <button onClick={() => { setErrorForm(null); setShowFondoForm(false) }}
                  className="px-4 py-2 rounded-lg text-sm text-muted hover:text-strong">
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Lista de fondos */}
          {fondos.length === 0 ? (
            <div className="card text-center py-12">
              <Wallet size={40} className="mx-auto text-faint mb-3" />
              <p className="text-strong font-medium">Sin fondos aún</p>
              <p className="text-muted text-sm mt-1">Agrega tus cuentas, CETES, fondos de emergencia…</p>
              <button onClick={() => setShowFondoForm(true)}
                className="mt-4 px-4 py-2 rounded-lg text-sm font-medium text-strong inline-flex items-center gap-2"
                style={{ background: 'var(--green)' }}>
                <Plus size={14} /> Crear primer fondo
              </button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {fondos.map(f => {
                const gananciasAnual = f.saldo * (f.rendimiento / 100)
                // Lo que de verdad te queda: el banco paga el bruto, el ISR
                // muerde el capital y la inflacion se lleva el resto.
                const isrFondo      = f.saldo * isrPct
                const inflFondo     = f.saldo * inflPct
                const realAnual     = gananciasAnual - isrFondo - inflFondo
                const totalAnio     = f.saldo + (haySupuestos ? realAnual : gananciasAnual)
                const movs          = movFondos.filter(mv => mv.fondo_id === f.id).slice(0, 5)
                const abonando      = abonoDe === f.id
                const isEditing     = editFondo?.id === f.id
                return (
                  <div key={f.id} className="card relative overflow-hidden">
                    {/* Barra de color lateral */}
                    <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl"
                      style={{ background: f.color }} />

                    <div className="pl-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                            style={{ background: f.color + '22' }}>{f.icono}</div>
                          <div>
                            <p className="font-semibold text-strong">{f.nombre}</p>
                            {f.descripcion && <p className="text-xs text-muted">{f.descripcion}</p>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button onClick={() => abrirEdicionFondo(f)}
                            className="text-dim hover:text-blue-400 p-1.5 rounded-lg transition-colors"
                            title="Editar este fondo">
                            <Edit2 size={13} />
                          </button>
                          <button onClick={() => deleteFondo(f.id)}
                            className="text-dim hover:text-red-400 p-1.5 rounded-lg transition-colors">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>

                      {/* Saldo */}
                      <div className="mt-4">
                        {isEditing ? (
                          <div className="rounded-xl p-3 space-y-3" style={{ background: 'var(--surface-2)' }}>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <label className="text-xs text-muted mb-1 block">Nombre *</label>
                                <input className="input w-full" value={editForm.nombre} autoFocus
                                  onChange={e => setEditForm(v => ({ ...v, nombre: e.target.value }))} />
                              </div>
                              <div>
                                <label className="text-xs text-muted mb-1 block">Saldo actual *</label>
                                <input className="input w-full font-bold" type="number" value={editForm.saldo}
                                  onChange={e => setEditForm(v => ({ ...v, saldo: e.target.value }))}
                                  onKeyDown={e => e.key === 'Enter' && guardarFondo(f)} />
                              </div>
                              <div>
                                <label className="text-xs text-muted mb-1 block">Rendimiento anual (%)</label>
                                <input className="input w-full" type="number" step="0.01" value={editForm.rendimiento}
                                  onChange={e => setEditForm(v => ({ ...v, rendimiento: e.target.value }))} />
                                <p className="text-xs text-dim mt-1">Cámbialo cuando el banco mueva su tasa</p>
                              </div>
                              <div>
                                <label className="text-xs text-muted mb-1 block">Descripción</label>
                                <input className="input w-full" value={editForm.descripcion}
                                  placeholder="CETES, cuenta Mifel…"
                                  onChange={e => setEditForm(v => ({ ...v, descripcion: e.target.value }))} />
                              </div>
                            </div>
                            <div className="flex gap-3 flex-wrap items-end">
                              <div className="flex-1" style={{ minWidth: 180 }}>
                                <label className="text-xs text-muted mb-1 block">Ícono</label>
                                <div className="flex gap-1.5 flex-wrap">
                                  {ICONOS.map(ic => (
                                    <button key={ic} onClick={() => setEditForm(v => ({ ...v, icono: ic }))}
                                      className={`text-lg p-1 rounded-lg transition-all ${editForm.icono === ic ? 'ring-2 ring-green-500' : ''}`}
                                      style={{ background: 'var(--bg-card)' }}>{ic}</button>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <label className="text-xs text-muted mb-1 block">Color</label>
                                <input type="color" className="w-20 h-9 rounded-lg cursor-pointer"
                                  value={editForm.color.startsWith('#') ? editForm.color : '#22c55e'}
                                  onChange={e => setEditForm(v => ({ ...v, color: e.target.value }))} />
                              </div>
                            </div>
                            <AvisoForm mensaje={errorForm} />
                            <div className="flex gap-2">
                              <button onClick={() => guardarFondo(f)} disabled={saving}
                                className="btn-primary text-sm">
                                <Check size={14} /> {saving ? 'Guardando…' : 'Guardar cambios'}
                              </button>
                              <button onClick={() => { setErrorForm(null); setEditFondo(null) }}
                                className="btn-secondary text-sm">
                                <X size={14} /> Cancelar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-2xl font-bold text-strong">{fmt(f.saldo)}</p>
                        )}
                        <p className="text-xs text-dim mt-0.5">saldo actual</p>
                      </div>

                      {/* Abonar o sacar: lo que mas se hace y lo que no existia.
                          Antes habia que editar el saldo a mano y calcular la
                          suma de cabeza, sin quedar constancia de nada. */}
                      {!isEditing && (
                        <div className="mt-3">
                          {!abonando ? (
                            <button onClick={() => { setErrorForm(null); setAbonoDe(f.id); setAbono({ monto: '', nota: '' }) }}
                              className="btn-secondary text-xs w-full">
                              <Plus size={13} /> Abonar o sacar
                            </button>
                          ) : (
                            <div className="rounded-lg p-3 space-y-2" style={{ background: 'var(--surface-2)' }}>
                              <div className="flex gap-2">
                                <input className="input flex-1" type="number" placeholder="250" autoFocus
                                  value={abono.monto}
                                  onChange={e => setAbono(v => ({ ...v, monto: e.target.value }))}
                                  onKeyDown={e => e.key === 'Enter' && moverFondo(f, 1)} />
                                <input className="input flex-1" placeholder="Nota (opcional)"
                                  value={abono.nota}
                                  onChange={e => setAbono(v => ({ ...v, nota: e.target.value }))} />
                              </div>
                              {!!Number(abono.monto) && (
                                <p className="text-xs font-mono text-dim">
                                  {fmt(f.saldo)} + {fmt(Number(abono.monto))} ={' '}
                                  <strong className="text-body">{fmt(f.saldo + Number(abono.monto))}</strong>
                                </p>
                              )}
                              <div className="flex gap-2 flex-wrap">
                                <button onClick={() => moverFondo(f, 1)} disabled={saving}
                                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-white flex-1"
                                  style={{ background: 'var(--green)' }}>
                                  {saving ? 'Guardando…' : 'Abonar'}
                                </button>
                                <button onClick={() => moverFondo(f, -1)} disabled={saving}
                                  className="btn-secondary text-xs" style={{ color: 'var(--red)' }}>
                                  Sacar
                                </button>
                                <button onClick={() => { setErrorForm(null); setAbonoDe(null) }}
                                  className="btn-secondary text-xs">Cancelar</button>
                              </div>
                              {abonando && <AvisoForm mensaje={errorForm} />}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Rendimiento */}
                      <div className="mt-4 pt-3 grid grid-cols-2 gap-3" style={{ borderTop: '1px solid var(--border)' }}>
                        <div className="rounded-lg p-2.5" style={{ background: 'var(--bg)' }}>
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <Percent size={11} className="text-yellow-400" />
                            <p className="text-xs text-muted">Rendimiento anual</p>
                          </div>
                          <p className="text-base font-bold text-yellow-400">{f.rendimiento}%</p>
                        </div>
                        <div className="rounded-lg p-2.5" style={{ background: 'var(--bg)' }}>
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <TrendingUp size={11} className="text-green-400" />
                            <p className="text-xs text-muted">
                              {haySupuestos ? 'Ganancia real' : 'Ganancia anual est.'}
                            </p>
                          </div>
                          <p className="text-base font-bold"
                             style={{ color: (haySupuestos ? realAnual : gananciasAnual) >= 0 ? 'var(--green)' : 'var(--red)' }}>
                            {(haySupuestos ? realAnual : gananciasAnual) >= 0 ? '+' : ''}
                            {fmt(haySupuestos ? realAnual : gananciasAnual)}
                          </p>
                        </div>
                      </div>

                      {/* El desglose, no solo el resultado. Ver que el ISR se
                          cobra sobre el capital explica por que un fondo con
                          tasa baja puede perder contra la inflacion. */}
                      {haySupuestos && (
                        <div className="mt-2 rounded-lg px-3 py-2 space-y-1"
                             style={{ background: 'var(--bg)' }}>
                          <Renglon k={`Lo que paga (${f.rendimiento}%)`} v={`+${fmt(gananciasAnual)}`} />
                          <Renglon k={`ISR ${(isrPct * 100).toFixed(2)}% del saldo`}
                                   v={`−${fmt(isrFondo)}`} tono="var(--red)" />
                          <Renglon k={`Inflación ${(inflPct * 100).toFixed(2)}%`}
                                   v={`−${fmt(inflFondo)}`} tono="var(--red)" />
                          <div className="flex items-center justify-between pt-1"
                               style={{ borderTop: '1px solid var(--border)' }}>
                            <span className="text-xs font-medium text-body">Te queda</span>
                            <span className="text-xs font-mono font-bold"
                                  style={{ color: realAnual >= 0 ? 'var(--green)' : 'var(--red)' }}>
                              {realAnual >= 0 ? '+' : ''}{fmt(realAnual)}
                            </span>
                          </div>
                        </div>
                      )}

                      {f.rendimiento > 0 && (
                        <div className="mt-2 rounded-lg px-3 py-2 flex items-center justify-between"
                          style={{ background: f.color + '15', border: `1px solid ${f.color}30` }}>
                          <span className="text-xs text-muted">
                            Total en 1 año{haySupuestos ? ', en pesos de hoy' : ''}
                          </span>
                          <span className="text-sm font-bold" style={{ color: f.color }}>{fmt(totalAnio)}</span>
                        </div>
                      )}

                      {!!movs.length && (
                        <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                          <p className="text-xs text-muted mb-1.5">Últimos movimientos</p>
                          <div className="space-y-1">
                            {movs.map(mv => (
                              <div key={mv.id} className="flex items-center justify-between text-xs gap-2">
                                <span className="text-dim truncate">
                                  {new Date(mv.fecha).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
                                  {mv.nota ? ` · ${mv.nota}` : ''}
                                </span>
                                <span className="font-mono flex-shrink-0"
                                      style={{ color: mv.tipo === 'retiro' ? 'var(--red)' : 'var(--green)' }}>
                                  {mv.tipo === 'retiro' ? '−' : '+'}{fmt(mv.monto)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Resumen total de fondos */}
          {fondos.length > 1 && (
            <div className="card" style={{ background: 'var(--green-soft)', border: '1px solid var(--green)' }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                  style={{ background: 'var(--green-soft)' }}>📊</div>
                <div className="min-w-0">
                  <p className="text-xs text-muted">Proyección a 12 meses</p>
                  <p className="text-xl font-bold text-green-400">
                    {fmt(totalFondos + (haySupuestos ? gananciaReal : gananciasAnualesEstimadas))}
                  </p>
                  {haySupuestos ? (
                    <p className="text-xs text-dim">
                      En pesos de hoy. El banco pagaría {fmt(gananciasAnualesEstimadas)},
                      pero el ISR se lleva {fmt(isrFondos)} y la inflación {fmt(inflFondos)}:
                      te quedan <strong className="text-body">{fmt(gananciaReal)}</strong> de
                      poder adquisitivo real.
                    </p>
                  ) : (
                    <p className="text-xs text-dim">
                      +{fmt(gananciasAnualesEstimadas)} sobre {fmt(totalFondos)}, sin descontar
                      impuestos ni inflación.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════ TAB: METAS ══════════════════ */}
      {tab === 'metas' && (
        <div className="space-y-4">

          {/* Form nueva meta */}
          {showMetaForm && (
            <div className="card">
              <h2 className="text-sm font-semibold text-strong mb-4 flex items-center gap-2">
                <Target size={14} className="text-indigo-400" /> Nueva Meta de Ahorro
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-muted mb-1 block">Nombre *</label>
                  <input className="input w-full" placeholder="Ej: Departamento, Viaje…"
                    value={metaForm.nombre}
                    onChange={e => setMetaForm(f => ({ ...f, nombre: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-muted mb-1 block">Meta (MXN) *</label>
                  <input className="input w-full" type="number" placeholder="0.00"
                    value={metaForm.meta}
                    onChange={e => setMetaForm(f => ({ ...f, meta: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-muted mb-1 block">Descripción</label>
                  <input className="input w-full" placeholder="Opcional…"
                    value={metaForm.descripcion}
                    onChange={e => setMetaForm(f => ({ ...f, descripcion: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-muted mb-1 block">Fecha límite</label>
                  <input className="input w-full" type="date"
                    value={metaForm.fecha_meta}
                    onChange={e => setMetaForm(f => ({ ...f, fecha_meta: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-muted mb-1 block">Ícono</label>
                  <div className="flex gap-2 flex-wrap">
                    {ICONOS.map(ic => (
                      <button key={ic} onClick={() => setMetaForm(f => ({ ...f, icono: ic }))}
                        className={`text-xl p-1.5 rounded-lg transition-all ${metaForm.icono === ic ? 'ring-2 ring-indigo-500' : ''}`}
                        style={{ background: 'var(--surface-2)' }}>{ic}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted mb-1 block">Color</label>
                  <input type="color" className="w-full h-9 rounded-lg cursor-pointer"
                    value={metaForm.color}
                    onChange={e => setMetaForm(f => ({ ...f, color: e.target.value }))} />
                </div>
              </div>
              <AvisoForm mensaje={errorForm} />
              <BorradorRecuperado b={bMeta} />
              <div className="flex gap-3 mt-4">
                <button onClick={createAhorro} disabled={saving}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white"
                  style={{ background: 'var(--accent)' }}>
                  {saving ? 'Guardando…' : 'Crear Meta'}
                </button>
                <button onClick={() => { setErrorForm(null); setShowMetaForm(false) }}
                  className="px-4 py-2 rounded-lg text-sm text-muted hover:text-strong">
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Lista de metas */}
          {ahorros.length === 0 ? (
            <div className="card text-center py-12">
              <PiggyBank size={40} className="mx-auto text-faint mb-3" />
              <p className="text-strong font-medium">Sin metas de ahorro</p>
              <p className="text-muted text-sm mt-1">Crea tu primera meta para empezar a ahorrar</p>
              <button onClick={() => setShowMetaForm(true)}
                className="mt-4 px-4 py-2 rounded-lg text-sm font-medium text-white inline-flex items-center gap-2"
                style={{ background: 'var(--accent)' }}>
                <Plus size={14} /> Crear primera meta
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {ahorros.map(a => {
                const pct = a.meta > 0 ? Math.min(100, (a.acumulado / a.meta) * 100) : 0
                const isExpanded = expanded === a.id
                const movs = movimientos.filter(m => m.ahorro_id === a.id)
                return (
                  <div key={a.id} className="card">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                          style={{ background: a.color + '22' }}>{a.icono}</div>
                        <div>
                          <p className="font-semibold text-strong">{a.nombre}</p>
                          {a.descripcion && <p className="text-xs text-muted">{a.descripcion}</p>}
                          {a.fecha_meta && (
                            <p className="text-xs text-dim mt-0.5">
                              Meta: {new Date(a.fecha_meta + 'T00:00:00').toLocaleDateString('es-MX', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          <p className="text-strong font-bold">{fmt(a.acumulado)}</p>
                          <p className="text-xs text-muted">de {fmt(a.meta)}</p>
                        </div>
                        <button onClick={() => setExpanded(isExpanded ? null : a.id)}
                          className="text-muted hover:text-strong p-1">
                          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                        <button onClick={() => deleteAhorro(a.id)}
                          className="text-faint hover:text-red-400 p-1">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    <div className="mt-3">
                      <div className="flex justify-between text-xs text-muted mb-1">
                        <span>{pct.toFixed(1)}% completado</span>
                        <span>Faltan {fmt(Math.max(0, a.meta - a.acumulado))}</span>
                      </div>
                      <ProgressBar value={a.acumulado} max={a.meta} color={a.color} />
                    </div>

                    {isExpanded && (
                      <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
                        <div className="flex gap-2 mb-4">
                          <select className="input flex-shrink-0"
                            value={movForm.id === a.id ? movForm.tipo : 'deposito'}
                            onChange={e => setMovForm(m => ({ ...m, id: a.id, tipo: e.target.value as 'deposito' | 'retiro' }))}>
                            <option value="deposito">Depósito</option>
                            <option value="retiro">Retiro</option>
                          </select>
                          <input className="input flex-1" type="number" placeholder="Monto"
                            value={movForm.id === a.id ? movForm.monto : ''}
                            onChange={e => setMovForm(m => ({ ...m, id: a.id, monto: e.target.value }))} />
                          <input className="input flex-1" placeholder="Nota (opcional)"
                            value={movForm.id === a.id ? movForm.nota : ''}
                            onChange={e => setMovForm(m => ({ ...m, id: a.id, nota: e.target.value }))} />
                          <button onClick={agregarMovimiento}
                            disabled={movForm.id !== a.id || saving}
                            className="px-3 py-2 rounded-lg text-sm font-medium text-white flex-shrink-0"
                            style={{ background: 'var(--accent)' }}>+</button>
                        </div>

                        <p className="text-xs text-muted mb-2">Movimientos recientes</p>
                        {movs.length === 0 ? (
                          <p className="text-xs text-dim text-center py-2">Sin movimientos aún</p>
                        ) : (
                          <div className="space-y-1.5">
                            {movs.slice(0, 10).map(m => (
                              <div key={m.id}
                                className="flex items-center justify-between text-xs py-1.5 px-2 rounded-lg"
                                style={{ background: 'var(--bg)' }}>
                                <div className="flex items-center gap-2">
                                  {m.tipo === 'deposito'
                                    ? <ArrowUpCircle size={14} className="text-green-400" />
                                    : <ArrowDownCircle size={14} className="text-red-400" />}
                                  <span className="text-body">
                                    {m.nota || (m.tipo === 'deposito' ? 'Depósito' : 'Retiro')}
                                  </span>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className={m.tipo === 'deposito' ? 'text-green-400' : 'text-red-400'}>
                                    {m.tipo === 'deposito' ? '+' : '-'}{fmt(m.monto)}
                                  </span>
                                  <span className="text-faint">{m.fecha}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
