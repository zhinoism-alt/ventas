import { useEffect, useState } from 'react'
import { CampoNumero } from './CampoNumero'
import { Coins, Target, Info } from 'lucide-react'
import { supabase } from '../lib/supabase'

/* ═══════════════════════════════════════════════════════════════════════
   UDI y libertad financiera.

   Dos ideas que sostienen todo lo de abajo.

   1. Un saldo en UDI no cambia de poder adquisitivo. 1 UDI de 2062 compra
      lo mismo que 1 de hoy. Lo que cambia es CUANTOS PESOS representa. Por
      eso la misma cifra tiene dos lecturas validas y hay que decir cual es
      cual: "poder adquisitivo de hoy" y "pesos nominales de ese anio".

   2. La inflacion no es constante. El UDI crecio 2.63% en 2020 y 7.77% en
      2023. En 36 anios, la diferencia entre 3% y 7% multiplica el resultado
      nominal por cuatro. Proyectar con un solo numero esconde eso, asi que
      aqui se modela una trayectoria y se muestran las bandas.
   ═══════════════════════════════════════════════════════════════════════ */

interface UdiAnio { anio: number; valor: number }

export interface ParamsHorizonte {
  udiHoy: number
  // patrimonio de hoy, separado por cuando puedes tocarlo
  liquido: number        // cuentas de banco
  pprUdi: number         // bloqueado hasta 65
  aforeRetiro: number    // bloqueado hasta 65
  aforeRetiroProyectado: number  // lo que sera a los 65 con aportaciones y rendimiento
  aforeVivienda: number  // solo para vivienda
  gastoMensual: number
  tasaRetiro: number
  aporteMensual: number
  rendimientoReal: number
  edadActual: number
  inflacionEsperada: number
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''))
  return Number.isFinite(n) ? n : 0
}
const mxn = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })
    .format(Math.round(n || 0))
const pct = (n: number) => `${(n || 0).toFixed(2)}%`

/** Estadistica de la serie del UDI. */
function estadistica(serie: UdiAnio[]) {
  if (serie.length < 2) return null
  const s = [...serie].sort((a, b) => a.anio - b.anio)
  const var_: { anio: number; pct: number }[] = []
  for (let i = 1; i < s.length; i++) {
    var_.push({ anio: s[i].anio, pct: (s[i].valor / s[i - 1].valor - 1) * 100 })
  }
  const vs = var_.map(v => v.pct)
  const n = vs.length
  const media = vs.reduce((a, b) => a + b, 0) / n
  const orden = [...vs].sort((a, b) => a - b)
  const mediana = n % 2 ? orden[(n - 1) / 2] : (orden[n / 2 - 1] + orden[n / 2]) / 2
  const desv = Math.sqrt(vs.reduce((a, b) => a + (b - media) ** 2, 0) / n)
  const cagr = ((s[s.length - 1].valor / s[0].valor) ** (1 / n) - 1) * 100
  return { var_, media, mediana, desv, cagr, min: orden[0], max: orden[n - 1], anios: n }
}

/**
 * Anios hasta que el capital rinda lo suficiente para cubrir el gasto.
 *
 * Todo en terminos REALES (ya descontada la inflacion), asi que el objetivo
 * no se mueve con los anios. Formula del valor futuro de una anualidad:
 *   n = ln((objetivo·r + aporte) / (capital·r + aporte)) / ln(1+r)
 */
function aniosParaLibertad(capital: number, aporteAnual: number, r: number, objetivo: number) {
  if (capital >= objetivo) return 0
  if (r <= 0) return aporteAnual > 0 ? (objetivo - capital) / aporteAnual : Infinity
  const arriba = objetivo * r + aporteAnual
  const abajo = capital * r + aporteAnual
  if (abajo <= 0 || arriba <= 0) return Infinity
  const n = Math.log(arriba / abajo) / Math.log(1 + r)
  return n > 0 && Number.isFinite(n) ? n : Infinity
}

export function Horizonte({ p }: { p: ParamsHorizonte }) {
  const [serie, setSerie] = useState<UdiAnio[]>([])
  const [infl, setInfl] = useState(p.inflacionEsperada)
  const [gasto, setGasto] = useState(p.gastoMensual)
  const [swr, setSwr] = useState(p.tasaRetiro)
  const [aporte, setAporte] = useState(p.aporteMensual)
  const [rend, setRend] = useState(p.rendimientoReal)
  const [incluyeBloqueado, setIncluyeBloqueado] = useState(false)

  useEffect(() => {
    supabase.from('udi_historico').select('anio,valor').order('anio')
      .then(r => setSerie((r.data ?? []) as UdiAnio[]))
  }, [])

  const est = estadistica(serie)

  // ── Libertad financiera ──────────────────────────────────────────────
  const objetivo = swr > 0 ? gasto * 12 / (swr / 100) : Infinity
  const pprMxn = p.pprUdi * p.udiHoy
  const disponible = p.liquido + (incluyeBloqueado ? pprMxn + p.aforeRetiroProyectado : 0)
  const anios = aniosParaLibertad(disponible, aporte * 12, rend / 100, objetivo)
  const edadMeta = p.edadActual + anios

  // ── Conversion UDI -> pesos ──────────────────────────────────────────
  const horizonte = [10, 20, 36]

  return (
    <div className="space-y-6">

      {/* ═══ UDI ═══ */}
      <div className="card">
        <div className="flex items-center gap-2 mb-1">
          <Coins size={17} className="accent" />
          <h2 className="text-strong font-semibold">El UDI y lo que valen tus pesos</h2>
        </div>
        <p className="text-xs text-dim mb-4 max-w-2xl">
          Un saldo en UDI <strong className="text-body">no cambia de poder adquisitivo</strong>:
          una UDI de 2062 compra lo mismo que una de hoy. Lo que cambia es cuántos pesos
          representa. Por eso la misma cifra tiene dos lecturas, y aquí se dice cuál es cuál.
        </p>

        {est && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
              <Tile k={`CAGR ${est.anios} años`} v={pct(est.cagr)} sub="crecimiento compuesto real" />
              <Tile k="Media / mediana" v={`${pct(est.media)} / ${pct(est.mediana)}`}
                    sub="la media pesa más los años altos" />
              <Tile k="Desviación" v={`±${pct(est.desv)}`}
                    sub={`banda típica ${pct(est.media - est.desv)} a ${pct(est.media + est.desv)}`} />
              <Tile k="Rango observado" v={`${pct(est.min)} – ${pct(est.max)}`}
                    sub="de 2020 a 2023" tono="warn" />
            </div>

            <div className="scroll-x mb-5">
              <table className="w-full text-xs" style={{ minWidth: 380 }}>
                <thead>
                  <tr className="text-dim">
                    <th className="text-left font-medium pb-2">Año</th>
                    <th className="text-right font-medium pb-2">Valor UDI</th>
                    <th className="text-right font-medium pb-2">Variación</th>
                    <th className="text-left font-medium pb-2 pl-4">Contra la media</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {est.var_.map(v => {
                    const val = serie.find(s => s.anio === v.anio)?.valor ?? 0
                    const ancho = Math.min(100, Math.abs(v.pct) / est.max * 100)
                    return (
                      <tr key={v.anio} style={{ borderTop: '1px solid var(--border)' }}>
                        <td className="py-1.5 text-body">{v.anio}</td>
                        <td className="py-1.5 text-right text-dim">{val.toFixed(4)}</td>
                        <td className="py-1.5 text-right"
                            style={{ color: v.pct > est.media ? 'var(--yellow)' : 'var(--text-body)' }}>
                          +{v.pct.toFixed(2)}%
                        </td>
                        <td className="py-1.5 pl-4">
                          <span className="inline-block h-2 rounded-full"
                                style={{ width: `${ancho}%`, minWidth: 4,
                                         background: v.pct > est.media ? 'var(--yellow)' : 'var(--accent)' }} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="rounded-xl p-4" style={{ background: 'var(--surface-2)' }}>
          <div className="grid md:grid-cols-2 gap-4 mb-4">
            <Campo label="Inflación esperada hacia adelante" sufijo="%" valor={infl} paso={0.1}
                   onChange={setInfl}
                   ayuda={est ? `El CAGR de los últimos ${est.anios} años fue ${pct(est.cagr)}.` : undefined} />
            <div className="flex items-end">
              <p className="text-xs text-dim leading-snug">
                Cambia este número y mira cómo se mueve la columna de pesos nominales.
                El poder adquisitivo no se mueve: esa es la gracia del UDI.
              </p>
            </div>
          </div>

          <p className="text-xs uppercase tracking-wider text-muted mb-2">
            Cuánto vale 1,000 UDI según cuándo lo veas
          </p>
          <div className="scroll-x">
            <table className="w-full text-sm" style={{ minWidth: 420 }}>
              <thead>
                <tr className="text-dim text-xs">
                  <th className="text-left font-medium pb-2">Horizonte</th>
                  <th className="text-right font-medium pb-2">Valor del UDI</th>
                  <th className="text-right font-medium pb-2">Pesos nominales</th>
                  <th className="text-right font-medium pb-2">Poder adquisitivo de hoy</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                <tr style={{ borderTop: '1px solid var(--border)' }}>
                  <td className="py-2 text-body">Hoy</td>
                  <td className="py-2 text-right text-dim">{p.udiHoy.toFixed(4)}</td>
                  <td className="py-2 text-right text-strong">{mxn(1000 * p.udiHoy)}</td>
                  <td className="py-2 text-right text-body">{mxn(1000 * p.udiHoy)}</td>
                </tr>
                {horizonte.map(h => {
                  const u = p.udiHoy * (1 + infl / 100) ** h
                  return (
                    <tr key={h} style={{ borderTop: '1px solid var(--border)' }}>
                      <td className="py-2 text-body">En {h} años</td>
                      <td className="py-2 text-right text-dim">{u.toFixed(2)}</td>
                      <td className="py-2 text-right text-strong">{mxn(1000 * u)}</td>
                      <td className="py-2 text-right text-body">{mxn(1000 * p.udiHoy)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-dim mt-3">
            La última columna no se mueve a propósito. Mil UDI compran lo mismo siempre —
            por eso tu PPR está denominado así y no en pesos.
          </p>
        </div>
      </div>

      {/* ═══ LIBERTAD FINANCIERA ═══ */}
      <div className="card">
        <div className="flex items-center gap-2 mb-1">
          <Target size={17} className="accent" />
          <h2 className="text-strong font-semibold">Cuándo el dinero trabaja por ti</h2>
        </div>
        <p className="text-xs text-dim mb-4 max-w-2xl">
          Todo en términos reales, ya descontada la inflación. Así el objetivo no se mueve
          con los años y la cifra significa lo mismo hoy que en 2050.
        </p>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <Campo label="Gasto mensual a cubrir" sufijo="$" valor={gasto} paso={1000}
                 onChange={setGasto} ayuda="Hoy gastas $14,000 sin contar renta." />
          <Campo label="Retiro anual seguro" sufijo="%" valor={swr} paso={0.25}
                 onChange={setSwr} ayuda="4% es la referencia clásica a 30 años; 3-3.5% si el horizonte es mayor." />
          <Campo label="Aporte mensual" sufijo="$" valor={aporte} paso={1000}
                 onChange={setAporte} ayuda="Lo que puedes apartar cada mes." />
          <Campo label="Rendimiento real" sufijo="%" valor={rend} paso={0.5}
                 onChange={setRend} ayuda="Por encima de la inflación. Tu banco da 6.63% hoy." />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <Tile k="Capital objetivo" v={mxn(objetivo)} sub={`${(objetivo / (gasto * 12)).toFixed(0)}× tu gasto anual`} />
          <Tile k="Tienes hoy" v={mxn(disponible)}
                sub={`${objetivo ? (disponible / objetivo * 100).toFixed(1) : 0}% del objetivo`} />
          <Tile k="Te faltan" v={mxn(Math.max(0, objetivo - disponible))} tono="warn" />
          <Tile k="Lo alcanzas en"
                v={Number.isFinite(anios) ? `${anios.toFixed(1)} años` : 'nunca así'}
                sub={Number.isFinite(anios) ? `a los ${edadMeta.toFixed(0)} años` : 'sube el aporte o el rendimiento'}
                tono={Number.isFinite(anios) && edadMeta <= 65 ? 'ok' : 'bad'} />
        </div>

        <div className="rounded-xl p-4 mb-4" style={{ background: 'var(--surface-2)' }}>
          <p className="text-xs uppercase tracking-wider text-muted mb-3">De qué está hecho tu patrimonio</p>
          <div className="space-y-2">
            <Fila k="Cuentas de banco" v={p.liquido} nota="disponible ya" />
            <Fila k="PPR (Imagina Ser)" v={pprMxn} nota="bloqueado hasta los 65" bloqueado />
            <Fila k="AFORE — retiro (hoy)" v={p.aforeRetiro} nota="bloqueado hasta los 65" bloqueado />
            <Fila k="AFORE — proyectada a los 65" v={p.aforeRetiroProyectado}
                  nota="con aportaciones y rendimiento" bloqueado />
            <Fila k="AFORE — vivienda" v={p.aforeVivienda} nota="solo para vivienda" bloqueado />
          </div>
          <label className="flex items-center gap-2 text-sm text-body mt-3 cursor-pointer">
            <input type="checkbox" checked={incluyeBloqueado}
                   onChange={e => setIncluyeBloqueado(e.target.checked)} />
            Contar también el PPR y la AFORE
            <span className="text-xs text-dim">(solo sirven si tu meta es a los 65)</span>
          </label>
          <p className="text-xs text-dim mt-2">
            La distinción importa: si quieres dejar de trabajar antes de los 65, ese dinero
            no está disponible y el cálculo con solo tu capital líquido es el que manda.
          </p>
        </div>

        <div className="rounded-lg p-3 flex items-start gap-2" style={{ background: 'var(--accent-soft)' }}>
          <Info size={14} style={{ color: 'var(--accent)' }} className="flex-shrink-0 mt-0.5" />
          <p className="text-xs" style={{ color: 'var(--accent-ink, var(--accent))' }}>
            Esto es aritmética sobre tus supuestos, no una recomendación de inversión.
            Qué instrumentos usar para alcanzar ese rendimiento es una decisión que amerita
            un asesor certificado.
          </p>
        </div>
      </div>
    </div>
  )
}

function Fila({ k, v, nota, bloqueado }: { k: string; v: number; nota: string; bloqueado?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-body">{k}</span>
      <span className="flex-1 border-b border-dashed" style={{ borderColor: 'var(--border)' }} />
      <span className="text-xs text-dim">{nota}</span>
      <span className="font-mono" style={{ color: bloqueado ? 'var(--text-dim)' : 'var(--text)' }}>
        {mxn(v)}
      </span>
    </div>
  )
}

// El campo numerico ahora vive en components/CampoNumero.tsx: la version
// local no dejaba borrar un cero.
const Campo = CampoNumero

function Tile({ k, v, sub, tono }: { k: string; v: string; sub?: string; tono?: 'ok' | 'warn' | 'bad' }) {
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
