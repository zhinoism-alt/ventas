import { useEffect, useState } from 'react'
import { ShieldCheck, AlertTriangle, TrendingUp, Home, Landmark } from 'lucide-react'
import { supabase } from '../lib/supabase'

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
          <h2 className="text-strong font-semibold">Qué ganas de verdad</h2>
        </div>
        <p className="text-xs text-dim mb-4 max-w-2xl">
          La tasa del banco menos el ISR menos la inflación. El ISR se retiene sobre el
          capital ({pct(num(perfil.isr_retencion_pct))} anual), no sobre el interés, así que se
          cobra tengas rendimiento o no.
        </p>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          <Tile k="Capital" v={mxn(capital)} sub={`${cuentas.length} cuentas`} />
          <Tile k="Tasa nominal" v={pct(capital ? interes / capital * 100 : 0)} sub={`${mxn(interes)} al año`} />
          <Tile k="Menos ISR e inflación" v={`−${mxn(isr + costoInf)}`}
                sub={`ISR ${mxn(isr)} · inflación ${mxn(costoInf)}`} />
          <Tile k="Rendimiento REAL" v={pct(capital ? real / capital * 100 : 0)}
                sub={`${mxn(real)} de poder adquisitivo`} tono={real > 0 ? 'ok' : 'bad'} />
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
                  <span className="font-mono text-strong">{mxn2(saldo)}</span>
                </div>

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
          <h2 className="text-strong font-semibold">PPR — {perfil.ppr_producto}</h2>
        </div>
        <p className="text-xs text-dim mb-4">
          Póliza {perfil.ppr_poliza} · {meses} pagos desde{' '}
          {inicio?.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })}
        </p>

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

        <ProyeccionPPR perfil={perfil} udi={udi} marg={marg} />

        <p className="text-xs text-dim mt-4 leading-relaxed">
          El costo del seguro no es dinero perdido: paga la cobertura por fallecimiento y los anexos.
          Se muestra aparte porque en los primeros años se lleva la mayor parte de la prima, y eso no
          se ve en el saldo. Contra eso juega la deducción del Art. 151, que sí es dinero de vuelta.
        </p>
      </div>

      {/* ═══ AFORE E INFONAVIT ═══ */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <Landmark size={17} className="accent" />
            <h2 className="text-strong font-semibold">AFORE {perfil.afore_nombre}</h2>
          </div>
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
            <h2 className="text-strong font-semibold">INFONAVIT</h2>
          </div>
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

function ProyeccionPPR({ perfil, udi, marg }: { perfil: Perfil; udi: number; marg: number }) {
  const pagos = num(perfil.ppr_anios_pago)
  const total = num(perfil.ppr_anios_total)
  const rendimientos = [
    { nombre: 'Mínimo garantizado', r: num(perfil.ppr_rend_garantizado) / 100 },
    { nombre: 'Al ritmo observado', r: num(perfil.ppr_rend_observado) / 100 },
  ]
  // La duda que decide todo: tras el ultimo pago, sigue saliendo el costo del
  // seguro del fondo? Mientras no este confirmado se muestran las dos ramas.
  const hipotesis = perfil.ppr_costo_tras_pagos === null
    ? [false, true]
    : [perfil.ppr_costo_tras_pagos]

  const referencia = proyectaPPR(perfil, rendimientos[1].r, false)
  if (!referencia) return null
  const aportado = referencia.aportadoTotal

  return (
    <div className="rounded-xl p-4 mt-5" style={{ background: 'var(--surface-2)' }}>
      <p className="text-xs uppercase tracking-wider text-muted mb-1">
        Proyección hasta los 65
      </p>
      <p className="text-xs text-dim mb-4 max-w-2xl">
        Pagas {pagos} años pero la póliza cubre {total}, hasta{' '}
        {perfil.ppr_vencimiento
          ? new Date(perfil.ppr_vencimiento).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })
          : 'el vencimiento'}. Todo en UDI, que ya está protegido de la inflación:
        una UDI de 2062 compra lo mismo que una de hoy.
      </p>

      {perfil.ppr_costo_tras_pagos === null && (
        <div className="rounded-lg p-3 mb-4 flex items-start gap-2"
             style={{ background: 'var(--yellow-soft)' }}>
          <AlertTriangle size={14} style={{ color: 'var(--yellow)' }} className="flex-shrink-0 mt-0.5" />
          <div className="text-xs" style={{ color: 'var(--yellow)' }}>
            <strong>Falta confirmar con la aseguradora:</strong> después del pago {pagos},
            ¿se sigue descontando el costo del seguro del fondo? Las dos respuestas dan
            resultados opuestos, así que abajo se muestran ambas.
          </div>
        </div>
      )}

      <div className="scroll-x mb-4">
        <table className="w-full text-sm" style={{ minWidth: 520 }}>
          <thead>
            <tr className="text-dim text-xs">
              <th className="text-left font-medium pb-2">Hipótesis</th>
              <th className="text-right font-medium pb-2">Rendimiento</th>
              <th className="text-right font-medium pb-2">Al último pago</th>
              <th className="text-right font-medium pb-2">A los 65</th>
            </tr>
          </thead>
          <tbody>
            {hipotesis.map(costo => rendimientos.map(rend => {
              const pr = proyectaPPR(perfil, rend.r, costo)
              if (!pr) return null
              const muere = pr.seAgota !== null
              return (
                <tr key={`${costo}-${rend.nombre}`} style={{ borderTop: '1px solid var(--border)' }}>
                  <td className="py-2 text-body text-xs">
                    {costo ? 'El costo sigue saliendo del fondo' : 'Póliza saldada, sin costo'}
                  </td>
                  <td className="py-2 text-right font-mono text-xs text-dim">
                    {rend.nombre} · {pct(rend.r * 100)}
                  </td>
                  <td className="py-2 text-right font-mono text-body">
                    {pr.saldoAlUltimoPago.toLocaleString('es-MX', { maximumFractionDigits: 0 })}
                  </td>
                  <td className="py-2 text-right font-mono font-semibold"
                      style={{ color: muere ? 'var(--red)' : 'var(--green)' }}>
                    {muere
                      ? `se agota en el año ${pr.seAgota}`
                      : `${pr.saldoFinal.toLocaleString('es-MX', { maximumFractionDigits: 0 })} UDI`}
                  </td>
                </tr>
              )
            }))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
        <Tile k="Habrás aportado" v={`${aportado.toLocaleString('es-MX', { maximumFractionDigits: 0 })} UDI`}
              sub={`${mxn(aportado * udi)} de hoy`} tono="warn" />
        <Tile k="ISR recuperado" v={mxn(aportado * udi * marg)} sub="deducción acumulada" tono="ok" />
        <Tile k="Cobertura mientras tanto"
              v={mxn(num(perfil.ppr_suma_asegurada_udi) * udi)} sub={`durante ${total} años`} />
      </div>

      <p className="text-xs text-dim leading-relaxed">
        Al vencimiento la aseguradora <strong className="text-body">no te entrega el saldo</strong>:
        le aplica un factor de rentas y paga una renta mensual. Ese factor no viene en tus
        documentos, así que la renta no se puede calcular aquí.
      </p>
      {perfil.ppr_cargo_rescate && (
        <p className="text-xs mt-2" style={{ color: 'var(--yellow)' }}>
          Cargo por rescate anticipado: {perfil.ppr_cargo_rescate}.
        </p>
      )}
      <p className="text-xs text-dim mt-2">
        Modelo con los factores de mortalidad de tu póliza, no la cifra garantizada.
        {perfil.ppr_aseguradora} puede darte la proyección oficial.
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
