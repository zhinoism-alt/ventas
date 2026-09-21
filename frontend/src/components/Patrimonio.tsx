import { useEffect, useState } from 'react'
import { ShieldCheck, AlertTriangle, TrendingUp, Home, Landmark } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { SimuladorPPR, SimuladorInfonavit } from './Simuladores'
import { Horizonte } from './Horizonte'
import { AforeProyeccion, proyectaAfore } from './Afore'
import { EditorCampos, BotonEditar, type Campo, type Valores } from './EditorCampos'

/* ═══════════════════════════════════════════════════════════════════════
   Rendimiento real, PPR, AFORE e INFONAVIT.

   La tasa que anuncia el banco casi nunca es lo que ganas. Entre medias
   hay tres cosas:

   1. El ISR se retiene sobre el CAPITAL, no sobre el interes (LIF art. 24).
      En 2026 son 0.90% anual del saldo, se hayan generado intereses o no.
   2. Las tasas promocionales tienen tope. Arriba de el aplica otra tasa,
      normalmente mucho menor, y la tasa efectiva se diluye.
   3. La inflacion se lleva el resto. Es lo unico que decide si tu dinero
      compra mas o menos que el anio pasado.
   ═══════════════════════════════════════════════════════════════════════ */

interface Cuenta {
  id: number
  nombre: string
  institucion: string | null
  tipo: string              // banco | sofipo | cetes | otro
  saldo: number
  tasa_promo: number
  tope_promo: number
  tasa_base: number
  notas: string | null
}

interface Perfil {
  id: number
  isr_retencion_pct: number
  isr_marginal_pct: number
  inflacion_pct: number
  udi: number
  ppr_producto: string | null
  ppr_poliza: string | null
  ppr_prima_anual_udi: number
  ppr_saldo_udi: number
  ppr_inicio: string | null
  ppr_suma_asegurada_udi: number
  ppr_rend_garantizado: number
  ppr_anios_pago: number
  ppr_anio_poliza: number
  ppr_costo_anual_udi: number
  ppr_rend_observado: number
  ppr_factores: string | null
  ppr_cargo_rescate: string | null
  ppr_anios_total: number
  ppr_costo_tras_pagos: boolean | null
  ppr_vencimiento: string | null
  ppr_aseguradora: string | null
  ppr_liquidacion: string | null
  ppr_modelo_confiable: boolean | null
  ppr_modelo_nota: string | null
  fi_gasto_mensual: number
  fi_tasa_retiro: number
  fi_aporte_mensual: number
  fi_rendimiento_real: number
  fi_edad_actual: number
  inflacion_esperada: number
  afore_sbc_diario: number
  afore_tasa_aportacion: number
  afore_rendimiento_real: number
  afore_semanas: number
  afore_semanas_meta: number
  afore_semanas_corte: string | null
  edad_retiro: number
  afore_nombre: string | null
  afore_retiro: number
  afore_vivienda: number
  afore_rendimiento_12m: number
  afore_comisiones_12m: number
  afore_corte: string | null
  infonavit_credito: number
  infonavit_tasa: number
  infonavit_cat: number
  infonavit_meses: number
  infonavit_retencion: number
  infonavit_patron: number
  infonavit_fpp: number
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''))
  return Number.isFinite(n) ? n : 0
}
const mxn = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })
    .format(Math.round(n || 0))
const mxn2 = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n || 0)
const pct = (n: number) => `${(n || 0).toFixed(2)}%`

/* Que se puede editar en cada seccion. Todo esto venia sembrado por migracion
   y era intocable desde la aplicacion: cuando el banco movia su tasa o se
   acababa una promocion, el numero se quedaba viejo y los calculos seguian
   corriendo sobre el. */

const CAMPOS_CUENTA: Campo[] = [
  { clave: 'institucion', etiqueta: 'Institución', tipo: 'texto' },
  { clave: 'nombre', etiqueta: 'Nombre de la cuenta', tipo: 'texto' },
  { clave: 'tipo', etiqueta: 'Tipo', tipo: 'opciones', opciones: [
      { valor: 'banco', texto: 'Banco (cubre IPAB, 400,000 UDI)' },
      { valor: 'sofipo', texto: 'SOFIPO (cubre su fondo, 25,000 UDI)' },
      { valor: 'cetes', texto: 'CETES' },
      { valor: 'otro', texto: 'Otro' },
    ], ayuda: 'Decide de cuánto es tu seguro de depósitos' },
  { clave: 'saldo', etiqueta: 'Saldo', tipo: 'dinero' },
  { clave: 'tasa_promo', etiqueta: 'Tasa promocional', tipo: 'porcentaje' },
  { clave: 'tope_promo', etiqueta: 'Hasta qué monto', tipo: 'dinero',
    ayuda: '0 si la tasa aplica a todo el saldo' },
  { clave: 'tasa_base', etiqueta: 'Tasa sobre el excedente', tipo: 'porcentaje' },
  { clave: 'notas', etiqueta: 'Notas', tipo: 'texto' },
]

const CAMPOS_REAL: Campo[] = [
  { clave: 'isr_retencion_pct', etiqueta: 'Retención de ISR', tipo: 'porcentaje',
    ayuda: '0.90% en 2026 (LIF art. 24). Sobre el capital, no el interés' },
  { clave: 'inflacion_pct', etiqueta: 'Inflación actual', tipo: 'porcentaje' },
  { clave: 'inflacion_esperada', etiqueta: 'Inflación esperada a futuro', tipo: 'porcentaje',
    ayuda: 'Con esta crece el UDI en las proyecciones' },
  { clave: 'udi', etiqueta: 'Valor del UDI hoy', tipo: 'numero', paso: '0.000001' },
]

const CAMPOS_PPR: Campo[] = [
  { clave: 'ppr_saldo_udi', etiqueta: 'Saldo', tipo: 'numero', ayuda: 'En UDI, como lo dice tu estado de cuenta' },
  { clave: 'ppr_prima_anual_udi', etiqueta: 'Prima anual', tipo: 'numero', ayuda: 'En UDI' },
  { clave: 'ppr_costo_anual_udi', etiqueta: 'Costo del seguro al año', tipo: 'numero', ayuda: 'En UDI' },
  { clave: 'ppr_suma_asegurada_udi', etiqueta: 'Suma asegurada', tipo: 'numero', ayuda: 'En UDI' },
  { clave: 'ppr_rend_garantizado', etiqueta: 'Rendimiento garantizado', tipo: 'porcentaje' },
  { clave: 'ppr_rend_observado', etiqueta: 'Rendimiento observado', tipo: 'porcentaje' },
  { clave: 'ppr_anio_poliza', etiqueta: 'Año de póliza en curso', tipo: 'numero' },
  { clave: 'ppr_anios_pago', etiqueta: 'Años que tú pagas', tipo: 'numero' },
  { clave: 'ppr_anios_total', etiqueta: 'Años hasta el vencimiento', tipo: 'numero' },
  { clave: 'ppr_inicio', etiqueta: 'Primer pago', tipo: 'fecha' },
]

const CAMPOS_AFORE: Campo[] = [
  { clave: 'afore_nombre', etiqueta: 'AFORE', tipo: 'texto' },
  { clave: 'afore_retiro', etiqueta: 'Subcuenta de retiro', tipo: 'dinero' },
  { clave: 'afore_vivienda', etiqueta: 'Subcuenta de vivienda', tipo: 'dinero' },
  { clave: 'afore_corte', etiqueta: 'Fecha de corte', tipo: 'fecha' },
  { clave: 'afore_rendimiento_12m', etiqueta: 'Rendimiento 12 meses', tipo: 'dinero' },
  { clave: 'afore_comisiones_12m', etiqueta: 'Comisiones 12 meses', tipo: 'dinero' },
  { clave: 'afore_sbc_diario', etiqueta: 'Salario base de cotización diario', tipo: 'dinero',
    ayuda: 'El que dice tu constancia del IMSS' },
  { clave: 'afore_tasa_aportacion', etiqueta: 'Aportación total', tipo: 'porcentaje',
    ayuda: '10.638% en 2026; sube por escalones hasta 2030' },
  { clave: 'afore_rendimiento_real', etiqueta: 'Rendimiento real esperado', tipo: 'porcentaje' },
  { clave: 'afore_semanas', etiqueta: 'Semanas cotizadas', tipo: 'numero' },
  { clave: 'afore_semanas_meta', etiqueta: 'Semanas necesarias', tipo: 'numero' },
  { clave: 'afore_semanas_corte', etiqueta: 'Corte de las semanas', tipo: 'fecha' },
  { clave: 'fi_edad_actual', etiqueta: 'Tu edad', tipo: 'numero' },
  { clave: 'edad_retiro', etiqueta: 'Edad de retiro', tipo: 'numero' },
]

const CAMPOS_INFONAVIT: Campo[] = [
  { clave: 'infonavit_credito', etiqueta: 'Monto del crédito', tipo: 'dinero' },
  { clave: 'infonavit_tasa', etiqueta: 'Tasa', tipo: 'porcentaje' },
  { clave: 'infonavit_cat', etiqueta: 'CAT', tipo: 'porcentaje' },
  { clave: 'infonavit_meses', etiqueta: 'Plazo en meses', tipo: 'numero' },
  { clave: 'infonavit_retencion', etiqueta: 'Sale de tu nómina al mes', tipo: 'dinero' },
  { clave: 'infonavit_patron', etiqueta: 'Aporta tu patrón al mes', tipo: 'dinero' },
  { clave: 'infonavit_fpp', etiqueta: 'Factor de pago', tipo: 'numero', paso: '0.0001' },
]

/** Cobertura del seguro de depositos, que NO es la misma segun el tipo. */
function cobertura(tipo: string, udi: number) {
  if (tipo === 'sofipo') return { udis: 25000, monto: 25000 * udi, quien: 'Fondo de Protección de SOFIPOs' }
  if (tipo === 'banco')  return { udis: 400000, monto: 400000 * udi, quien: 'IPAB' }
  return null
}

/** Interes anual de una cuenta, respetando el tope de la tasa promocional. */
function interesAnual(c: Cuenta) {
  const saldo = num(c.saldo), tope = num(c.tope_promo)
  const enPromo = tope > 0 ? Math.min(saldo, tope) : saldo
  const excedente = Math.max(0, saldo - enPromo)
  return enPromo * (num(c.tasa_promo) / 100) + excedente * (num(c.tasa_base) / 100)
}

/**
 * Proyecta el saldo del PPR hasta el ultimo pago.
 *
 * Dos cosas que una proyeccion ingenua se salta y que cambian el resultado:
 *
 * 1. El costo del seguro SUBE cada anio con la edad. Los factores de
 *    mortalidad de la poliza van de 1.08 a 1.94 entre el anio 2 y el 15.
 *    Proyectar con el costo de hoy da una cifra optimista y falsa.
 * 2. Ese costo se cobra sobre la SUMA EN RIESGO -- asegurada menos saldo --
 *    que baja conforme crece el ahorro. Ignorarlo castiga de mas al producto.
 *
 * Es un modelo, no la cifra garantizada por la aseguradora.
 */
function proyectaPPR(p: Perfil, rendimiento: number, costoTrasPagos: boolean) {
  const factores = (p.ppr_factores ?? '').split(',').map(f => num(f)).filter(f => f > 0)
  const pagos = num(p.ppr_anios_pago)
  const total = Math.max(pagos, num(p.ppr_anios_total))
  const a0 = Math.max(1, num(p.ppr_anio_poliza))
  const suma = num(p.ppr_suma_asegurada_udi)
  const prima = num(p.ppr_prima_anual_udi)
  if (!factores.length || !total || !suma) return null

  // Costo por unidad de factor y de suma en riesgo, calibrado con lo observado.
  const riesgo0 = suma - num(p.ppr_saldo_udi)
  const base = num(p.ppr_costo_anual_udi) / (factores[a0 - 1] * riesgo0)

  let saldo = num(p.ppr_saldo_udi)
  let seAgota: number | null = null
  const filas: { anio: number; prima: number; costo: number; saldo: number }[] = []
  for (let a = a0; a <= total; a++) {
    const f = factores[a - 1] ?? factores[factores.length - 1]
    const primaA = a <= pagos ? prima : 0
    const cobra = a <= pagos || costoTrasPagos
    const costo = cobra ? base * f * Math.max(0, suma - saldo) : 0
    saldo = Math.max(0, (saldo + primaA - costo) * (1 + rendimiento))
    if (saldo === 0 && seAgota === null) seAgota = a
    filas.push({ anio: a, prima: primaA, costo, saldo })
  }
  return {
    filas, saldoFinal: saldo, seAgota,
    aportadoTotal: prima * pagos,
    saldoAlUltimoPago: filas.find(f => f.anio === pagos)?.saldo ?? 0,
  }
}

export function Patrimonio() {
  const [cuentas, setCuentas] = useState<Cuenta[]>([])
  const [perfil, setPerfil]   = useState<Perfil | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  // Que seccion esta abierta para editar: 'real' | 'ppr' | 'afore' |
  // 'infonavit' | 'cuenta:<id>'. Solo una a la vez, para no perder cambios.
  const [editando, setEditando] = useState<string | null>(null)

  /** Guarda en finanzas_perfil. Devuelve el mensaje de error, o null si fue bien. */
  async function guardaPerfil(cambios: Valores): Promise<string | null> {
    const { error: err } = await supabase.from('finanzas_perfil')
      .update({ ...cambios, updated_at: new Date().toISOString() }).eq('id', 1)
    if (err) return `No se guardó: ${err.message}`
    setEditando(null)
    await load()
    return null
  }

  /** Guarda una cuenta de ahorro. */
  async function guardaCuenta(id: number, cambios: Valores): Promise<string | null> {
    if (!String(cambios.institucion ?? '').trim() && !String(cambios.nombre ?? '').trim())
      return 'Ponle al menos una institución o un nombre.'
    const { error: err } = await supabase.from('ahorros_cuentas')
      .update({ ...cambios, updated_at: new Date().toISOString() }).eq('id', id)
    if (err) return `No se guardó: ${err.message}`
    setEditando(null)
    await load()
    return null
  }

  /** Agrega una cuenta vacia y la abre para editar. */
  async function nuevaCuenta() {
    const { data, error: err } = await supabase.from('ahorros_cuentas')
      .insert({ nombre: 'Cuenta nueva', institucion: '', tipo: 'banco',
                saldo: 0, tasa_promo: 0, tope_promo: 0, tasa_base: 0 })
      .select().single()
    if (err) { setError(err.message); return }
    await load()
    if (data) setEditando(`cuenta:${data.id}`)
  }

  async function borraCuenta(id: number) {
    if (!confirm('¿Quitar esta cuenta del patrimonio?')) return
    await supabase.from('ahorros_cuentas').update({ activo: false }).eq('id', id)
    setEditando(null)
    await load()
  }

  async function load() {
    setError(null)
    try {
      const [c, p] = await Promise.all([
        supabase.from('ahorros_cuentas').select('*').eq('activo', true).order('saldo', { ascending: false }),
        supabase.from('finanzas_perfil').select('*').eq('id', 1).maybeSingle(),
      ])
      const fallo = c.error ?? p.error
      if (fallo && !/PGRST205|does not exist|schema cache/i.test(`${fallo.message} ${fallo.code}`)) {
        setError(fallo.message)
      }
      setCuentas((c.data ?? []) as Cuenta[])
      if (p.data) setPerfil(p.data as Perfil)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-40">
      <div className="animate-spin w-7 h-7 border-2 rounded-full"
        style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
    </div>
  )

  if (!perfil) return (
    <div className="card text-center py-10">
      <AlertTriangle className="mx-auto text-yellow-400 mb-3" size={30} />
      <p className="text-strong font-semibold mb-1">Falta correr la migración</p>
      <p className="text-muted text-sm mb-4">
        Aplica <code className="accent">supabase/migrations/20260920000000_finanzas.sql</code>.
      </p>
      {error && <p className="text-xs font-mono mb-3" style={{ color: 'var(--red)' }}>{error}</p>}
      <button className="btn-secondary text-sm" onClick={() => { setLoading(true); load() }}>Reintentar</button>
    </div>
  )

  // ── Rendimiento real ───────────────────────────────────────────────
  const isrRet = num(perfil.isr_retencion_pct) / 100
  const infl   = num(perfil.inflacion_pct) / 100
  const marg   = num(perfil.isr_marginal_pct) / 100
  const udi    = num(perfil.udi)

  const capital  = cuentas.reduce((s, c) => s + num(c.saldo), 0)
  const interes  = cuentas.reduce((s, c) => s + interesAnual(c), 0)
  const isr      = capital * isrRet
  const costoInf = capital * infl
  const real     = interes - isr - costoInf

  // El ISR retenido es pago provisional. En la anual el impuesto se calcula
  // sobre el interes REAL, es decir el que excede a la inflacion.
  const interesReal = interes - costoInf
  const isrAnual    = Math.max(0, interesReal) * marg

  // ── PPR ────────────────────────────────────────────────────────────
  const primaMes = num(perfil.ppr_prima_anual_udi) / 12
  const inicio   = perfil.ppr_inicio ? new Date(perfil.ppr_inicio) : null
  const meses    = inicio
    ? Math.max(0, (new Date().getFullYear() - inicio.getFullYear()) * 12 +
                  (new Date().getMonth() - inicio.getMonth()) + 1)
    : 0
  const aportado = primaMes * meses
  const saldoPpr = num(perfil.ppr_saldo_udi)
  const costoSeg = aportado - saldoPpr
  const dedAnual = num(perfil.ppr_prima_anual_udi) * udi * marg

  const paramsAfore = {
    saldoRetiro: num(perfil.afore_retiro),
    saldoVivienda: num(perfil.afore_vivienda),
    sbcDiario: num(perfil.afore_sbc_diario),
    tasaAportacion: num(perfil.afore_tasa_aportacion),
    rendimientoReal: num(perfil.afore_rendimiento_real),
    edadActual: num(perfil.fi_edad_actual),
    edadRetiro: num(perfil.edad_retiro),
    semanas: num(perfil.afore_semanas),
    semanasMeta: num(perfil.afore_semanas_meta),
    semanasCorte: perfil.afore_semanas_corte,
    nombre: perfil.afore_nombre,
  }

  // ── INFONAVIT ──────────────────────────────────────────────────────
  const mesesInf = num(perfil.infonavit_meses)
  const pagoMes  = num(perfil.infonavit_retencion) + num(perfil.infonavit_fpp)
  const totalTuyo= pagoMes * mesesInf
  const totalPat = num(perfil.infonavit_patron) * mesesInf
  const credito  = num(perfil.infonavit_credito)
  const costoTot = totalTuyo + totalPat - credito

  return (
    <div className="space-y-6">

      {/* ═══ RENDIMIENTO REAL ═══ */}
      <div className="card">
        <div className="flex items-center gap-2 mb-1">
          <TrendingUp size={17} className="accent" />
          <h2 className="text-strong font-semibold flex-1">Qué ganas de verdad</h2>
          <BotonEditar activo={editando === 'real'}
            onClick={() => setEditando(editando === 'real' ? null : 'real')}
            titulo="Editar ISR, inflación y UDI" />
        </div>
        <p className="text-xs text-dim mb-4 max-w-2xl">
          La tasa del banco menos el ISR menos la inflación. El ISR se retiene sobre el
          capital ({pct(num(perfil.isr_retencion_pct))} anual), no sobre el interés, así que se
          cobra tengas rendimiento o no.
        </p>

        {editando === 'real' && (
          <EditorCampos titulo="Supuestos del cálculo" campos={CAMPOS_REAL}
            valores={perfil as unknown as Valores}
            onGuardar={guardaPerfil} onCancelar={() => setEditando(null)} />
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          <Tile k="Capital" v={mxn(capital)} sub={`${cuentas.length} cuentas`} />
          <Tile k="Tasa nominal" v={pct(capital ? interes / capital * 100 : 0)} sub={`${mxn(interes)} al año`} />
          <Tile k="Menos ISR e inflación" v={`−${mxn(isr + costoInf)}`}
                sub={`ISR ${mxn(isr)} · inflación ${mxn(costoInf)}`} />
          <Tile k="Rendimiento REAL" v={pct(capital ? real / capital * 100 : 0)}
                sub={`${mxn(real)} de poder adquisitivo`} tono={real > 0 ? 'ok' : 'bad'} />
        </div>

        <div className="flex justify-end mb-3">
          <button onClick={nuevaCuenta} className="btn-secondary text-xs">+ Agregar cuenta</button>
        </div>

        <div className="space-y-3">
          {cuentas.map(c => {
            const i = interesAnual(c)
            const cob = cobertura(c.tipo, udi)
            const saldo = num(c.saldo), tope = num(c.tope_promo)
            const excede = tope > 0 && saldo > tope
            const sobreCobertura = cob && saldo > cob.monto
            return (
              <div key={c.id} className="rounded-xl p-4" style={{ background: 'var(--surface-2)' }}>
                <div className="flex items-baseline justify-between gap-3 flex-wrap mb-2">
                  <div>
                    <span className="text-strong font-medium">{c.institucion}</span>
                    <span className={`badge ml-2 ${c.tipo === 'sofipo' ? 'badge-yellow' : 'badge-green'}`}>
                      {c.tipo}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="font-mono text-strong">{mxn2(saldo)}</span>
                    <BotonEditar activo={editando === `cuenta:${c.id}`}
                      onClick={() => setEditando(editando === `cuenta:${c.id}` ? null : `cuenta:${c.id}`)}
                      titulo="Editar saldo, tasa y tope" />
                  </div>
                </div>

                {editando === `cuenta:${c.id}` && (
                  <>
                    <EditorCampos titulo={`Editar ${c.institucion || c.nombre}`} campos={CAMPOS_CUENTA}
                      valores={c as unknown as Valores}
                      onGuardar={cambios => guardaCuenta(c.id, cambios)}
                      onCancelar={() => setEditando(null)} />
                    <button onClick={() => borraCuenta(c.id)}
                      className="btn-secondary text-xs mb-3" style={{ color: 'var(--red)' }}>
                      Quitar esta cuenta
                    </button>
                  </>
                )}

                <dl className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  <Par k="Tasa" v={`${pct(num(c.tasa_promo))}${tope > 0 ? ` hasta ${mxn(tope)}` : ''}`} />
                  {excede && <Par k={`Sobre ${mxn(tope)}`} v={pct(num(c.tasa_base))} alerta />}
                  <Par k="Interés al año" v={mxn(i)} />
                  <Par k="Tasa efectiva" v={pct(saldo ? i / saldo * 100 : 0)} />
                  <Par k="ISR retenido" v={`−${mxn(saldo * isrRet)}`} />
                </dl>

                {cob && (
                  <p className="text-xs mt-3 flex items-start gap-2"
                     style={{ color: sobreCobertura ? 'var(--red)' : 'var(--text-dim)' }}>
                    <ShieldCheck size={13} className="flex-shrink-0 mt-0.5" />
                    <span>
                      {cob.quien} cubre hasta {cob.udis.toLocaleString('es-MX')} UDI ({mxn(cob.monto)}).
                      {sobreCobertura
                        ? ` Tu saldo excede esa cobertura en ${mxn(saldo - cob.monto)}.`
                        : ' Tu saldo está cubierto.'}
                    </span>
                  </p>
                )}
                {c.notas && <p className="text-xs text-dim mt-2">{c.notas}</p>}
              </div>
            )
          })}
        </div>

        <div className="rounded-xl p-4 mt-4" style={{ background: 'var(--accent-soft)' }}>
          <p className="text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--accent)' }}>
            Si presentas declaración anual
          </p>
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <Par k="Interés real (sobre inflación)" v={mxn(interesReal)} />
            <Par k={`ISR que corresponde (${pct(num(perfil.isr_marginal_pct))})`} v={mxn(isrAnual)} />
            <Par k="Ya retenido" v={mxn(isr)} />
            <Par k={isrAnual > isr ? 'Pagarías de más' : 'Te devolverían'}
                 v={mxn(Math.abs(isrAnual - isr))} alerta={isrAnual > isr} />
          </dl>
          <p className="text-xs text-dim mt-3">
            La retención es pago provisional. En la anual el impuesto se recalcula sobre el interés
            que excede a la inflación — pero ahí también entra la deducción de tu PPR, que es mayor.
          </p>
        </div>
      </div>

      {/* ═══ PPR ═══ */}
      <div className="card">
        <div className="flex items-center gap-2 mb-1">
          <Landmark size={17} className="accent" />
          <h2 className="text-strong font-semibold flex-1">PPR — {perfil.ppr_producto}</h2>
          <BotonEditar activo={editando === 'ppr'}
            onClick={() => setEditando(editando === 'ppr' ? null : 'ppr')}
            titulo="Editar saldo, prima y rendimiento" />
        </div>
        <p className="text-xs text-dim mb-4">
          Póliza {perfil.ppr_poliza} · {meses} pagos desde{' '}
          {inicio?.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })}
        </p>

        {editando === 'ppr' && (
          <EditorCampos titulo="Datos de tu estado de cuenta" campos={CAMPOS_PPR}
            valores={perfil as unknown as Valores}
            onGuardar={guardaPerfil} onCancelar={() => setEditando(null)} />
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <Tile k="Aportado" v={`${aportado.toLocaleString('es-MX', { maximumFractionDigits: 0 })} UDI`}
                sub={`≈ ${mxn(aportado * udi)}`} />
          <Tile k="Saldo" v={`${saldoPpr.toLocaleString('es-MX', { maximumFractionDigits: 0 })} UDI`}
                sub={mxn(saldoPpr * udi)} />
          <Tile k="Costo del seguro" v={`${aportado ? (costoSeg / aportado * 100).toFixed(0) : 0}%`}
                sub={`${costoSeg.toLocaleString('es-MX', { maximumFractionDigits: 0 })} UDI de lo aportado`}
                tono="warn" />
          <Tile k="ISR que recuperas" v={mxn(dedAnual)} sub="al año, por Art. 151" tono="ok" />
        </div>

        <dl className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Par k="Prima anual" v={`${num(perfil.ppr_prima_anual_udi).toLocaleString('es-MX')} UDI`} />
          <Par k="≈ en pesos" v={mxn(num(perfil.ppr_prima_anual_udi) * udi)} />
          <Par k="Suma asegurada" v={mxn(num(perfil.ppr_suma_asegurada_udi) * udi)} />
          <Par k="Rendimiento garantizado" v={pct(num(perfil.ppr_rend_garantizado))} />
        </dl>



        <p className="text-xs text-dim mt-4 leading-relaxed">
          El costo del seguro no es dinero perdido: paga la cobertura por fallecimiento y los anexos.
          Se muestra aparte porque en los primeros años se lleva la mayor parte de la prima, y eso no
          se ve en el saldo. Contra eso juega la deducción del Art. 151, que sí es dinero de vuelta.
        </p>
      </div>

      <SimuladorPPR p={{
        saldoUdi: num(perfil.ppr_saldo_udi),
        primaAnualUdi: num(perfil.ppr_prima_anual_udi),
        sumaAseguradaUdi: num(perfil.ppr_suma_asegurada_udi),
        anioActual: num(perfil.ppr_anio_poliza),
        aniosPago: num(perfil.ppr_anios_pago),
        aniosTotal: num(perfil.ppr_anios_total),
        costoAnualObservado: num(perfil.ppr_costo_anual_udi),
        factores: (perfil.ppr_factores ?? '').split(',').map(f => num(f)).filter(f => f > 0),
        udi,
        inflacionEsperada: num(perfil.inflacion_esperada),
      }} />

      <AforeProyeccion p={paramsAfore} />

      <Horizonte p={{
        udiHoy: udi,
        liquido: capital,
        pprUdi: num(perfil.ppr_saldo_udi),
        aforeRetiro: num(perfil.afore_retiro),
        aforeRetiroProyectado: proyectaAfore(paramsAfore).saldoFinal,
        aforeVivienda: num(perfil.afore_vivienda),
        gastoMensual: num(perfil.fi_gasto_mensual),
        tasaRetiro: num(perfil.fi_tasa_retiro),
        aporteMensual: num(perfil.fi_aporte_mensual),
        rendimientoReal: num(perfil.fi_rendimiento_real),
        edadActual: num(perfil.fi_edad_actual),
        inflacionEsperada: num(perfil.inflacion_esperada),
      }} />

      <SimuladorInfonavit p={{
        credito: num(perfil.infonavit_credito),
        tasaAnual: num(perfil.infonavit_tasa),
        retencion: num(perfil.infonavit_retencion),
        patron: num(perfil.infonavit_patron),
        fpp: num(perfil.infonavit_fpp),
        mesesOriginal: num(perfil.infonavit_meses),
      }} />

      {/* ═══ AFORE E INFONAVIT ═══ */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <Landmark size={17} className="accent" />
            <h2 className="text-strong font-semibold flex-1">AFORE {perfil.afore_nombre}</h2>
            <BotonEditar activo={editando === 'afore'}
              onClick={() => setEditando(editando === 'afore' ? null : 'afore')}
              titulo="Editar saldos, SBC y semanas" />
          </div>
          {editando === 'afore' && (
            <EditorCampos titulo="Datos de tu AFORE y del IMSS" campos={CAMPOS_AFORE}
              valores={perfil as unknown as Valores}
              onGuardar={guardaPerfil} onCancelar={() => setEditando(null)} />
          )}
          <p className="text-2xl font-bold text-strong font-mono mb-1">
            {mxn(num(perfil.afore_retiro) + num(perfil.afore_vivienda))}
          </p>
          <p className="text-xs text-dim mb-4">
            al {perfil.afore_corte
              ? new Date(perfil.afore_corte).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })
              : '—'}
          </p>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Par k="Retiro" v={mxn(num(perfil.afore_retiro))} />
            <Par k="Vivienda" v={mxn(num(perfil.afore_vivienda))} />
            <Par k="Rendimiento 12m" v={mxn(num(perfil.afore_rendimiento_12m))} />
            <Par k="Comisiones 12m" v={`−${mxn(num(perfil.afore_comisiones_12m))}`} alerta />
          </dl>
        </div>

        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <Home size={17} className="accent" />
            <h2 className="text-strong font-semibold flex-1">INFONAVIT</h2>
            <BotonEditar activo={editando === 'infonavit'}
              onClick={() => setEditando(editando === 'infonavit' ? null : 'infonavit')}
              titulo="Editar crédito, tasa y plazo" />
          </div>
          {editando === 'infonavit' && (
            <EditorCampos titulo="Datos de tu crédito" campos={CAMPOS_INFONAVIT}
              valores={perfil as unknown as Valores}
              onGuardar={guardaPerfil} onCancelar={() => setEditando(null)} />
          )}
          <p className="text-2xl font-bold text-strong font-mono mb-1">{mxn(credito)}</p>
          <p className="text-xs text-dim mb-4">
            de crédito · {pct(num(perfil.infonavit_tasa))} de tasa · CAT {pct(num(perfil.infonavit_cat))}
          </p>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Par k="Sale de tu nómina" v={`${mxn(pagoMes)}/mes`} />
            <Par k="Aporta tu patrón" v={`${mxn(num(perfil.infonavit_patron))}/mes`} />
            <Par k="Plazo" v={`${mesesInf} meses (${(mesesInf / 12).toFixed(1)} años)`} />
            <Par k="Con tu subcuenta" v={mxn(credito + num(perfil.afore_vivienda))} />
            <Par k="Pagarías en total" v={mxn(totalTuyo + totalPat)} />
            <Par k="Intereses y comisiones" v={`+${mxn(costoTot)}`} alerta />
          </dl>
          <p className="text-xs text-dim mt-3">
            Terminarías pagando {((totalTuyo + totalPat) / credito).toFixed(2)} veces lo prestado.
          </p>
        </div>
      </div>

      <p className="text-xs text-dim text-center max-w-2xl mx-auto">
        Esto es aritmética sobre tus propios documentos, no asesoría financiera.
        Para decidir qué hacer con un PPR o un crédito hipotecario, consulta a un asesor certificado.
      </p>
    </div>
  )
}

function Tile({ k, v, sub, tono }: { k: string; v: string; sub?: string; tono?: 'ok' | 'warn' | 'bad' }) {
  const color = tono === 'ok' ? 'var(--green)' : tono === 'warn' ? 'var(--yellow)'
              : tono === 'bad' ? 'var(--red)' : 'var(--text)'
  return (
    <div className="stat-card">
      <p className="text-xs text-muted mb-1">{k}</p>
      <p className="text-lg font-bold font-mono" style={{ color }}>{v}</p>
      {sub && <p className="text-xs text-dim mt-1">{sub}</p>}
    </div>
  )
}

function Par({ k, v, alerta }: { k: string; v: string; alerta?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-dim">{k}</dt>
      <dd className="font-mono mt-0.5" style={{ color: alerta ? 'var(--red)' : 'var(--text)' }}>{v}</dd>
    </div>
  )
}
