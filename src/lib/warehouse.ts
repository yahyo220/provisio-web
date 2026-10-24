// Warehouse (Склад) — data model and the math every tab shares. The data
// lives in the database (migration 0080, read/written by ./warehouseDb):
// receipts, batches, write-offs and the movement journal; posting goes
// through database functions so stock, batches and sale prices change
// together.
//
// Rules the screens follow (agreed with the business, see the warehouse plan):
// - stock is kept in each product's base unit (кг for weighed goods, шт /
//   бутылка otherwise); other sales units (коробка) may carry a "kg per unit";
// - every receipt line is a batch with a purchase price and an expiry date;
//   stock leaves the oldest-expiring batch first;
// - stock may go negative (an order picked up with nothing left);
// - a receipt sets the sale price: purchase price + margin, rounded up
//   (roundSalePrice), and only ever raises it — lowering is the admin's call.

import type { OrderItemRow, OrderRow, ProductRow } from './types'

export type WriteOffReason = 'spoiled' | 'damaged' | 'expired' | 'other' | 'order'
export type MovementType = 'receipt' | 'order' | 'writeoff' | 'adjustment'
export type StockState = 'in' | 'low' | 'out' | 'negative'

export const WRITE_OFF_REASONS: { value: WriteOffReason; label: string }[] = [
  { value: 'spoiled', label: 'Порча' },
  { value: 'damaged', label: 'Брак' },
  { value: 'expired', label: 'Просрочка' },
  { value: 'other', label: 'Другое' },
  { value: 'order', label: 'По заказу' },
]

/** Reasons a person can pick when writing stock off by hand — "По заказу"
 * only ever comes from delivered orders. */
export const MANUAL_WRITE_OFF_REASONS = WRITE_OFF_REASONS.filter((r) => r.value !== 'order')

export const MOVEMENT_LABELS: Record<MovementType, string> = {
  receipt: 'Приход',
  order: 'Заказ',
  writeoff: 'Списание',
  adjustment: 'Корректировка',
}

export const STOCK_STATE_LABELS: Record<StockState, string> = {
  in: 'В наличии',
  low: 'Заканчивается',
  out: 'Нет в наличии',
  negative: 'В минусе',
}

/** A batch counts as "expiring soon" this many days ahead. */
export const EXPIRY_SOON_DAYS = 3

export interface Warehouse {
  id: string
  name: string
}

export interface StockSettings {
  productId: string
  baseUnit: string
  minStock: number
  /** False for goods that never expire (kitchen equipment, cleaning
   * supplies, packaging) — their batches carry no expiry date. */
  tracksExpiry: boolean
  /** Days a fresh product keeps (fruit, vegetables…) — fills in a receipt's
   * expiry date. Null for packaged goods: the date comes off the pack. */
  shelfLifeDays: number | null
  /** How many base units one other sales unit holds, e.g. { коробка: 10 }. */
  unitSize: Record<string, number>
}

export interface StockBatch {
  id: string
  productId: string
  receiptId: string
  receivedAt: string
  qtyReceived: number
  qtyLeft: number
  /** Per base unit. */
  purchasePrice: number
  /** ISO date (yyyy-mm-dd); null for goods that don't expire. */
  expiresAt: string | null
}

export interface ReceiptLine {
  productId: string
  batchId: string
  /** In the product's base unit. */
  qty: number
  /** What was typed, when it wasn't the base unit ("3 коробки"). */
  entered?: { qty: number; unit: string }
  /** Per base unit. */
  purchasePrice: number
  expiresAt: string | null
}

export interface Receipt {
  id: string
  number: string
  receivedAt: string
  supplier: string
  comment: string
  postedBy: string
  lines: ReceiptLine[]
}

export interface WriteOff {
  id: string
  createdAt: string
  productId: string
  batchId: string | null
  qty: number
  reason: WriteOffReason
  comment: string
  /** Purchase value of what was written off. */
  loss: number
}

/** One row of the Списания tab and its Excel: a manual write-off, or a line
 * of an order that reached its customer ("По заказу"). */
export interface WriteOffView {
  id: string
  at: string
  productId: string | null
  name: string
  unit: string
  qty: number
  reason: WriteOffReason
  /** The comment typed on a manual write-off, or "Заказ №19 · Клиент". */
  note: string
  orderNumber: number | null
  /** orders.id for "По заказу" rows (numbers repeat across companies). */
  orderId: string | null
  /** Manual: purchase value lost. По заказу: what the customer was charged, before VAT. */
  amount: number
}

export interface Movement {
  id: string
  at: string
  productId: string
  type: MovementType
  /** + in, − out, in the base unit. */
  delta: number
  balanceAfter: number
  /** "ПР-0042", "Заказ №19", the write-off reason… */
  ref: string
}

/** Margins the sale prices follow (pricing_settings in the database). */
export interface PricingSettings {
  /** Added to the purchase price for the regular sale price, in %. */
  marginPercent: number
  /** Same for the external price; null while it's still set by hand. */
  externalMarginPercent: number | null
}

export interface WarehouseState {
  warehouses: Warehouse[]
  settings: Record<string, StockSettings>
  batches: StockBatch[]
  receipts: Receipt[]
  writeOffs: WriteOff[]
  movements: Movement[]
  pricing: PricingSettings
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** 124.5 → "124,5"; negatives get a real minus sign ("−2"). */
export function formatQty(qty: number): string {
  const s = Math.abs(qty).toLocaleString('ru-RU', { maximumFractionDigits: 3 })
  return qty < 0 ? `−${s}` : s
}

/** "10 апр" — day and short month, no trailing dot. */
export function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', '')
}

/** "14 апр, 09:20". */
export function formatDayTime(iso: string): string {
  const d = new Date(iso)
  return `${formatDay(iso)}, ${d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`
}

export function todayIso(): string {
  return toDateIso(new Date())
}

export function toDateIso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function addDays(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T00:00:00`)
  d.setDate(d.getDate() + days)
  return toDateIso(d)
}

/** Whole days from today until the date (negative once it has passed). */
export function daysUntil(dateIso: string): number {
  const today = new Date(`${todayIso()}T00:00:00`).getTime()
  return Math.round((new Date(`${dateIso}T00:00:00`).getTime() - today) / 86_400_000)
}

/** "1,2" or "1.2" → 1.2; null unless it's a number with at most [decimals] places. */
export function parseAmount(text: string, decimals: number): number | null {
  const s = text.replace(/\s/g, '').replace(',', '.')
  if (!new RegExp(`^\\d+(\\.\\d{1,${decimals}})?$`).test(s)) return null
  return Number(s)
}

/** True when an ISO timestamp falls within [from, to] (whole days, either side optional). */
export function inPeriod(iso: string, from: string, to: string): boolean {
  const day = iso.slice(0, 10)
  return (!from || day >= from) && (!to || day <= to)
}

export function periodLabel(from: string, to: string): string {
  if (from && to) return `${formatDay(from)} – ${formatDay(to)}`
  if (from) return `с ${formatDay(from)}`
  if (to) return `по ${formatDay(to)}`
  return 'за всё время'
}

// ---------------------------------------------------------------------------
// Derived values
// ---------------------------------------------------------------------------

/** Current stock: the sum of every movement, so it can go below zero. */
export function stockOf(state: WarehouseState, productId: string): number {
  let total = 0
  for (const m of state.movements) if (m.productId === productId) total += m.delta
  return Math.round(total * 1000) / 1000
}

export function stockState(stock: number, minStock: number): StockState {
  if (stock < 0) return 'negative'
  if (stock === 0) return 'out'
  if (stock < minStock) return 'low'
  return 'in'
}

/** Oldest-expiring first; batches without an expiry date go last, oldest received first. */
export function byExpiry(a: StockBatch, b: StockBatch): number {
  return (a.expiresAt ?? '9999-12-31').localeCompare(b.expiresAt ?? '9999-12-31') || a.receivedAt.localeCompare(b.receivedAt)
}

/** Batches that still hold stock, in the order stock leaves them. */
export function liveBatches(state: WarehouseState, productId: string): StockBatch[] {
  return state.batches.filter((b) => b.productId === productId && b.qtyLeft > 0).sort(byExpiry)
}

/** The nearest expiry among batches still in stock — null when none of them expires. */
export function nearestExpiry(state: WarehouseState, productId: string): string | null {
  return liveBatches(state, productId).find((b) => b.expiresAt)?.expiresAt ?? null
}

export type ExpiryTone = 'ok' | 'soon' | 'late'

export function expiryTone(dateIso: string): ExpiryTone {
  const d = daysUntil(dateIso)
  if (d < 0) return 'late'
  if (d <= EXPIRY_SOON_DAYS) return 'soon'
  return 'ok'
}

export function receiptTotal(receipt: Receipt): number {
  return receipt.lines.reduce((sum, l) => sum + l.qty * l.purchasePrice, 0)
}

export function manualWriteOffViews(state: WarehouseState, productsById: Map<string, ProductRow>): WriteOffView[] {
  return state.writeOffs.map((w) => {
    const p = productsById.get(w.productId)
    return {
      id: w.id,
      at: w.createdAt,
      productId: w.productId,
      name: p?.name ?? 'Товар удалён',
      unit: p?.unit ?? '',
      qty: w.qty,
      reason: w.reason,
      note: w.comment,
      orderNumber: null,
      orderId: null,
      amount: w.loss,
    }
  })
}

/** Every line of every delivered order — real orders from the database, even
 * while the rest of the warehouse runs on demo data. Dated by when the order
 * was placed (orders carry no delivery timestamp). */
export function orderWriteOffViews(orders: OrderRow[], items: OrderItemRow[]): WriteOffView[] {
  const delivered = new Map(orders.filter((o) => o.status === 'delivered').map((o) => [o.id, o]))
  const views: WriteOffView[] = []
  items.forEach((item, i) => {
    const order = delivered.get(item.orderId)
    if (!order || !(item.qty > 0)) return
    views.push({
      id: `order-${item.orderId}-${i}`,
      at: order.createdAt,
      productId: item.productId,
      name: item.name || 'Товар',
      unit: item.unit,
      qty: item.qty,
      reason: 'order',
      note: `Заказ ${order.companyName} №${order.orderNumber} · ${order.customer}`,
      orderNumber: order.orderNumber,
      orderId: order.id,
      amount: item.qty * item.unitPrice,
    })
  })
  return views
}

/** A receipt line as the Приход dialog hands it over for posting. */
export interface NewReceiptLine {
  productId: string
  /** In the product's base unit. */
  qty: number
  entered?: { qty: number; unit: string }
  /** Per base unit. */
  purchasePrice: number
  expiresAt: string | null
}

// ---------------------------------------------------------------------------
// Prices
// ---------------------------------------------------------------------------

/** A sale price rounded UP to a round number — the same rule the database
 * applies when a receipt is posted (round_sale_price, migration 0080): under
 * 10 000 to 100, up to 100 000 to 500, above that to 1 000. */
export function roundSalePrice(price: number): number {
  const step = price < 10_000 ? 100 : price <= 100_000 ? 500 : 1_000
  return Math.ceil(price / step) * step
}

/** The sale price a purchase price leads to at [percent] margin. */
export function salePriceFromCost(cost: number, percent: number): number {
  return roundSalePrice(cost * (1 + percent / 100))
}

// ---------------------------------------------------------------------------
// Defaults for products without saved warehouse settings
// ---------------------------------------------------------------------------

/** Typical shelf life for fresh categories (products.category is stored in
 * English — see translateCategory); anything else expiring is packaged. */
const SHELF_LIFE_BY_CATEGORY: Record<string, number> = {
  Herbs: 4,
  Vegetables: 10,
  Fruits: 12,
  Meat: 5,
  Seafood: 4,
  Dairy: 10,
  Eggs: 25,
  Bread: 3,
  'Bakery / Confectionery': 7,
  'Semi-finished Products': 30,
  Frozen: 120,
}

/** Categories whose goods don't expire at all. */
const NON_EXPIRING_CATEGORIES = new Set(['Cleaning', 'Kitchen Supplies / Disposables', 'Packaging & Disposables', 'Kitchen Equipment'])

/** Settings a product has until someone saves its own in the product card. */
export function defaultSettings(p: ProductRow): StockSettings {
  const tracksExpiry = !NON_EXPIRING_CATEGORIES.has(p.category)
  return {
    productId: p.id,
    baseUnit: p.unit,
    minStock: 0,
    tracksExpiry,
    shelfLifeDays: tracksExpiry ? (SHELF_LIFE_BY_CATEGORY[p.category] ?? null) : null,
    unitSize: {},
  }
}
