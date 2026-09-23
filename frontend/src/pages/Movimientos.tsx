import { useEffect, useMemo, useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { TrendingUp, TrendingDown, Wallet, Trash2, X, ChevronLeft, ChevronRight, HandCoins, Check } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { fmt } from '../lib/utils'
import { TOOLTIP_STYLE } from '../lib/constants'
import { periodoConOffset } from '../lib/periodoFinanciero'

/* ═══════════════════════════════════════════════════════════════════════════
   Movimientos: reemplazo de FetPocket, capturado directo en VentasPro.

   FetPocket solo sabia "entro/salio X". Lo que de verdad hace falta es de
   donde sale el dinero y de quien es -- no todo vive en un solo lugar:
   lo de ventas/IPTV se va a Fondo de Inversion, a veces sacan de Fondo de
   Emergencia y lo reponen despues con tarjeta (un prestamo de ellos a
   ellos mismos), y un gasto puede ser de Brandon, de Itzel o compartido.

   fondo_id es solo etiqueta para reportear -- Brandon decidio explicitamente
   que NO debe tocar el saldo real en Ahorros, para no repetir el bug de
   doble conteo que ya tuvimos entre Patrimonio y Fondos.

   El "mes" no es el mes de calendario: cierran cuentas el ultimo jueves de
   cada mes (ver lib/periodoFinanciero.ts), que es cuando cae el ultimo pago.
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
  fondo_id: number | null
  persona: 'brandon' | 'itzel' | 'compartido'
  es_prestamo: boolean
  prestamo_pagado: boolean
}

interface FondoLite { id: number; nombre: string; descripcion: string | null; color: string }

const CATEGORIAS_GASTO = [
  'Comida rápida', 'Súper', 'Transporte', 'Servicios', 'Salud',
  'Entretenimiento', 'Regalos', 'Ropa', 'Casa', 'Otro',
]
const CATEGORIAS_INGRESO = ['Nómina', 'Venta', 'Extra', 'Reembolso', 'Otro']
const PERSONAS = [
  { valor: 'compartido', label: 'Compartido' },
  { valor: 'brandon',    label: 'Brandon' },
  { valor: 'itzel',      label: 'Itzel' },
] as const

const COLORS = ['var(--accent)', 'var(--red)', 'var(--yellow)', 'var(--cyan)', 'var(--green)', '#a78bfa', '#f472b6', '#fb923c', '#38bdf8', '#94a3b8']

function hoyISO() { return new Date().toISOString().slice(0, 10) }

function FormMovimiento({ tipo, fondos, onGuardado, onCerrar }: {
  tipo: 'ingreso' | 'gasto'; fondos: FondoLite[]; onGuardado: () => void; onCerrar: () => void
}) {
  const { usuario } = useAuth()
  const categorias = tipo === 'gasto' ? CATEGORIAS_GASTO : CATEGORIAS_INGRESO
  const [monto, setMonto]           = useState('')
  const [categoria, setCategoria]   = useState(categorias[0])
  const [descripcion, setDescripcion] = useState('')
  const [fecha, setFecha]           = useState(hoyISO())
  const [persona, setPersona]       = useState<'brandon' | 'itzel' | 'compartido'>('compartido')
  const [fondoId, setFondoId]       = useState('')
  const [esPrestamo, setEsPrestamo] = useState(false)
  const [guardando, setGuardando]   = useState(false)

  const guardar = async () => {
    const m = Number(monto)
    if (!m || m <= 0) return
    setGuardando(true)
    await supabase.from('movimientos').insert({
      tipo, monto: m, categoria, descripcion, fecha,
      registrado_por: usuario?.nombre ?? null,
      persona,
      fondo_id: fondoId ? Number(fondoId) : null,
      es_prestamo: tipo === 'gasto' ? esPrestamo : false,
    })
    setGuardando(false)
    onGuardado()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4"
         onClick={onCerrar}>
      <div className="card w-full sm:max-w-sm rounded-b-none sm:rounded-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
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
          <div>
            <label className="text-xs text-muted mb-1 block">¿De quién es?</label>
            <div className="grid grid-cols-3 gap-1.5">
              {PERSONAS.map(p => (
                <button key={p.valor} type="button" onClick={() => setPersona(p.valor)}
                  className="py-1.5 rounded-lg text-xs font-medium transition-colors"
                  style={persona === p.valor
                    ? { background: 'var(--accent)', color: '#fff' }
                    : { background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-muted mb-1 block">
              {tipo === 'gasto' ? '¿De qué fondo sale? (opcional)' : '¿A qué fondo entra? (opcional)'}
            </label>
            <select value={fondoId} onChange={e => setFondoId(e.target.value)} className="input w-full">
              <option value="">Sin fondo específico</option>
              {fondos.map(f => <option key={f.id} value={f.id}>{f.nombre}{f.descripcion ? ` · ${f.descripcion}` : ''}</option>)}
            </select>
            <p className="text-xs text-dim mt-1">Solo para reportear — no cambia el saldo del fondo en Ahorros.</p>
          </div>
          {tipo === 'gasto' && (
            <label className="flex items-center gap-2 text-xs text-body cursor-pointer">
              <input type="checkbox" checked={esPrestamo} onChange={e => setEsPrestamo(e.target.checked)} />
              Es préstamo — lo voy a reponer después (ej. con tarjeta de crédito)
            </label>
          )}
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
  const [movs, setMovs]         = useState<Movimiento[]>([])
  const [fondos, setFondos]     = useState<FondoLite[]>([])
  const [cargando, setCargando] = useState(true)
  const [formTipo, setFormTipo] = useState<'ingreso' | 'gasto' | null>(null)
  const [offset, setOffset]     = useState(0)

  const periodo = useMemo(() => periodoConOffset(offset), [offset])

  const cargar = async () => {
    const [{ data: m }, { data: f }] = await Promise.all([
      supabase.from('movimientos').select('*')
        .order('fecha', { ascending: false }).order('created_at', { ascending: false }).limit(1000),
      supabase.from('fondos_ahorro').select('id,nombre,descripcion,color').eq('activo', true),
    ])
    setMovs((m ?? []) as Movimiento[])
    setFondos((f ?? []) as FondoLite[])
    setCargando(false)
  }
  useEffect(() => { cargar() }, [])

  const delMov = async (id: number) => {
    setMovs(m => m.filter(x => x.id !== id)) // optimista
    await supabase.from('movimientos').delete().eq('id', id)
  }

  const marcarRepuesto = async (id: number) => {
    setMovs(ms => ms.map(m => m.id === id ? { ...m, prestamo_pagado: true } : m)) // optimista
    await supabase.from('movimientos').update({ prestamo_pagado: true }).eq('id', id)
  }

  const delPeriodo = useMemo(() =>
    movs.filter(m => m.fecha >= periodo.inicioISO && m.fecha <= periodo.cierreISO),
    [movs, periodo])

  const totalIngresos = delPeriodo.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0)
  const totalGastos   = delPeriodo.filter(m => m.tipo === 'gasto').reduce((s, m) => s + m.monto, 0)
  const balance        = totalIngresos - totalGastos

  const gastosPorCategoria = useMemo(() => {
    const mapa = new Map<string, number>()
    delPeriodo.filter(m => m.tipo === 'gasto').forEach(m => mapa.set(m.categoria, (mapa.get(m.categoria) ?? 0) + m.monto))
    return Array.from(mapa, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  }, [delPeriodo])

  const porPersona = useMemo(() => PERSONAS.map(p => {
    const items = delPeriodo.filter(m => m.persona === p.valor)
    const ingresos = items.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0)
    const gastos   = items.filter(m => m.tipo === 'gasto').reduce((s, m) => s + m.monto, 0)
    return { ...p, ingresos, gastos, neto: ingresos - gastos }
  }).filter(p => p.ingresos > 0 || p.gastos > 0), [delPeriodo])

  const porFondo = useMemo(() => {
    const mapa = new Map<number, { nombre: string; ingresos: number; gastos: number }>()
    delPeriodo.filter(m => m.fondo_id != null).forEach(m => {
      const f = fondos.find(x => x.id === m.fondo_id)
      const nombre = f?.nombre ?? `Fondo #${m.fondo_id}`
      const actual = mapa.get(m.fondo_id!) ?? { nombre, ingresos: 0, gastos: 0 }
      if (m.tipo === 'ingreso') actual.ingresos += m.monto; else actual.gastos += m.monto
      mapa.set(m.fondo_id!, actual)
    })
    return Array.from(mapa.values())
  }, [delPeriodo, fondos])

  const prestamosPendientes = useMemo(() =>
    movs.filter(m => m.es_prestamo && !m.prestamo_pagado)
      .sort((a, b) => b.fecha.localeCompare(a.fecha)),
    [movs])

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

      {/* ── Reporte del periodo (jueves a jueves) ── */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => setOffset(o => o + 1)} className="text-dim hover:text-strong p-1">
            <ChevronLeft size={18} />
          </button>
          <div className="text-center">
            <p className="text-strong font-semibold text-sm">{periodo.etiqueta}</p>
            <p className="text-xs text-dim">
              {periodo.inicio.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })} — {periodo.cierre.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
            </p>
          </div>
          <button onClick={() => setOffset(o => Math.max(0, o - 1))} disabled={offset === 0}
            className="text-dim hover:text-strong p-1 disabled:opacity-30">
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl p-4" style={{ background: 'var(--green)' }}>
            <p className="text-xs text-white/80 mb-1">Ingresos</p>
            <p className="text-xl font-bold text-white">{fmt(totalIngresos)}</p>
          </div>
          <div className="rounded-xl p-4" style={{ background: 'var(--red)' }}>
            <p className="text-xs text-white/80 mb-1">Gastos</p>
            <p className="text-xl font-bold text-white">{fmt(totalGastos)}</p>
          </div>
        </div>
        <div className="flex items-center justify-between mt-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
          <span className="text-sm text-muted">Balance del periodo</span>
          <span className="text-lg font-bold" style={{ color: balance >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(balance)}</span>
        </div>
      </div>

      {prestamosPendientes.length > 0 && (
        <div className="card" style={{ borderLeft: '3px solid var(--yellow)' }}>
          <p className="text-strong font-semibold text-sm mb-2 flex items-center gap-1.5">
            <HandCoins size={15} style={{ color: 'var(--yellow)' }} /> Préstamos pendientes de reponer ({prestamosPendientes.length})
          </p>
          <div className="space-y-1">
            {prestamosPendientes.map(m => (
              <div key={m.id} className="flex items-center justify-between gap-2 py-1.5 px-2 rounded-lg" style={{ background: 'var(--bg)' }}>
                <div className="min-w-0">
                  <p className="text-body text-sm truncate">{m.descripcion || m.categoria}</p>
                  <p className="text-xs text-dim">{fmt(m.monto)} · {PERSONAS.find(p => p.valor === m.persona)?.label} · {m.fecha}</p>
                </div>
                <button onClick={() => marcarRepuesto(m.id)}
                  className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-white"
                  style={{ background: 'var(--green)' }}>
                  <Check size={12} /> Repuesto
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {porPersona.length > 0 && (
        <div className="card">
          <p className="text-strong font-semibold text-sm mb-2">Por persona (periodo)</p>
          <div className="space-y-2">
            {porPersona.map(p => (
              <div key={p.valor} className="flex items-center justify-between text-sm">
                <span className="text-body">{p.label}</span>
                <span className="text-xs text-dim">
                  <span style={{ color: 'var(--green)' }}>+{fmt(p.ingresos)}</span>
                  {' · '}
                  <span style={{ color: 'var(--red)' }}>−{fmt(p.gastos)}</span>
                  {' · '}
                  <span className="font-medium" style={{ color: p.neto >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(p.neto)}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {porFondo.length > 0 && (
        <div className="card">
          <p className="text-strong font-semibold text-sm mb-2">Por fondo de origen (periodo)</p>
          <div className="space-y-2">
            {porFondo.map(f => (
              <div key={f.nombre} className="flex items-center justify-between text-sm">
                <span className="text-body">{f.nombre}</span>
                <span className="text-xs text-dim">
                  {f.ingresos > 0 && <span style={{ color: 'var(--green)' }}>+{fmt(f.ingresos)} </span>}
                  {f.gastos > 0 && <span style={{ color: 'var(--red)' }}>−{fmt(f.gastos)}</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {gastosPorCategoria.length > 0 && (
        <div className="card">
          <p className="text-strong font-semibold text-sm mb-2">Gastos por categoría (periodo)</p>
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
        <p className="text-strong font-semibold text-sm mb-3">Historial</p>
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
                        <p className="text-xs text-dim">
                          {m.categoria} · {PERSONAS.find(p => p.valor === m.persona)?.label}
                          {m.es_prestamo ? (m.prestamo_pagado ? ' · préstamo repuesto' : ' · préstamo pendiente') : ''}
                          {m.registrado_por ? ` · ${m.registrado_por}` : ''}
                        </p>
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
        <FormMovimiento tipo={formTipo} fondos={fondos} onCerrar={() => setFormTipo(null)}
          onGuardado={() => { setFormTipo(null); cargar() }} />
      )}
    </div>
  )
}
