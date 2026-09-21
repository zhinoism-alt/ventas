import { Landmark, CalendarClock } from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════════════
   AFORE: saldo proyectado y semanas cotizadas.

   Tratar la AFORE como un saldo fijo subestima el patrimonio de retiro por
   millones. Cada bimestre entran aportaciones sobre el salario base de
   cotizacion, y ese saldo rinde.

   Tasas 2026, tras la reforma de 2020, para un SBC en el tramo alto:
     Retiro patron 2.000% + Cesantia y Vejez patron 7.513%
     + Cesantia y Vejez obrero 1.125% + cuota social 0% (solo hasta 4 UMA)
     = 10.638% del SBC

   Las semanas cotizadas son otra cosa y se cuentan aparte: son el requisito
   para tener derecho a pension garantizada, no el monto.
   ═══════════════════════════════════════════════════════════════════════ */

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''))
  return Number.isFinite(n) ? n : 0
}
const mxn = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })
    .format(Math.round(n || 0))

export interface ParamsAfore {
  saldoRetiro: number
  saldoVivienda: number
  sbcDiario: number
  tasaAportacion: number
  rendimientoReal: number
  edadActual: number
  edadRetiro: number
  semanas: number
  semanasMeta: number
  semanasCorte: string | null
  nombre: string | null
}

/** Valor futuro del saldo mas las aportaciones, en terminos reales. */
export function proyectaAfore(p: ParamsAfore, rendimiento?: number) {
  const r = (rendimiento ?? num(p.rendimientoReal)) / 100
  const n = Math.max(0, num(p.edadRetiro) - num(p.edadActual))
  const aporteMensual = num(p.sbcDiario) * 30.4 * (num(p.tasaAportacion) / 100)
  const aporteAnual = aporteMensual * 12
  const saldo = num(p.saldoRetiro)
  const fv = r === 0
    ? saldo + aporteAnual * n
    : saldo * (1 + r) ** n + aporteAnual * (((1 + r) ** n - 1) / r)
  return { aporteMensual, aporteAnual, anios: n, saldoFinal: fv }
}

export function AforeProyeccion({ p }: { p: ParamsAfore }) {
  const base = proyectaAfore(p)
  const faltan = Math.max(0, num(p.semanasMeta) - num(p.semanas))
  const aniosFaltan = faltan / 52
  const avance = num(p.semanasMeta) ? num(p.semanas) / num(p.semanasMeta) * 100 : 0

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-1">
        <Landmark size={17} className="accent" />
        <h2 className="text-strong font-semibold">AFORE {p.nombre} — proyectada</h2>
      </div>
      <p className="text-xs text-dim mb-4 max-w-2xl">
        Cada bimestre entra {mxn(base.aporteMensual)} al mes sobre tu salario base de
        cotizacion de {mxn(num(p.sbcDiario))} diarios, al {num(p.tasaAportacion)}%. Ese
        saldo ademas rinde, asi que no se queda quieto.
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Tile k="Saldo de retiro hoy" v={mxn(num(p.saldoRetiro))} sub={`a los ${num(p.edadActual)} anos`} />
        <Tile k="Entra al mes" v={mxn(base.aporteMensual)} sub={`${mxn(base.aporteAnual)} al ano`} tono="ok" />
        <Tile k={`A los ${num(p.edadRetiro)}`} v={mxn(base.saldoFinal)}
              sub={`${base.anios} anos al ${num(p.rendimientoReal)}% real`} tono="ok" />
        <Tile k="Subcuenta de vivienda" v={mxn(num(p.saldoVivienda))} sub="solo para INFONAVIT" />
      </div>

      <div className="rounded-xl p-4 mb-4" style={{ background: 'var(--surface-2)' }}>
        <p className="text-xs uppercase tracking-wider text-muted mb-3">Sensibilidad al rendimiento</p>
        <div className="scroll-x">
          <table className="w-full text-sm" style={{ minWidth: 340 }}>
            <thead>
              <tr className="text-dim text-xs">
                <th className="text-left font-medium pb-2">Rendimiento real</th>
                <th className="text-right font-medium pb-2">Saldo a los {num(p.edadRetiro)}</th>
                <th className="text-right font-medium pb-2">Renta al 4% anual</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {[3, 4, 5, 6].map(r => {
                const s = proyectaAfore(p, r).saldoFinal
                return (
                  <tr key={r} style={{ borderTop: '1px solid var(--border)' }}>
                    <td className="py-2 text-body">{r}%</td>
                    <td className="py-2 text-right text-strong">{mxn(s)}</td>
                    <td className="py-2 text-right text-dim">{mxn(s * 0.04 / 12)}/mes</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-dim mt-3">
          Todo en poder adquisitivo de hoy. La ultima columna es cuanto podrias retirar al
          mes sin agotar el capital.
        </p>
      </div>

      <div className="rounded-xl p-4" style={{ background: 'var(--surface-2)' }}>
        <div className="flex items-center gap-2 mb-2">
          <CalendarClock size={14} className="accent" />
          <p className="text-xs uppercase tracking-wider text-muted">Semanas cotizadas</p>
        </div>
        <div className="flex items-baseline gap-3 mb-2">
          <span className="text-2xl font-bold font-mono text-strong">{num(p.semanas)}</span>
          <span className="text-sm text-dim">de {num(p.semanasMeta)} necesarias</span>
          <span className="flex-1" />
          <span className="text-sm font-mono text-body">{avance.toFixed(1)}%</span>
        </div>
        <div className="h-2 rounded-full overflow-hidden mb-3" style={{ background: 'var(--surface-3)' }}>
          <div className="h-full rounded-full"
               style={{ width: `${Math.min(100, avance)}%`, background: 'var(--accent)' }} />
        </div>
        <p className="text-xs text-dim">
          Te faltan {faltan} semanas, unos {aniosFaltan.toFixed(1)} anos cotizando sin
          interrupcion: las alcanzarias cerca de los{' '}
          <strong className="text-body">{Math.round(num(p.edadActual) + aniosFaltan)} anos</strong>.
          Son el requisito para tener derecho a pension garantizada; el monto depende del
          saldo, no de las semanas.
        </p>
        {p.semanasCorte && (
          <p className="text-xs text-dim mt-1">
            Corte del {new Date(p.semanasCorte).toLocaleDateString('es-MX',
              { day: '2-digit', month: 'long', year: 'numeric' })}.
          </p>
        )}
      </div>
    </div>
  )
}

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
