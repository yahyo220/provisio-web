/** Small formatting helpers for turning raw Supabase rows into display strings. */

export function formatRelative(iso: string): string {
  const then = new Date(iso).getTime()
  const diffMs = Date.now() - then
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `${weeks} week${weeks === 1 ? '' : 's'} ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** "Mar 22, 9:14 AM" style — used both for display and (via Date parsing) for sorting. */
export function formatOrderDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

/** Matches the app's formatMoney() exactly: space-separated thousands + "сум" suffix. */
export function formatMoney(amount: number): string {
  const rounded = Math.round(amount)
  const s = Math.abs(rounded).toString()
  let out = ''
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += ' '
    out += s[i]
  }
  return `${rounded < 0 ? '-' : ''}${out} сум`
}

/** Parses a possibly-formatted money value (already a number, or a string a
 * person may have hand-typed/edited in Excel — thousands separators, a
 * "сум" suffix, etc.) into a plain number. Strips everything but digits,
 * the decimal point, and a leading minus before converting — a bare
 * Number(...) silently returns NaN on anything with a space/separator,
 * which once made a hand-retyped price silently drop a whole price-list
 * import row. formatMoney() below does emit a leading "-" for negative
 * amounts, so this needs to round-trip that rather than strip it. */
export function parseMoney(raw: unknown): number {
  if (typeof raw === 'number') return raw
  const s = String(raw ?? '').trim()
  const negative = s.startsWith('-')
  const digits = s.replace(/[^\d.]/g, '')
  const n = Number(digits)
  return negative ? -n : n
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || 'NA'
}
