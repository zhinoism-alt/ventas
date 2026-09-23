import { useEffect, useMemo, useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { TrendingUp, TrendingDown, Wallet, Trash2, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { fmt } from '../lib/utils'
import { TOOLTIP_STYLE } from '../lib/constants'

/* ═══════════════════════════════════════════════════════════════════════════
   Movimientos: reemplazo de FetPocket, capturado directo en VentasPro.

   FetPocket registraba cada gasto e ingreso del dia a dia (comida, parqueo,
   regalos, nomina) en una base ajena. Esto es lo mismo pero en la base de
   Brandon: cada movimiento es una fila, sin categorizacion por IA por
   ahora -- un select con las categorias que ya se ven en su historial y
   "Otra" para lo que no encaje. Se puede afinar despues; hoy gana tener el
   dato capturado.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Movimiento {
  id: number
  tipo: 'ingreso' | 'gasto'
  monto: number
  categoria: string
  descripcion: string
  fecha: string
  registrado_por: string | null
  created_at: string
}

const CATEGORIAS_GASTO = [
  'Comida rápida', 'Súper', 'Transporte', 'Servicios', 'Salud',
  'Entretenimiento', 'Regalos', 'Ropa', 'Casa', 'Otro',
]
const CATEGORIAS_INGRESO = ['Nómina', 'Venta', 'Extra', 'Reembolso', 'Otro']

const COLORS = ['var(--accent)', 'var(--red)', 'var(--yellow)', 'var(--cyan)', 'var(--green)', '#a78bfa', '#f472b6', '#fb923c', '#38bdf8', '#94a3b8']

function hoyISO() { return new Date().toISOString().slice(0, 10) }
function mesActual() { const d = new Date(); return { anio: d.getFullYear(), mes: d.getMonth() + 1 } }

function FormMovimiento({ tipo, onGuardado, onCerrar }: { tipo: 'ingreso' | 'gasto'; onGuardado: () => void; onCerrar: () => void }) {
  const { usuario } = useAuth()
  const categorias = tipo === 'gasto' ? CATEGORIAS_GASTO : CATEGORIAS_INGRESO
  const [monto, setMonto] = useState('')
  const [categoria, setCategoria] = useState(categorias[0])
  const [descripcion, setDescripcion] = useState('')
  const [fecha, setFecha] = useState(hoyISO())
  const [guardando, setGuardando] = useState(false)

  const guardar = async () => {
    const m = Number(monto)
    if (!m || m <= 0) return
    setGuardando(true)
    await supabase.from('movimientos').insert({
      tipo, monto: m, categoria, descripcion, fecha,
      registrado_por: usuario?.nombre ?? null,
    })
    setGuardando(false)
    onGuardado()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4"
         onClick={onCerrar}>
      <div className="card w-full sm:max-w-sm rounded-b-none sm:rounded-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <p className="text-strong font-semibold flex items-center gap-2">
            {tipo === 'gasto'
              ? <><TrendingDown size={16} style={{ color: 'var(--red)' }} /> Nuevo gasto</>
              : <><TrendingUp size={16} style={{ color: 'var(--green)' }} /> Nuevo ingreso</>}
          </p>
          <button onClick={onCerrar} className="text-dim"><X size={18} /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted mb-1 block">Monto</label>
            <input type="number" inputMode="decimal" autoFocus value={monto}
              onChange={e => setMonto(e.target.value)} placeholder="0.00"
              className="input w-full text-lg" />
          </div>
          <div>
            <label className="text-xs text-muted mb-1 block">Categoría</label>
            <select value={categoria} onChange={e => setCategoria(e.target.value)} className="input w-full">
              {categorias.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted mb-1 block">Descripción (opcional)</label>
            <input value={descripcion} onChange={e => setDescripcion(e.target.value)}
              placeholder={tipo === 'gasto' ? 'Ej: Pizza' : 'Ej: Pago de nómina'} className="input w-full" />
          </div>
          <div>
            <label className="text-xs text-muted mb-1 block">Fecha</label>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="input w-full" />
          </div>
          <button onClick={guardar} disabled={guardando || !monto}
            className="w-full py-2.5 rounded-lg text-sm font-medium text-white mt-2 disabled:opacity-50"
            style={{ background: tipo === 'gasto' ? 'var(--red)' : 'var(--green)' }}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Movimientos() {
  const [movs, setMovs]           = useState<Movimiento[]>([])
  const [cargando, setCargando]   = useState(true)
  const [formTipo, setFormTipo]   = useState<'ingreso' | 'gasto' | null>(null)
  const { anio, mes } = mesActual()

  const cargar = async () => {
    const { data } = await supabase.from('movimientos').select('*')
      .order('fecha', { ascending: false }).order('created_at', { ascending: false })
      .limit(500)
    setMovs((data ?? []) as Movimiento[])
    setCargando(false)
  }
  useEffect(() => { cargar() }, [])

  const delMov = async (id: number) => {
    setMovs(m => m.filter(x => x.id !== id)) // optimista
    await supabase.from('movimientos').delete().eq('id', id)
  }

  const delMes = useMemo(() => movs.filter(m => {
    const [y, mo] = m.fecha.split('-').map(Number)
    return y === anio && mo === mes
  }), [movs, anio, mes])

  const totalIngresos = delMes.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0)
  const totalGastos   = delMes.filter(m => m.tipo === 'gasto').reduce((s, m) => s + m.monto, 0)
  const balance       = totalIngresos - totalGastos

  const gastosPorCategoria = useMemo(() => {
    const mapa = new Map<string, number>()
    delMes.filter(m => m.tipo === 'gasto').forEach(m => mapa.set(m.categoria, (mapa.get(m.categoria) ?? 0) + m.monto))
    return Array.from(mapa, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  }, [delMes])

  // Agrupados por fecha para la lista, mas facil de leer que una tabla plana.
  const porFecha = useMemo(() => {
    const mapa = new Map<string, Movimiento[]>()
    movs.slice(0, 100).forEach(m => {
      if (!mapa.has(m.fecha)) mapa.set(m.fecha, [])
      mapa.get(m.fecha)!.push(m)
    })
    return Array.from(mapa.entries())
  }, [movs])

  if (cargando) return <div className="card"><p className="text-xs text-dim">Cargando…</p></div>

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="px-1 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-strong flex items-center gap-2">
            <Wallet className="text-green-400" size={22} /> Movimientos
          </h1>
          <p className="text-muted text-sm mt-0.5">Tus ingresos y gastos del día a día, capturados aquí en vez de en FetPocket.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => setFormTipo('gasto')}
          className="py-4 rounded-xl text-white font-medium flex flex-col items-center gap-1.5"
          style={{ background: 'var(--red)' }}>
          <TrendingDown size={20} /> Registrar gasto
        </button>
        <button onClick={() => setFormTipo('ingreso')}
          className="py-4 rounded-xl text-white font-medium flex flex-col items-center gap-1.5"
          style={{ background: 'var(--green)' }}>
          <TrendingUp size={20} /> Registrar ingreso
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="card py-3 px-3">
          <p className="text-xs text-muted mb-1">Ingresos (mes)</p>
          <p className="text-base font-bold" style={{ color: 'var(--green)' }}>{fmt(totalIngresos)}</p>
        </div>
        <div className="card py-3 px-3">
          <p className="text-xs text-muted mb-1">Gastos (mes)</p>
          <p className="text-base font-bold" style={{ color: 'var(--red)' }}>{fmt(totalGastos)}</p>
        </div>
        <div className="card py-3 px-3">
          <p className="text-xs text-muted mb-1">Balance</p>
          <p className="text-base font-bold" style={{ color: balance >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(balance)}</p>
        </div>
      </div>

      {gastosPorCategoria.length > 0 && (
        <div className="card">
          <p className="text-strong font-semibold text-sm mb-2">Gastos por categoría (mes)</p>
          <div className="flex items-center gap-4 flex-wrap">
            <div style={{ width: 140, height: 140 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={gastosPorCategoria} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={35} outerRadius={60}>
                    {gastosPorCategoria.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => fmt(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 min-w-[160px] space-y-1">
              {gastosPorCategoria.map((c, i) => (
                <div key={c.name} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-body">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                    {c.name}
                  </span>
                  <span className="text-muted font-medium">{fmt(c.value)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <p className="text-strong font-semibold text-sm mb-3">Recientes</p>
        {porFecha.length === 0 ? (
          <p className="text-xs text-dim text-center py-6">Sin movimientos todavía.</p>
        ) : (
          <div className="space-y-4">
            {porFecha.map(([fecha, items]) => (
              <div key={fecha}>
                <p className="text-xs text-dim mb-1.5">{new Date(fecha + 'T00:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'short' })}</p>
                <div className="space-y-1">
                  {items.map(m => (
                    <div key={m.id} className="flex items-center justify-between gap-2 py-1.5 px-2 rounded-lg" style={{ background: 'var(--bg)' }}>
                      <div className="min-w-0">
                        <p className="text-body text-sm truncate">{m.descripcion || m.categoria}</p>
                        <p className="text-xs text-dim">{m.categoria}{m.registrado_por ? ` · ${m.registrado_por}` : ''}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-sm font-medium" style={{ color: m.tipo === 'gasto' ? 'var(--red)' : 'var(--green)' }}>
                          {m.tipo === 'gasto' ? '-' : '+'}{fmt(m.monto)}
                        </span>
                        <button onClick={() => delMov(m.id)} className="text-dim hover:text-red-400">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {formTipo && (
        <FormMovimiento tipo={formTipo} onCerrar={() => setFormTipo(null)}
          onGuardado={() => { setFormTipo(null); cargar() }} />
      )}
    </div>
  )
}
