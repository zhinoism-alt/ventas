import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  ResponsiveContainer, Line, ComposedChart,
} from 'recharts'
import {
  RefreshCw, ExternalLink, CheckCircle2, Link2,
  Loader2, Settings2, Calendar, Users, Download, TrendingDown, TrendingUp,
  Plus, X, Store, ArrowRightLeft,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { TOOLTIP_STYLE } from '../lib/constants'
import { fmt } from '../lib/utils'
import { AvisoError } from '../components/AvisoError'
import { AvisoForm, BorradorRecuperado } from '../components/FormAvisos'
import { useDraft } from '../lib/useDraft'
import {
  listaHojas, descargaHoja, parsePresupuesto, hojaDelMes, hojasDeMeses,
  pubIdDeUrl, MESES,
  type Hoja, type Presupuesto as Datos,
} from '../lib/presupuestoSheet'

/* ═══════════════════════════════════════════════════════════════════════════
   Presupuesto.

   Antes esta pagina dependia de un backend de Sheets que no esta desplegado, y
   cuando no encontraba nada caia a un ingreso escrito a mano de 37,044.89. O
   sea: ensenaba una cifra inventada con cara de dato.

   Ahora lee la hoja publicada directamente desde el navegador, descubre sola
   que pestana corresponde al mes en curso, y guarda una instantanea en
   Supabase para poder comparar meses. El trabajo mensual pasa de "capturar
   todo otra vez" a "nada": la hoja se sigue llevando como siempre.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Config {
  id: number
  nombre: string
  pub_id: string
  url: string
  auto_sync: boolean
  ingresos_excluidos: string
  ultima_sync: string | null
}

interface IngresoExtra {
  id: number
  anio: number
  mes: number
  concepto: string
  monto: number
  tipo: 'variable' | 'fijo'
  periodicidad: 'semanal' | 'quincenal' | 'mensual'
  recurrente: boolean
  nota: string
}

/**
 * Un mes no tiene cuatro semanas, tiene 4.333 (52 / 12). Con 4 fijas se
 * pierden 2,960 al ano sobre un bono de 740 semanales.
 */
const A_MENSUAL: Record<IngresoExtra['periodicidad'], number> = {
  semanal: 52 / 12,
  quincenal: 2,
  mensual: 1,
}
const mensualiza = (o: IngresoExtra) => Number(o.monto) * A_MENSUAL[o.periodicidad]

const PERIODO_ETIQUETA: Record<IngresoExtra['periodicidad'], string> = {
  semanal: 'a la semana',
  quincenal: 'por quincena',
  mensual: 'al mes',
}

/** Un ingreso aplica a un mes si es de ese mes, o si es recurrente y ya empezo. */
function aplicaEn(o: IngresoExtra, anio: number, mes: number): boolean {
  const cuando = o.anio * 100 + o.mes
  const objetivo = anio * 100 + mes
  return o.recurrente ? cuando <= objetivo : cuando === objetivo
}

interface MesGuardado {
  anio: number
  mes: number
  hoja: string
  gid: string
  datos: Datos
  sincronizado: string
}

const hoy = new Date()
const MES_HOY = hoy.getMonth() + 1
const ANIO_HOY = hoy.getFullYear()

/** Las metas del metodo que ya usa la hoja: 55 / 10 / 10 / 10 / 5. */
const METAS: { clave: RegExp; nombre: string; pct: number }[] = [
  { clave: /necesarios/, nombre: 'Gastos necesarios', pct: 55 },
  { clave: /emergencia/, nombre: 'Fondo de emergencia', pct: 10 },
  { clave: /inversion/, nombre: 'Inversiones', pct: 10 },
  { clave: /educacion/, nombre: 'Educación', pct: 10 },
  { clave: /no necesarios/, nombre: 'Gastos no necesarios', pct: 10 },
  { clave: /^dar/, nombre: 'Dar', pct: 5 },
]

const claveMes = (a: number, m: number) => a * 100 + m

// ── Componente ──────────────────────────────────────────────────────────────

export default function Presupuesto() {
  const [config, setConfig] = useState<Config | null>(null)
  const [hojas, setHojas] = useState<Hoja[]>([])
  const [meses, setMeses] = useState<MesGuardado[]>([])
  const [sel, setSel] = useState<number>(claveMes(ANIO_HOY, MES_HOY))

  const [cargando, setCargando] = useState(true)
  const [sincronizando, setSincronizando] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [ajustes, setAjustes] = useState(false)
  const [urlBorrador, setUrlBorrador] = useState('')

  // Ingresos propios que la hoja no registra: ventas, IPTV, lo que caiga.
  const [otros, setOtros] = useState<IngresoExtra[]>([])
  const [altaOtro, setAltaOtro] = useState(false)
  const bOtro = useDraft('presupuesto-ingreso', {
    concepto: '', monto: '', tipo: 'variable' as 'variable' | 'fijo',
    periodicidad: 'mensual' as IngresoExtra['periodicidad'], recurrente: false, nota: '',
  })
  const [errorOtro, setErrorOtro] = useState<string | null>(null)
  const [guardandoOtro, setGuardandoOtro] = useState(false)

  // ── Carga inicial ─────────────────────────────────────────────────────────
  const cargar = useCallback(async () => {
    setError(null)
    try {
      const [{ data: cfgs }, { data: ms }, { data: ing }] = await Promise.all([
        supabase.from('presupuesto_config').select('*').eq('activo', true).limit(1),
        supabase.from('presupuesto_meses').select('*').order('anio', { ascending: false }).order('mes', { ascending: false }),
        supabase.from('presupuesto_ingresos').select('*').eq('activo', true).order('created_at', { ascending: false }),
      ])
      const cfg = (cfgs ?? [])[0] ?? null
      setConfig(cfg)
      setUrlBorrador(cfg?.url ?? '')
      setMeses((ms ?? []) as MesGuardado[])
      setOtros((ing ?? []) as IngresoExtra[])
      return cfg as Config | null
    } catch (e) {
      console.error('[Presupuesto] no se pudo cargar', e)
      setError(e instanceof Error ? e.message : String(e))
      return null
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { cargar() }, [cargar])

  // Descubrir pestanas en cuanto hay configuracion.
  useEffect(() => {
    if (!config?.pub_id) return
    let vivo = true
    listaHojas(config.pub_id)
      .then(h => { if (vivo) setHojas(h) })
      .catch(e => { if (vivo) setError(`No se pudieron leer las pestañas: ${e.message}`) })
    return () => { vivo = false }
  }, [config?.pub_id])

  // ── Sincronizacion ────────────────────────────────────────────────────────
  const sincronizaHoja = useCallback(async (cfg: Config, h: Hoja & { anio: number; mes: number }) => {
    const matriz = await descargaHoja(cfg.pub_id, h.gid)
    const datos = parsePresupuesto(matriz)
    const fila = {
      anio: h.anio, mes: h.mes, hoja: h.nombre, gid: h.gid, datos,
      ingreso_principal: datos.ingresoPrincipal ?? 0,
      ingreso_extra: datos.totalExtra,
      gastos_necesarios: datos.totalNecesarios,
      gastos_no_necesarios: datos.totalNoNecesarios,
      disponible: datos.disponible,
      fondo_emergencia: datos.fondoEmergencia3Meses,
      sincronizado: new Date().toISOString(),
    }
    const { error: err } = await supabase
      .from('presupuesto_meses').upsert(fila, { onConflict: 'anio,mes' })
    if (err) throw new Error(err.message)
    return fila as unknown as MesGuardado
  }, [])

  const sincroniza = useCallback(async (todos: boolean) => {
    if (!config) { setError('Falta configurar el enlace de la hoja.'); return }
    const candidatas = hojasDeMeses(hojas, ANIO_HOY)
    if (!candidatas.length) { setError('Ninguna pestaña parece ser un mes.'); return }

    const objetivo = todos
      ? candidatas
      : [hojaDelMes(hojas, Math.floor(sel / 100), sel % 100)].filter(Boolean) as typeof candidatas

    if (!objetivo.length) {
      setError(`No hay pestaña para ${MESES[(sel % 100) - 1]} ${Math.floor(sel / 100)}.`)
      return
    }

    setError(null); setAviso(null)
    try {
      for (const h of objetivo) {
        setSincronizando(h.nombre)
        await sincronizaHoja(config, h)
      }
      await supabase.from('presupuesto_config')
        .update({ ultima_sync: new Date().toISOString() }).eq('id', config.id)
      await cargar()
      setAviso(objetivo.length === 1
        ? `${objetivo[0].nombre} actualizado.`
        : `${objetivo.length} meses actualizados.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSincronizando(null)
    }
  }, [config, hojas, sel, sincronizaHoja, cargar])

  // Auto-sync del mes en curso: solo si esta activado y el dato ya no es de hoy.
  useEffect(() => {
    if (!config?.auto_sync || !hojas.length || sincronizando) return
    const actual = meses.find(m => m.anio === ANIO_HOY && m.mes === MES_HOY)
    const fresco = actual && (Date.now() - new Date(actual.sincronizado).getTime()) < 6 * 3600 * 1000
    if (fresco) return
    const h = hojaDelMes(hojas, ANIO_HOY, MES_HOY)
    if (!h || h.mes === null) return
    setSincronizando(h.nombre)
    sincronizaHoja(config, { ...h, anio: h.anio ?? ANIO_HOY, mes: h.mes })
      .then(() => cargar())
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setSincronizando(null))
    // Solo cuando aparecen las pestanas o cambia la config.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.id, config?.auto_sync, hojas.length])

  // ── Guardar ajustes ───────────────────────────────────────────────────────
  const guardaConfig = async (cambios: Partial<Config>) => {
    if (!config) return
    const nuevo = { ...config, ...cambios }
    setConfig(nuevo)
    await supabase.from('presupuesto_config').update(cambios).eq('id', config.id)
  }

  const agregaOtro = async () => {
    const f = bOtro.valor
    if (!f.concepto.trim()) return setErrorOtro('Ponle un nombre: de donde salio.')
    if (!f.monto || !Number.isFinite(Number(f.monto))) return setErrorOtro('Falta el monto.')
    setErrorOtro(null)
    setGuardandoOtro(true)
    try {
      const { error: err } = await supabase.from('presupuesto_ingresos').insert({
        anio: Math.floor(sel / 100), mes: sel % 100,
        concepto: f.concepto.trim(), monto: Number(f.monto), tipo: f.tipo,
        periodicidad: f.periodicidad, recurrente: f.recurrente, nota: f.nota,
      })
      if (err) { setErrorOtro(`No se guardo: ${err.message}`); return }
      bOtro.limpiar()
      setAltaOtro(false)
      await cargar()
    } catch (e) {
      setErrorOtro(e instanceof Error ? e.message : String(e))
    } finally {
      setGuardandoOtro(false)
    }
  }

  const quitaOtro = async (id: number) => {
    await supabase.from('presupuesto_ingresos').update({ activo: false }).eq('id', id)
    setOtros(prev => prev.filter(o => o.id !== id))
  }

  const excluidos = useMemo(
    () => new Set((config?.ingresos_excluidos ?? '').split('|').filter(Boolean)),
    [config?.ingresos_excluidos],
  )

  const alternaIngreso = (clave: string) => {
    const s = new Set(excluidos)
    if (s.has(clave)) s.delete(clave); else s.add(clave)
    guardaConfig({ ingresos_excluidos: [...s].join('|') })
  }

  const aplicaUrl = async () => {
    const id = pubIdDeUrl(urlBorrador)
    if (!id) { setError('Ese enlace no parece de "Publicar en la web". Debe contener /spreadsheets/d/e/2PACX-…'); return }
    setError(null)
    if (config) await guardaConfig({ pub_id: id, url: urlBorrador })
    else {
      const { data } = await supabase.from('presupuesto_config')
        .insert({ nombre: 'Presupuesto', pub_id: id, url: urlBorrador }).select().single()
      setConfig(data as Config)
    }
    setHojas([])
  }

  // ── Derivados del mes seleccionado ────────────────────────────────────────
  const mesSel = meses.find(m => claveMes(m.anio, m.mes) === sel) ?? null
  const d = mesSel?.datos ?? null

  const otrosDelMes = useMemo(
    () => otros.filter(o => aplicaEn(o, Math.floor(sel / 100), sel % 100)),
    [otros, sel],
  )
  const totalOtros = otrosDelMes.reduce((t, o) => t + mensualiza(o), 0)

  // Lo que sobro el mes pasado y se paso a este. No es ingreso nuevo: si se
  // sumara al ingreso, los porcentajes contra las metas saldrian inflados.
  const vieneDeAntes = useMemo(() => {
    const anio = Math.floor(sel / 100), mes = sel % 100
    const prevMes = mes === 1 ? 12 : mes - 1
    const prevAnio = mes === 1 ? anio - 1 : anio
    const prev = meses.find(m => m.anio === prevAnio && m.mes === prevMes)
    if (!prev) return null
    const ing = (prev.datos.ingresoPrincipal ?? 0)
      + otros.filter(o => aplicaEn(o, prevAnio, prevMes)).reduce((t, o) => t + mensualiza(o), 0)
    const sobro = ing - prev.datos.totalNecesarios - prev.datos.totalNoNecesarios
    return { mes: MESES[prevMes - 1], monto: sobro }
  }, [meses, otros, sel])

  const ingresoNomina = d?.ingresoPrincipal ?? 0
  const hayExtra = (d?.ingresoExtra.length ?? 0) > 0
  const extraExcluido = excluidos.has('extra')
  // Lo tuyo: nomina mas lo que entro por ventas. Sin tu pareja.
  const ingresoPropio = ingresoNomina + totalOtros
  const ingresoContado = ingresoPropio + (hayExtra && !extraExcluido ? d!.totalExtra : 0)

  const gastoTotal = (d?.totalNecesarios ?? 0) + (d?.totalNoNecesarios ?? 0)
  const sobra = ingresoContado - gastoTotal
  const pctNec = ingresoContado ? (d!.totalNecesarios / ingresoContado) * 100 : 0
  const pctNoNec = ingresoContado ? (d!.totalNoNecesarios / ingresoContado) * 100 : 0

  // Solo con su ingreso: lo que queda si su pareja deja de aportar.
  const soloPropio = useMemo(() => {
    if (!d) return null
    const nec = d.totalNecesarios
    const noNec = d.totalNoNecesarios
    return {
      ingreso: ingresoPropio,
      nec, noNec,
      pctNec: ingresoPropio ? (nec / ingresoPropio) * 100 : 0,
      queda: ingresoPropio - nec - noNec,
      metas: METAS.map(mt => ({ ...mt, monto: ingresoPropio * (mt.pct / 100) })),
    }
  }, [d, ingresoPropio])

  const serie = useMemo(() => [...meses]
    .sort((a, b) => claveMes(a.anio, a.mes) - claveMes(b.anio, b.mes))
    .map(m => {
      const propios = otros
        .filter(o => aplicaEn(o, m.anio, m.mes))
        .reduce((t, o) => t + mensualiza(o), 0)
      const ing = (m.datos.ingresoPrincipal ?? 0) + propios
        + (excluidos.has('extra') ? 0 : m.datos.totalExtra)
      return {
        mes: `${MESES[m.mes - 1].slice(0, 3)} ${String(m.anio).slice(2)}`,
        Ingreso: Math.round(ing),
        Necesarios: Math.round(m.datos.totalNecesarios),
        'No necesarios': Math.round(m.datos.totalNoNecesarios),
        Sobra: Math.round(ing - m.datos.totalNecesarios - m.datos.totalNoNecesarios),
      }
    }), [meses, excluidos, otros])

  const disponiblesSel = useMemo(() => {
    const vistos = new Map<number, { anio: number; mes: number; nombre: string }>()
    for (const m of meses) vistos.set(claveMes(m.anio, m.mes), { anio: m.anio, mes: m.mes, nombre: m.hoja })
    for (const h of hojasDeMeses(hojas, ANIO_HOY))
      if (!vistos.has(claveMes(h.anio, h.mes)))
        vistos.set(claveMes(h.anio, h.mes), { anio: h.anio, mes: h.mes, nombre: h.nombre })
    return [...vistos.entries()].sort((a, b) => b[0] - a[0])
  }, [meses, hojas])

  // ── Render ────────────────────────────────────────────────────────────────

  if (cargando) return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <Loader2 size={28} className="animate-spin accent" />
        <p className="text-dim text-sm">Cargando presupuesto…</p>
      </div>
    </div>
  )

  return (
    <div className="space-y-5 max-w-7xl mx-auto">

      {/* ── Encabezado ── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-strong">Presupuesto</h1>
          <p className="text-muted text-sm mt-0.5">
            Se lee solo de tu hoja de Google
            {config?.ultima_sync && (
              <> · última lectura {new Date(config.ultima_sync).toLocaleString('es-MX',
                { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select className="input" value={sel} onChange={e => setSel(Number(e.target.value))}>
            {disponiblesSel.map(([k, v]) => (
              <option key={k} value={k}>{MESES[v.mes - 1]} {v.anio}</option>
            ))}
          </select>
          <button onClick={() => sincroniza(false)} disabled={!!sincronizando} className="btn-primary">
            {sincronizando
              ? <><Loader2 size={14} className="animate-spin" /> {sincronizando}…</>
              : <><RefreshCw size={14} /> Actualizar mes</>}
          </button>
          <button onClick={() => sincroniza(true)} disabled={!!sincronizando} className="btn-secondary">
            <Download size={14} /> Todos
          </button>
          <button onClick={() => setAjustes(a => !a)} className="btn-secondary">
            <Settings2 size={14} />
          </button>
        </div>
      </div>

      {error && <AvisoError mensaje={error} onReintentar={() => { setError(null); cargar() }} />}
      {aviso && (
        <div className="card flex items-center gap-2 py-3">
          <CheckCircle2 size={15} style={{ color: 'var(--green)' }} />
          <p className="text-sm text-body">{aviso}</p>
        </div>
      )}

      {/* ── Ajustes ── */}
      {ajustes && (
        <div className="card space-y-4">
          <div>
            <label className="text-xs text-muted mb-1 block">Enlace de «Publicar en la web»</label>
            <div className="flex gap-2 flex-wrap">
              <input className="input flex-1" style={{ minWidth: 260 }} value={urlBorrador}
                onChange={e => setUrlBorrador(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/e/2PACX-…/pubhtml" />
              <button onClick={aplicaUrl} className="btn-primary"><Link2 size={14} /> Guardar</button>
            </div>
            <p className="text-xs text-dim mt-1.5">
              En Google Sheets: Archivo → Compartir → Publicar en la web. No sirve el enlace
              normal de «Compartir»; ese pide sesión y el navegador no puede leerlo.
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm text-body cursor-pointer">
            <input type="checkbox" checked={config?.auto_sync ?? false}
              onChange={e => guardaConfig({ auto_sync: e.target.checked })} />
            Leer sola la pestaña del mes en curso al abrir esta página
          </label>

          {!!hojas.length && (
            <div>
              <p className="text-xs text-muted mb-2">Pestañas encontradas ({hojas.length})</p>
              <div className="flex gap-1.5 flex-wrap">
                {hojas.map(h => (
                  <span key={h.gid} className={`badge ${h.mes ? 'badge-indigo' : 'badge-gray'}`}>
                    {h.nombre}
                  </span>
                ))}
              </div>
            </div>
          )}
          {config?.url && (
            <a href={config.url} target="_blank" rel="noreferrer"
               className="text-xs accent inline-flex items-center gap-1">
              Abrir la hoja <ExternalLink size={11} />
            </a>
          )}
        </div>
      )}

      {!d ? (
        <div className="card text-center py-12">
          <Calendar size={40} className="mx-auto text-faint mb-3" />
          <p className="text-strong font-medium">
            Sin datos de {MESES[(sel % 100) - 1]} {Math.floor(sel / 100)}
          </p>
          <p className="text-sm text-muted mt-1 mb-4">
            Dale a «Actualizar mes» para leerlo de la hoja.
          </p>
          <button onClick={() => sincroniza(false)} disabled={!!sincronizando} className="btn-primary mx-auto">
            <RefreshCw size={14} /> Actualizar mes
          </button>
        </div>
      ) : (
        <>
          {/* ── Ingresos: que se cuenta y que no ── */}
          <div className="card">
            <div className="flex items-center gap-2 mb-1">
              <Users size={16} className="accent" />
              <h2 className="text-strong font-semibold">Qué ingreso estamos contando</h2>
            </div>
            <p className="text-xs text-dim mb-4 max-w-2xl">
              Cada fuente se puede apagar. Lo que apagues deja de contar en todos los
              números de abajo y en la gráfica de tendencia.
            </p>

            <div className="space-y-2">
              <FuenteIngreso
                nombre="Tu nómina"
                nota={d.ingresoNota || 'La celda de arriba de tu hoja'}
                monto={ingresoNomina}
                incluido
                fijo
              />

              {otrosDelMes.map(o => (
                <FuenteIngreso key={o.id}
                  nombre={o.concepto}
                  nota={o.periodicidad === 'mensual'
                    ? (o.nota || (o.tipo === 'variable' ? 'Entra de vez en cuando' : 'Cada mes'))
                    : `${fmt(Number(o.monto))} ${PERIODO_ETIQUETA[o.periodicidad]} · ${(A_MENSUAL[o.periodicidad]).toFixed(3)} veces al mes`}
                  monto={mensualiza(o)}
                  incluido
                  etiqueta={o.tipo === 'variable' ? 'variable' : undefined}
                  onQuitar={() => quitaOtro(o.id)}
                />
              ))}

              {hayExtra && (
                <FuenteIngreso
                  nombre="Ingreso de tu pareja"
                  nota={`${d.ingresoExtra.length} quincenas · el bloque «Ingreso Quincenal Extra» de tu hoja`}
                  monto={d.totalExtra}
                  incluido={!extraExcluido}
                  onToggle={() => alternaIngreso('extra')}
                />
              )}
            </div>

            {/* Alta de ingresos propios que la hoja no registra */}
            {!altaOtro ? (
              <button onClick={() => { setErrorOtro(null); setAltaOtro(true) }}
                      className="btn-secondary text-xs mt-3">
                <Plus size={13} /> Agregar un ingreso de {MESES[(sel % 100) - 1]}
              </button>
            ) : (
              <div className="rounded-xl p-4 mt-3" style={{ background: 'var(--surface-2)' }}>
                <div className="flex items-center gap-2 mb-3">
                  <Store size={14} className="accent" />
                  <p className="text-sm text-strong font-medium">
                    Ingreso de {MESES[(sel % 100) - 1]} {Math.floor(sel / 100)}
                  </p>
                </div>
                <div className="grid md:grid-cols-4 gap-3">
                  <div className="md:col-span-2">
                    <label className="text-xs text-muted mb-1 block">De dónde salió *</label>
                    <input className="input w-full" placeholder="Venta de una consola, IPTV…"
                      value={bOtro.valor.concepto}
                      onChange={e => bOtro.campo('concepto', e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-muted mb-1 block">Monto *</label>
                    <input className="input w-full" type="number" placeholder="0.00"
                      value={bOtro.valor.monto}
                      onChange={e => bOtro.campo('monto', e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-muted mb-1 block">Cada cuánto</label>
                    <select className="input w-full" value={bOtro.valor.periodicidad}
                      onChange={e => bOtro.campo('periodicidad', e.target.value as IngresoExtra['periodicidad'])}>
                      <option value="mensual">Al mes</option>
                      <option value="quincenal">Por quincena</option>
                      <option value="semanal">A la semana</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-4 mt-3 flex-wrap">
                  <label className="flex items-center gap-2 text-sm text-body cursor-pointer">
                    <input type="checkbox" checked={bOtro.valor.tipo === 'variable'}
                      onChange={e => bOtro.campo('tipo', e.target.checked ? 'variable' : 'fijo')} />
                    Entra a veces, no lo des por seguro
                  </label>
                  <label className="flex items-center gap-2 text-sm text-body cursor-pointer">
                    <input type="checkbox" checked={bOtro.valor.recurrente}
                      onChange={e => bOtro.campo('recurrente', e.target.checked)} />
                    Se repite todos los meses desde éste
                  </label>
                </div>
                {bOtro.valor.monto && bOtro.valor.periodicidad !== 'mensual' && (
                  <p className="text-xs mt-2 font-mono accent">
                    = {fmt(Number(bOtro.valor.monto) * A_MENSUAL[bOtro.valor.periodicidad])} al mes
                  </p>
                )}
                <AvisoForm mensaje={errorOtro} />
                <BorradorRecuperado b={bOtro} />
                <div className="flex gap-2 mt-3">
                  <button onClick={agregaOtro} disabled={guardandoOtro} className="btn-primary text-xs">
                    {guardandoOtro ? 'Guardando…' : 'Guardar'}
                  </button>
                  <button onClick={() => { setErrorOtro(null); setAltaOtro(false) }}
                          className="btn-secondary text-xs">Cancelar</button>
                </div>
                <p className="text-xs text-dim mt-2 max-w-xl">
                  «Entra a veces» se cuenta en el mes pero se marca aparte: presupuestar
                  gastos fijos contra un ingreso irregular es justo como se rompe un
                  presupuesto. Lo semanal se convierte multiplicando por 4.333
                  (52&nbsp;semanas ÷ 12&nbsp;meses), no por 4: con cuatro fijas se pierden
                  unos 3,000 al año.
                </p>
              </div>
            )}
          </div>

          {/* ── KPIs ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Tile k="Ingreso contado" v={fmt(ingresoContado)}
                  sub={extraExcluido && hayExtra
                    ? `solo tuyo · sin ${fmt(d.totalExtra)} de tu pareja`
                    : 'incluye el ingreso de tu pareja'} />
            <Tile k="Gastos necesarios" v={fmt(d.totalNecesarios)}
                  sub={`${pctNec.toFixed(0)}% del ingreso · meta 55%`}
                  tono={pctNec <= 55 ? 'ok' : 'bad'} />
            <Tile k="Gastos no necesarios" v={fmt(d.totalNoNecesarios)}
                  sub={`${pctNoNec.toFixed(0)}% del ingreso · meta 10%`}
                  tono={pctNoNec <= 10 ? 'ok' : pctNoNec <= 20 ? 'warn' : 'bad'} />
            <Tile k="Sobra al mes" v={fmt(sobra)}
                  sub={sobra >= 0 ? 'ingreso menos gastos' : 'estás gastando de más'}
                  tono={sobra >= 0 ? 'ok' : 'bad'} />
          </div>

          {vieneDeAntes && (
            <div className="card flex items-center gap-3 py-3 flex-wrap">
              <ArrowRightLeft size={15} className="accent flex-shrink-0" />
              <p className="text-sm text-body flex-1 min-w-0">
                De {vieneDeAntes.mes} {vieneDeAntes.monto >= 0 ? 'te sobraron' : 'te faltaron'}{' '}
                <strong className="font-mono"
                        style={{ color: vieneDeAntes.monto >= 0 ? 'var(--green)' : 'var(--red)' }}>
                  {fmt(Math.abs(vieneDeAntes.monto))}
                </strong>
                {vieneDeAntes.monto >= 0 ? ', que pasaste a este mes.' : '.'}
              </p>
              <span className="text-sm font-mono text-strong">
                Con eso: {fmt(sobra + vieneDeAntes.monto)}
              </span>
            </div>
          )}

          {/* ── Solo con su ingreso ── */}
          {soloPropio && (
            <div className="card">
              <h2 className="text-strong font-semibold mb-1">Si solo contara tu ingreso</h2>
              <p className="text-xs text-dim mb-4 max-w-2xl">
                Tu pareja va a dejar de trabajar. Esto es {MESES[(sel % 100) - 1]} recalculado
                sobre {fmt(soloPropio.ingreso)} tuyos
                {totalOtros > 0 && <> ({fmt(ingresoNomina)} de nómina más {fmt(totalOtros)} de ventas)</>},
                con los gastos tal como están hoy.
              </p>

              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
                <Tile k="Necesarios sobre tu ingreso" v={`${soloPropio.pctNec.toFixed(0)}%`}
                      sub={`${fmt(soloPropio.nec)} de ${fmt(soloPropio.ingreso)} · meta 55%`}
                      tono={soloPropio.pctNec <= 55 ? 'ok' : 'bad'} />
                <Tile k="Quedaría al mes" v={fmt(soloPropio.queda)}
                      sub="después de todos los gastos actuales"
                      tono={soloPropio.queda >= 0 ? 'ok' : 'bad'} />
                <Tile k="Para ahorro e inversión" v={fmt(soloPropio.ingreso * 0.20)}
                      sub="el 20% que marca tu propio método" />
              </div>

              <div className="scroll-x">
                <table className="w-full text-sm" style={{ minWidth: 460 }}>
                  <thead>
                    <tr className="text-dim text-xs">
                      <th className="text-left font-medium pb-2">Categoría</th>
                      <th className="text-right font-medium pb-2">Meta con tu ingreso</th>
                      <th className="text-right font-medium pb-2">Gastado este mes</th>
                      <th className="text-right font-medium pb-2">Diferencia</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    {soloPropio.metas.map(mt => {
                      const cat = d.categorias.find(c => mt.clave.test(
                        c.categoria.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()))
                      const real = cat?.real ?? null
                      const dif = real === null ? null : mt.monto - real
                      return (
                        <tr key={mt.nombre} style={{ borderTop: '1px solid var(--border)' }}>
                          <td className="py-2 text-body">{mt.nombre} <span className="text-dim">{mt.pct}%</span></td>
                          <td className="py-2 text-right text-strong">{fmt(mt.monto)}</td>
                          <td className="py-2 text-right text-dim">{real === null ? '—' : fmt(real)}</td>
                          <td className="py-2 text-right font-semibold"
                              style={{ color: dif === null ? 'var(--text-dim)' : dif >= 0 ? 'var(--green)' : 'var(--red)' }}>
                            {dif === null ? '—' : `${dif >= 0 ? '+' : ''}${fmt(dif)}`}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-dim mt-3">
                Verde es margen que te sobra frente a la meta; rojo es cuánto te pasaste.
                «Gastos necesarios» y «no necesarios» son gastos: pasarse es malo. Las otras
                cuatro son destinos de tu dinero: quedarse corto es lo que duele.
              </p>
            </div>
          )}

          {/* ── Teorico vs real ── */}
          {!!d.categorias.length && (
            <div className="card">
              <h2 className="text-strong font-semibold mb-4">
                Teórico contra real — {mesSel?.hoja}
              </h2>
              <div className="scroll-x">
                <table className="w-full text-sm" style={{ minWidth: 420 }}>
                  <thead>
                    <tr className="text-dim text-xs">
                      <th className="text-left font-medium pb-2">Categoría</th>
                      <th className="text-right font-medium pb-2">Teórico</th>
                      <th className="text-right font-medium pb-2">Real</th>
                      <th className="text-right font-medium pb-2">Δ</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    {d.categorias.map(c => {
                      const dif = (c.real ?? 0) - (c.teorico ?? 0)
                      return (
                        <tr key={c.categoria} style={{ borderTop: '1px solid var(--border)' }}>
                          <td className="py-2 text-body">{c.categoria}</td>
                          <td className="py-2 text-right text-dim">{fmt(c.teorico ?? 0)}</td>
                          <td className="py-2 text-right text-strong">{fmt(c.real ?? 0)}</td>
                          <td className="py-2 text-right" style={{ color: dif === 0 ? 'var(--text-dim)' : 'var(--text-body)' }}>
                            {dif >= 0 ? '+' : ''}{fmt(dif)}
                          </td>
                        </tr>
                      )
                    })}
                    {d.totalTeorico !== null && (
                      <tr style={{ borderTop: '2px solid var(--border-hi)' }}>
                        <td className="py-2 text-body font-semibold">Total</td>
                        <td className="py-2 text-right text-dim">{fmt(d.totalTeorico)}</td>
                        <td className="py-2 text-right text-strong font-semibold">{fmt(d.totalReal ?? 0)}</td>
                        <td className="py-2 text-right text-dim">
                          {fmt((d.totalReal ?? 0) - d.totalTeorico)}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Detalle de gastos ── */}
          <div className="grid md:grid-cols-2 gap-4">
            <ListaGastos titulo="Gastos necesarios" items={d.necesarios} total={d.totalNecesarios} color="var(--green)" />
            <ListaGastos titulo="Gastos no necesarios" items={d.noNecesarios} total={d.totalNoNecesarios} color="var(--yellow)" />
          </div>

          {/* ── Apartados semanales ── */}
          {!!d.apartados.filas.length && (
            <div className="card">
              <h2 className="text-strong font-semibold mb-1">Apartados por semana</h2>
              <p className="text-xs text-dim mb-4">
                Un asterisco en tu hoja significa que está planeado pero sin cifra; aquí sale como «·».
              </p>
              <div className="scroll-x">
                <table className="w-full text-sm" style={{ minWidth: 420 }}>
                  <thead>
                    <tr className="text-dim text-xs">
                      <th className="text-left font-medium pb-2">Concepto</th>
                      {d.apartados.semanas.map((s, i) => (
                        <th key={i} className="text-right font-medium pb-2 whitespace-nowrap px-2">{s}</th>
                      ))}
                      <th className="text-right font-medium pb-2">Total</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    {d.apartados.filas.map(f => {
                      const suma = f.montos.reduce<number>((s, v) => s + (v ?? 0), 0)
                      return (
                        <tr key={f.concepto} style={{ borderTop: '1px solid var(--border)' }}>
                          <td className="py-2 text-body font-sans">{f.concepto}</td>
                          {f.montos.map((v, i) => (
                            <td key={i} className="py-2 text-right px-2"
                                style={{ color: v === null ? 'var(--text-dim)' : 'var(--text-body)' }}>
                              {v === null ? (f.planeado[i] ? '·' : '') : fmt(v)}
                            </td>
                          ))}
                          <td className="py-2 text-right text-strong font-semibold">{fmt(suma)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Saldos de fondos ── */}
          {!!d.saldosFondos.length && (
            <div className="grid md:grid-cols-2 gap-4">
              {d.saldosFondos.map(s => {
                const delta = (s.final ?? 0) - (s.inicial ?? 0)
                return (
                  <div key={s.nombre} className="card">
                    <p className="text-xs uppercase tracking-wider text-muted mb-2">{s.nombre}</p>
                    <div className="flex items-baseline gap-3 flex-wrap">
                      <span className="text-2xl font-bold font-mono text-strong">{fmt(s.final ?? 0)}</span>
                      <span className="text-sm font-mono inline-flex items-center gap-1"
                            style={{ color: delta >= 0 ? 'var(--green)' : 'var(--red)' }}>
                        {delta >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                        {delta >= 0 ? '+' : ''}{fmt(delta)}
                      </span>
                    </div>
                    <p className="text-xs text-dim mt-1">
                      Empezó el mes en {fmt(s.inicial ?? 0)}
                      {s.serie.length > 2 && ` · ${s.serie.length} cortes en la hoja`}
                    </p>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ── Tendencia ── */}
      {serie.length > 1 && (
        <div className="card">
          <h2 className="text-strong font-semibold mb-1">Tendencia</h2>
          <p className="text-xs text-dim mb-4">
            {serie.length} meses leídos de la hoja
            {excluidos.has('extra') && ' · sin el ingreso quincenal extra'}
          </p>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={serie}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="mes" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false}
                     tickFormatter={v => `${Math.round(v / 1000)}k`} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => fmt(v)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Necesarios" stackId="g" fill="var(--green)" radius={[0, 0, 0, 0]} />
              <Bar dataKey="No necesarios" stackId="g" fill="var(--yellow)" radius={[4, 4, 0, 0]} />
              <Line type="monotone" dataKey="Ingreso" stroke="var(--accent)" strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
          <p className="text-xs text-dim mt-2">
            Las barras son gastos apilados; la línea es tu ingreso. Cuando la barra pasa la
            línea, ese mes salió de los ahorros.
          </p>
        </div>
      )}
    </div>
  )
}

// ── Piezas ──────────────────────────────────────────────────────────────────

function FuenteIngreso({ nombre, nota, monto, incluido, onToggle, fijo, etiqueta, onQuitar }: {
  nombre: string; nota: string; monto: number; incluido: boolean
  onToggle?: () => void; fijo?: boolean; etiqueta?: string; onQuitar?: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-xl"
         style={{ background: 'var(--surface-2)', opacity: incluido ? 1 : 0.55 }}>
      <div className="min-w-0">
        <p className="text-sm text-strong font-medium truncate">{nombre}</p>
        <p className="text-xs text-dim truncate">{nota}</p>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <span className="font-mono font-semibold"
              style={{ color: incluido ? 'var(--green)' : 'var(--text-dim)',
                       textDecoration: incluido ? 'none' : 'line-through' }}>
          {fmt(monto)}
        </span>
        {etiqueta && (
          <span className={`badge ${etiqueta === 'variable' ? 'badge-yellow' : 'badge-gray'}`}>
            {etiqueta}
          </span>
        )}
        {onQuitar && (
          <button onClick={onQuitar} className="text-faint hover:text-red-400 p-1"
                  title="Quitar este ingreso">
            <X size={14} />
          </button>
        )}
        {fijo && <span className="badge badge-gray">nómina</span>}
        {onToggle && (
          <button onClick={onToggle} className="btn-secondary text-xs">
            {incluido ? 'No contar' : 'Contar'}
          </button>
        )}
      </div>
    </div>
  )
}

function ListaGastos({ titulo, items, total, color }: {
  titulo: string; items: { concepto: string; monto: number }[]; total: number; color: string
}) {
  const ordenados = [...items].sort((a, b) => b.monto - a.monto)
  const mayor = ordenados[0]?.monto ?? 1
  return (
    <div className="card">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-strong font-semibold">{titulo}</h2>
        <span className="font-mono font-bold" style={{ color }}>{fmt(total)}</span>
      </div>
      {!ordenados.length ? (
        <p className="text-xs text-dim text-center py-4">Sin renglones este mes</p>
      ) : (
        <div className="space-y-1.5">
          {ordenados.map(i => (
            <div key={i.concepto}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-body truncate">{i.concepto}</span>
                <span className="font-mono text-strong flex-shrink-0">{fmt(i.monto)}</span>
              </div>
              <div className="h-1 rounded-full mt-1" style={{ background: 'var(--surface-2)' }}>
                <div className="h-1 rounded-full"
                     style={{ width: `${(i.monto / mayor) * 100}%`, background: color, opacity: 0.7 }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Tile({ k, v, sub, tono }: {
  k: string; v: string; sub?: string; tono?: 'ok' | 'warn' | 'bad'
}) {
  const color = tono === 'ok' ? 'var(--green)' : tono === 'warn' ? 'var(--yellow)'
              : tono === 'bad' ? 'var(--red)' : 'var(--text)'
  return (
    <div className="stat-card">
      <p className="text-xs text-muted mb-1">{k}</p>
      <p className="text-base font-bold font-mono" style={{ color }}>{v}</p>
      {sub && <p className="text-xs text-dim mt-1">{sub}</p>}
    </div>
  )
}
