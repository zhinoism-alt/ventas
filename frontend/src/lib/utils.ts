import { formatMXN, toMXN } from './api'

/** Safe parseFloat — returns 0 instead of NaN */
export const safeFloat = (v: string | number | undefined | null): number => {
  const n = parseFloat(String(v ?? ''))
  return isNaN(n) ? 0 : n
}

/** Safe division — returns 0 instead of Infinity/NaN */
export const safeDiv = (a: number, b: number): number =>
  b === 0 ? 0 : a / b

/** Profit in MXN for a product */
export const calcProfit = (
  salePrice: number, saleCurrency: string,
  purchasePrice: number, purchaseCurrency: string,
  rate: number,
): number =>
  toMXN(salePrice, saleCurrency, rate) - toMXN(purchasePrice, purchaseCurrency, rate)

/** Format profit with sign coloring class */
export const profitClass = (amount: number): string =>
  amount > 0 ? 'text-green-400' : amount < 0 ? 'text-red-400' : 'text-slate-400'

/** Format currency — never returns NaN/null */
export const fmt = (amount: number | null | undefined): string =>
  formatMXN(isNaN(Number(amount)) || amount == null ? 0 : Number(amount))

/** NavLink active class helper */
export const navLinkClass = (isActive: boolean): string =>
  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 ${
    isActive
      ? 'bg-indigo-600 text-white font-medium'
      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
  }`
