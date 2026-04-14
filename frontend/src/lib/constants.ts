// ── Shared chart tooltip style ────────────────────────────────────────────────
export const TOOLTIP_STYLE = {
  backgroundColor: '#1e293b',
  border: '1px solid #2d3f58',
  borderRadius: '8px',
  color: '#f1f5f9',
  fontSize: '12px',
}

// ── Month abbreviations (ES) ──────────────────────────────────────────────────
export const MONTH_NAMES: Record<string, string> = {
  '01': 'Ene', '02': 'Feb', '03': 'Mar', '04': 'Abr',
  '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Ago',
  '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dic',
}

export const formatMonth = (m: string): string => {
  if (!m) return ''
  const mo = m.split('-')[1]
  return MONTH_NAMES[mo] || m
}

// ── Product enums ─────────────────────────────────────────────────────────────
export const CONDITIONS = ['nuevo', 'como_nuevo', 'buen_estado', 'regular'] as const

export const COND_LABELS: Record<string, string> = {
  nuevo: 'Nuevo',
  como_nuevo: 'Como nuevo',
  buen_estado: 'Buen estado',
  regular: 'Regular',
}

export const COND_COLORS: Record<string, string> = {
  nuevo: 'badge-blue',
  como_nuevo: 'badge-green',
  buen_estado: 'badge-yellow',
  regular: 'badge-gray',
}

export const STATUS_COLORS: Record<string, string> = {
  disponible: 'badge-green',
  vendido: 'badge-gray',
  reservado: 'badge-yellow',
}

// ── IPTV panel prices (single source of truth) ────────────────────────────────
export const PANEL_PRICES: Record<string, { credits: number; price_mxn: number; price_usd: number }[]> = {
  '1': [
    { credits: 15, price_mxn: 1200, price_usd: 75 },
    { credits: 30, price_mxn: 2100, price_usd: 135 },
    { credits: 50, price_mxn: 3250, price_usd: 250 },
  ],
  '2': [
    { credits: 15, price_mxn: 1450, price_usd: 95 },
    { credits: 30, price_mxn: 2700, price_usd: 174 },
    { credits: 50, price_mxn: 4250, price_usd: 270 },
  ],
}

export const SELL_PRICES: Record<string, { months: number; price_mxn: number; price_usd: number }[]> = {
  '1': [
    { months: 1, price_mxn: 200, price_usd: 15 },
    { months: 3, price_mxn: 540, price_usd: 41 },
    { months: 6, price_mxn: 990, price_usd: 66 },
  ],
  '2': [
    { months: 1, price_mxn: 260, price_usd: 17 },
    { months: 3, price_mxn: 675, price_usd: 45 },
    { months: 6, price_mxn: 1200, price_usd: 71 },
  ],
}

// ── Shared inline styles ──────────────────────────────────────────────────────
export const CARD_STYLE: React.CSSProperties = {
  background: '#1e293b',
  border: '1px solid #2d3f58',
}

export const INNER_CARD_STYLE: React.CSSProperties = {
  background: '#0f172a',
}

export const DIVIDER_STYLE: React.CSSProperties = {
  borderColor: '#2d3f58',
}
