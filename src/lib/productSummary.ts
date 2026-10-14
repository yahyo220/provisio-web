// "Товары по заказам" on the Orders page: every product across a set of
// orders, added up — no per-customer breakdown. Used both for what still has
// to go out ("Нужно списать": orders not delivered yet) and for what already
// went ("Списано": delivered orders), for whichever days are picked.
import ExcelJS from 'exceljs'
import { byCatalog } from './catalogOrder'
import { formatMoney } from './format'
import { esc, printHtml } from './printOrder'
import type { OrderItemRow } from './types'
import { THIN_BORDER, triggerXlsxDownload } from './xlsxShared'

export interface SummaryRow {
  productId: string | null
  name: string
  unit: string
  total: number
  /** Current catalog price for this unit, in сум — null when unknown. */
  price: number | null
  /** What the warehouse holds right now, e.g. "12,5 кг" — '—' when unknown. */
  stock: string
}

/** Adds lines up per product *and* unit — "3 кг" and "2 коробки" of one
 * product stay separate rows. Lines without a product id group by name.
 * Rows come out in catalog order (lib/catalogOrder.ts). */
export function summarizeItems(
  items: OrderItemRow[],
  categoryOf: (productId: string) => string | undefined,
  stockOf: (productId: string) => string | undefined,
  priceOf: (productId: string, unit: string) => number | null,
): SummaryRow[] {
  const rows = new Map<string, { productId: string | null; name: string; unit: string; total: number }>()
  for (const item of items) {
    if (!(item.qty > 0)) continue
    const unit = item.unit.trim()
    const key = `${item.productId ?? `name:${item.name.trim().toLowerCase()}`}|${unit}`
    const row = rows.get(key) ?? { productId: item.productId, name: item.name, unit, total: 0 }
    row.total += item.qty
    rows.set(key, row)
  }
  const summed = [...rows.values()].map((r) => ({
    productId: r.productId,
    name: r.name,
    unit: r.unit,
    total: Math.round(r.total * 1000) / 1000,
    price: r.productId ? priceOf(r.productId, r.unit) : null,
    stock: (r.productId && stockOf(r.productId)) || '—',
  }))
  return byCatalog(summed, (r) => (r.productId ? categoryOf(r.productId) : undefined), (r) => r.name)
}

export function formatSummaryQty(n: number): string {
  return n.toLocaleString('ru-RU', { maximumFractionDigits: 3 })
}

export function printProductSummary(title: string, subtitle: string, rows: SummaryRow[], unitLabel: (u: string) => string) {
  printHtml(`<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  @page { size: A4; margin: 16mm; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color: #111; font-size: 12pt; }
  h1 { font-size: 18pt; margin: 0 0 6px; }
  .sub { color: #555; font-size: 10pt; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #999; padding: 6px 8px; text-align: left; }
  th { background: #eee; font-size: 10pt; }
  .num { text-align: right; white-space: nowrap; font-weight: 600; }
  .check { width: 18px; text-align: center; }
  .stock { font-weight: 400; color: #444; }
  .foot { margin-top: 12px; font-size: 9pt; color: #666; }
</style></head>
<body>
  <h1>${esc(title)}</h1>
  <div class="sub">${esc(subtitle)}</div>
  <table>
    <thead><tr><th class="check"></th><th>№</th><th>Товар</th><th>Ед.</th><th class="num">Количество</th><th class="num stock">На складе</th><th class="num">Цена</th></tr></thead>
    <tbody>${rows
      .map(
        (r, i) =>
          `<tr><td class="check">☐</td><td>${i + 1}</td><td>${esc(r.name)}</td><td>${esc(unitLabel(r.unit))}</td><td class="num">${esc(formatSummaryQty(r.total))}</td><td class="num stock">${esc(r.stock)}</td><td class="num stock">${r.price != null ? esc(formatMoney(r.price)) : '—'}</td></tr>`,
      )
      .join('')}</tbody>
  </table>
  <div class="foot">Позиций: ${rows.length}. Напечатано ${esc(new Date().toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }))}.</div>
</body></html>`)
}

export async function downloadProductSummaryExcel(title: string, subtitle: string, rows: SummaryRow[], unitLabel: (u: string) => string, filename: string) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Товары')
  ws.columns = [{ width: 6 }, { width: 40 }, { width: 10 }, { width: 14 }, { width: 14 }, { width: 16 }]
  ws.getCell(1, 1).value = title
  ws.getCell(1, 1).font = { bold: true, size: 14 }
  ws.mergeCells(1, 1, 1, 6)
  ws.getCell(2, 1).value = subtitle
  ws.getCell(2, 1).font = { size: 10, color: { argb: 'FF55523F' } }
  ws.mergeCells(2, 1, 2, 6)
  const headers = ['№', 'Товар', 'Ед.', 'Количество', 'На складе', 'Цена, сум']
  headers.forEach((h, i) => {
    const cell = ws.getCell(4, i + 1)
    cell.value = h
    cell.font = { bold: true, size: 11 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EFE9' } }
    cell.alignment = { horizontal: i >= 3 ? 'right' : 'left' }
    cell.border = THIN_BORDER
  })
  rows.forEach((r, i) => {
    const values: (string | number)[] = [i + 1, r.name, unitLabel(r.unit), r.total, r.stock, r.price ?? '—']
    values.forEach((v, c) => {
      const cell = ws.getCell(5 + i, c + 1)
      cell.value = v
      cell.font = { size: 11 }
      cell.alignment = { horizontal: c >= 3 ? 'right' : 'left' }
      if (c === 3) cell.numFmt = '#,##0.###'
      if (c === 5) cell.numFmt = '#,##0'
      cell.border = THIN_BORDER
    })
  })
  ws.views = [{ state: 'frozen', ySplit: 4 }]
  await triggerXlsxDownload(wb, filename)
}
