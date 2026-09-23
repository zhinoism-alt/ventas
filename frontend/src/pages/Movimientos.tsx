import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
} from 'recharts'
import {
  TrendingUp, TrendingDown, Wallet, Trash2, Pencil, X, ChevronLeft, ChevronRight,
  HandCoins, Check, Search, CalendarRange, CreditCard, Repeat, Target, Archive, Plus, SlidersHorizontal,
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

type MetodoPago = 'credito_didi' | 'credito_rappi' | 'debito_edenred' | 'efectivo' | 'debito_nu'

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
  metodo_pago: MetodoPago | null
  recurrente_id: number | null
  monto_esperado: number | null
}

interface FondoLite { id: number; nombre: string; descripcion: string | null; color: string }

interface Recurrente {
  id: number
  descripcion: string
  tipo: 'ingreso' | 'gasto'
  categoria: string
  monto_esperado: number
  persona: 'brandon' | 'itzel' | 'compartido'
  fondo_id: number | null
  metodo_pago: MetodoPago | null
  activo: boolean
}

interface PresupuestoCategoria { id: number; categoria: string; limite: number; activo: boolean }

interface CierrePeriodo {
  id: number
  periodo_inicio: string
  periodo_cierre: string
  total_ingresos: number
  total_gastos: number
  balance: number
}

const METODOS_PAGO: { valor: MetodoPago; label: string; emoji: string }[] = [
  { valor: 'credito_didi',   label: 'Crédito Didi (Brandon)',      emoji: '💳' },
  { valor: 'credito_rappi',  label: 'Crédito Rappi (Itzel)',       emoji: '💳' },
  { valor: 'debito_edenred', label: 'Edenred (vale de despensa)',  emoji: '🥕' },
  { valor: 'efectivo',       label: 'Efectivo',                    emoji: '💵' },
  { valor: 'debito_nu',      label: 'Débito Nu (transferencia)',   emoji: '🏦' },
]
const METODO_LABEL: Record<string, string> = Object.fromEntries(METODOS_PAGO.map(m => [m.valor, m.label]))
const METODO_EMOJI: Record<string, string> = Object.fromEntries(METODOS_PAGO.map(m => [m.valor, m.emoji]))

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
  ['luz', 'Servicios'], ['agua', 'Servicios'], ['internet', 'Servicios'], ['telcel', 'Servicios'], ['celular', 'Servicios'],
  // 'gas' va despues de 'gasolina' a proposito: "gasolina" tiene que
  // encontrar Transporte primero, o "Gasolina" caeria aqui por error
  // (gasolina contiene "gas" como substring).
  ['gas', 'Servicios'],
  ['netflix', 'Entretenimiento'], ['spotify', 'Entretenimiento'], ['cine', 'Entretenimiento'], ['boleto', 'Entretenimiento'],
  ['farmacia', 'Salud'], ['doctor', 'Salud'], ['medico', 'Salud'], ['dentista', 'Salud'], ['hospital', 'Salud'],
  ['regalo', 'Regalos'], ['boda', 'Regalos'], ['cumpleaños', 'Regalos'], ['cumple', 'Regalos'], ['baby shower', 'Regalos'],
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

function FormMovimiento({ tipo, fondos, editando, recurrenteBase, onGuardado, onCerrar }: {
  tipo: 'ingreso' | 'gasto'; fondos: FondoLite[]; editando?: Movimiento; recurrenteBase?: Recurrente
  onGuardado: () => void; onCerrar: () => void
}) {
  const { usuario } = useAuth()
  const categorias = tipo === 'gasto' ? CATEGORIAS_GASTO : CATEGORIAS_INGRESO
  const [descripcion, setDescripcion] = useState(editando?.descripcion ?? recurrenteBase?.descripcion ?? '')
  const [monto, setMonto]           = useState(editando ? String(editando.monto) : recurrenteBase ? String(recurrenteBase.monto_esperado) : '')
  const [categoria, setCategoria]   = useState(editando?.categoria ?? recurrenteBase?.categoria ?? categorias[0])
  // Mientras el usuario no toque el select a mano, cada letra que escribe en
  // "que es" puede seguir moviendo la categoria sugerida. En cuanto la elige
  // el mismo, se respeta lo que puso -- nunca se le pisa una eleccion propia.
  const [categoriaTocada, setCategoriaTocada] = useState(!!editando || !!recurrenteBase)
  const [fecha, setFecha]           = useState(editando?.fecha ?? hoyISO())
  const [persona, setPersona]       = useState<'brandon' | 'itzel' | 'compartido'>(editando?.persona ?? recurrenteBase?.persona ?? 'compartido')
  const [fondoId, setFondoId]       = useState(editando?.fondo_id ? String(editando.fondo_id) : recurrenteBase?.fondo_id ? String(recurrenteBase.fondo_id) : '')
  const [metodoPago, setMetodoPago] = useState(editando?.metodo_pago ?? recurrenteBase?.metodo_pago ?? '')
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
      metodo_pago: metodoPago || null,
      es_prestamo: tipo === 'gasto' ? esPrestamo : false,
      // Si viene de una plantilla recurrente, guarda una instantanea del
      // estimado de ese momento -- si despues editan la plantilla, este
      // movimiento ya capturado no debe cambiar de opinion sobre cual era
      // el estimado de ese mes.
      recurrente_id: editando ? editando.recurrente_id : (recurrenteBase?.id ?? null),
      monto_esperado: editando ? editando.monto_esperado : (recurrenteBase?.monto_esperado ?? null),
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
              ? <><TrendingDown size={16} style={{ color: 'var(--red)' }} /> {editando ? 'Editar gasto' : recurrenteBase ? `Registrar: ${recurrenteBase.descripcion}` : 'Nuevo gasto'}</>
              : <><TrendingUp size={16} style={{ color: 'var(--green)' }} /> {editando ? 'Editar ingreso' : recurrenteBase ? `Registrar: ${recurrenteBase.descripcion}` : 'Nuevo ingreso'}</>}
          </p>
          <button onClick={onCerrar} className="text-dim"><X size={18} /></button>
        </div>
        {recurrenteBase && (
          <p className="text-xs mb-3 px-2.5 py-1.5 rounded-lg" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
            Estimado: {fmt(recurrenteBase.monto_esperado)} — ajusta el monto si este mes cambió (luz, gas…).
          </p>
        )}

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
          <div>
            <label className="text-xs text-muted mb-1 block">¿Con qué pagaste? (opcional)</label>
            <select value={metodoPago} onChange={e => setMetodoPago(e.target.value as MetodoPago | '')} className="input w-full">
              <option value="">Sin especificar</option>
              {METODOS_PAGO.map(m => <option key={m.valor} value={m.valor}>{m.emoji} {m.label}</option>)}
            </select>
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
          {m.metodo_pago && (
            <span className="text-xs text-dim">{METODO_EMOJI[m.metodo_pago]} {METODO_LABEL[m.metodo_pago]}</span>
          )}
        </div>
        <p className="text-body text-sm font-medium truncate mt-1">{m.descripcion || m.categoria}</p>
        {m.monto_esperado != null && m.monto_esperado !== m.monto && (
          <p className="text-xs mt-0.5" style={{ color: m.monto > m.monto_esperado ? 'var(--red)' : 'var(--green)' }}>
            {m.monto > m.monto_esperado ? '↑' : '↓'} {fmt(Math.abs(m.monto - m.monto_esperado))} {m.monto > m.monto_esperado ? 'sobre' : 'bajo'} lo esperado ({fmt(m.monto_esperado)})
          </p>
        )}
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

// Alta/edicion de una plantilla recurrente. Sin fecha ni prestamo -- eso
// vive en el movimiento real cuando lo registran, no en la plantilla.
function FormRecurrente({ fondos, editando, onGuardado, onCerrar }: {
  fondos: FondoLite[]; editando?: Recurrente; onGuardado: () => void; onCerrar: () => void
}) {
  const [tipo, setTipo]             = useState<'ingreso' | 'gasto'>(editando?.tipo ?? 'gasto')
  const categorias = tipo === 'gasto' ? CATEGORIAS_GASTO : CATEGORIAS_INGRESO
  const [descripcion, setDescripcion] = useState(editando?.descripcion ?? '')
  const [montoEsperado, setMontoEsperado] = useState(editando ? String(editando.monto_esperado) : '')
  const [categoria, setCategoria]   = useState(editando?.categoria ?? categorias[0])
  const [persona, setPersona]       = useState<'brandon' | 'itzel' | 'compartido'>(editando?.persona ?? 'compartido')
  const [fondoId, setFondoId]       = useState(editando?.fondo_id ? String(editando.fondo_id) : '')
  const [metodoPago, setMetodoPago] = useState(editando?.metodo_pago ?? '')
  const [guardando, setGuardando]   = useState(false)

  const guardar = async () => {
    const m = Number(montoEsperado)
    if (!descripcion.trim() || !m || m <= 0) return
    setGuardando(true)
    const payload = {
      descripcion, tipo, categoria, monto_esperado: m, persona,
      fondo_id: fondoId ? Number(fondoId) : null,
      metodo_pago: metodoPago || null,
    }
    if (editando) await supabase.from('movimientos_recurrentes').update(payload).eq('id', editando.id)
    else await supabase.from('movimientos_recurrentes').insert(payload)
    setGuardando(false)
    onGuardado()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4" onClick={onCerrar}>
      <div className="card w-full sm:max-w-sm rounded-b-none sm:rounded-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <p className="text-strong font-semibold flex items-center gap-2"><Repeat size={16} /> {editando ? 'Editar recurrente' : 'Nuevo recurrente'}</p>
          <button onClick={onCerrar} className="text-dim"><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted mb-1 block">Tipo</label>
            <div className="grid grid-cols-2 gap-1.5">
              <button type="button" onClick={() => { setTipo('gasto'); setCategoria(CATEGORIAS_GASTO[0]) }}
                className="py-1.5 rounded-lg text-xs font-medium" style={tipo === 'gasto' ? { background: 'var(--red)', color: '#fff' } : { background: 'var(--surface-2)', color: 'var(--text-muted)' }}>Gasto</button>
              <button type="button" onClick={() => { setTipo('ingreso'); setCategoria(CATEGORIAS_INGRESO[0]) }}
                className="py-1.5 rounded-lg text-xs font-medium" style={tipo === 'ingreso' ? { background: 'var(--green)', color: '#fff' } : { background: 'var(--surface-2)', color: 'var(--text-muted)' }}>Ingreso</button>
            </div>
          </div>
          <div>
            <label className="text-xs text-muted mb-1 block">Descripción</label>
            <input autoFocus value={descripcion} onChange={e => setDescripcion(e.target.value)}
              placeholder="Ej: Gas, Luz, Renta, Internet…" className="input w-full" />
          </div>
          <div>
            <label className="text-xs text-muted mb-1 block">Monto estimado</label>
            <input type="number" inputMode="decimal" value={montoEsperado}
              onChange={e => setMontoEsperado(e.target.value)} placeholder="0.00" className="input w-full text-lg" />
            <p className="text-xs text-dim mt-1">Lo ajustas cada vez que registres — esto es solo el punto de partida.</p>
          </div>
          <div>
            <label className="text-xs text-muted mb-1 block">Categoría</label>
            <select value={categoria} onChange={e => setCategoria(e.target.value)} className="input w-full">
              {categorias.map(c => <option key={c} value={c}>{CATEGORIA_EMOJI[c] ?? ''} {c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted mb-1 block">¿De quién es?</label>
            <div className="grid grid-cols-3 gap-1.5">
              {PERSONAS.map(p => (
                <button key={p.valor} type="button" onClick={() => setPersona(p.valor)}
                  className="py-1.5 rounded-lg text-xs font-medium transition-colors"
                  style={persona === p.valor ? { background: 'var(--accent)', color: '#fff' } : { background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-muted mb-1 block">Fondo (opcional)</label>
            <select value={fondoId} onChange={e => setFondoId(e.target.value)} className="input w-full">
              <option value="">Sin fondo específico</option>
              {fondos.map(f => <option key={f.id} value={f.id}>{f.nombre}{f.descripcion ? ` · ${f.descripcion}` : ''}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted mb-1 block">Método de pago (opcional)</label>
            <select value={metodoPago} onChange={e => setMetodoPago(e.target.value as MetodoPago | '')} className="input w-full">
              <option value="">Sin especificar</option>
              {METODOS_PAGO.map(m => <option key={m.valor} value={m.valor}>{m.emoji} {m.label}</option>)}
            </select>
          </div>
          <button onClick={guardar} disabled={guardando || !descripcion.trim() || !montoEsperado}
            className="w-full py-2.5 rounded-lg text-sm font-medium text-white mt-2 disabled:opacity-50"
            style={{ background: 'var(--accent)' }}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Editar todos los limites de presupuesto por categoria de una sola vez --
// mas rapido que abrir un modal por categoria. 0 o vacio = sin limite.
function FormPresupuestos({ presupuestos, onGuardado, onCerrar }: {
  presupuestos: PresupuestoCategoria[]; onGuardado: () => void; onCerrar: () => void
}) {
  const [valores, setValores] = useState<Record<string, string>>(() => {
    const inicial: Record<string, string> = {}
    CATEGORIAS_GASTO.forEach(c => {
      const existente = presupuestos.find(p => p.categoria === c)
      inicial[c] = existente ? String(existente.limite) : ''
    })
    return inicial
  })
  const [guardando, setGuardando] = useState(false)
  const [sugiriendo, setSugiriendo] = useState(false)
  const [sugerencia, setSugerencia] = useState<{ fuente: string; omitidos: string[] } | null>(null)

  // Combinacion que Brandon pidio: el Presupuesto (Google Sheet) sigue
  // siendo la fuente para lo estructural (PPR, seguros de vida, viajes) --
  // eso ya lo modelan bien ahi con quincenas y % teorico vs real. Esto solo
  // jala lo que SI es gasto variable del dia a dia (gasolina, luz, comida...)
  // usando el mismo diccionario de palabras clave que ya adivina categorias
  // al capturar un movimiento. Lo que no mapea (PPR, Vida Mujer, viajes) se
  // queda fuera a proposito -- forzarlo a una categoria seria enganoso.
  const sugerirDesdePresupuesto = async () => {
    setSugiriendo(true)
    const { data } = await supabase.from('presupuesto_meses')
      .select('anio,mes,datos')
      .order('anio', { ascending: false }).order('mes', { ascending: false })
      .limit(1).maybeSingle()
    setSugiriendo(false)
    if (!data) { setSugerencia({ fuente: '', omitidos: [] }); return }

    const items = [...(data.datos?.necesarios ?? []), ...(data.datos?.noNecesarios ?? [])] as { concepto: string; monto: number }[]
    const sumas: Record<string, number> = {}
    const omitidos: string[] = []
    items.forEach(it => {
      const cat = sugerirCategoria(it.concepto ?? '', CATEGORIAS_GASTO)
      if (cat) sumas[cat] = (sumas[cat] ?? 0) + Number(it.monto ?? 0)
      else if (it.concepto) omitidos.push(it.concepto)
    })
    setValores(v => {
      const nuevo = { ...v }
      Object.entries(sumas).forEach(([cat, monto]) => { nuevo[cat] = String(Math.round(monto * 100) / 100) })
      return nuevo
    })
    const fuente = new Date(data.anio, data.mes - 1, 1).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })
    setSugerencia({ fuente, omitidos })
  }

  const guardar = async () => {
    setGuardando(true)
    const filas = CATEGORIAS_GASTO
      .map(c => ({ categoria: c, limite: Number(valores[c]) }))
      .filter(f => f.limite > 0)
    // Borra los que quedaron en 0/vacio y sube el resto -- mas simple que
    // reconciliar altas/bajas una por una.
    await supabase.from('movimientos_presupuestos').delete().neq('id', 0)
    if (filas.length) await supabase.from('movimientos_presupuestos').insert(filas)
    setGuardando(false)
    onGuardado()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4" onClick={onCerrar}>
      <div className="card w-full sm:max-w-sm rounded-b-none sm:rounded-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <p className="text-strong font-semibold flex items-center gap-2"><Target size={16} /> Presupuesto por categoría</p>
          <button onClick={onCerrar} className="text-dim"><X size={18} /></button>
        </div>
        <p className="text-xs text-dim mb-3">Cuánto quieren gastar como máximo por categoría cada periodo. Déjalo vacío para no ponerle límite.</p>

        <button onClick={sugerirDesdePresupuesto} disabled={sugiriendo}
          className="w-full mb-3 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 disabled:opacity-50"
          style={{ background: 'var(--surface-2)', color: 'var(--text-body)', border: '1px solid var(--border-hi)' }}>
          ✨ {sugiriendo ? 'Buscando…' : 'Sugerir desde mi Presupuesto'}
        </button>
        {sugerencia && (
          <div className="rounded-lg p-2.5 mb-3 text-xs" style={{ background: 'var(--surface-2)' }}>
            {sugerencia.fuente ? (
              <>
                <p className="text-body">Sugerido desde tu Presupuesto de <span className="font-medium">{sugerencia.fuente}</span>. Ajusta si hace falta y guarda.</p>
                {sugerencia.omitidos.length > 0 && (
                  <p className="text-dim mt-1">No se ubicaron automáticamente: {sugerencia.omitidos.join(', ')} — esos siguen viviendo solo en tu Presupuesto, no son gasto variable del día a día.</p>
                )}
              </>
            ) : (
              <p className="text-dim">No encontramos ningún mes sincronizado en tu Presupuesto todavía.</p>
            )}
          </div>
        )}

        <div className="space-y-2">
          {CATEGORIAS_GASTO.map(c => (
            <div key={c} className="flex items-center gap-2">
              <span className="text-sm text-body flex-1">{CATEGORIA_EMOJI[c]} {c}</span>
              <input type="number" inputMode="decimal" value={valores[c]}
                onChange={e => setValores(v => ({ ...v, [c]: e.target.value }))}
                placeholder="Sin límite" className="input w-28 text-right" />
            </div>
          ))}
        </div>
        <button onClick={guardar} disabled={guardando}
          className="w-full py-2.5 rounded-lg text-sm font-medium text-white mt-4 disabled:opacity-50"
          style={{ background: 'var(--accent)' }}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}

function BarraPresupuesto({ categoria, gastado, limite }: { categoria: string; gastado: number; limite: number }) {
  const pct = limite > 0 ? Math.min(100, (gastado / limite) * 100) : 0
  const excedido = gastado > limite
  const color = excedido ? 'var(--red)' : pct >= 80 ? 'var(--yellow)' : 'var(--green)'
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-body">{CATEGORIA_EMOJI[categoria] ?? ''} {categoria}</span>
        <span className={excedido ? 'font-semibold' : 'text-muted'} style={excedido ? { color: 'var(--red)' } : undefined}>
          {fmt(gastado)} / {fmt(limite)}{excedido ? ` (+${fmt(gastado - limite)})` : ''}
        </span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

// Ultimos 6 periodos, mas viejo a mas nuevo, para responder "vamos mejor o
// peor que antes" en vez de solo ver la foto de este periodo.
function GraficaTendencia({ movs }: { movs: Movimiento[] }) {
  const datos = useMemo(() => {
    const filas = []
    for (let offset = 5; offset >= 0; offset--) {
      const p = periodoConOffset(offset)
      const delP = movs.filter(m => m.fecha >= p.inicioISO && m.fecha <= p.cierreISO)
      const ingresos = delP.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0)
      const gastos   = delP.filter(m => m.tipo === 'gasto').reduce((s, m) => s + m.monto, 0)
      filas.push({ name: p.cierre.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }), Ingresos: ingresos, Gastos: gastos })
    }
    return filas
  }, [movs])

  if (datos.every(d => d.Ingresos === 0 && d.Gastos === 0)) return null

  return (
    <div className="card">
      <p className="text-strong font-semibold text-sm mb-3">Tendencia — últimos 6 periodos</p>
      <div style={{ width: '100%', height: 220 }}>
        <ResponsiveContainer>
          <BarChart data={datos} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-dim)' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--text-dim)' }} axisLine={false} tickLine={false}
              tickFormatter={v => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`} />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => fmt(v)} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="Ingresos" fill="var(--green)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Gastos" fill="var(--red)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export default function Movimientos() {
  const [movs, setMovs]         = useState<Movimiento[]>([])
  const [fondos, setFondos]     = useState<FondoLite[]>([])
  const [recurrentes, setRecurrentes] = useState<Recurrente[]>([])
  const [presupuestos, setPresupuestos] = useState<PresupuestoCategoria[]>([])
  const [cierres, setCierres]   = useState<CierrePeriodo[]>([])
  const [cargando, setCargando] = useState(true)
  const [formAbierto, setFormAbierto] = useState<{ tipo: 'ingreso' | 'gasto'; editando?: Movimiento; recurrenteBase?: Recurrente } | null>(null)
  const [formRecurrenteAbierto, setFormRecurrenteAbierto] = useState<{ editando?: Recurrente } | null>(null)
  const [formPresupuestosAbierto, setFormPresupuestosAbierto] = useState(false)
  const [offset, setOffset]     = useState(0)
  const [busqueda, setBusqueda] = useState('')
  const [filtroDesde, setFiltroDesde] = useState('')
  const [filtroHasta, setFiltroHasta] = useState('')
  const [mostrarRango, setMostrarRango] = useState(false)

  const periodo = useMemo(() => periodoConOffset(offset), [offset])

  const cargar = async () => {
    const [{ data: m }, { data: f }, { data: r }, { data: p }, { data: c }] = await Promise.all([
      supabase.from('movimientos').select('*')
        .order('fecha', { ascending: false }).order('created_at', { ascending: false }).limit(1000),
      supabase.from('fondos_ahorro').select('id,nombre,descripcion,color').eq('activo', true),
      supabase.from('movimientos_recurrentes').select('*').eq('activo', true).order('descripcion'),
      supabase.from('movimientos_presupuestos').select('*').eq('activo', true),
      supabase.from('movimientos_cierres').select('id,periodo_inicio,periodo_cierre,total_ingresos,total_gastos,balance')
        .order('periodo_cierre', { ascending: false }).limit(12),
    ])
    setMovs((m ?? []) as Movimiento[])
    setFondos((f ?? []) as FondoLite[])
    setRecurrentes((r ?? []) as Recurrente[])
    setPresupuestos((p ?? []) as PresupuestoCategoria[])
    setCierres((c ?? []) as CierrePeriodo[])
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

  const porMetodo = useMemo(() => {
    const mapa = new Map<string, { ingresos: number; gastos: number }>()
    delPeriodo.filter(m => m.metodo_pago).forEach(m => {
      const actual = mapa.get(m.metodo_pago!) ?? { ingresos: 0, gastos: 0 }
      if (m.tipo === 'ingreso') actual.ingresos += m.monto; else actual.gastos += m.monto
      mapa.set(m.metodo_pago!, actual)
    })
    return Array.from(mapa, ([metodo, v]) => ({ metodo, ...v }))
  }, [delPeriodo])

  // Edenred es un vale de despensa, no dinero de su bolsillo -- se muestra
  // aparte para que "Gastos" siga reflejando lo que de verdad les pega al
  // presupuesto liquido.
  const gastosEdenred = useMemo(() =>
    delPeriodo.filter(m => m.tipo === 'gasto' && m.metodo_pago === 'debito_edenred').reduce((s, m) => s + m.monto, 0),
    [delPeriodo])
  const gastosSinEdenred = totalGastos - gastosEdenred

  const eliminarRecurrente = async (id: number) => {
    setRecurrentes(rs => rs.filter(r => r.id !== id)) // optimista
    await supabase.from('movimientos_recurrentes').update({ activo: false }).eq('id', id)
  }

  const presupuestoProgreso = useMemo(() =>
    presupuestos.map(p => ({
      ...p,
      gastado: delPeriodo.filter(m => m.tipo === 'gasto' && m.categoria === p.categoria).reduce((s, m) => s + m.monto, 0),
    })).sort((a, b) => (b.gastado / b.limite) - (a.gastado / a.limite)),
    [presupuestos, delPeriodo])

  // Ritmo de gasto: solo tiene sentido en el periodo actual, no en uno ya
  // cerrado -- ahi ya se sabe como termino, no hace falta proyectar nada.
  const proyeccion = useMemo(() => {
    if (offset !== 0) return null
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
    const diasTranscurridos = Math.floor((hoy.getTime() - periodo.inicio.getTime()) / 86400000) + 1
    const diasTotales = Math.floor((periodo.cierre.getTime() - periodo.inicio.getTime()) / 86400000) + 1
    if (diasTranscurridos <= 0 || diasTranscurridos >= diasTotales) return null
    const ritmoDiario = totalGastos / diasTranscurridos
    return { proyectado: ritmoDiario * diasTotales, diasTranscurridos, diasTotales }
  }, [offset, periodo, totalGastos])

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
            {gastosEdenred > 0 && (
              <p className="text-xs text-white/75 mt-0.5">🥕 {fmt(gastosEdenred)} con Edenred</p>
            )}
          </div>
        </div>
        {gastosEdenred > 0 && (
          <p className="text-xs text-dim mt-2">
            Gastos sin Edenred (lo que de verdad sale de su bolsillo): <span className="font-medium text-muted">{fmt(gastosSinEdenred)}</span>
          </p>
        )}
        <div className="flex items-center justify-between mt-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
          <span className="text-sm text-muted">Balance del periodo</span>
          <span className="text-lg font-bold" style={{ color: balance >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(balance)}</span>
        </div>
        {proyeccion && (
          <p className="text-xs text-dim mt-2 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
            Van {proyeccion.diasTranscurridos} de {proyeccion.diasTotales} días — a este ritmo de gasto, terminarían el periodo con
            <span className="font-semibold text-muted"> ~{fmt(proyeccion.proyectado)}</span> en gastos.
          </p>
        )}
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

      {/* ── Historial: arriba de los analisis, porque la mayoria de las
          capturas y consultas pasan aqui y son desde el celular -- no tiene
          sentido hacer scroll por seis tarjetas de graficas primero. ── */}
      <div className="card">
        <p className="text-strong font-semibold text-sm mb-3">Historial</p>

        <div className="relative mb-2.5">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
          {/* El padding-left va inline a proposito: .input define su propio
              `padding` en shorthand y, como ese CSS carga despues de las
              utilidades de Tailwind, un simple `pl-9` no le ganaba -- el
              icono terminaba encimado sobre el texto. Inline siempre gana. */}
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por concepto, categoría o monto…"
            className="input w-full" style={{ paddingLeft: '2.25rem', paddingRight: busqueda ? '2.25rem' : undefined }} />
          {busqueda && (
            <button onClick={() => setBusqueda('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-dim hover:text-strong">
              <X size={14} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap mb-1">
          <button onClick={filtrarHoy} className="text-xs px-2.5 py-1.5 rounded-lg font-medium"
            style={{ background: 'var(--bg-card)', color: 'var(--text-body)', border: '1px solid var(--border-hi)' }}>Hoy</button>
          <button onClick={filtrarEsteMes} className="text-xs px-2.5 py-1.5 rounded-lg font-medium"
            style={{ background: 'var(--bg-card)', color: 'var(--text-body)', border: '1px solid var(--border-hi)' }}>Este mes</button>
          <button onClick={filtrarEstePeriodo} className="text-xs px-2.5 py-1.5 rounded-lg font-medium"
            style={{ background: 'var(--bg-card)', color: 'var(--text-body)', border: '1px solid var(--border-hi)' }}>Este periodo</button>
          <button onClick={() => setMostrarRango(v => !v)} className="text-xs px-2.5 py-1.5 rounded-lg font-medium flex items-center gap-1"
            style={mostrarRango
              ? { background: 'var(--accent)', color: '#fff' }
              : { background: 'var(--bg-card)', color: 'var(--text-body)', border: '1px solid var(--border-hi)' }}>
            <SlidersHorizontal size={11} /> Fecha
          </button>
          {hayFiltroActivo && (
            <button onClick={() => { limpiarFiltros(); setMostrarRango(false) }} className="text-xs px-2.5 py-1.5 rounded-lg font-medium flex items-center gap-1"
              style={{ background: 'var(--red)', color: '#fff' }}>
              <X size={11} /> Limpiar
            </button>
          )}
        </div>

        {mostrarRango && (
          <div className="rounded-xl p-3 mb-2 flex items-center gap-1.5 flex-wrap" style={{ background: 'var(--surface-2)' }}>
            <CalendarRange size={14} className="flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
            <input type="date" value={filtroDesde} onChange={e => setFiltroDesde(e.target.value)}
              className="input text-xs py-1 px-2 w-[130px]" />
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>a</span>
            <input type="date" value={filtroHasta} onChange={e => setFiltroHasta(e.target.value)}
              className="input text-xs py-1 px-2 w-[130px]" />
          </div>
        )}
        <p className="text-xs mt-1 mb-3" style={{ color: 'var(--text-muted)' }}>
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

      {porMetodo.length > 0 && (
        <div className="card">
          <p className="text-strong font-semibold text-sm mb-2 flex items-center gap-1.5"><CreditCard size={14} /> Por método de pago (periodo)</p>
          <div className="space-y-2">
            {porMetodo.map(m => (
              <div key={m.metodo} className="flex items-center gap-2.5 p-2 rounded-lg" style={{ background: 'var(--bg)' }}>
                <span className="text-base flex-shrink-0">{METODO_EMOJI[m.metodo]}</span>
                <span className="text-body text-sm flex-1">{METODO_LABEL[m.metodo]}</span>
                <span className="text-xs">
                  {m.ingresos > 0 && <span style={{ color: 'var(--green)' }} className="font-medium">+{fmt(m.ingresos)} </span>}
                  {m.gastos > 0 && <span style={{ color: 'var(--red)' }} className="font-medium">−{fmt(m.gastos)}</span>}
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

      <GraficaTendencia movs={movs} />

      {/* ── Presupuesto por categoria (envelope budgeting) ── */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <p className="text-strong font-semibold text-sm flex items-center gap-1.5"><Target size={14} /> Presupuesto por categoría</p>
          <button onClick={() => setFormPresupuestosAbierto(true)} className="text-xs px-2.5 py-1.5 rounded-lg font-medium"
            style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
            {presupuestos.length ? 'Editar límites' : '+ Poner límites'}
          </button>
        </div>
        {presupuestoProgreso.length === 0 ? (
          <p className="text-xs text-dim text-center py-4">Sin límites configurados. Ponle un tope a tus categorías para ver cómo van a mitad de periodo.</p>
        ) : (
          <div className="space-y-3">
            {presupuestoProgreso.map(p => (
              <BarraPresupuesto key={p.categoria} categoria={p.categoria} gastado={p.gastado} limite={p.limite} />
            ))}
          </div>
        )}
      </div>

      {/* ── Gastos e ingresos recurrentes ── */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <p className="text-strong font-semibold text-sm flex items-center gap-1.5"><Repeat size={14} /> Recurrentes</p>
          <button onClick={() => setFormRecurrenteAbierto({})} className="text-xs px-2.5 py-1.5 rounded-lg font-medium flex items-center gap-1"
            style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
            <Plus size={12} /> Nuevo
          </button>
        </div>
        {recurrentes.length === 0 ? (
          <p className="text-xs text-dim text-center py-4">Renta, luz, gas, internet… cosas que pagan cada periodo. Regístralas una vez, ajusta el monto cada vez que las captures.</p>
        ) : (
          <div className="space-y-1.5">
            {recurrentes.map(r => (
              <div key={r.id} className="flex items-center gap-3 p-2.5 rounded-xl" style={{ background: 'var(--bg)' }}>
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-base flex-shrink-0" style={{ background: 'var(--surface-2)' }}>
                  {CATEGORIA_EMOJI[r.categoria] ?? '💸'}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-body text-sm font-medium truncate">{r.descripcion}</p>
                  <p className="text-xs text-dim">≈ {fmt(r.monto_esperado)} · {PERSONAS.find(p => p.valor === r.persona)?.label}</p>
                </div>
                <button onClick={() => setFormAbierto({ tipo: r.tipo, recurrenteBase: r })}
                  className="flex-shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-medium text-white"
                  style={{ background: r.tipo === 'gasto' ? 'var(--red)' : 'var(--green)' }}>
                  Registrar
                </button>
                <button onClick={() => setFormRecurrenteAbierto({ editando: r })} className="p-1.5 rounded-lg text-dim hover:text-indigo-400" style={{ background: 'var(--surface-2)' }}>
                  <Pencil size={13} />
                </button>
                <button onClick={() => eliminarRecurrente(r.id)} className="p-1.5 rounded-lg text-dim hover:text-red-400" style={{ background: 'var(--surface-2)' }}>
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {cierres.length > 0 && (
        <div className="card">
          <p className="text-strong font-semibold text-sm mb-2 flex items-center gap-1.5">
            <Archive size={14} /> Cierres guardados
          </p>
          <p className="text-xs text-dim mb-3">Fotografía de cada periodo al cerrar (el jueves) — no cambia aunque después editen un movimiento viejo.</p>
          <div className="space-y-1.5">
            {cierres.map(c => (
              <div key={c.id} className="flex items-center justify-between text-xs p-2 rounded-lg" style={{ background: 'var(--bg)' }}>
                <span className="text-body">{new Date(c.periodo_cierre + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long' })}</span>
                <span>
                  <span style={{ color: 'var(--green)' }}>+{fmt(c.total_ingresos)}</span>
                  {' · '}
                  <span style={{ color: 'var(--red)' }}>−{fmt(c.total_gastos)}</span>
                  {' · '}
                  <span className="font-semibold" style={{ color: c.balance >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(c.balance)}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {formAbierto && (
        <FormMovimiento tipo={formAbierto.tipo} fondos={fondos} editando={formAbierto.editando} recurrenteBase={formAbierto.recurrenteBase}
          onCerrar={() => setFormAbierto(null)}
          onGuardado={() => { setFormAbierto(null); cargar() }} />
      )}
      {formRecurrenteAbierto && (
        <FormRecurrente fondos={fondos} editando={formRecurrenteAbierto.editando}
          onCerrar={() => setFormRecurrenteAbierto(null)}
          onGuardado={() => { setFormRecurrenteAbierto(null); cargar() }} />
      )}
      {formPresupuestosAbierto && (
        <FormPresupuestos presupuestos={presupuestos}
          onCerrar={() => setFormPresupuestosAbierto(false)}
          onGuardado={() => { setFormPresupuestosAbierto(false); cargar() }} />
      )}
    </div>
  )
}
