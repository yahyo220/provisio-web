// Склад — reading and writing the warehouse tables (migration 0080). Reads
// build the same WarehouseState the page's tabs already work on; postings go
// through database functions so batches, the journal and sale prices change
// in one transaction.
import { supabase } from './supabase'
import type { ProductRow } from './types'
import {
  defaultSettings,
  type Movement,
  type MovementType,
  type NewReceiptLine,
  type Receipt,
  type StockBatch,
  type StockSettings,
  type WarehouseState,
  type WriteOff,
  type WriteOffReason,
} from './warehouse'

const PAGE_SIZE = 1000

function db() {
  if (!supabase) throw new Error('Supabase is not configured — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
  return supabase
}

/** Every row of [table], page by page (PostgREST caps a response at 1000);
 * [uniqueCol] keeps the paging order stable so no row repeats or goes missing. */
async function allRows<T>(table: string, orderBy: string, uniqueCol = 'id'): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await db()
      .from(table)
      .select('*')
      .order(orderBy, { ascending: false })
      .order(uniqueCol)
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    rows.push(...((data ?? []) as T[]))
    if (!data || data.length < PAGE_SIZE) return rows
  }
}

interface SettingsRow {
  product_id: string
  min_stock: number
  tracks_expiry: boolean
  shelf_life_days: number | null
  unit_size: Record<string, number> | null
}
interface ReceiptRow {
  id: string
  number: string
  received_at: string
  supplier: string
  comment: string
  posted_by: string
}
interface BatchRow {
  id: string
  receipt_id: string
  product_id: string
  line_no: number
  received_at: string
  qty_received: number
  qty_left: number
  purchase_price: number
  expires_at: string | null
  entered_qty: number | null
  entered_unit: string | null
}
interface WriteOffRow {
  id: string
  created_at: string
  product_id: string
  batch_id: string | null
  qty: number
  reason: WriteOffReason
  comment: string
  loss: number
}
interface MovementRow {
  id: string
  at: string
  product_id: string
  type: MovementType
  delta: number
  balance_after: number
  ref: string
}

/** The whole warehouse, for the products the page shows. */
export async function loadWarehouse(products: ProductRow[]): Promise<WarehouseState> {
  const [warehouses, settingRows, receiptRows, batchRows, writeOffRows, movementRows, pricingRows] = await Promise.all([
    db().from('warehouses').select('id, name').order('created_at'),
    allRows<SettingsRow>('warehouse_settings', 'updated_at', 'product_id'),
    allRows<ReceiptRow>('warehouse_receipts', 'received_at'),
    allRows<BatchRow>('warehouse_batches', 'received_at'),
    allRows<WriteOffRow>('warehouse_write_offs', 'created_at'),
    allRows<MovementRow>('warehouse_movements', 'at'),
    db().from('pricing_settings').select('key, value'),
  ])
  if (warehouses.error) throw warehouses.error
  if (pricingRows.error) throw pricingRows.error

  const saved = new Map(settingRows.map((r) => [r.product_id, r]))
  const settings: Record<string, StockSettings> = {}
  for (const p of products) {
    const base = defaultSettings(p)
    const r = saved.get(p.id)
    settings[p.id] = r
      ? {
          ...base,
          minStock: Number(r.min_stock),
          tracksExpiry: r.tracks_expiry,
          shelfLifeDays: r.shelf_life_days,
          unitSize: Object.fromEntries(Object.entries(r.unit_size ?? {}).map(([u, n]) => [u, Number(n)])),
        }
      : base
  }

  const batches: StockBatch[] = batchRows.map((b) => ({
    id: b.id,
    productId: b.product_id,
    receiptId: b.receipt_id,
    receivedAt: b.received_at,
    qtyReceived: Number(b.qty_received),
    qtyLeft: Number(b.qty_left),
    purchasePrice: Number(b.purchase_price),
    expiresAt: b.expires_at,
  }))

  const linesByReceipt = new Map<string, BatchRow[]>()
  for (const b of batchRows) linesByReceipt.set(b.receipt_id, [...(linesByReceipt.get(b.receipt_id) ?? []), b])
  const receipts: Receipt[] = receiptRows.map((r) => ({
    id: r.id,
    number: r.number,
    receivedAt: r.received_at,
    supplier: r.supplier,
    comment: r.comment,
    postedBy: r.posted_by,
    lines: (linesByReceipt.get(r.id) ?? [])
      .sort((a, b) => a.line_no - b.line_no)
      .map((b) => ({
        productId: b.product_id,
        batchId: b.id,
        qty: Number(b.qty_received),
        ...(b.entered_qty != null && b.entered_unit ? { entered: { qty: Number(b.entered_qty), unit: b.entered_unit } } : {}),
        purchasePrice: Number(b.purchase_price),
        expiresAt: b.expires_at,
      })),
  }))

  const writeOffs: WriteOff[] = writeOffRows.map((w) => ({
    id: w.id,
    createdAt: w.created_at,
    productId: w.product_id,
    batchId: w.batch_id,
    qty: Number(w.qty),
    reason: w.reason,
    comment: w.comment,
    loss: Number(w.loss),
  }))

  const movements: Movement[] = movementRows.map((m) => ({
    id: m.id,
    at: m.at,
    productId: m.product_id,
    type: m.type,
    delta: Number(m.delta),
    balanceAfter: Number(m.balance_after),
    ref: m.ref,
  }))

  const pricing = new Map((pricingRows.data ?? []).map((r: { key: string; value: number | null }) => [r.key, r.value]))
  const margin = pricing.get('margin_percent')
  const external = pricing.get('external_margin_percent')

  return {
    warehouses: (warehouses.data ?? []) as { id: string; name: string }[],
    settings,
    batches,
    receipts,
    writeOffs,
    movements,
    pricing: {
      marginPercent: margin != null ? Number(margin) : 12,
      externalMarginPercent: external != null ? Number(external) : null,
    },
  }
}

export interface PriceChange {
  productId: string
  name: string
  oldPrice: number
  newPrice: number
}

/** Posts a receipt; the database raises the sale prices it affects. */
export async function postReceiptDb(input: {
  receivedAt: string
  supplier: string
  comment: string
  lines: NewReceiptLine[]
}): Promise<{ number: string; lines: number; priceChanges: PriceChange[] }> {
  const { data, error } = await db().rpc('warehouse_post_receipt', {
    // The dialog gives local wall-clock time ("2026-10-24T09:30:00").
    p_received_at: new Date(input.receivedAt).toISOString(),
    p_supplier: input.supplier,
    p_comment: input.comment,
    p_lines: input.lines.map((l) => ({
      product_id: l.productId,
      qty: l.qty,
      purchase_price: l.purchasePrice,
      expires_at: l.expiresAt,
      entered_qty: l.entered?.qty ?? null,
      entered_unit: l.entered?.unit ?? null,
    })),
  })
  if (error) throw error
  const result = data as { number: string; lines: number; price_changes: { product_id: string; name: string; old: number; new: number }[] }
  return {
    number: result.number,
    lines: result.lines,
    priceChanges: (result.price_changes ?? []).map((c) => ({ productId: c.product_id, name: c.name, oldPrice: Number(c.old), newPrice: Number(c.new) })),
  }
}

export async function postWriteOffsDb(
  inputs: { productId: string; batchId: string | null; qty: number; reason: WriteOffReason; comment: string }[],
): Promise<void> {
  const { error } = await db().rpc('warehouse_post_write_offs', {
    p_items: inputs.map((i) => ({ product_id: i.productId, batch_id: i.batchId, qty: i.qty, reason: i.reason, comment: i.comment })),
  })
  if (error) throw error
}

export async function saveSettingsDb(s: StockSettings): Promise<void> {
  const { error } = await db().from('warehouse_settings').upsert({
    product_id: s.productId,
    min_stock: s.minStock,
    tracks_expiry: s.tracksExpiry,
    shelf_life_days: s.shelfLifeDays,
    unit_size: s.unitSize,
    updated_at: new Date().toISOString(),
  })
  if (error) throw error
}
