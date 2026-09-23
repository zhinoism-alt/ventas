/**
 * GET /api/calendario/feed?token=...
 *
 * Publica un feed .ics (RFC 5545) con la dieta de la semana activa y el
 * recordatorio de limpieza del sabado. Brandon e Itzel se suscriben UNA vez
 * desde su Google Calendar / iPhone pegando esta URL -- Google revisa el
 * feed solo cada pocas horas y los avisos los maneja Calendar con sus
 * notificaciones nativas. VentasPro nunca manda un correo por su cuenta:
 * solo publica texto, sin login de Google, sin cuota de API que agotar.
 *
 * Protegido por un token de un solo valor (CALENDAR_FEED_TOKEN) en vez de
 * autenticacion real: Google poll-ea este URL de forma anonima, sin poder
 * mandar un Bearer token de Clerk, asi que no hay otra forma de resguardarlo
 * que no sea que la URL en si sea dificil de adivinar.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
) as any

const ETIQUETA: Record<string, string> = {
  desayuno: '🍳 Desayuno', colacion1: '🍎 Colación', comida: '🍽️ Comida',
  colacion2: '🍏 Colación', cena: '🌙 Cena',
}

/** Escapa texto para un campo de .ics (RFC 5545 3.3.11). */
function escICS(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/** Dobla lineas a 75 octetos, como pide el RFC, para que los parsers estrictos no las corten. */
function fold(line: string): string {
  const bytes = Buffer.byteLength(line, 'utf8')
  if (bytes <= 75) return line
  let out = ''
  let chunk = ''
  for (const ch of line) {
    if (Buffer.byteLength(chunk + ch, 'utf8') > 74) {
      out += (out ? '\r\n ' : '') + chunk
      chunk = ch
    } else {
      chunk += ch
    }
  }
  out += (out ? '\r\n ' : '') + chunk
  return out
}

/** dd -> siguiente fecha (desde hoy) que cae en ese dia ISO (1=lunes..7=domingo), como YYYYMMDD. */
function proximaFecha(diaISO: number): string {
  const hoy = new Date()
  const diaHoy = hoy.getDay() === 0 ? 7 : hoy.getDay()
  let delta = diaISO - diaHoy
  if (delta < 0) delta += 7
  const fecha = new Date(hoy)
  fecha.setDate(hoy.getDate() + delta)
  const y = fecha.getFullYear()
  const m = String(fecha.getMonth() + 1).padStart(2, '0')
  const d = String(fecha.getDate()).padStart(2, '0')
  return `${y}${m}${d}`
}

const BYDAY: Record<number, string> = { 1: 'MO', 2: 'TU', 3: 'WE', 4: 'TH', 5: 'FR', 6: 'SA', 7: 'SU' }

/**
 * Numero de semana ISO-8601. Las dos dietas se alternan por paridad: semana
 * impar -> primer menu (por id), semana par -> el segundo. Es una suposicion
 * sobre en que semana empezo cada quien -- si algun dia sale al reves de lo
 * que marca el papel de la doctora, se invierte esta paridad en una linea.
 */
function semanaISO(fecha: Date): number {
  const d = new Date(Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()))
  const diaSemana = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - diaSemana)
  const inicioAnio = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - inicioAnio.getTime()) / 86400000 + 1) / 7)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = String(req.query.token ?? '')
  if (!process.env.CALENDAR_FEED_TOKEN || token !== process.env.CALENDAR_FEED_TOKEN) {
    return res.status(404).send('Not found')
  }

  const [{ data: menus }, { data: tareas }, { data: eventos }] = await Promise.all([
    supabase.from('dietas_menus').select('id,nombre').order('id'),
    supabase.from('limpieza_tareas').select('nombre').eq('activo', true).order('orden'),
    supabase.from('calendario_eventos').select('titulo,detalle,fecha,hora,recurrencia,monto').eq('activo', true),
  ])

  // Alterna por paridad de semana ISO -- ver semanaISO() arriba.
  const listaMenus = (menus ?? []) as { id: number; nombre: string }[]
  const menuActivo = listaMenus.length
    ? listaMenus[semanaISO(new Date()) % 2 === 1 ? 0 : 1 % listaMenus.length]
    : undefined

  const lineas: string[] = []
  lineas.push('BEGIN:VCALENDAR')
  lineas.push('VERSION:2.0')
  lineas.push('PRODID:-//VentasPro//Calendario Familiar//ES')
  lineas.push('CALSCALE:GREGORIAN')
  lineas.push('METHOD:PUBLISH')
  lineas.push('X-WR-CALNAME:VentasPro — Dieta y Limpieza')
  lineas.push('X-WR-TIMEZONE:America/Mexico_City')
  lineas.push('REFRESH-INTERVAL;VALUE=DURATION:PT6H')
  lineas.push('X-PUBLISHED-TTL:PT6H')

  if (menuActivo) {
    const { data: comidas } = await supabase
      .from('dietas_comidas')
      .select('dia,tiempo,hora,titulo,detalle')
      .eq('menu_id', menuActivo.id)
      .order('dia')

    for (const c of comidas ?? []) {
      const fecha = proximaFecha(c.dia)
      const [hh, mm] = String(c.hora).split(':').map(Number)
      const finTotal = hh * 60 + mm + 30  // 30 min de duracion
      const hhFin = String(Math.floor(finTotal / 60) % 24).padStart(2, '0')
      const mmFin = String(finTotal % 60).padStart(2, '0')
      const hhIni = String(hh).padStart(2, '0')
      const mmIni = String(mm).padStart(2, '0')
      lineas.push('BEGIN:VEVENT')
      lineas.push(`UID:comida-${menuActivo.id}-${c.dia}-${c.tiempo}@ventaspro`)
      lineas.push(`DTSTAMP:${fecha}T000000Z`)
      lineas.push(`DTSTART;TZID=America/Mexico_City:${fecha}T${hhIni}${mmIni}00`)
      lineas.push(`DTEND;TZID=America/Mexico_City:${fecha}T${hhFin}${mmFin}00`)
      lineas.push(`RRULE:FREQ=WEEKLY;BYDAY=${BYDAY[c.dia]}`)
      lineas.push(fold(`SUMMARY:${escICS(`${ETIQUETA[c.tiempo] ?? c.tiempo}: ${c.titulo}`)}`))
      lineas.push(fold(`DESCRIPTION:${escICS(`${c.detalle}\n\n(${menuActivo.nombre} — Dra. Ochoa)`)}`))
      lineas.push('END:VEVENT')
    }
  }

  if ((tareas ?? []).length) {
    const fecha = proximaFecha(6) // sabado
    const lista = (tareas ?? []).map((t: { nombre: string }) => `• ${t.nombre}`).join('\n')
    lineas.push('BEGIN:VEVENT')
    lineas.push('UID:limpieza-sabado@ventaspro')
    lineas.push(`DTSTAMP:${fecha}T000000Z`)
    lineas.push(`DTSTART;TZID=America/Mexico_City:${fecha}T090000`)
    lineas.push(`DTEND;TZID=America/Mexico_City:${fecha}T110000`)
    lineas.push('RRULE:FREQ=WEEKLY;BYDAY=SA')
    lineas.push('SUMMARY:🧹 Día de limpieza')
    lineas.push(fold(`DESCRIPTION:${escICS(`${lista}\n\nMarca lo que ya hiciste en VentasPro → Personal.`)}`))
    lineas.push('END:VEVENT')
  }

  for (const ev of (eventos ?? []) as { titulo: string; detalle: string | null; fecha: string; hora: string; recurrencia: string; monto: number | null }[]) {
    const [hh, mm] = String(ev.hora).split(':').map(Number)
    const finTotal = hh * 60 + mm + 60  // 1h de duracion por default
    const hhFin = String(Math.floor(finTotal / 60) % 24).padStart(2, '0')
    const mmFin = String(finTotal % 60).padStart(2, '0')
    const hhIni = String(hh).padStart(2, '0')
    const mmIni = String(mm).padStart(2, '0')
    const descripcion = [ev.detalle, ev.monto != null ? `Precio: $${Number(ev.monto).toLocaleString('es-MX', { minimumFractionDigits: 2 })}` : null]
      .filter(Boolean).join('\n\n')

    lineas.push('BEGIN:VEVENT')
    if (ev.recurrencia === 'semanal') {
      const anclaISO = new Date(ev.fecha + 'T00:00:00')
      const diaISO = anclaISO.getDay() === 0 ? 7 : anclaISO.getDay()
      const fecha = proximaFecha(diaISO)
      lineas.push(`UID:evento-${ev.titulo.replace(/[^a-zA-Z0-9]/g, '')}@ventaspro`)
      lineas.push(`DTSTAMP:${fecha}T000000Z`)
      lineas.push(`DTSTART;TZID=America/Mexico_City:${fecha}T${hhIni}${mmIni}00`)
      lineas.push(`DTEND;TZID=America/Mexico_City:${fecha}T${hhFin}${mmFin}00`)
      lineas.push(`RRULE:FREQ=WEEKLY;BYDAY=${BYDAY[diaISO]}`)
    } else {
      const fecha = ev.fecha.replace(/-/g, '')
      lineas.push(`UID:evento-${ev.titulo.replace(/[^a-zA-Z0-9]/g, '')}-${fecha}@ventaspro`)
      lineas.push(`DTSTAMP:${fecha}T000000Z`)
      lineas.push(`DTSTART;TZID=America/Mexico_City:${fecha}T${hhIni}${mmIni}00`)
      lineas.push(`DTEND;TZID=America/Mexico_City:${fecha}T${hhFin}${mmFin}00`)
    }
    lineas.push(fold(`SUMMARY:${escICS(ev.titulo)}`))
    if (descripcion) lineas.push(fold(`DESCRIPTION:${escICS(descripcion)}`))
    lineas.push('END:VEVENT')
  }

  lineas.push('END:VCALENDAR')

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=3600')
  res.setHeader('Content-Disposition', 'inline; filename="ventaspro.ics"')
  return res.status(200).send(lineas.join('\r\n') + '\r\n')
}
