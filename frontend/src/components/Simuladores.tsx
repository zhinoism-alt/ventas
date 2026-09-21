import { useState } from 'react'
import { Sliders, TrendingUp, Home } from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════════════
   Simuladores: PPR e INFONAVIT.

   Los dos existen porque una proyeccion cerrada no sirve para decidir. Lo
   util es ver cuanto mueve cada palanca, sobre todo las que dependen de ti.

   En el PPR hay un mecanismo que no es obvio: el costo de mortalidad se
   cobra sobre la SUMA EN RIESGO -- asegurada menos saldo. Si aportas de mas,
   el fondo crece, la suma en riesgo baja, y el costo del seguro baja contigo.
   Cada peso extra trabaja dos veces: rinde y ademas abarata el seguro.

   En el INFONAVIT el mecanismo es el contrario y igual de fuerte: cada peso
   a capital deja de generar intereses el resto del plazo. Con una tasa de
   10.45% eso es mucho mas de lo que rinde ese mismo peso en el banco.
   ═══════════════════════════════════════════════════════════════════════ */

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''))
  return Number.isFinite(n) ? n : 0
}
const mxn = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })
    .format(Math.round(n || 0))
const udiFmt = (n: number) => `${Math.round(n).toLocaleString('es-MX')} UDI`

// ─────────────────────────────────────────────────────────────────────────
// PPR
// ─────────────────────────────────────────────────────────────────────────

export interface ParamsPPR {
  saldoUdi: number
  primaAnualUdi: number
  sumaAseguradaUdi: number
  anioActual: number
  aniosPago: number
  aniosTotal: number
  costoAnualObservado: number
  factores: number[]
  udi: number
}

interface Palancas {
  rendimiento: number      // % anual, en UDI (real)
  extraMensual: number     // UDI adicionales al mes
  pctAdquisicion: number   // % del cargo actual que es adquisicion, no mortalidad
  aniosAdquisicion: number // hasta que anio corre ese cargo
  costoTrasPagos: boolean
}

function simulaPPR(p: ParamsPPR, l: Palancas) {
  const r = l.rendimiento / 100
  const riesgo0 = p.sumaAseguradaUdi - p.saldoUdi
  const f0 = p.factores[p.anioActual - 1] ?? 1

  // El cargo observado se parte en dos piezas que se comportan al reves:
  // la adquisicion es fija y se extingue; la mortalidad escala con la edad
  // pero se aplica sobre una suma en riesgo que encoge.
  const adqAnual = p.costoAnualObservado * (l.pctAdquisicion / 100)
  const tasaMort = (p.costoAnualObservado - adqAnual) / (f0 * riesgo0)

  let saldo = p.saldoUdi
  let seAgota: number | null = null
  let aportadoExtra = 0
  const filas: { anio: number; aporta: number; costo: number; saldo: number }[] = []

  for (let a = p.anioActual; a <= p.aniosTotal; a++) {
    const f = p.factores[a - 1] ?? p.factores[p.factores.length - 1]
    const enPago = a <= p.aniosPago
    const extra = enPago ? l.extraMensual * 12 : 0
    const aporta = (enPago ? p.primaAnualUdi : 0) + extra
    aportadoExtra += extra

    const cobra = enPago || l.costoTrasPagos
    const mort = cobra ? tasaMort * f * Math.max(0, p.sumaAseguradaUdi - saldo) : 0
    const adq = cobra && a <= l.aniosAdquisicion ? adqAnual : 0
    const costo = mort + adq

    saldo = Math.max(0, (saldo + aporta - costo) * (1 + r))
    if (saldo === 0 && seAgota === null) seAgota = a
    filas.push({ anio: a, aporta, costo, saldo })
  }

  // Cuando el saldo alcanza la suma asegurada, la suma en riesgo llega a cero
  // y aqui el costo de mortalidad desaparece. En la practica las polizas de
  // vida universal suben el beneficio por fallecimiento para mantener un
  // margen sobre el fondo, asi que el costo no se anula del todo. Con
  // aportaciones extra grandes el modelo se vuelve optimista por esto.
  const tocaTecho = filas.some(f => f.saldo >= p.sumaAseguradaUdi * 0.9)

  const alUltimoPago = filas.find(f => f.anio === p.aniosPago)?.saldo ?? 0
  return {
    tocaTecho,
    filas, seAgota, alUltimoPago, saldoFinal: saldo,
    aportadoTotal: p.primaAnualUdi * p.aniosPago + aportadoExtra,
    aportadoExtra,
  }
}

export function SimuladorPPR({ p }: { p: ParamsPPR }) {
  const [l, setL] = useState<Palancas>({
    rendimiento: 4.3,
    extraMensual: 0,
    pctAdquisicion: 70,
    aniosAdquisicion: 10,
    costoTrasPagos: false,
  })
  const set = (k: keyof Palancas, v: number | boolean) => setL({ ...l, [k]: v })

  const sim = simulaPPR(p, l)
  const sinExtra = simulaPPR(p, { ...l, extraMensual: 0 })
  const gananciaExtra = sim.saldoFinal - sinExtra.saldoFinal
  const costoExtra = sim.aportadoExtra

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-1">
        <Sliders size={17} className="accent" />
        <h2 className="text-strong font-semibold">Simulador del PPR</h2>
      </div>
      <p className="text-xs text-dim mb-4 max-w-2xl">
        Mueve los supuestos y mira qué pasa. Todo en UDI, que ya viene protegida de
        la inflación.
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Campo label="Rendimiento anual" sufijo="%" valor={l.rendimiento} paso={0.1}
               onChange={v => set('rendimiento', v)}
               ayuda="Tu póliza garantiza 1%. Tu estado de cuenta va en 4.3%." />
        <Campo label="Aportación extra" sufijo="UDI/mes" valor={l.extraMensual} paso={50}
               onChange={v => set('extraMensual', v)}
               ayuda={`1 UDI ≈ ${mxn(p.udi)}. Se suma a la prima planeada.`} />
        <Campo label="Del cargo, es adquisición" sufijo="%" valor={l.pctAdquisicion} paso={5}
               onChange={v => set('pctAdquisicion', Math.min(100, Math.max(0, v)))}
               ayuda="La comisión amortizada. Se extingue; no crece con la edad." />
        <Campo label="Adquisición corre hasta el año" valor={l.aniosAdquisicion} paso={1}
               onChange={v => set('aniosAdquisicion', v)}
               ayuda="Después de ese año solo queda el costo de mortalidad." />
      </div>

      <label className="flex items-center gap-2 text-sm text-body mb-5 cursor-pointer">
        <input type="checkbox" checked={l.costoTrasPagos}
               onChange={e => set('costoTrasPagos', e.target.checked)} />
        Seguir descontando el costo del seguro después del pago {p.aniosPago}
        <span className="text-xs text-dim">(sin confirmar con la aseguradora)</span>
      </label>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Tile k={`Al pago ${p.aniosPago}`} v={udiFmt(sim.alUltimoPago)} sub={mxn(sim.alUltimoPago * p.udi)} />
        <Tile k="A los 65" tono={sim.seAgota ? 'bad' : 'ok'}
              v={sim.seAgota ? `se agota año ${sim.seAgota}` : udiFmt(sim.saldoFinal)}
              sub={sim.seAgota ? 'con estos supuestos' : mxn(sim.saldoFinal * p.udi)} />
        <Tile k="Habrás aportado" v={udiFmt(sim.aportadoTotal)} sub={mxn(sim.aportadoTotal * p.udi)} tono="warn" />
        <Tile k="Saldo ÷ aportado"
              v={sim.aportadoTotal ? `${(sim.saldoFinal / sim.aportadoTotal).toFixed(2)}×` : '—'}
              sub="cuánto recuperas por cada UDI" />
      </div>

      {sim.tocaTecho && (
        <div className="rounded-lg p-3 mb-4 flex items-start gap-2" style={{ background: 'var(--yellow-soft)' }}>
          <TrendingUp size={14} style={{ color: 'var(--yellow)' }} className="flex-shrink-0 mt-0.5" />
          <p className="text-xs" style={{ color: 'var(--yellow)' }}>
            Con estos supuestos el fondo se acerca a la suma asegurada
            ({udiFmt(p.sumaAseguradaUdi)}) y el modelo deja de cobrar mortalidad. En la
            práctica la aseguradora sube el beneficio por fallecimiento para mantener un
            margen, así que el costo no se anula. <strong>Aquí la cifra queda optimista.</strong>
          </p>
        </div>
      )}

      {l.extraMensual > 0 && (
        <div className="rounded-lg p-3 mb-4" style={{ background: 'var(--accent-soft)' }}>
          <p className="text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--accent)' }}>
            Qué compra tu aportación extra
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            <Par k="Aportas de más" v={udiFmt(costoExtra)} />
            <Par k="Recibes de más a los 65" v={udiFmt(gananciaExtra)} />
            <Par k="Por cada UDI extra"
                 v={costoExtra > 0 ? `${(gananciaExtra / costoExtra).toFixed(2)} UDI` : '—'} />
          </div>
          <p className="text-xs text-dim mt-2">
            Rinde más de lo que aportas no solo por el interés: al crecer el fondo baja la
            suma en riesgo, y con ella el costo del seguro. Cada UDI extra trabaja dos veces.
          </p>
        </div>
      )}

      <div className="scroll-x">
        <table className="w-full text-xs" style={{ minWidth: 460 }}>
          <thead>
            <tr className="text-dim">
              <th className="text-left font-medium pb-2">Año</th>
              <th className="text-right font-medium pb-2">Aportas</th>
              <th className="text-right font-medium pb-2">Costo</th>
              <th className="text-right font-medium pb-2">Saldo</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {sim.filas.filter(f => f.anio <= p.aniosPago + 1 || f.anio % 5 === 0 || f.anio === p.aniosTotal)
              .map(f => (
              <tr key={f.anio} style={{ borderTop: '1px solid var(--border)' }}>
                <td className="py-1.5 text-body">{f.anio}</td>
                <td className="py-1.5 text-right text-dim">{f.aporta ? Math.round(f.aporta).toLocaleString('es-MX') : '—'}</td>
                <td className="py-1.5 text-right text-dim">{Math.round(f.costo).toLocaleString('es-MX')}</td>
                <td className="py-1.5 text-right text-strong">{Math.round(f.saldo).toLocaleString('es-MX')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// INFONAVIT
// ─────────────────────────────────────────────────────────────────────────

export interface ParamsInfonavit {
  credito: number
  tasaAnual: number
  retencion: number
  patron: number
  fpp: number
  mesesOriginal: number
}

function amortiza(p: ParamsInfonavit, extraMensual: number) {
  const r = p.tasaAnual / 100 / 12
  const pago = p.retencion + p.patron - p.fpp + extraMensual
  let saldo = p.credito
  let interes = 0
  let mes = 0
  const maxMeses = 600
  while (saldo > 0.5 && mes < maxMeses) {
    const i = saldo * r
    const capital = pago - i
    if (capital <= 0) return { meses: Infinity, interes: Infinity, pagado: Infinity }
    saldo -= capital
    interes += i
    mes++
  }
  return { meses: mes, interes, pagado: pago * mes }
}

export function SimuladorInfonavit({ p }: { p: ParamsInfonavit }) {
  const [extra, setExtra] = useState(0)
  const base = amortiza(p, 0)
  const con = amortiza(p, extra)
  const mesesAhorrados = base.meses - con.meses
  const interesAhorrado = base.interes - con.interes
  const extraTotal = extra * con.meses

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-1">
        <Home size={17} className="accent" />
        <h2 className="text-strong font-semibold">Simulador de INFONAVIT</h2>
      </div>
      <p className="text-xs text-dim mb-4 max-w-2xl">
        Cada peso que abonas a capital deja de generar intereses el resto del plazo.
        A {p.tasaAnual}% anual, ese peso te ahorra más de lo que rendiría en el banco.
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Campo label="Abono extra a capital" sufijo="$/mes" valor={extra} paso={500}
               onChange={v => setExtra(Math.max(0, v))}
               ayuda="Aparte de tu retención de nómina." />
        <Tile k="Plazo" v={`${con.meses} meses`}
              sub={mesesAhorrados > 0 ? `${mesesAhorrados} menos (${(mesesAhorrados / 12).toFixed(1)} años)` : `${(con.meses / 12).toFixed(1)} años`}
              tono={mesesAhorrados > 0 ? 'ok' : undefined} />
        <Tile k="Intereses totales" v={mxn(con.interes)}
              sub={interesAhorrado > 0 ? `${mxn(interesAhorrado)} menos` : 'sin abono extra'}
              tono={interesAhorrado > 0 ? 'ok' : 'warn'} />
        <Tile k="Pagarías en total" v={mxn(con.pagado)}
              sub={`${(con.pagado / p.credito).toFixed(2)}× lo prestado`} />
      </div>

      {extra > 0 && (
        <div className="rounded-lg p-3" style={{ background: 'var(--green-soft)' }}>
          <p className="text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--green)' }}>
            Qué compra tu abono
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            <Par k="Abonarás de más" v={mxn(extraTotal)} />
            <Par k="Ahorras en intereses" v={mxn(interesAhorrado)} />
            <Par k="Por cada peso abonado"
                 v={extraTotal > 0 ? `${(interesAhorrado / extraTotal).toFixed(2)} de ahorro` : '—'} />
          </div>
          <p className="text-xs text-dim mt-2">
            Compáralo con tu rendimiento real en el banco, que es 6.63% después de ISR e
            inflación. Abonar a una deuda del {p.tasaAnual}% es un rendimiento libre de
            impuestos y sin riesgo.
          </p>
        </div>
      )}
    </div>
  )
}

// ─── piezas compartidas ──────────────────────────────────────────────────

function Campo({ label, valor, onChange, sufijo, paso = 1, ayuda }: {
  label: string; valor: number; onChange: (v: number) => void
  sufijo?: string; paso?: number; ayuda?: string
}) {
  return (
    <div>
      <label className="text-xs text-muted block mb-1.5">
        {label}{sufijo ? ` (${sufijo})` : ''}
      </label>
      <input className="input font-mono" type="number" value={valor} step={paso}
             onChange={e => onChange(num(e.target.value))} />
      {ayuda && <p className="text-xs text-dim mt-1 leading-snug">{ayuda}</p>}
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

function Par({ k, v }: { k: string; v: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-dim">{k}</dt>
      <dd className="font-mono mt-0.5 text-strong">{v}</dd>
    </div>
  )
}
