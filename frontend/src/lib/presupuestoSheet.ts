/* ═══════════════════════════════════════════════════════════════════════════
   Lector del presupuesto publicado en Google Sheets.

   La hoja no es una tabla limpia: es una hoja de trabajo humana. Los bloques
   cambian de columna entre meses (los "Gastos NO Necesarios" estan en D de
   enero a marzo y en E de abril en adelante), hay filas vacias en medio, notas
   sueltas en las columnas de la derecha, montos escritos a veces como
   "$1,234.56" y a veces como 1234.56, y asteriscos donde hay un apartado
   planeado pero sin cifra.

   Asi que no buscamos celdas por coordenada, sino por lo que dicen: se localiza
   el encabezado de cada bloque en cualquier parte de la hoja y se lee hacia
   abajo hasta el "Total". Eso aguanta que el mes entrante tenga dos gastos mas
   o una fila de menos, que es lo que pasa siempre.

   Google sirve el CSV publicado con Access-Control-Allow-Origin: *, asi que
   todo esto ocurre en el navegador. No hace falta backend ni credenciales.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface Concepto { concepto: string; monto: number }
export interface Categoria { categoria: string; teorico: number | null; real: number | null }
export interface FilaApartado { concepto: string; montos: (number | null)[]; planeado: boolean[] }
export interface Apartados { semanas: string[]; filas: FilaApartado[] }
export interface SaldoFondo { nombre: string; inicial: number | null; serie: number[]; final: number | null }

export interface Presupuesto {
  ingresoPrincipal: number | null
  ingresoNota: string
  ingresoExtra: Concepto[]
  totalExtra: number
  necesarios: Concepto[]
  totalNecesarios: number
  noNecesarios: Concepto[]
  totalNoNecesarios: number
  categorias: Categoria[]
  totalTeorico: number | null
  totalReal: number | null
  fondoEmergencia3Meses: number | null
  disponible: number | null
  apartados: Apartados
  saldosFondos: SaldoFondo[]
}

export interface Hoja { nombre: string; gid: string; anio: number | null; mes: number | null }

// ── Normalizacion ───────────────────────────────────────────────────────────

/** Minusculas, sin acentos, sin espacios repetidos. Para comparar etiquetas. */
export function norm(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** "$1,234.56" -> 1234.56 · "*" -> null · "(50)" -> -50 */
export function money(s: unknown): number | null {
  const t = String(s ?? '').trim()
  if (!t || t === '*') return null
  const negParen = t.startsWith('(') && t.endsWith(')')
  const limpio = t.replace(/[^0-9.-]/g, '')
  if (!limpio || !/[0-9]/.test(limpio)) return null
  const v = Number(limpio)
  if (!Number.isFinite(v)) return null
  return negParen ? -v : v
}

// ── CSV ─────────────────────────────────────────────────────────────────────

/** Parser de CSV con comillas. Google cita cualquier celda con coma o salto. */
export function parseCSV(texto: string): string[][] {
  const filas: string[][] = []
  let fila: string[] = []
  let campo = ''
  let enComillas = false

  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i]
    if (enComillas) {
      if (ch === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++ }
        else enComillas = false
      } else campo += ch
    } else if (ch === '"') {
      enComillas = true
    } else if (ch === ',') {
      fila.push(campo); campo = ''
    } else if (ch === '\n') {
      fila.push(campo); filas.push(fila); fila = []; campo = ''
    } else if (ch !== '\r') {
      campo += ch
    }
  }
  if (campo || fila.length) { fila.push(campo); filas.push(fila) }
  return filas
}

// ── Acceso a la matriz ──────────────────────────────────────────────────────

const cel = (m: string[][], r: number, c: number): string =>
  (r >= 0 && r < m.length && c >= 0 && c < m[r].length) ? m[r][c] : ''

/** Primera celda cuyo texto normalizado casa con el patron. */
function buscar(m: string[][], rx: RegExp): [number, number] | null {
  for (let r = 0; r < m.length; r++)
    for (let c = 0; c < m[r].length; c++)
      if (rx.test(norm(m[r][c]))) return [r, c]
  return null
}

const ES_ENCABEZADO = (n: string) =>
  n.startsWith('gastos necesarios') || n.startsWith('gastos no necesarios') ||
  n === 'apartados' || n === 'teorico' || n === 'real'

/**
 * Lee un bloque concepto/monto hacia abajo desde un encabezado en (r0, c).
 * Tolera huecos: en marzo el bloque de no necesarios arranca tres filas
 * despues de su titulo. Se detiene en "Total" (y toma ese total como bueno,
 * porque la hoja a veces suma cosas que no estan listadas) o al toparse con
 * otro encabezado.
 */
function bloque(m: string[][], r0: number, c: number, maxVacias = 4): { items: Concepto[]; total: number } {
  const items: Concepto[] = []
  let total: number | null = null
  let vacias = 0

  for (let r = r0 + 1; r < m.length && vacias <= maxVacias; r++) {
    const etq = cel(m, r, c).trim()
    if (!etq) { vacias++; continue }
    vacias = 0
    const n = norm(etq)
    if (n === 'total') { total = money(cel(m, r, c + 1)); break }
    if (ES_ENCABEZADO(n)) break
    const v = money(cel(m, r, c + 1))
    if (v !== null) items.push({ concepto: etq, monto: v })
  }

  return { items, total: total ?? items.reduce((s, i) => s + i.monto, 0) }
}

// ── Parseo de una hoja-mes ──────────────────────────────────────────────────

export function parsePresupuesto(m: string[][]): Presupuesto {
  // Ingreso principal
  const pIng = buscar(m, /^ingreso mensual/)
  const ingresoPrincipal = pIng ? money(cel(m, pIng[0], pIng[1] + 1)) : null
  const ingresoNota = pIng ? cel(m, pIng[0], pIng[1] + 2).trim() : ''

  // Gastos
  const pNec = buscar(m, /^gastos necesarios:/)
  const nec = pNec ? bloque(m, pNec[0], pNec[1]) : { items: [], total: 0 }
  const pNoNec = buscar(m, /^gastos no necesarios$/)
  const noNec = pNoNec ? bloque(m, pNoNec[0], pNoNec[1]) : { items: [], total: 0 }

  // Teorico vs real. La etiqueta de cada categoria vive una columna a la
  // izquierda del encabezado "Teorico"; la fila sin etiqueta es la de totales.
  const categorias: Categoria[] = []
  let totalTeorico: number | null = null
  let totalReal: number | null = null
  const pTeo = buscar(m, /^teorico$/)
  if (pTeo) {
    const [r0, c] = pTeo
    for (let r = r0 + 1; r < m.length; r++) {
      const etq = cel(m, r, c - 1).trim()
      if (!etq) {
        totalTeorico = money(cel(m, r, c))
        totalReal = money(cel(m, r, c + 1))
        break
      }
      categorias.push({
        categoria: etq.replace(/\s+/g, ' ').trim(),
        teorico: money(cel(m, r, c)),
        real: money(cel(m, r, c + 1)),
      })
    }
  }

  // Metricas sueltas
  const pFe = buscar(m, /fondo de emergencia 3 meses/)
  const pDisp = buscar(m, /^dinero disponible mensual/)

  // Ingreso quincenal extra: los montos van directo bajo el titulo, luego la
  // palabra "Total" y en la fila siguiente la suma.
  const ingresoExtra: Concepto[] = []
  let totalExtra: number | null = null
  const pExtra = buscar(m, /ingreso quincenal extra/)
  if (pExtra) {
    const [r0, c] = pExtra
    for (let r = r0 + 1; r < m.length; r++) {
      const v = cel(m, r, c).trim()
      if (norm(v) === 'total') { totalExtra = money(cel(m, r + 1, c)); break }
      const mv = money(v)
      if (mv === null) break
      ingresoExtra.push({ concepto: `Quincena ${ingresoExtra.length + 1}`, monto: mv })
    }
  }

  // Apartados semanales
  const apartados: Apartados = { semanas: [], filas: [] }
  const pAp = buscar(m, /^apartados$/)
  if (pAp) {
    const [r0, c] = pAp
    for (let cc = c + 1; cc < c + 12; cc++) {
      const v = cel(m, r0, cc).trim()
      if (!v) break
      apartados.semanas.push(v)
    }
    const n = apartados.semanas.length
    let vacias = 0
    for (let r = r0 + 1; r < m.length && vacias <= 2; r++) {
      const etq = cel(m, r, c).trim()
      if (!etq) { vacias++; continue }
      if (norm(etq).startsWith('saldo de fondo')) break
      vacias = 0
      apartados.filas.push({
        concepto: etq,
        montos: Array.from({ length: n }, (_, i) => money(cel(m, r, c + 1 + i))),
        planeado: Array.from({ length: n }, (_, i) => cel(m, r, c + 1 + i).trim() === '*'),
      })
    }
  }

  // Saldos de fondos: titulo, fila de semanas, fila de importes.
  const saldosFondos: SaldoFondo[] = []
  for (let r = 0; r < m.length; r++) {
    for (let c = 0; c < m[r].length; c++) {
      if (!norm(m[r][c]).startsWith('saldo de fondo')) continue
      const serie: number[] = []
      for (let cc = c; cc < c + 8; cc++) {
        const mv = money(cel(m, r + 2, cc))
        if (mv === null && !cel(m, r + 1, cc).trim()) break
        if (mv !== null) serie.push(mv)
      }
      saldosFondos.push({
        nombre: m[r][c].trim(),
        inicial: serie[0] ?? null,
        serie,
        final: serie[serie.length - 1] ?? null,
      })
    }
  }

  return {
    ingresoPrincipal, ingresoNota,
    ingresoExtra, totalExtra: totalExtra ?? ingresoExtra.reduce((s, e) => s + e.monto, 0),
    necesarios: nec.items, totalNecesarios: nec.total,
    noNecesarios: noNec.items, totalNoNecesarios: noNec.total,
    categorias, totalTeorico, totalReal,
    fondoEmergencia3Meses: pFe ? money(cel(m, pFe[0], pFe[1] + 1)) : null,
    disponible: pDisp ? money(cel(m, pDisp[0], pDisp[1] + 1)) : null,
    apartados, saldosFondos,
  }
}

// ── Descubrimiento de hojas ─────────────────────────────────────────────────

export const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

/** "Septiembre 2026" -> {anio:2026, mes:9} · "Septiembre" -> {anio:null, mes:9} */
export function mesDeNombre(nombre: string): { anio: number | null; mes: number | null } {
  const n = norm(nombre)
  const mes = MESES.findIndex(mm => n.startsWith(norm(mm)))
  const anio = n.match(/\b(20\d{2})\b/)
  return { mes: mes >= 0 ? mes + 1 : null, anio: anio ? Number(anio[1]) : null }
}

/** Saca el identificador 2PACX-... de un enlace de "Publicar en la web". */
export function pubIdDeUrl(url: string): string | null {
  const m = String(url || '').match(/\/spreadsheets\/d\/e\/([A-Za-z0-9_-]+)/)
  return m ? m[1] : (/^2PACX-[A-Za-z0-9_-]+$/.test(url.trim()) ? url.trim() : null)
}

const BASE = (pubId: string) => `https://docs.google.com/spreadsheets/d/e/${pubId}`

/**
 * Lista las pestanas de la hoja publicada. Google no ofrece un endpoint para
 * esto en documentos publicados, pero el pubhtml trae la lista incrustada en un
 * `items.push({name: ..., gid: ...})` del script de navegacion, y responde con
 * CORS abierto.
 */
export async function listaHojas(pubId: string): Promise<Hoja[]> {
  const res = await fetch(`${BASE(pubId)}/pubhtml`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Google respondio ${res.status} al listar las pestanas`)
  const html = await res.text()

  const hojas: Hoja[] = []
  const rx = /items\.push\(\{name: "([^"]*)"[\s\S]{0,400}?gid: "(\d+)"/g
  let m: RegExpExecArray | null
  while ((m = rx.exec(html)) !== null) {
    const nombre = m[1].replace(/\\(.)/g, '$1')
    hojas.push({ nombre, gid: m[2], ...mesDeNombre(nombre) })
  }
  if (!hojas.length) throw new Error('No se encontraron pestanas. Revisa que el enlace sea el de "Publicar en la web".')
  return hojas
}

/** Descarga una pestana como matriz de celdas. */
export async function descargaHoja(pubId: string, gid: string): Promise<string[][]> {
  const res = await fetch(`${BASE(pubId)}/pub?gid=${gid}&single=true&output=csv`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Google respondio ${res.status} al descargar la pestana`)
  return parseCSV(await res.text())
}

export async function leeMes(pubId: string, gid: string): Promise<Presupuesto> {
  return parsePresupuesto(await descargaHoja(pubId, gid))
}

/**
 * Elige la pestana que corresponde a un mes. Tolera que el nombre venga sin
 * anio, como "Septiembre": en ese caso basta con que coincida el mes y que no
 * haya otra pestana del mismo mes que si traiga anio.
 */
export function hojaDelMes(hojas: Hoja[], anio: number, mes: number): Hoja | null {
  return hojas.find(h => h.mes === mes && h.anio === anio)
      ?? hojas.find(h => h.mes === mes && h.anio === null)
      ?? null
}

/** Pestanas que representan un mes real, de la mas reciente a la mas antigua. */
export function hojasDeMeses(hojas: Hoja[], anioPorDefecto: number): (Hoja & { anio: number; mes: number })[] {
  return hojas
    .filter((h): h is Hoja & { mes: number } => h.mes !== null)
    .map(h => ({ ...h, anio: h.anio ?? anioPorDefecto, mes: h.mes }))
    .sort((a, b) => b.anio - a.anio || b.mes - a.mes)
}
