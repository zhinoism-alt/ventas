/**
 * El mes financiero de Brandon e Itzel no es el mes de calendario: cierran
 * cuentas el ultimo jueves de cada mes, porque es cuando cae el ultimo pago
 * del mes. El periodo va del dia siguiente al jueves de cierre anterior
 * hasta ese jueves, inclusive -- no del 1 al 30.
 */

export function ultimoJuevesDelMes(anio: number, mesIdx0: number): Date {
  const ultimoDia = new Date(anio, mesIdx0 + 1, 0)
  const dow = ultimoDia.getDay() // 0=domingo … 4=jueves … 6=sabado
  const delta = (dow - 4 + 7) % 7
  ultimoDia.setDate(ultimoDia.getDate() - delta)
  ultimoDia.setHours(0, 0, 0, 0)
  return ultimoDia
}

export interface PeriodoFinanciero {
  inicio: Date
  cierre: Date
  inicioISO: string
  cierreISO: string
  etiqueta: string
}

function aISO(d: Date): string { return d.toISOString().slice(0, 10) }

/** El periodo (jueves a jueves) al que pertenece `ref`. */
export function periodoDe(ref: Date): PeriodoFinanciero {
  const hoy = new Date(ref); hoy.setHours(0, 0, 0, 0)
  let anio = hoy.getFullYear(), mes = hoy.getMonth()
  let cierre = ultimoJuevesDelMes(anio, mes)
  if (hoy > cierre) {
    mes += 1
    if (mes > 11) { mes = 0; anio += 1 }
    cierre = ultimoJuevesDelMes(anio, mes)
  }
  let mesPrev = mes - 1, anioPrev = anio
  if (mesPrev < 0) { mesPrev = 11; anioPrev -= 1 }
  const cierreAnterior = ultimoJuevesDelMes(anioPrev, mesPrev)
  const inicio = new Date(cierreAnterior)
  inicio.setDate(inicio.getDate() + 1)
  return {
    inicio, cierre,
    inicioISO: aISO(inicio), cierreISO: aISO(cierre),
    etiqueta: `Cierre ${cierre.toLocaleDateString('es-MX', { day: 'numeric', month: 'long' })}`,
  }
}

/** `offset` periodos hacia atras (0 = el actual, 1 = el anterior, …). */
export function periodoConOffset(offset: number): PeriodoFinanciero {
  const actual = periodoDe(new Date())
  if (offset === 0) return actual
  // Un periodo dura entre 28 y 31 dias segun cuantos jueves tenga el mes de
  // cierre, asi que restar dias a ciegas no siempre cae en el mes anterior.
  // Mas seguro: mover el (anio, mes) del cierre actual y recalcular desde
  // un dia a medio mes, que siempre queda antes del jueves de cierre.
  let anio = actual.cierre.getFullYear()
  let mes  = actual.cierre.getMonth() - offset
  while (mes < 0) { mes += 12; anio -= 1 }
  return periodoDe(new Date(anio, mes, 15))
}

/**
 * Que cuenta en el Reporte del periodo, el presupuesto por categoria y la
 * tendencia -- compartido entre Movimientos.tsx y el HUD del Dashboard para
 * que los dos muestren el mismo numero (antes viaje_id se filtraba aparte en
 * cada lado y se desincronizaban).
 *
 * Un viaje tiene su propio dinero aparte. Un ingreso etiquetado con fondo se
 * fue directo al ahorro/inversion, nunca paso por lo liquido. Un gasto que
 * "sale de" un fondo esta usando ahorro que ya se conto cuando se guardo, no
 * es gasto nuevo -- salvo que sea una aportacion real (dinero liquido que
 * SI sale este periodo hacia el fondo).
 */
export interface MovimientoPresupuesto {
  tipo: 'ingreso' | 'gasto'
  fondo_id: number | null
  es_aportacion: boolean
  viaje_id: number | null
}

export function cuentaEnPresupuesto(m: MovimientoPresupuesto): boolean {
  if (m.viaje_id != null) return false
  if (m.fondo_id == null) return true
  if (m.tipo === 'ingreso') return false
  return m.es_aportacion
}
