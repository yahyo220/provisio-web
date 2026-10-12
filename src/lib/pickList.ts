// Courier pick list ("сборочный лист"): every product across the orders a
// courier is about to collect, added up, so the warehouse hands it over in
// one go; each line keeps its per-order split so the courier can give every
// customer their own order afterwards (with that order's накладная).
// Same rules as the app's lib/utils/pick_list.dart — keep the two in step.
import ExcelJS from 'exceljs'
import type { PickSourceLine } from './api'
import { esc, printHtml } from './printOrder'
import { THIN_BORDER, triggerXlsxDownload } from './xlsxShared'

export interface PickShare {
  orderNumber: number | null
  qty: number
}

export interface PickRow {
  name: string
  unit: string
  total: number
  shares: PickShare[]
}

/** An order on the pick list, for the header and the closing order table. */
export interface PickOrder {
  id: string
  orderNumber: number | null
  customer: string
  address: string
}

const round3 = (n: number) => Math.round(n * 1000) / 1000

/** Adds lines up per product *and* unit — "3 кг" and "2 коробки" of one
 * product stay separate rows. Lines without a product id group by name.
 * Rows sorted by name; shares by order number. */
export function buildPickList(lines: PickSourceLine[], orderNumbers: Map<string, number | null>): PickRow[] {
  const rows = new Map<string, { name: string; unit: string; total: number; byOrder: Map<string, number> }>()
  for (const l of lines) {
    if (!(l.qty > 0)) continue
    const unit = l.unit.trim()
    const key = `${l.productId ?? `name:${l.name.trim().toLowerCase()}`}|${unit}`
    const row = rows.get(key) ?? { name: l.name, unit, total: 0, byOrder: new Map<string, number>() }
    row.total += l.qty
    row.byOrder.set(l.orderId, (row.byOrder.get(l.orderId) ?? 0) + l.qty)
    rows.set(key, row)
  }
  return [...rows.values()]
    .map((r) => ({
      name: r.name,
      unit: r.unit,
      total: round3(r.total),
      shares: [...r.byOrder.entries()]
        .map(([orderId, qty]) => ({ orderNumber: orderNumbers.get(orderId) ?? null, qty: round3(qty) }))
        .sort((a, b) => (a.orderNumber ?? Infinity) - (b.orderNumber ?? Infinity)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
}

export function formatPickQty(n: number): string {
  return n.toLocaleString('ru-RU', { maximumFractionDigits: 3 })
}

/** "№12: 20 · №15: 17,5". */
export function formatShares(shares: PickShare[]): string {
  return shares.map((s) => `№${s.orderNumber ?? '—'}: ${formatPickQty(s.qty)}`).join(' · ')
}

function today(): string {
  return new Date().toLocaleDateString('ru-RU')
}

export function printPickList(courier: string, orders: PickOrder[], rows: PickRow[], unitLabel: (u: string) => string) {
  const orderList = orders.map((o) => `№${o.orderNumber ?? '—'}`).join(', ')
  printHtml(`<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>Сборочный лист — ${esc(courier)}</title>
<style>
  @page { size: A4; margin: 16mm; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color: #111; font-size: 12pt; }
  h1 { font-size: 18pt; margin: 0 0 12px; }
  h2 { font-size: 13pt; margin: 20px 0 8px; }
  .info { border-collapse: collapse; margin-bottom: 16px; }
  .info td { padding: 2px 16px 2px 0; vertical-align: top; }
  .info td:first-child { color: #555; white-space: nowrap; }
  table.grid { width: 100%; border-collapse: collapse; }
  table.grid th, table.grid td { border: 1px solid #999; padding: 6px 8px; text-align: left; vertical-align: top; }
  table.grid th { background: #eee; font-size: 10pt; }
  .num { text-align: right !important; white-space: nowrap; font-weight: 600; }
  .split { font-size: 10pt; color: #444; }
  .check { width: 18px; }
  .foot { margin-top: 16px; font-size: 9pt; color: #666; }
</style></head>
<body>
  <h1>Сборочный лист</h1>
  <table class="info">
    <tr><td>Доставщик</td><td>${esc(courier)}</td></tr>
    <tr><td>Дата</td><td>${esc(today())}</td></tr>
    <tr><td>Заказов</td><td>${orders.length}: ${esc(orderList)}</td></tr>
  </table>
  <table class="grid">
    <thead><tr><th class="check"></th><th>№</th><th>Товар</th><th>Ед.</th><th class="num">Всего</th><th>По заказам</th></tr></thead>
    <tbody>${rows
      .map(
        (r, i) => `<tr><td class="check">☐</td><td>${i + 1}</td><td>${esc(r.name)}</td><td>${esc(unitLabel(r.unit))}</td><td class="num">${esc(formatPickQty(r.total))}</td><td class="split">${esc(formatShares(r.shares))}</td></tr>`,
      )
      .join('')}</tbody>
  </table>
  <h2>Заказы в этом листе</h2>
  <table class="grid">
    <thead><tr><th>Заказ</th><th>Клиент</th><th>Адрес доставки</th></tr></thead>
    <tbody>${orders.map((o) => `<tr><td>№${o.orderNumber ?? '—'}</td><td>${esc(o.customer)}</td><td>${esc(o.address)}</td></tr>`).join('')}</tbody>
  </table>
  <div class="foot">Позиций: ${rows.length}. Цены в этом документе не указываются — каждому клиенту выдаётся его заказ по накладной.</div>
</body></html>`)
}

export async function downloadPickListExcel(courier: string, orders: PickOrder[], rows: PickRow[], unitLabel: (u: string) => string) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Сборочный лист')
  ws.columns = [{ width: 6 }, { width: 34 }, { width: 10 }, { width: 12 }, { width: 46 }]
  const put = (r: number, c: number, v: string | number, opts: { bold?: boolean; fill?: boolean; right?: boolean; border?: boolean; numFmt?: string } = {}) => {
    const cell = ws.getCell(r, c)
    cell.value = v
    cell.font = { size: 11, bold: opts.bold }
    cell.alignment = { horizontal: opts.right ? 'right' : 'left', vertical: 'top', wrapText: c === 5 }
    if (opts.border) cell.border = THIN_BORDER
    if (opts.fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EFE9' } }
    if (opts.numFmt) cell.numFmt = opts.numFmt
  }
  put(1, 1, 'Сборочный лист', { bold: true })
  ws.getCell(1, 1).font = { bold: true, size: 14 }
  put(2, 1, `Доставщик: ${courier} · Дата: ${today()} · Заказов: ${orders.length} (${orders.map((o) => `№${o.orderNumber ?? '—'}`).join(', ')})`)
  ws.mergeCells(2, 1, 2, 5)
  let r = 4
  ;['№', 'Товар', 'Ед.', 'Всего', 'По заказам'].forEach((h, i) => put(r, i + 1, h, { bold: true, fill: true, border: true, right: i === 3 }))
  rows.forEach((row, i) => {
    r += 1
    put(r, 1, i + 1, { border: true })
    put(r, 2, row.name, { border: true })
    put(r, 3, unitLabel(row.unit), { border: true })
    put(r, 4, row.total, { border: true, right: true, numFmt: '#,##0.###' })
    put(r, 5, formatShares(row.shares), { border: true })
  })
  r += 2
  put(r, 1, 'Заказы в этом листе', { bold: true })
  r += 1
  ;['Заказ', 'Клиент', '', '', 'Адрес доставки'].forEach((h, i) => put(r, i + 1, h, { bold: true, fill: true, border: true }))
  ws.mergeCells(r, 2, r, 4)
  for (const o of orders) {
    r += 1
    put(r, 1, `№${o.orderNumber ?? '—'}`, { border: true })
    put(r, 2, o.customer, { border: true })
    ws.mergeCells(r, 2, r, 4)
    put(r, 5, o.address, { border: true })
  }
  ws.views = [{ state: 'frozen', ySplit: 4 }]
  const stamp = new Date().toISOString().slice(0, 10)
  await triggerXlsxDownload(wb, `Сборочный_лист_${courier.replace(/\s+/g, '_')}_${stamp}.xlsx`)
}
