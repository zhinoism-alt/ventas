import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

/* ═══════════════════════════════════════════════════════════════════════════
   Corre una vez al dia. Si hoy es el jueves de cierre del periodo financiero
   (el ultimo jueves del mes -- ver frontend/src/lib/periodoFinanciero.ts,
   duplicado aqui porque las funciones de api/ no importan de src/), congela
   los totales del periodo en movimientos_cierres y deja un pendiente en la
   pantalla de inicio -- el mismo mecanismo que ya usan para "postear carro" o
   cualquier otro recordatorio, asi que aparece en el banner llamativo del
   Dashboard sin tener que montar un sistema de correo o notificaciones nuevo.

   Idempotente: periodo_cierre es UNIQUE, y ademas se checa antes de insertar,
   para no duplicar el pendiente si el cron corre mas de una vez el mismo dia.
   ═══════════════════════════════════════════════════════════════════════════ */

function ultimoJuevesDelMes(anio: number, mesIdx0: number): Date {
  const ultimoDia = new Date(Date.UTC(anio, mesIdx0 + 1, 0))
  const dow = ultimoDia.getUTCDay()
  const delta = (dow - 4 + 7) % 7
  ultimoDia.setUTCDate(ultimoDia.getUTCDate() - delta)
  return ultimoDia
}

function aISO(d: Date): string { return d.toISOString().slice(0, 10) }

function periodoDe(ref: Date) {
  let anio = ref.getUTCFullYear(), mes = ref.getUTCMonth()
  let cierre = ultimoJuevesDelMes(anio, mes)
  if (ref > cierre) {
    mes += 1
    if (mes > 11) { mes = 0; anio += 1 }
    cierre = ultimoJuevesDelMes(anio, mes)
  }
  let mesPrev = mes - 1, anioPrev = anio
  if (mesPrev < 0) { mesPrev = 11; anioPrev -= 1 }
  const cierreAnterior = ultimoJuevesDelMes(anioPrev, mesPrev)
  const inicio = new Date(cierreAnterior)
  inicio.setUTCDate(inicio.getUTCDate() + 1)
  return { inicio: aISO(inicio), cierre: aISO(cierre) }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const secreto = process.env.CRON_SECRET
  const autorizado = secreto
    ? req.headers.authorization === `Bearer ${secreto}`
    : req.headers['x-vercel-cron'] !== undefined
  if (!autorizado) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

    // Mexico ya no cambia de horario (fijo UTC-6 desde 2022): restar 6h a la
    // hora del servidor (UTC) da la fecha local sin depender de zonas.
    const hoyMx = new Date(Date.now() - 6 * 3600 * 1000)
    const periodo = periodoDe(hoyMx)
    const hoyISO = aISO(hoyMx)

    if (hoyISO !== periodo.cierre) {
      return res.json({ success: true, accion: 'no es dia de cierre', hoy: hoyISO, cierre_del_periodo: periodo.cierre })
    }

    const { data: yaExiste } = await supabase.from('movimientos_cierres')
      .select('id').eq('periodo_cierre', periodo.cierre).maybeSingle()
    if (yaExiste) {
      return res.json({ success: true, accion: 'ya estaba cerrado', periodo_cierre: periodo.cierre })
    }

    const { data: movs, error } = await supabase.from('movimientos')
      .select('tipo,monto,categoria,persona,fondo_id,metodo_pago')
      .gte('fecha', periodo.inicio).lte('fecha', periodo.cierre)
    if (error) throw error

    const lista = movs ?? []
    const totalIngresos = lista.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + Number(m.monto), 0)
    const totalGastos    = lista.filter(m => m.tipo === 'gasto').reduce((s, m) => s + Number(m.monto), 0)

    const agrupar = (campo: 'categoria' | 'persona' | 'metodo_pago') => {
      const mapa: Record<string, { ingresos: number; gastos: number }> = {}
      lista.forEach(m => {
        const llave = (m as any)[campo] ?? 'sin_dato'
        if (!mapa[llave]) mapa[llave] = { ingresos: 0, gastos: 0 }
        if (m.tipo === 'ingreso') mapa[llave].ingresos += Number(m.monto)
        else mapa[llave].gastos += Number(m.monto)
      })
      return mapa
    }

    const desglose = {
      por_categoria: agrupar('categoria'),
      por_persona: agrupar('persona'),
      por_metodo: agrupar('metodo_pago'),
      cantidad_movimientos: lista.length,
    }

    await supabase.from('movimientos_cierres').insert({
      periodo_inicio: periodo.inicio,
      periodo_cierre: periodo.cierre,
      total_ingresos: totalIngresos,
      total_gastos: totalGastos,
      balance: totalIngresos - totalGastos,
      desglose,
    })

    await supabase.from('pendientes').insert({
      texto: `📊 Cerró tu periodo (${periodo.inicio} a ${periodo.cierre}): ingresos $${totalIngresos.toFixed(2)}, gastos $${totalGastos.toFixed(2)}. Revísalo en Movimientos.`,
    })

    console.log(`[CRON] Periodo cerrado: ${periodo.inicio} a ${periodo.cierre}, ingresos ${totalIngresos}, gastos ${totalGastos}`)
    return res.json({ success: true, accion: 'cerrado', periodo, totalIngresos, totalGastos })
  } catch (err: any) {
    console.error('[CRON] Error cerrando periodo:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
