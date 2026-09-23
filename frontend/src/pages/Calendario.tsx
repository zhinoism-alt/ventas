import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, Pencil, Trash2, X, Calendar as CalendarIcon } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { fmt } from '../lib/utils'

/* ═══════════════════════════════════════════════════════════════════════════
   Calendario: vista de mes de calendario_eventos, con edicion completa.

   Editar aqui SI se refleja en el calendario al que ya se suscribieron
   (Personal -> Calendario compartido): el feed usa el id de la fila como UID
   estable, asi que Google ve el MISMO evento actualizado, no uno nuevo. La
   unica letra chica real: Google revisa el feed cada varias horas, no al
   instante -- es la naturaleza de un feed al que uno se suscribe, no un push.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Evento {
  id: number
  titulo: string
  detalle: string | null
  fecha: string
  hora: string
  recurrencia: 'ninguna' | 'semanal'
  monto: number | null
  activo: boolean
}

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const DIAS_CORTO = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

const vacio = { titulo: '', detalle: '', fecha: '', hora: '09:00', recurrencia: 'ninguna' as 'ninguna' | 'semanal', monto: '' }

/** Todas las celdas del mes visible, empezando en lunes, semanas completas. */
function celdasDelMes(anio: number, mes: number): Date[] {
  const primero = new Date(anio, mes, 1)
  const diaSemana = primero.getDay() === 0 ? 7 : primero.getDay()
  const inicio = new Date(anio, mes, 1 - (diaSemana - 1))
  const celdas: Date[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(inicio)
    d.setDate(inicio.getDate() + i)
    celdas.push(d)
  }
  return celdas
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const hoyISO = iso(new Date())

/** ¿Este evento cae en este día? Semanal: mismo día de la semana. Única vez: misma fecha. */
function ocurreEn(ev: Evento, dia: Date): boolean {
  if (ev.recurrencia === 'ninguna') return ev.fecha === iso(dia)
  const ancla = new Date(ev.fecha + 'T00:00:00')
  return ancla.getDay() === dia.getDay()
}

export default function Calendario() {
  const [eventos, setEventos] = useState<Evento[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const hoy = new Date()
  const [anio, setAnio] = useState(hoy.getFullYear())
  const [mes, setMes] = useState(hoy.getMonth())
  const [diaSel, setDiaSel] = useState<string>(hoyISO)
  const [editando, setEditando] = useState<Evento | 'nuevo' | null>(null)
  const [form, setForm] = useState(vacio)
  const [guardando, setGuardando] = useState(false)
  const [errorForm, setErrorForm] = useState<string | null>(null)

  const cargar = async () => {
    setError(null)
    try {
      const { data, error } = await supabase.from('calendario_eventos')
        .select('id,titulo,detalle,fecha,hora,recurrencia,monto,activo')
        .eq('activo', true).order('fecha')
      if (error) throw error
      setEventos((data ?? []) as Evento[])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCargando(false)
    }
  }
  useEffect(() => { cargar() }, [])

  const celdas = useMemo(() => celdasDelMes(anio, mes), [anio, mes])
  const eventosDelDia = (d: Date) => eventos.filter(ev => ocurreEn(ev, d)).sort((a, b) => a.hora.localeCompare(b.hora))
  const seleccionado = celdas.find(c => iso(c) === diaSel) ?? hoy
  const listaDia = eventosDelDia(seleccionado)

  const cambiarMes = (delta: number) => {
    const d = new Date(anio, mes + delta, 1)
    setAnio(d.getFullYear())
    setMes(d.getMonth())
  }

  const abrirNuevo = (fechaSugerida?: string) => {
    setForm({ ...vacio, fecha: fechaSugerida ?? diaSel })
    setErrorForm(null)
    setEditando('nuevo')
  }
  const abrirEditar = (ev: Evento) => {
    setForm({
      titulo: ev.titulo, detalle: ev.detalle ?? '', fecha: ev.fecha, hora: ev.hora.slice(0, 5),
      recurrencia: ev.recurrencia, monto: ev.monto != null ? String(ev.monto) : '',
    })
    setErrorForm(null)
    setEditando(ev)
  }

  const guardar = async () => {
    if (!form.titulo.trim()) return setErrorForm('Falta el título.')
    if (!form.fecha) return setErrorForm('Falta la fecha.')
    setErrorForm(null)
    setGuardando(true)
    try {
      const payload = {
        titulo: form.titulo.trim(),
        detalle: form.detalle.trim() || null,
        fecha: form.fecha,
        hora: form.hora,
        recurrencia: form.recurrencia,
        monto: form.monto.trim() ? Number(form.monto) : null,
      }
      const { error } = editando === 'nuevo'
        ? await supabase.from('calendario_eventos').insert(payload)
        : await supabase.from('calendario_eventos').update(payload).eq('id', (editando as Evento).id)
      if (error) { setErrorForm(`No se guardó: ${error.message}`); return }
      setEditando(null)
      cargar()
    } finally {
      setGuardando(false)
    }
  }

  const eliminar = async (ev: Evento) => {
    if (!confirm(`¿Eliminar "${ev.titulo}"? También desaparece del calendario suscrito.`)) return
    await supabase.from('calendario_eventos').update({ activo: false }).eq('id', ev.id)
    setEditando(null)
    cargar()
  }

  if (cargando) return <div className="card"><p className="text-xs text-dim">Cargando calendario…</p></div>

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between px-1">
        <div>
          <h1 className="text-2xl font-bold text-strong flex items-center gap-2">
            <CalendarIcon className="text-indigo-400" size={22} /> Calendario
          </h1>
          <p className="text-muted text-sm mt-0.5">
            Citas, dosis y eventos. Editar aquí actualiza el calendario al que ya se suscribieron
            (Personal → Calendario compartido) — Google lo refresca cada varias horas, no al instante.
          </p>
        </div>
        <button onClick={() => abrirNuevo()} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-2))' }}>
          <Plus size={16} /> Nuevo
        </button>
      </div>

      {error && (
        <div className="card" style={{ borderColor: 'var(--red)' }}>
          <p className="text-xs" style={{ color: 'var(--red)' }}>No se pudo cargar: {error}</p>
        </div>
      )}

      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => cambiarMes(-1)} className="p-1.5 rounded-lg hover:surface-2 text-muted"><ChevronLeft size={18} /></button>
          <p className="text-strong font-semibold">{MESES[mes]} {anio}</p>
          <button onClick={() => cambiarMes(1)} className="p-1.5 rounded-lg hover:surface-2 text-muted"><ChevronRight size={18} /></button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-xs text-dim mb-1">
          {DIAS_CORTO.map((d, i) => <div key={i} className="py-1">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {celdas.map(d => {
            const eventosDia = eventosDelDia(d)
            const esMesActual = d.getMonth() === mes
            const esHoy = iso(d) === hoyISO
            const esSel = iso(d) === diaSel
            return (
              <button key={iso(d)} onClick={() => setDiaSel(iso(d))}
                className="rounded-lg p-1.5 text-left transition-colors"
                style={{
                  minHeight: 56,
                  opacity: esMesActual ? 1 : 0.35,
                  background: esSel ? 'var(--accent)' : 'var(--surface-2)',
                  border: esHoy && !esSel ? '1px solid var(--accent)' : '1px solid transparent',
                }}>
                <span className="text-xs font-medium" style={{ color: esSel ? '#fff' : 'var(--text-body)' }}>{d.getDate()}</span>
                {eventosDia.length > 0 && (
                  <div className="flex flex-wrap gap-0.5 mt-1">
                    {eventosDia.slice(0, 3).map(ev => (
                      <span key={ev.id} className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ background: esSel ? '#fff' : 'var(--accent)' }} />
                    ))}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <p className="text-strong font-semibold text-sm">
            {seleccionado.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          <button onClick={() => abrirNuevo(diaSel)} className="btn-secondary text-xs"><Plus size={12} /> Agregar aquí</button>
        </div>
        {listaDia.length === 0 ? (
          <p className="text-xs text-dim text-center py-4">Sin eventos este día.</p>
        ) : (
          <div className="space-y-2">
            {listaDia.map(ev => (
              <div key={ev.id} className="flex items-start justify-between gap-3 text-xs px-3 py-2.5 rounded-lg"
                style={{ background: 'var(--surface-2)' }}>
                <div>
                  <p className="text-strong font-medium">{ev.hora?.slice(0, 5)} — {ev.titulo}</p>
                  {ev.recurrencia === 'semanal' && <p className="text-dim mt-0.5">Se repite cada semana</p>}
                  {ev.detalle && <p className="text-dim mt-0.5 whitespace-pre-line">{ev.detalle}</p>}
                  {ev.monto != null && <p className="text-strong font-mono mt-0.5">{fmt(ev.monto)}</p>}
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => abrirEditar(ev)} className="p-1.5 text-muted hover:text-strong"><Pencil size={13} /></button>
                  <button onClick={() => eliminar(ev)} className="p-1.5 text-faint hover:text-red-400"><Trash2 size={13} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.6)' }}
          onClick={() => setEditando(null)}>
          <div className="card w-full max-w-md" style={{ zIndex: 20 }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-strong font-semibold">{editando === 'nuevo' ? 'Nuevo evento' : 'Editar evento'}</h2>
              <button onClick={() => setEditando(null)} className="text-muted hover:text-strong"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted mb-1 block">Título *</label>
                <input className="input w-full" placeholder="Ej: Cita con el dentista"
                  value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted mb-1 block">Fecha *</label>
                  <input className="input w-full" type="date" value={form.fecha}
                    onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-muted mb-1 block">Hora</label>
                  <input className="input w-full" type="time" value={form.hora}
                    onChange={e => setForm(f => ({ ...f, hora: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted mb-1 block">Repetir</label>
                <select className="input w-full" value={form.recurrencia}
                  onChange={e => setForm(f => ({ ...f, recurrencia: e.target.value as 'ninguna' | 'semanal' }))}>
                  <option value="ninguna">Una sola vez</option>
                  <option value="semanal">Cada semana, ese mismo día</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted mb-1 block">Notas</label>
                <textarea className="input w-full" rows={2} placeholder="Opcional…"
                  value={form.detalle} onChange={e => setForm(f => ({ ...f, detalle: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-muted mb-1 block">Precio (opcional)</label>
                <input className="input w-full" type="number" placeholder="0.00"
                  value={form.monto} onChange={e => setForm(f => ({ ...f, monto: e.target.value }))} />
              </div>
            </div>
            {errorForm && <p className="text-xs mt-3" style={{ color: 'var(--red)' }}>{errorForm}</p>}
            <div className="flex gap-3 mt-4">
              <button onClick={guardar} disabled={guardando}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: 'var(--accent)' }}>
                {guardando ? 'Guardando…' : 'Guardar'}
              </button>
              {editando !== 'nuevo' && (
                <button onClick={() => eliminar(editando as Evento)} className="px-4 py-2 rounded-lg text-sm text-red-400 hover:bg-red-900/20">
                  Eliminar
                </button>
              )}
              <button onClick={() => setEditando(null)} className="px-4 py-2 rounded-lg text-sm text-muted">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
