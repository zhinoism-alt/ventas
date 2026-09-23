import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import {
  TrendingUp, TrendingDown, Wallet, Trash2, Pencil, X, ChevronLeft, ChevronRight,
  HandCoins, Check, Search, CalendarRange,
} from 'lucide-react'
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
  'Entretenimiento', 'Regalos', 'Ropa', 'Casa', 'Seguros', 'Otro',
]
const CATEGORIAS_INGRESO = ['Nómina', 'Venta', 'Extra', 'Reembolso', 'Otro']
const PERSONAS = [
  { valor: 'compartido', label: 'Compartido', emoji: '🤝', color: 'var(--yellow)' },
  { valor: 'brandon',    label: 'Brandon',    emoji: '🧔', color: 'var(--accent)' },
  { valor: 'itzel',      label: 'Itzel',      emoji: '👩', color: '#f472b6' },
] as const

// Paletas separadas: verdes/frios para lo que entra, calidos para lo que
// sale. Ayuda a distinguir los dos pastels de un vistazo sin leer el titulo.
const INGRESO_COLORS = ['var(--green)', '#38bdf8', 'var(--cyan)', 'var(--accent)', '#4ade80', '#22d3ee']
const GASTO_COLORS   = ['var(--red)', '#fb923c', 'var(--yellow)', '#f472b6', '#a78bfa', '#94a3b8', '#f87171', '#fbbf24']

// Un emoji fijo por categoria, como el icono que FetPocket le pone a cada
// gasto -- da referencia visual de un vistazo sin tener que leer el texto.
const CATEGORIA_EMOJI: Record<string, string> = {
  'Comida rápida': '🍔', 'Súper': '🛒', 'Transporte': '🚗', 'Servicios': '💡',
  'Salud': '🏥', 'Entretenimiento': '🎬', 'Regalos': '🎁', 'Ropa': '👕',
  'Casa': '🏠', 'Seguros': '📄', 'Nómina': '💼', 'Venta': '📈',
  'Extra': '➕', 'Reembolso': '🔄', 'Otro': '💸',
}

// Adivina la categoria a partir de lo que Brandon escribe en "que es" --
// nada de IA, solo palabras clave. Empezar sencillo: cubre lo que ya
// aparece en su historial de FetPocket, y siempre queda editable.
const PISTAS_CATEGORIA: [string, string][] = [
  ['pizza', 'Comida rápida'], ['subway', 'Comida rápida'], ['tacos', 'Comida rápida'],
  ['burger', 'Comida rápida'], ['mcdonalds', 'Comida rápida'], ['kfc', 'Comida rápida'],
  ['restaurante', 'Comida rápida'], ['comida', 'Comida rápida'], ['tostadas', 'Comida rápida'],
  ['soriana', 'Súper'], ['walmart', 'Súper'], ['costco', 'Súper'], ['supermercado', 'Súper'],
  ['gasolina', 'Transporte'], ['uber', 'Transporte'], ['didi', 'Transporte'], ['taxi', 'Transporte'],
  ['parqu', 'Transporte'], ['estacionamiento', 'Transporte'],
  ['luz', 'Servicios'], ['agua', 'Servicios'], ['internet', 'Servicios'], ['telcel', 'Servicios'],
  ['netflix', 'Entretenimiento'], ['spotify', 'Entretenimiento'], ['cine', 'Entretenimiento'], ['boleto', 'Entretenimiento'],
  ['farmacia', 'Salud'], ['doctor', 'Salud'], ['medico', 'Salud'], ['dentista', 'Salud'], ['hospital', 'Salud'],
  ['regalo', 'Regalos'], ['boda', 'Regalos'], ['cumpleaños', 'Regalos'],
  ['ropa', 'Ropa'], ['zapatos', 'Ropa'],
  ['renta', 'Casa'], ['mantenimiento', 'Casa'],
  ['seguro', 'Seguros'], ['aseguranza', 'Seguros'], ['poliza', 'Seguros'],
  ['nomina', 'Nómina'], ['sueldo', 'Nómina'], ['salario', 'Nómina'],
  ['venta', 'Venta'], ['iptv', 'Venta'],
]

function sugerirCategoria(descripcion: string, categorias: string[]): string | null {
  const d = descripcion.toLowerCase()
  for (const [pista, cat] of PISTAS_CATEGORIA) {
    if (d.includes(pista) && categorias.includes(cat)) return cat
  }
  return null
}

function hoyISO() { return new Date().toISOString().slice(0, 10) }

// Sin acentos y sin mayusculas para que "categoria" encuentre "categoría" y
// "Súper" se encuentre buscando "super". String.normalize('NFD') separa la
// letra de su acento (a + ´) y el regex se queda solo con la letra.
function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function primerDiaDelMes(d: Date): string {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}
function ultimoDiaDelMes(d: Date): string {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10)
}

function FormMovimiento({ tipo, fondos, editando, onGuardado, onCerrar }: {
  tipo: 'ingreso' | 'gasto'; fondos: FondoLite[]; editando?: Movimiento; onGuardado: () => void; onCerrar: () => void
}) {
  const { usuario } = useAuth()
  const categorias = tipo === 'gasto' ? CATEGORIAS_GASTO : CATEGORIAS_INGRESO
  const [descripcion, setDescripcion] = useState(editando?.descripcion ?? '')
  const [monto, setMonto]           = useState(editando ? String(editando.monto) : '')
  const [categoria, setCategoria]   = useState(editando?.categoria ?? categorias[0])
  // Mientras el usuario no toque el select a mano, cada letra que escribe en
  // "que es" puede seguir moviendo la categoria sugerida. En cuanto la elige
  // el mismo, se respeta lo que puso -- nunca se le pisa una eleccion propia.
  const [categoriaTocada, setCategoriaTocada] = useState(!!editando)
  const [fecha, setFecha]           = useState(editando?.fecha ?? hoyISO())
  const [persona, setPersona]       = useState<'brandon' | 'itzel' | 'compartido'>(editando?.persona ?? 'compartido')
  const [fondoId, setFondoId]       = useState(editando?.fondo_id ? String(editando.fondo_id) : '')
  const [esPrestamo, setEsPrestamo] = useState(editando?.es_prestamo ?? false)
  const [guardando, setGuardando]   = useState(false)

  const cambiarDescripcion = (v: string) => {
    setDescripcion(v)
    if (!categoriaTocada) {
      const sugerida = sugerirCategoria(v, categorias)
      if (sugerida) setCategoria(sugerida)
    }
  }

  const guardar = async () => {
    const m = Number(monto)
    if (!m || m <= 0) return
    setGuardando(true)
    const payload = {
      tipo, monto: m, categoria, descripcion, fecha, persona,
      fondo_id: fondoId ? Number(fondoId) : null,
      es_prestamo: tipo === 'gasto' ? esPrestamo : false,
    }
    if (editando) {
      await supabase.from('movimientos').update(payload).eq('id', editando.id)
    } else {
      await supabase.from('movimientos').insert({ ...payload, registrado_por: usuario?.nombre ?? null })
    }
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
              ? <><TrendingDown size={16} style={{ color: 'var(--red)' }} /> {editando ? 'Editar gasto' : 'Nuevo gasto'}</>
              : <><TrendingUp size={16} style={{ color: 'var(--green)' }} /> {editando ? 'Editar ingreso' : 'Nuevo ingreso'}</>}
          </p>
          <button onClick={onCerrar} className="text-dim"><X size={18} /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted mb-1 block">¿De qué es?</label>
            <input autoFocus value={descripcion} onChange={e => cambiarDescripcion(e.target.value)}
              placeholder={tipo === 'gasto' ? 'Ej: Pizza, gasolina, Subway…' : 'Ej: Pago de nómina, venta…'}
              className="input w-full" />
          </div>
          <div>
            <label className="text-xs text-muted mb-1 block">Monto</label>
            <input type="number" inputMode="decimal" value={monto}
              onChange={e => setMonto(e.target.value)} placeholder="0.00"
              className="input w-full text-lg" />
          </div>
          <div>
            <label className="text-xs text-muted mb-1 block flex items-center justify-between">
              <span>Categoría</span>
              {!categoriaTocada && descripcion && <span className="text-dim normal-case font-normal">sugerida automáticamente</span>}
            </label>
            <select value={categoria} onChange={e => { setCategoria(e.target.value); setCategoriaTocada(true) }} className="input w-full">
              {categorias.map(c => <option key={c} value={c}>{CATEGORIA_EMOJI[c] ?? ''} {c}</option>)}
            </select>
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

// Fila de historial estilo FetPocket: avatar circular con el emoji,
// pastilla de categoria, descripcion, y a la derecha el monto con los
// botones de editar/borrar siempre visibles (no hace falta pasar el mouse
// para saber que existen).
function FilaMovimiento({ m, onEditar, onBorrar, destacar }: {
  m: Movimiento; onEditar: () => void; onBorrar: () => void; destacar?: ReactNode
}) {
  return (
    <div className="group flex items-center gap-3 p-2.5 rounded-xl transition-colors hover:brightness-110"
      style={{ background: 'var(--bg)' }}>
      <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg flex-shrink-0"
        style={{ background: 'var(--surface-2)' }}>
        {CATEGORIA_EMOJI[m.categoria] ?? '💸'}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
            style={{ background: 'var(--surface-2)', color: 'var(--text-strong)' }}>
            {m.categoria}
          </span>
          <span className="text-xs text-dim">{PERSONAS.find(p => p.valor === m.persona)?.emoji} {PERSONAS.find(p => p.valor === m.persona)?.label}</span>
        </div>
        <p className="text-body text-sm font-medium truncate mt-1">{m.descripcion || m.categoria}</p>
        {destacar}
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <span className="text-base font-bold" style={{ color: m.tipo === 'gasto' ? 'var(--red)' : 'var(--green)' }}>
          {m.tipo === 'gasto' ? '-' : '+'}{fmt(m.monto)}
        </span>
        <div className="flex items-center gap-1">
          <button onClick={onEditar}
            className="p-1.5 rounded-lg text-dim hover:text-indigo-400 transition-colors" style={{ background: 'var(--surface-2)' }}>
            <Pencil size={13} />
          </button>
          <button onClick={onBorrar}
            className="p-1.5 rounded-lg text-dim hover:text-red-400 transition-colors" style={{ background: 'var(--surface-2)' }}>
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  )
}

function TarjetaCategorias({ titulo, datos, colores }: { titulo: string; datos: { name: string; value: number }[]; colores: string[] }) {
  return (
    <div className="card">
      <p className="text-strong font-semibold text-sm mb-2">{titulo}</p>
      <div className="flex items-center gap-4 flex-wrap">
        <div style={{ width: 130, height: 130 }} className="flex-shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={datos} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={32} outerRadius={58} paddingAngle={2}>
                {datos.map((_, i) => <Cell key={i} fill={colores[i % colores.length]} />)}
              </Pie>
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => fmt(v)} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex-1 min-w-[140px] space-y-1.5">
          {datos.map((c, i) => (
            <div key={c.name} className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-body">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: colores[i % colores.length] }} />
                {CATEGORIA_EMOJI[c.name] ?? ''} {c.name}
              </span>
              <span className="text-muted font-medium">{fmt(c.value)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function Movimientos() {
  const [movs, setMovs]         = useState<Movimiento[]>([])
  const [fondos, setFondos]     = useState<FondoLite[]>([])
  const [cargando, setCargando] = useState(true)
  const [formAbierto, setFormAbierto] = useState<{ tipo: 'ingreso' | 'gasto'; editando?: Movimiento } | null>(null)
  const [offset, setOffset]     = useState(0)
  const [busqueda, setBusqueda] = useState('')
  const [filtroDesde, setFiltroDesde] = useState('')
  const [filtroHasta, setFiltroHasta] = useState('')

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

  const agruparPorCategoria = (tipo: 'ingreso' | 'gasto') => {
    const mapa = new Map<string, number>()
    delPeriodo.filter(m => m.tipo === tipo).forEach(m => mapa.set(m.categoria, (mapa.get(m.categoria) ?? 0) + m.monto))
    return Array.from(mapa, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  }
  const gastosPorCategoria   = useMemo(() => agruparPorCategoria('gasto'), [delPeriodo])
  const ingresosPorCategoria = useMemo(() => agruparPorCategoria('ingreso'), [delPeriodo])

  const porPersona = useMemo(() => PERSONAS.map(p => {
    const items = delPeriodo.filter(m => m.persona === p.valor)
    const ingresos = items.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0)
    const gastos   = items.filter(m => m.tipo === 'gasto').reduce((s, m) => s + m.monto, 0)
    return { ...p, ingresos, gastos, neto: ingresos - gastos }
  }).filter(p => p.ingresos > 0 || p.gastos > 0), [delPeriodo])

  const porFondo = useMemo(() => {
    const mapa = new Map<number, { nombre: string; color: string; ingresos: number; gastos: number }>()
    delPeriodo.filter(m => m.fondo_id != null).forEach(m => {
      const f = fondos.find(x => x.id === m.fondo_id)
      const actual = mapa.get(m.fondo_id!) ?? { nombre: f?.nombre ?? `Fondo #${m.fondo_id}`, color: f?.color || 'var(--accent)', ingresos: 0, gastos: 0 }
      if (m.tipo === 'ingreso') actual.ingresos += m.monto; else actual.gastos += m.monto
      mapa.set(m.fondo_id!, actual)
    })
    return Array.from(mapa.values())
  }, [delPeriodo, fondos])

  const prestamosPendientes = useMemo(() =>
    movs.filter(m => m.es_prestamo && !m.prestamo_pagado)
      .sort((a, b) => b.fecha.localeCompare(a.fecha)),
    [movs])

  // El buscador de Historial es independiente del Reporte del periodo de
  // arriba (jueves a jueves): busca sobre TODOS los movimientos, no solo los
  // del periodo mostrado, para que "buscar gasolina" encuentre uno de hace
  // dos meses aunque el reporte de arriba este viendo el periodo actual.
  const hayFiltroActivo = !!busqueda.trim() || !!filtroDesde || !!filtroHasta

  const historialFiltrado = useMemo(() => {
    let lista = movs
    if (filtroDesde) lista = lista.filter(m => m.fecha >= filtroDesde)
    if (filtroHasta) lista = lista.filter(m => m.fecha <= filtroHasta)
    const q = busqueda.trim()
    if (q) {
      const qNorm = normalizar(q)
      lista = lista.filter(m =>
        normalizar(m.descripcion).includes(qNorm) ||
        normalizar(m.categoria).includes(qNorm) ||
        String(m.monto).includes(q))
    }
    return lista
  }, [movs, busqueda, filtroDesde, filtroHasta])

  const resumenFiltrado = useMemo(() => {
    const ingresos = historialFiltrado.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0)
    const gastos   = historialFiltrado.filter(m => m.tipo === 'gasto').reduce((s, m) => s + m.monto, 0)
    return { ingresos, gastos, balance: ingresos - gastos, cantidad: historialFiltrado.length }
  }, [historialFiltrado])

  // Agrupados por fecha para la lista, mas facil de leer que una tabla plana.
  const porFecha = useMemo(() => {
    const mapa = new Map<string, Movimiento[]>()
    historialFiltrado.slice(0, 300).forEach(m => {
      if (!mapa.has(m.fecha)) mapa.set(m.fecha, [])
      mapa.get(m.fecha)!.push(m)
    })
    return Array.from(mapa.entries())
  }, [historialFiltrado])

  const limpiarFiltros = () => { setBusqueda(''); setFiltroDesde(''); setFiltroHasta('') }
  const filtrarHoy = () => { const h = hoyISO(); setFiltroDesde(h); setFiltroHasta(h) }
  const filtrarEsteMes = () => { const hoy = new Date(); setFiltroDesde(primerDiaDelMes(hoy)); setFiltroHasta(ultimoDiaDelMes(hoy)) }
  const filtrarEstePeriodo = () => { setFiltroDesde(periodo.inicioISO); setFiltroHasta(periodo.cierreISO) }

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
        <button onClick={() => setFormAbierto({ tipo: 'gasto' })}
          className="py-4 rounded-xl text-white font-medium flex flex-col items-center gap-1.5 transition-transform hover:scale-[1.02]"
          style={{ background: 'linear-gradient(135deg, #ef4444, #b91c1c)', boxShadow: '0 4px 14px -4px rgba(239,68,68,.5)' }}>
          <TrendingDown size={20} /> Registrar gasto
        </button>
        <button onClick={() => setFormAbierto({ tipo: 'ingreso' })}
          className="py-4 rounded-xl text-white font-medium flex flex-col items-center gap-1.5 transition-transform hover:scale-[1.02]"
          style={{ background: 'linear-gradient(135deg, #22c55e, #15803d)', boxShadow: '0 4px 14px -4px rgba(34,197,94,.5)' }}>
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
          <div className="rounded-2xl p-4 relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg, #22c55e, #15803d)' }}>
            <TrendingUp size={54} className="absolute -right-2 -bottom-3 text-white/15" />
            <p className="text-xs text-white/80 mb-1 font-medium uppercase tracking-wide">Ingresos</p>
            <p className="text-2xl font-extrabold text-white">{fmt(totalIngresos)}</p>
          </div>
          <div className="rounded-2xl p-4 relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg, #ef4444, #b91c1c)' }}>
            <TrendingDown size={54} className="absolute -right-2 -bottom-3 text-white/15" />
            <p className="text-xs text-white/80 mb-1 font-medium uppercase tracking-wide">Gastos</p>
            <p className="text-2xl font-extrabold text-white">{fmt(totalGastos)}</p>
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
          <div className="space-y-1.5">
            {prestamosPendientes.map(m => (
              <div key={m.id} className="flex items-center gap-3 p-2.5 rounded-xl" style={{ background: 'var(--bg)' }}>
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-base flex-shrink-0" style={{ background: 'var(--surface-2)' }}>
                  {CATEGORIA_EMOJI[m.categoria] ?? '💸'}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-body text-sm font-medium truncate">{m.descripcion || m.categoria}</p>
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
          <p className="text-strong font-semibold text-sm mb-3">Por persona (periodo)</p>
          <div className="grid gap-2.5 sm:grid-cols-3">
            {porPersona.map(p => {
              const total = p.ingresos + p.gastos
              const pctIngreso = total > 0 ? (p.ingresos / total) * 100 : 0
              return (
                <div key={p.valor} className="rounded-xl p-3" style={{ background: 'var(--bg)' }}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0"
                      style={{ background: 'var(--surface-2)' }}>{p.emoji}</div>
                    <span className="text-sm font-semibold text-strong">{p.label}</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden flex mb-2" style={{ background: 'var(--surface-2)' }}>
                    <div style={{ width: `${pctIngreso}%`, background: 'var(--green)' }} />
                    <div style={{ width: `${100 - pctIngreso}%`, background: 'var(--red)' }} />
                  </div>
                  <div className="text-xs space-y-0.5">
                    <div className="flex justify-between"><span className="text-dim">Ingresos</span><span style={{ color: 'var(--green)' }} className="font-medium">+{fmt(p.ingresos)}</span></div>
                    <div className="flex justify-between"><span className="text-dim">Gastos</span><span style={{ color: 'var(--red)' }} className="font-medium">−{fmt(p.gastos)}</span></div>
                    <div className="flex justify-between pt-1" style={{ borderTop: '1px solid var(--border)' }}>
                      <span className="text-dim">Neto</span>
                      <span className="font-bold" style={{ color: p.neto >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(p.neto)}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {porFondo.length > 0 && (
        <div className="card">
          <p className="text-strong font-semibold text-sm mb-2">Por fondo de origen (periodo)</p>
          <div className="space-y-2">
            {porFondo.map(f => (
              <div key={f.nombre} className="flex items-center gap-2.5 p-2 rounded-lg" style={{ background: 'var(--bg)' }}>
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: f.color }} />
                <span className="text-body text-sm flex-1">{f.nombre}</span>
                <span className="text-xs">
                  {f.ingresos > 0 && <span style={{ color: 'var(--green)' }} className="font-medium">+{fmt(f.ingresos)} </span>}
                  {f.gastos > 0 && <span style={{ color: 'var(--red)' }} className="font-medium">−{fmt(f.gastos)}</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {(ingresosPorCategoria.length > 0 || gastosPorCategoria.length > 0) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {ingresosPorCategoria.length > 0 && (
            <TarjetaCategorias titulo="Ingresos por categoría (periodo)" datos={ingresosPorCategoria} colores={INGRESO_COLORS} />
          )}
          {gastosPorCategoria.length > 0 && (
            <TarjetaCategorias titulo="Gastos por categoría (periodo)" datos={gastosPorCategoria} colores={GASTO_COLORS} />
          )}
        </div>
      )}

      <div className="card">
        <p className="text-strong font-semibold text-sm mb-3">Historial</p>

        <div className="relative mb-2.5">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dim" />
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por concepto, categoría o monto…"
            className="input w-full pl-9" />
          {busqueda && (
            <button onClick={() => setBusqueda('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-dim hover:text-strong">
              <X size={14} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap mb-1">
          <CalendarRange size={13} className="text-dim flex-shrink-0" />
          <input type="date" value={filtroDesde} onChange={e => setFiltroDesde(e.target.value)}
            className="input text-xs py-1 px-2 w-[130px]" />
          <span className="text-xs text-dim">a</span>
          <input type="date" value={filtroHasta} onChange={e => setFiltroHasta(e.target.value)}
            className="input text-xs py-1 px-2 w-[130px]" />
          <button onClick={filtrarHoy} className="text-xs px-2 py-1 rounded-lg" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>Hoy</button>
          <button onClick={filtrarEsteMes} className="text-xs px-2 py-1 rounded-lg" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>Este mes</button>
          <button onClick={filtrarEstePeriodo} className="text-xs px-2 py-1 rounded-lg" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>Este periodo</button>
          {hayFiltroActivo && (
            <button onClick={limpiarFiltros} className="text-xs px-2 py-1 rounded-lg flex items-center gap-1"
              style={{ background: 'var(--red)', color: '#fff' }}>
              <X size={11} /> Limpiar
            </button>
          )}
        </div>
        <p className="text-xs text-dim mb-3">
          "Este mes" es mes de calendario y "Este periodo" es el jueves-a-jueves de arriba — este buscador es independiente y no cambia el Reporte del periodo.
        </p>

        {hayFiltroActivo && (
          <div className="rounded-xl p-3 mb-3 flex items-center justify-between flex-wrap gap-2" style={{ background: 'var(--surface-2)' }}>
            <span className="text-xs text-muted">{resumenFiltrado.cantidad} resultado{resumenFiltrado.cantidad !== 1 ? 's' : ''}</span>
            <span className="text-xs">
              <span style={{ color: 'var(--green)' }}>+{fmt(resumenFiltrado.ingresos)}</span>
              {' · '}
              <span style={{ color: 'var(--red)' }}>−{fmt(resumenFiltrado.gastos)}</span>
              {' · '}
              <span className="font-semibold" style={{ color: resumenFiltrado.balance >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(resumenFiltrado.balance)}</span>
            </span>
          </div>
        )}

        {porFecha.length === 0 ? (
          <p className="text-xs text-dim text-center py-6">
            {hayFiltroActivo ? 'Nada encontrado con ese filtro.' : 'Sin movimientos todavía.'}
          </p>
        ) : (
          <div className="space-y-4">
            {porFecha.map(([fecha, items]) => (
              <div key={fecha}>
                <p className="text-xs text-dim mb-1.5 font-medium uppercase tracking-wide">
                  {new Date(fecha + 'T00:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'short' })}
                </p>
                <div className="space-y-1.5">
                  {items.map(m => (
                    <FilaMovimiento key={m.id} m={m}
                      onEditar={() => setFormAbierto({ tipo: m.tipo, editando: m })}
                      onBorrar={() => delMov(m.id)}
                      destacar={m.es_prestamo
                        ? <p className="text-xs mt-0.5" style={{ color: 'var(--yellow)' }}>
                            🤝 {m.prestamo_pagado ? 'Préstamo repuesto' : 'Préstamo pendiente'}
                          </p>
                        : m.registrado_por
                          ? <p className="text-xs text-dim mt-0.5">{m.registrado_por}</p>
                          : undefined} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {formAbierto && (
        <FormMovimiento tipo={formAbierto.tipo} fondos={fondos} editando={formAbierto.editando}
          onCerrar={() => setFormAbierto(null)}
          onGuardado={() => { setFormAbierto(null); cargar() }} />
      )}
    </div>
  )
}
