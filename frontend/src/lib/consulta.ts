import { norm, type Presupuesto } from './presupuestoSheet'

/* ═══════════════════════════════════════════════════════════════════════════
   Consulta cruzada.

   La pregunta que esto contesta no es "¿cuánto gasté en X?" — eso lo dice la
   hoja. Es "¿qué historia cuenta X a lo largo del año, y qué peso tiene contra
   lo que gano?".

   Sin inteligencia artificial, a propósito. Buscando "gimnasio" en nueve meses
   de presupuesto sale que lo pagó una sola vez, en enero, y nunca más. Ese
   hallazgo es de SQL, no de un modelo; meter uno aquí solo lo redactaría más
   bonito. La capa de lenguaje viene después y encima de esto, porque sin datos
   crudos buenos un modelo únicamente inventa con seguridad.

   Fuentes: los nueve meses de presupuesto leídos de la hoja, los fondos de
   ahorro, las metas y los ingresos capturados a mano.
   ═══════════════════════════════════════════════════════════════════════════ */

export const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

/**
 * Sinónimos por tema. Existen porque la hoja dice "Gimnasio" y uno escribe
 * "gym", y porque un gasto de salud se llama distinto cada mes: "Nutriólogo",
 * "Medicamentos", "Guardadito dientes".
 */
export const TEMAS: { id: string; nombre: string; icono: string; claves: string[] }[] = [
  { id: 'salud', nombre: 'Salud y gimnasio', icono: '💪',
    claves: ['gimnasio', 'gym', 'nutriolog', 'medicament', 'salud', 'dentista', 'diente', 'glp', 'doctor', 'consulta medica'] },
  { id: 'viajes', nombre: 'Viajes', icono: '✈️',
    claves: ['viaje', 'disney', 'metallica', 'vacacion', 'hotel', 'vuelo', 'boletos'] },
  { id: 'auto', nombre: 'Camioneta y transporte', icono: '🚗',
    claves: ['camioneta', 'gasolina', 'seguro camioneta', 'aseguranza', 'carrocero', 'llanta', 'didi', 'uber', 'transporte', 'lavar camioneta'] },
  { id: 'mascotas', nombre: 'Las gatas', icono: '🐈',
    claves: ['gata', 'gatas', 'modi', 'vacuna', 'esteriliz', 'veterinar', 'necesidades gatas'] },
  { id: 'casa', nombre: 'Casa y servicios', icono: '🏠',
    claves: ['luz', 'agua', 'internet', 'gas', 'predial', 'escritura', 'minisplit', 'renta'] },
  { id: 'retiro', nombre: 'PPR y retiro', icono: '🏦',
    claves: ['ppr', 'vida mujer', 'afore', 'retiro', 'seguro de vida'] },
  { id: 'escuela', nombre: 'Escuela', icono: '🎓',
    claves: ['educacion', 'colegiatura', 'unitec', 'revalidacion', 'chino', 'curso', 'certificacion'] },
  { id: 'salidas', nombre: 'Salidas y antojos', icono: '🍔',
    claves: ['salida', 'comida', 'pizza', 'cine', 'antojo', 'mandado', 'cumple', 'regalo', 'pastel'] },
]

export interface MesDato { anio: number; mes: number; datos: Presupuesto }
export interface Fondo { id: number; nombre: string; saldo: number; rendimiento: number; descripcion?: string | null }
export interface Meta { id: number; nombre: string; meta: number; acumulado: number; descripcion?: string | null }

export interface Renglon {
  anio: number
  mes: number
  concepto: string
  monto: number
  categoria: 'necesario' | 'no necesario' | 'apartado'
}

export interface Resultado {
  termino: string
  renglones: Renglon[]
  total: number
  /** Meses del periodo en los que aparece al menos un renglón. */
  mesesActivos: number
  mesesTotales: number
  /** Promedio sobre los meses en que sí apareció, no sobre todos. */
  promedioActivo: number
  primerMes: { anio: number; mes: number } | null
  ultimoMes: { anio: number; mes: number } | null
  /** Ingreso sumado del periodo, para poder dar el peso real. */
  ingresoPeriodo: number
  pctIngreso: number
  porMes: { anio: number; mes: number; monto: number }[]
  fondos: Fondo[]
  metas: Meta[]
  /** Lectura en una frase. Lo que uno querría que alguien le dijera. */
  lectura: string
}

const claveMes = (a: number, m: number) => a * 100 + m

/** ¿Este concepto habla del tema que se busca? */
function casa(concepto: string, claves: string[]): boolean {
  const c = norm(concepto)
  return claves.some(k => c.includes(k))
}

/**
 * Convierte lo que se escribió en la lista de palabras a buscar. Si coincide
 * con un tema conocido, usa sus sinónimos; si no, busca el texto tal cual.
 */
export function clavesDe(termino: string): { claves: string[]; tema: typeof TEMAS[number] | null } {
  const t = norm(termino)
  if (!t) return { claves: [], tema: null }
  const tema = TEMAS.find(x => x.id === t || norm(x.nombre).includes(t) || x.claves.some(k => k === t || k.includes(t)))
  return { claves: tema ? tema.claves : [t], tema: tema ?? null }
}

export function consultar(
  termino: string,
  meses: MesDato[],
  fondos: Fondo[],
  metas: Meta[],
  ingresosExtra: { anio: number; mes: number; monto: number }[] = [],
): Resultado {
  const { claves } = clavesDe(termino)
  const renglones: Renglon[] = []

  for (const m of meses) {
    const d = m.datos
    for (const it of d.necesarios ?? [])
      if (casa(it.concepto, claves)) renglones.push({ anio: m.anio, mes: m.mes, concepto: it.concepto, monto: it.monto, categoria: 'necesario' })
    for (const it of d.noNecesarios ?? [])
      if (casa(it.concepto, claves)) renglones.push({ anio: m.anio, mes: m.mes, concepto: it.concepto, monto: it.monto, categoria: 'no necesario' })
    for (const f of d.apartados?.filas ?? [])
      if (casa(f.concepto, claves)) {
        const suma = f.montos.reduce<number>((s, v) => s + (v ?? 0), 0)
        if (suma > 0) renglones.push({ anio: m.anio, mes: m.mes, concepto: f.concepto, monto: suma, categoria: 'apartado' })
      }
  }

  const total = renglones.reduce((s, r) => s + r.monto, 0)

  // Un mes cuenta como activo si tuvo al menos un renglón. Promediar sobre los
  // nueve meses cuando algo solo pasó en enero diría "320 al mes", que es
  // falso en los dos sentidos: ni lo pagas cada mes ni pagaste 320.
  const porMesMapa = new Map<number, { anio: number; mes: number; monto: number }>()
  for (const r of renglones) {
    const k = claveMes(r.anio, r.mes)
    const prev = porMesMapa.get(k)
    if (prev) prev.monto += r.monto
    else porMesMapa.set(k, { anio: r.anio, mes: r.mes, monto: r.monto })
  }
  const porMes = [...porMesMapa.values()].sort((a, b) => claveMes(a.anio, a.mes) - claveMes(b.anio, b.mes))

  const ingresoPeriodo = meses.reduce((s, m) => {
    const extra = ingresosExtra
      .filter(e => e.anio === m.anio && e.mes === m.mes)
      .reduce((t, e) => t + e.monto, 0)
    return s + (m.datos.ingresoPrincipal ?? 0) + extra
  }, 0)

  const cl = claves
  const fondosRel = fondos.filter(f => casa(f.nombre, cl) || casa(f.descripcion ?? '', cl))
  const metasRel = metas.filter(m => casa(m.nombre, cl) || casa(m.descripcion ?? '', cl))

  const mesesActivos = porMes.length
  const mesesTotales = meses.length
  const promedioActivo = mesesActivos ? total / mesesActivos : 0

  return {
    termino,
    renglones,
    total,
    mesesActivos,
    mesesTotales,
    promedioActivo,
    primerMes: porMes[0] ? { anio: porMes[0].anio, mes: porMes[0].mes } : null,
    ultimoMes: porMes.length ? { anio: porMes[porMes.length - 1].anio, mes: porMes[porMes.length - 1].mes } : null,
    ingresoPeriodo,
    pctIngreso: ingresoPeriodo ? (total / ingresoPeriodo) * 100 : 0,
    porMes,
    fondos: fondosRel,
    metas: metasRel,
    lectura: leer(porMes, mesesTotales, meses),
  }
}

/**
 * La frase que resume. No adorna: dice qué pasó y cuándo dejó de pasar, que es
 * la parte que un total anual esconde.
 */
function leer(
  porMes: { anio: number; mes: number; monto: number }[],
  mesesTotales: number,
  meses: MesDato[],
): string {
  if (!porMes.length) return 'No aparece en ninguno de los meses leídos.'

  const ultimoDelPeriodo = [...meses].sort((a, b) => claveMes(b.anio, b.mes) - claveMes(a.anio, a.mes))[0]
  const ultimo = porMes[porMes.length - 1]
  const nombreUlt = MESES_CORTOS[ultimo.mes - 1]
  const activos = porMes.length

  if (activos === 1) {
    return `Solo aparece en ${nombreUlt}. No volvió a aparecer en los otros ${mesesTotales - 1} meses.`
  }

  const abandonado = ultimoDelPeriodo &&
    claveMes(ultimo.anio, ultimo.mes) < claveMes(ultimoDelPeriodo.anio, ultimoDelPeriodo.mes)

  if (abandonado) {
    const desde = MESES_CORTOS[ultimoDelPeriodo.mes - 1]
    return `Aparece en ${activos} de ${mesesTotales} meses, pero el último fue ${nombreUlt}: lleva sin aparecer hasta ${desde}.`
  }

  // Sigue vivo. ¿Sube o baja?
  const mitad = Math.floor(porMes.length / 2)
  const vieja = porMes.slice(0, mitad).reduce((s, x) => s + x.monto, 0) / Math.max(1, mitad)
  const nueva = porMes.slice(mitad).reduce((s, x) => s + x.monto, 0) / Math.max(1, porMes.length - mitad)
  const cambio = vieja ? ((nueva - vieja) / vieja) * 100 : 0

  if (Math.abs(cambio) < 15) return `Constante: aparece en ${activos} de ${mesesTotales} meses sin cambios grandes.`
  return cambio > 0
    ? `Va en aumento: la segunda mitad del periodo cuesta ${Math.round(cambio)}% más que la primera.`
    : `Va a la baja: la segunda mitad cuesta ${Math.round(Math.abs(cambio))}% menos que la primera.`
}
