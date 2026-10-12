// Warehouse (Склад) — data model, demo data and the math every tab shares.
//
// The database has no warehouse tables yet (stage 1 of the plan is on hold),
// so the Склад page runs on DEMO data: the real product catalog, with stock,
// batches, receipts and write-offs generated from each product's id. The
// numbers are random but stable across reloads; receipts and write-offs
// posted on the page update this in-memory state only. Swapping in the real
// tables later means replacing createDemoWarehouse() — the page and every
// helper below keep working on the same shapes.
//
// Rules the screens follow (agreed with the business, see the warehouse plan):
// - stock is kept in each product's base unit (кг for weighed goods, шт /
//   бутылка otherwise); other sales units (коробка) may carry a "kg per unit";
// - every receipt line is a batch with a purchase price and an expiry date;
//   stock leaves the oldest-expiring batch first;
// - stock may go negative (an order picked up with nothing left).

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

/** True until the warehouse tables exist: the page shows a demo banner and
 * every Excel report says the numbers are test data. */
export const WAREHOUSE_IS_DEMO = true

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

export interface WarehouseState {
  warehouses: Warehouse[]
  settings: Record<string, StockSettings>
  batches: StockBatch[]
  receipts: Receipt[]
  writeOffs: WriteOff[]
  movements: Movement[]
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
      note: `Заказ №${order.orderNumber} · ${order.customer}`,
      orderNumber: order.orderNumber,
      amount: item.qty * item.unitPrice,
    })
  })
  return views
}

// ---------------------------------------------------------------------------
// Posting (in-memory for now)
// ---------------------------------------------------------------------------

let idCounter = 0
function nextId(prefix: string): string {
  idCounter += 1
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`
}

export interface NewReceiptLine {
  productId: string
  qty: number
  entered?: { qty: number; unit: string }
  purchasePrice: number
  expiresAt: string | null
}

export function postReceipt(
  state: WarehouseState,
  input: { receivedAt: string; supplier: string; comment: string; lines: NewReceiptLine[] },
): { state: WarehouseState; receipt: Receipt } {
  const receiptId = nextId('rc')
  const number = `ПР-${String(state.receipts.length + 1).padStart(4, '0')}`
  const batches: StockBatch[] = []
  const movements: Movement[] = []
  const lines: ReceiptLine[] = []
  const balance = new Map<string, number>()
  for (const l of input.lines) {
    const batchId = nextId('bt')
    batches.push({
      id: batchId,
      productId: l.productId,
      receiptId,
      receivedAt: input.receivedAt,
      qtyReceived: l.qty,
      qtyLeft: l.qty,
      purchasePrice: l.purchasePrice,
      expiresAt: l.expiresAt,
    })
    lines.push({ ...l, batchId })
    const before = balance.get(l.productId) ?? stockOf(state, l.productId)
    const after = before + l.qty
    balance.set(l.productId, after)
    movements.push({ id: nextId('mv'), at: input.receivedAt, productId: l.productId, type: 'receipt', delta: l.qty, balanceAfter: after, ref: number })
  }
  const receipt: Receipt = { id: receiptId, number, receivedAt: input.receivedAt, supplier: input.supplier, comment: input.comment, postedBy: 'Админ', lines }
  return {
    receipt,
    state: {
      ...state,
      batches: [...state.batches, ...batches],
      receipts: [receipt, ...state.receipts],
      movements: [...movements, ...state.movements],
    },
  }
}

export function postWriteOff(
  state: WarehouseState,
  input: { productId: string; batchId: string | null; qty: number; reason: WriteOffReason; comment: string },
): WarehouseState {
  const at = new Date().toISOString()
  const batch = input.batchId ? state.batches.find((b) => b.id === input.batchId) : undefined
  const price = batch?.purchasePrice ?? liveBatches(state, input.productId)[0]?.purchasePrice ?? 0
  const after = stockOf(state, input.productId) - input.qty
  const reasonLabel = WRITE_OFF_REASONS.find((r) => r.value === input.reason)?.label ?? 'Списание'
  return {
    ...state,
    batches: state.batches.map((b) => (b.id === input.batchId ? { ...b, qtyLeft: Math.max(0, b.qtyLeft - input.qty) } : b)),
    writeOffs: [
      { id: nextId('wo'), createdAt: at, productId: input.productId, batchId: input.batchId, qty: input.qty, reason: input.reason, comment: input.comment, loss: input.qty * price },
      ...state.writeOffs,
    ],
    movements: [{ id: nextId('mv'), at, productId: input.productId, type: 'writeoff', delta: -input.qty, balanceAfter: after, ref: reasonLabel }, ...state.movements],
  }
}

export function updateSettings(state: WarehouseState, settings: StockSettings): WarehouseState {
  return { ...state, settings: { ...state.settings, [settings.productId]: settings } }
}

// ---------------------------------------------------------------------------
// Demo data
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

const DEMO_SUPPLIERS = ['ООО «Агрофуд»', 'ИП Расулов', 'Молторг', 'Ташкент Мит', 'Fresh Valley']

/** Small seeded PRNG (mulberry32), so a product always gets the same demo numbers. */
function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  let a = h >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function isWeighed(unit: string): boolean {
  return /кг|kg/i.test(unit)
}

function roundQty(n: number, weighed: boolean): number {
  return weighed ? Math.round(n * 10) / 10 : Math.round(n)
}

/**
 * Demo warehouse built from the real catalog. Every receipt is a batch;
 * orders then take stock from the oldest-expiring batch first, a few batches
 * get written off, and a handful of products end up low, empty or negative
 * so every status shows up on the page.
 */
export function createDemoWarehouse(products: ProductRow[], orderNumbers: number[]): WarehouseState {
  const today = todayIso()
  const settings: Record<string, StockSettings> = {}
  const batches: StockBatch[] = []
  const writeOffs: WriteOff[] = []
  const movements: Movement[] = []
  const receiptsByKey = new Map<string, Receipt>()
  const orderRefs = orderNumbers.length > 0 ? orderNumbers : [1, 2, 3]

  for (const p of products) {
    if (!p.active) continue
    const rnd = seededRandom(p.id)
    const weighed = isWeighed(p.unit)
    const tracksExpiry = !NON_EXPIRING_CATEGORIES.has(p.category)
    const shelf = tracksExpiry ? (SHELF_LIFE_BY_CATEGORY[p.category] ?? null) : null
    const unitSize: Record<string, number> = {}
    if (weighed) {
      for (const u of p.units) if (/box|короб|ящик/i.test(u)) unitSize[u] = 10
    }
    const minStock = roundQty(weighed ? 10 + rnd() * 40 : 6 + rnd() * 30, weighed)
    settings[p.id] = { productId: p.id, baseUnit: p.unit, minStock, tracksExpiry, shelfLifeDays: shelf, unitSize }

    // 1–3 receipts over the last month.
    const receiptCount = 1 + Math.floor(rnd() * 3)
    const myBatches: StockBatch[] = []
    for (let i = 0; i < receiptCount; i++) {
      // Fresh goods were delivered recently enough that most are still good.
      const daysAgo = Math.floor(rnd() * (shelf != null ? Math.max(2, Math.round(shelf * 1.15)) : 28)) + 1
      const receivedDate = addDays(today, -daysAgo)
      const receivedAt = `${receivedDate}T${String(8 + Math.floor(rnd() * 8)).padStart(2, '0')}:${String(Math.floor(rnd() * 6) * 10).padStart(2, '0')}:00`
      const supplier = DEMO_SUPPLIERS[Math.floor(rnd() * DEMO_SUPPLIERS.length)]
      const key = `${receivedDate}|${supplier}`
      let receipt = receiptsByKey.get(key)
      if (!receipt) {
        receipt = { id: `demo-rc-${receiptsByKey.size}`, number: '', receivedAt, supplier, comment: '', postedBy: 'Админ', lines: [] }
        receiptsByKey.set(key, receipt)
      }
      const qty = roundQty(weighed ? 15 + rnd() * 120 : 12 + rnd() * 80, weighed)
      const salePrice = Number(String(p.price).replace(/[^\d.]/g, '')) || 10_000
      const purchasePrice = Math.round((salePrice * (0.62 + rnd() * 0.2)) / 100) * 100
      const life = tracksExpiry ? (shelf ?? 90 + Math.floor(rnd() * 450)) : null
      const batch: StockBatch = {
        id: `demo-bt-${p.id}-${i}`,
        productId: p.id,
        receiptId: receipt.id,
        receivedAt,
        qtyReceived: qty,
        qtyLeft: qty,
        purchasePrice,
        expiresAt: life != null ? addDays(receivedDate, life) : null,
      }
      myBatches.push(batch)
      const boxUnit = Object.keys(unitSize)[0]
      receipt.lines.push({ productId: p.id, batchId: batch.id, qty, purchasePrice, expiresAt: batch.expiresAt, ...(boxUnit && rnd() < 0.5 ? { entered: { qty: Math.round((qty / unitSize[boxUnit]) * 10) / 10, unit: boxUnit } } : {}) })
    }

    // Timeline: receipts in, then orders out (oldest-expiring batch first).
    const events: { at: string; type: MovementType; delta: number; ref: string }[] = myBatches.map((b) => ({ at: b.receivedAt, type: 'receipt' as const, delta: b.qtyReceived, ref: '' }))
    const received = myBatches.reduce((s, b) => s + b.qtyReceived, 0)
    // Some products sell out or even go negative; most keep stock.
    const roll = rnd()
    const consumeShare = roll < 0.03 ? 1.08 : roll < 0.07 ? 1 : roll < 0.2 ? 0.85 + rnd() * 0.12 : 0.2 + rnd() * 0.5
    let toConsume = roundQty(received * consumeShare, weighed)
    const orderCount = 2 + Math.floor(rnd() * 5)
    const firstReceipt = myBatches.map((b) => b.receivedAt).sort()[0]
    for (let i = 0; i < orderCount && toConsume > 0; i++) {
      const qty = i === orderCount - 1 ? toConsume : roundQty(Math.min(toConsume, (toConsume / (orderCount - i)) * (0.6 + rnd() * 0.8)), weighed)
      if (qty <= 0) continue
      toConsume = roundQty(toConsume - qty, weighed)
      const at = new Date(new Date(firstReceipt).getTime() + (i + 1) * (Date.now() - new Date(firstReceipt).getTime()) / (orderCount + 1)).toISOString()
      events.push({ at, type: 'order', delta: -qty, ref: `Заказ №${orderRefs[Math.floor(rnd() * orderRefs.length)]}` })
    }
    events.sort((a, b) => a.at.localeCompare(b.at))

    let balance = 0
    for (const e of events) {
      if (e.type === 'order') {
        let left = -e.delta
        for (const b of [...myBatches].sort(byExpiry)) {
          if (left <= 0) break
          const take = Math.min(b.qtyLeft, left)
          b.qtyLeft = roundQty(b.qtyLeft - take, weighed)
          left = roundQty(left - take, weighed)
        }
      }
      balance = roundQty(balance + e.delta, weighed)
      movements.push({ id: `demo-mv-${p.id}-${movements.length}`, at: e.at, productId: p.id, type: e.type, delta: e.delta, balanceAfter: balance, ref: e.ref })
    }

    // Now and then, part of a batch spoiled.
    const spoilable = myBatches.find((b) => b.qtyLeft > 2)
    if (spoilable && rnd() < 0.12) {
      const qty = roundQty(Math.min(spoilable.qtyLeft, 1 + rnd() * 5), weighed)
      spoilable.qtyLeft = roundQty(spoilable.qtyLeft - qty, weighed)
      balance = roundQty(balance - qty, weighed)
      const reason: WriteOffReason = spoilable.expiresAt && daysUntil(spoilable.expiresAt) < 0 ? 'expired' : rnd() < 0.7 ? 'spoiled' : 'damaged'
      const at = new Date(Date.now() - Math.floor(rnd() * 6 + 1) * 86_400_000).toISOString()
      writeOffs.push({ id: `demo-wo-${p.id}`, createdAt: at, productId: p.id, batchId: spoilable.id, qty, reason, comment: '', loss: qty * spoilable.purchasePrice })
      movements.push({ id: `demo-mv-${p.id}-wo`, at, productId: p.id, type: 'writeoff', delta: -qty, balanceAfter: balance, ref: WRITE_OFF_REASONS.find((r) => r.value === reason)!.label })
    }

    batches.push(...myBatches)
  }

  const receipts = [...receiptsByKey.values()].sort((a, b) => a.receivedAt.localeCompare(b.receivedAt))
  receipts.forEach((r, i) => {
    r.number = `ПР-${String(i + 1).padStart(4, '0')}`
  })
  const numberById = new Map(receipts.map((r) => [r.id, r.number]))
  for (const m of movements) {
    if (m.type === 'receipt') {
      const batch = batches.find((b) => b.productId === m.productId && b.receivedAt === m.at)
      m.ref = (batch && numberById.get(batch.receiptId)) ?? 'Приход'
    }
  }

  return {
    warehouses: [{ id: 'main', name: 'Основной склад' }],
    settings,
    batches,
    receipts: receipts.reverse(),
    writeOffs: writeOffs.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    movements: movements.sort((a, b) => b.at.localeCompare(a.at)),
  }
}
