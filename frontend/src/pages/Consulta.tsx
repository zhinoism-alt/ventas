import { useEffect, useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
} from 'recharts'
import { Search, Loader2, PiggyBank, Target, AlertTriangle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { fmt } from '../lib/utils'
import { TOOLTIP_STYLE } from '../lib/constants'
import {
  consultar, TEMAS, MESES_CORTOS,
  type MesDato, type Fondo, type Meta, type Resultado,
} from '../lib/consulta'

/* ═══════════════════════════════════════════════════════════════════════════
   Consulta cruzada.

   Escribes un tema y cruza los meses de presupuesto leídos de la hoja con los
   fondos y las metas. Contesta lo que un total anual esconde: en cuántos meses
   de verdad pasó, cuándo dejó de pasar, y cuánto pesa contra lo que ganas.

   Sin modelo de lenguaje. Buscar "gimnasio" en nueve meses saca que se pagó una
   sola vez y nunca más — eso lo encuentra una consulta, no un modelo. La capa
   de lenguaje, si llega, va encima de esto.
   ═══════════════════════════════════════════════════════════════════════════ */

export default function Consulta() {
  const [meses, setMeses] = useState<MesDato[]>([])
  const [fondos, setFondos] = useState<Fondo[]>([])
  const [metas, setMetas] = useState<Meta[]>([])
  const [extra, setExtra] = useState<{ anio: number; mes: number; monto: number }[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [termino, setTermino] = useState('')
  const [buscado, setBuscado] = useState('')

  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const [m, f, a, i] = await Promise.all([
          supabase.from('presupuesto_meses').select('anio,mes,datos').order('anio').order('mes'),
          supabase.from('fondos_ahorro').select('id,nombre,saldo,rendimiento,descripcion').eq('activo', true),
          supabase.from('ahorros').select('id,nombre,meta,acumulado,descripcion').eq('activo', true),
          supabase.from('presupuesto_ingresos').select('anio,mes,monto,periodicidad,recurrente').eq('activo', true),
        ])
        if (!vivo) return
        const fallo = m.error ?? f.error ?? a.error ?? i.error
        if (fallo) setError(fallo.message)
        setMeses((m.data ?? []) as MesDato[])
        setFondos((f.data ?? []) as Fondo[])
        setMetas((a.data ?? []) as Meta[])

        // Los ingresos capturados a mano se mensualizan igual que en Presupuesto:
        // lo semanal por 52/12, no por 4.
        const factor: Record<string, number> = { semanal: 52 / 12, quincenal: 2, mensual: 1 }
        const filas: { anio: number; mes: number; monto: number }[] = []
        for (const mes of (m.data ?? []) as MesDato[]) {
          const suma = (i.data ?? [])
            .filter((x: Record<string, unknown>) => {
              const cuando = Number(x.anio) * 100 + Number(x.mes)
              const objetivo = mes.anio * 100 + mes.mes
              return x.recurrente ? cuando <= objetivo : cuando === objetivo
            })
            .reduce((s: number, x: Record<string, unknown>) =>
              s + Number(x.monto) * (factor[String(x.periodicidad)] ?? 1), 0)
          filas.push({ anio: mes.anio, mes: mes.mes, monto: suma })
        }
        setExtra(filas)
      } catch (e) {
        if (vivo) setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (vivo) setCargando(false)
      }
    })()
    return () => { vivo = false }
  }, [])

  const r: Resultado | null = useMemo(
    () => buscado.trim() ? consultar(buscado, meses, fondos, metas, extra) : null,
    [buscado, meses, fondos, metas, extra],
  )

  const grafica = useMemo(() => {
    if (!r) return []
    return meses.map(m => ({
      mes: MESES_CORTOS[m.mes - 1],
      gasto: Math.round(r.porMes.find(p => p.anio === m.anio && p.mes === m.mes)?.monto ?? 0),
    }))
  }, [r, meses])

  if (cargando) return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <Loader2 size={26} className="animate-spin accent" />
        <p className="text-dim text-sm">Cargando tus datos…</p>
      </div>
    </div>
  )

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-strong">Consulta</h1>
        <p className="text-muted text-sm mt-0.5">
          Cruza un tema contra tus {meses.length} meses de presupuesto, tus fondos y tus metas
        </p>
      </div>

      {error && (
        <div className="card flex items-start gap-3 py-3"
             style={{ borderColor: 'var(--red)', background: 'var(--red-soft)' }}>
          <AlertTriangle size={16} style={{ color: 'var(--red)' }} className="mt-0.5 flex-shrink-0" />
          <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>
        </div>
      )}

      <div className="card">
        <div className="flex gap-2 flex-wrap">
          <div className="flex-1 relative" style={{ minWidth: 220 }}>
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-dim" />
            <input className="input" style={{ paddingLeft: '2.1rem' }}
              placeholder="gym, viajes, camioneta…"
              value={termino}
              onChange={e => setTermino(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && setBuscado(termino)} />
          </div>
          <button className="btn-primary" onClick={() => setBuscado(termino)}>
            <Search size={14} /> Buscar
          </button>
        </div>

        <div className="flex gap-1.5 flex-wrap mt-3">
          {TEMAS.map(t => (
            <button key={t.id} className="btn-secondary text-xs"
              onClick={() => { setTermino(t.id); setBuscado(t.id) }}>
              {t.icono} {t.nombre}
            </button>
          ))}
        </div>
      </div>

      {r && (r.renglones.length ? (
        <>
          <div className="card">
            <p className="text-sm text-body">{r.lectura}</p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Tile k="Total del periodo" v={fmt(r.total)} sub={`${r.mesesTotales} meses leídos`} />
            <Tile k="Meses en que pasó" v={`${r.mesesActivos} de ${r.mesesTotales}`}
                  sub={r.ultimoMes ? `último: ${MESES_CORTOS[r.ultimoMes.mes - 1]}` : ''}
                  tono={r.mesesActivos <= 2 ? 'warn' : undefined} />
            <Tile k="Cuando lo pagas" v={fmt(r.promedioActivo)}
                  sub="promedio de los meses activos" />
            <Tile k="De tu ingreso" v={`${r.pctIngreso.toFixed(1)}%`}
                  sub={`sobre ${fmt(r.ingresoPeriodo)}`} />
          </div>

          <div className="card">
            <h2 className="text-strong font-semibold mb-3">Mes a mes</h2>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={grafica}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="mes" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false}
                       tickFormatter={v => v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => fmt(v)} />
                <Bar dataKey="gasto" fill="var(--accent)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <p className="text-xs text-dim mt-2">
              Las barras en cero son meses en los que no aparece nada de este tema.
            </p>
          </div>

          <div className="card">
            <h2 className="text-strong font-semibold mb-3">
              Los {r.renglones.length} renglones que encontré
            </h2>
            <div className="scroll-x">
              <table className="w-full text-sm" style={{ minWidth: 420 }}>
                <thead>
                  <tr className="text-dim text-xs">
                    <th className="text-left font-medium pb-2">Mes</th>
                    <th className="text-left font-medium pb-2">Concepto</th>
                    <th className="text-left font-medium pb-2">Dónde</th>
                    <th className="text-right font-medium pb-2">Monto</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {r.renglones.map((x, i) => (
                    <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                      <td className="py-2 text-dim">{MESES_CORTOS[x.mes - 1]}</td>
                      <td className="py-2 text-body font-sans">{x.concepto}</td>
                      <td className="py-2">
                        <span className={`badge ${x.categoria === 'necesario' ? 'badge-green'
                          : x.categoria === 'apartado' ? 'badge-blue' : 'badge-yellow'}`}>
                          {x.categoria}
                        </span>
                      </td>
                      <td className="py-2 text-right text-strong">{fmt(x.monto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {(!!r.fondos.length || !!r.metas.length) && (
            <div className="card">
              <h2 className="text-strong font-semibold mb-3">Lo que tienes apartado para esto</h2>
              <div className="space-y-2">
                {r.fondos.map(f => (
                  <div key={`f${f.id}`} className="flex items-center justify-between gap-3 p-3 rounded-xl"
                       style={{ background: 'var(--surface-2)' }}>
                    <span className="text-sm text-body flex items-center gap-2">
                      <PiggyBank size={14} className="accent" /> {f.nombre}
                    </span>
                    <span className="font-mono text-strong">{fmt(f.saldo)}</span>
                  </div>
                ))}
                {r.metas.map(m => (
                  <div key={`m${m.id}`} className="flex items-center justify-between gap-3 p-3 rounded-xl"
                       style={{ background: 'var(--surface-2)' }}>
                    <span className="text-sm text-body flex items-center gap-2">
                      <Target size={14} className="accent" /> {m.nombre}
                    </span>
                    <span className="font-mono text-strong">
                      {fmt(m.acumulado)} <span className="text-dim">de {fmt(m.meta)}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="card text-center py-10">
          <Search size={34} className="mx-auto text-faint mb-3" />
          <p className="text-strong font-medium">
            «{r.termino}» no aparece en tus {r.mesesTotales} meses
          </p>
          <p className="text-sm text-muted mt-1 max-w-md mx-auto">
            Busco en los conceptos tal como los escribes en tu hoja. Prueba con
            una palabra que uses ahí, o pica uno de los temas de arriba.
          </p>
        </div>
      ))}
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
