// Freshline — two накладная variants beyond the plain one in
// exportOrderExcel.ts, both reachable from the Analytics page:
//   1. One order, with a Сумма column + "всего к оплате" total (matches
//      the same header block as exportOrderExcel.ts's накладная, just with
//      price added back).
//   2. A period summary for one customer — one row per order (date, order
//      number, units, sum without VAT, VAT, order total) plus a grand
//      "Итого" row. This one is a real merge template (weeklyInvoiceTemplate
//      below) rather than hand-built styling — see downloadWeeklyInvoiceExcel.
import ExcelJS from 'exceljs'
import type { CustomerRow, OrderItemRow, OrderRow, ProductRow } from './types'
import type { OrderLineItem } from './data'
import { MEDIUM_BORDER, triggerXlsxDownload } from './xlsxShared'
import weeklyInvoiceTemplateUrl from '../assets/templates/weekly-invoice-template.xlsx?url'

// Matches the app's own CartController.kVatRate (lib/state/cart_controller.dart) —
// keep the two in sync if this ever changes.
export const VAT_RATE = 0.12

function addLabelRow(ws: ExcelJS.Worksheet, rowIndex: number, span: number, text: string, bold: boolean) {
  ws.mergeCells(rowIndex, 1, rowIndex, span)
  const cell = ws.getCell(rowIndex, 1)
  cell.value = text
  cell.font = { name: 'Calibri', size: 11, bold }
  cell.alignment = { horizontal: 'left', vertical: bold ? 'top' : undefined }
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** Variant 1 — one order, with price. */
export async function downloadOrderExcelWithPrice(
  order: OrderRow,
  customer: CustomerRow | undefined,
  lineItems: OrderLineItem[],
) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Накладная')
  ws.columns = [{ width: 7.14 }, { width: 34.29 }, { width: 18.14 }, {}, { width: 11.43 }, { width: 15 }]

  addLabelRow(ws, 1, 2, `Номер накладной: ${order.orderNumber}`, false)
  addLabelRow(ws, 2, 2, `Организация: Freshline`, false)
  addLabelRow(ws, 3, 2, `Организация: ${customer?.companyName || '—'}`, true)
  addLabelRow(ws, 4, 2, `Дата заявки: ${formatDate(order.createdAt)}`, true)
  addLabelRow(ws, 5, 2, `Должность: ${customer?.staffRole || '—'}`, true)
  addLabelRow(ws, 6, 2, `Контрагент: ${customer?.contact || customer?.name || order.customer}`, true)
  addLabelRow(ws, 7, 2, `Телефон: ${customer?.phone || '—'}`, true)

  const headerRow = 8
  const headers: [number, string][] = [
    [1, '№'],
    [2, 'Название'],
    [3, 'Категория'],
    [4, 'Кол_во'],
    [5, 'Кол-во'],
    [6, 'Сумма'],
  ]
  for (const [col, text] of headers) {
    const cell = ws.getCell(headerRow, col)
    cell.value = text
    cell.font = { name: 'sans-serif', size: 8, bold: true }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
  }
  for (let col = 1; col <= 6; col++) {
    const cell = ws.getCell(headerRow, col)
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD5D5D5' } }
    cell.border = MEDIUM_BORDER
  }

  const aligns: Record<number, 'left' | 'right' | 'center'> = { 1: 'right', 2: 'left', 3: 'left', 4: 'left', 5: 'right', 6: 'right' }
  let grandTotal = 0
  lineItems.forEach((line, i) => {
    const r = headerRow + 1 + i
    const sum = line.qty * line.unitPrice
    grandTotal += sum
    const values: Record<number, string | number> = {
      1: i + 1,
      2: line.name,
      3: line.category,
      4: line.unit,
      5: line.qty,
      6: sum,
    }
    for (let col = 1; col <= 6; col++) {
      const cell = ws.getCell(r, col)
      cell.value = values[col]
      cell.font = { name: 'sans-serif', size: 8 }
      cell.alignment = { horizontal: aligns[col], vertical: 'top' }
      cell.border = MEDIUM_BORDER
      if (col === 1 || col === 5 || col === 6) cell.numFmt = '#,##0'
    }
  })

  const totalRow = headerRow + 1 + lineItems.length
  ws.mergeCells(totalRow, 1, totalRow, 2)
  const totalLabel = ws.getCell(totalRow, 1)
  totalLabel.value = 'всего к оплате'
  totalLabel.font = { name: 'sans-serif', size: 8, bold: true }
  totalLabel.alignment = { horizontal: 'center', vertical: 'middle' }
  totalLabel.border = MEDIUM_BORDER
  const totalValue = ws.getCell(totalRow, 6)
  totalValue.value = grandTotal
  totalValue.numFmt = '#,##0'
  totalValue.font = { name: 'sans-serif', size: 8 }
  totalValue.alignment = { horizontal: 'center', vertical: 'middle' }
  totalValue.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF92D050' } }
  totalValue.border = MEDIUM_BORDER

  await triggerXlsxDownload(wb, `Накладная №${order.orderNumber} (с ценой).xlsx`)
}

// The real merge template (weekly-invoice-template.xlsx, embedded unmodified
// under src/assets/templates/) uses `<order>`/`<product>…</product>` tags and
// `[bracket]` placeholders — the convention of whatever external tool the
// business used to design накладные. It is never edited: the code below only
// ever swaps a placeholder's text or overwrites a cell it owns, so the file
// on disk stays byte-for-byte what was provided. Column layout (16 columns,
// grouped exactly as below) is shared by the header (row 5), the one
// example product row (row 6) and the totals row (row 7).
const WEEKLY_COLS: [number, number][] = [[1, 1], [2, 3], [4, 6], [7, 9], [10, 11], [12, 13], [14, 16]]

let weeklyTemplateCache: ArrayBuffer | null = null
async function loadWeeklyTemplate(): Promise<ExcelJS.Workbook> {
  if (!weeklyTemplateCache) {
    const res = await fetch(weeklyInvoiceTemplateUrl)
    weeklyTemplateCache = await res.arrayBuffer()
  }
  const wb = new ExcelJS.Workbook()
  // .slice(0) so each call gets its own copy — ExcelJS/JSZip may consume the
  // buffer while unzipping, and the cached bytes need to survive re-use.
  await wb.xlsx.load(weeklyTemplateCache.slice(0))
  return wb
}

/** Replaces a `[token]` inside a cell's existing text, keeping any literal
 * text around it (e.g. "Организация: [company_name]" → "Организация: X") —
 * the template mixes literal labels and tokens in the same cell. */
function fillToken(ws: ExcelJS.Worksheet, row: number, col: number, token: string, value: string) {
  const cell = ws.getCell(row, col)
  cell.value = String(cell.value ?? '').replace(token, value)
}

/** Writes one product row using styles captured from the template's own
 * example row (6) — see downloadWeeklyInvoiceExcel — so every row this
 * export produces looks exactly like that one real row did, whether there
 * end up being one order in range or fifty. Merges all 7 column groups,
 * matching how the template's row 6 itself was merged. */
function writeWeeklyProductRow(ws: ExcelJS.Worksheet, row: number, values: (string | number)[], colStyles: Partial<ExcelJS.Style>[][]) {
  WEEKLY_COLS.forEach(([start, end], i) => {
    if (end > start) ws.mergeCells(row, start, row, end)
    for (let col = start; col <= end; col++) {
      ws.getCell(row, col).style = colStyles[i][col - start]
    }
    ws.getCell(row, start).value = values[i]
  })
}

/** Writes the "Итого: N" totals row. Only the N:P group is merged, matching
 * the template's own row 7 (its other columns are plain, unmerged and
 * blank — everything up to column M just gets that same blank style, so a
 * totals row that lands on a former product-row's line — with orders in
 * range — never shows that row's leftover borders). */
function writeWeeklyTotalRow(ws: ExcelJS.Worksheet, row: number, grandTotal: number, colStyles: Partial<ExcelJS.Style>[][]) {
  WEEKLY_COLS.forEach(([start, end], i) => {
    for (let col = start; col <= end; col++) ws.getCell(row, col).style = colStyles[i][col - start]
  })
  ws.mergeCells(row, 14, row, 16)
  ws.getCell(row, 14).value = `Итого: ${grandTotal.toLocaleString('ru-RU')}`
}

/** Variant 2 — one row per order, for one customer, over a date range.
 * Loads the real накладная merge template unmodified and fills it in,
 * rather than hand-building the sheet's styling — see the comment above
 * WEEKLY_COLS for why. */
export async function downloadWeeklyInvoiceExcel(params: {
  customer: CustomerRow
  orders: OrderRow[]
  orderItems: OrderItemRow[]
  products: ProductRow[]
  dateFrom: string // yyyy-mm-dd
  dateTo: string // yyyy-mm-dd
}) {
  const { customer, orders, orderItems, products, dateFrom, dateTo } = params
  const from = new Date(`${dateFrom}T00:00:00`)
  const to = new Date(`${dateTo}T23:59:59`)
  const productById = new Map(products.map((p) => [p.id, p]))

  const relevant = orders
    .filter((o) => o.customerId === customer.id)
    .filter((o) => {
      const d = new Date(o.createdAt)
      return d >= from && d <= to
    })
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())

  const wb = await loadWeeklyTemplate()
  const ws = wb.worksheets[0]

  // Rows 1 and 8 are pure structural tags in the template (<order>, </order>)
  // — not meant to ever be visible, so they're cleared rather than filled.
  ws.getCell(1, 1).value = null
  ws.getCell(8, 1).value = null

  fillToken(ws, 2, 1, '[company_name]', 'Freshline')
  fillToken(ws, 3, 1, '[client_company_name]', customer.companyName || customer.name)
  fillToken(ws, 4, 1, '[date]', `${formatDate(dateFrom)} — ${formatDate(dateTo)}`)

  // Capture every column's style from the template's one example product row
  // (6) and totals row (7) before writing anything — every row this export
  // produces (0, 1, or many) reuses these, so the output is pixel-identical
  // to the template regardless of how many orders fall in the range.
  const productColStyles = WEEKLY_COLS.map(([start, end]) => {
    const styles: Partial<ExcelJS.Style>[] = []
    for (let col = start; col <= end; col++) styles.push(ws.getCell(6, col).style)
    return styles
  })
  const totalColStyles = WEEKLY_COLS.map(([start, end]) => {
    const styles: Partial<ExcelJS.Style>[] = []
    for (let col = start; col <= end; col++) styles.push(ws.getCell(7, col).style)
    return styles
  })

  // Row 5 (the header) keeps its template merges untouched — only rows 6+
  // (the product-row template, its totals row, and the closing tag) get
  // rewritten below, potentially across more or fewer rows than the
  // template shipped with, so clear that band's merges first or re-merging
  // it would collide with a leftover merge definition.
  ws.unMergeCells(6, 1, 200, 16)
  // Rows 6–8 held the template's one example product row, its totals row,
  // and the closing </order> tag — all three get fully rewritten below
  // (rows 6 alone when there are zero orders in range), so wipe every value
  // in that band first. Otherwise, with fewer orders than the template had
  // rows for, a leftover "[order_date]"-style placeholder or stray "Итого"
  // text would survive untouched past wherever this export stops writing.
  for (let row = 6; row <= 8; row++) {
    for (let col = 1; col <= 16; col++) ws.getCell(row, col).value = null
  }

  let grandTotal = 0
  relevant.forEach((order, i) => {
    const row = 6 + i
    const items = orderItems.filter((oi) => oi.orderId === order.id)
    const units = [...new Set(items.map((oi) => productById.get(oi.productId ?? '')?.unit).filter(Boolean))].join(', ') || '—'
    const subtotal = items.reduce((s, oi) => s + oi.qty * oi.unitPrice, 0)
    const vat = Math.round(subtotal * VAT_RATE)
    // sum_without_vat + vat_sum = total_sum, matching what the sheet's own
    // visible columns add up to — delivery isn't a column here, so unlike
    // the single-order variant above it isn't folded into the total.
    const orderTotal = subtotal + vat
    grandTotal += orderTotal

    writeWeeklyProductRow(
      ws,
      row,
      [i + 1, formatDate(order.createdAt), order.orderNumber, units, subtotal, vat, orderTotal],
      productColStyles,
    )
  })

  writeWeeklyTotalRow(ws, 6 + relevant.length, grandTotal, totalColStyles)

  await triggerXlsxDownload(
    wb,
    `Накладная ${customer.name} ${formatDate(dateFrom)}-${formatDate(dateTo)}.xlsx`,
  )

  return relevant.length
}
