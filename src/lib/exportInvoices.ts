// Freshline — two накладная variants beyond the plain one in
// exportOrderExcel.ts, both reachable from the Analytics page:
//   1. One order, with price — a №/Название/Категория/Сумма без НДС/Кол-во/
//      Сумма table plus a "всего к оплате" total. Loads the real merge
//      template (orderInvoiceWithPriceTemplateUrl) unmodified and fills it
//      in — see downloadOrderExcelWithPrice.
//   2. A period summary for one customer — one row per order (date, order
//      number, units, sum without VAT, VAT, order total) plus a grand
//      "Итого" row. Same approach, its own template (weeklyInvoiceTemplate
//      below) — see downloadWeeklyInvoiceExcel.
import ExcelJS from 'exceljs'
import type { CustomerRow, OrderItemRow, OrderRow, ProductRow } from './types'
import type { OrderLineItem } from './data'
import { triggerXlsxDownload } from './xlsxShared'
import orderInvoiceWithPriceTemplateUrl from '../assets/templates/order-invoice-with-price-template.xlsx?url'
import weeklyInvoiceTemplateUrl from '../assets/templates/weekly-invoice-template.xlsx?url'

// Matches the app's own CartController.kVatRate (lib/state/cart_controller.dart) —
// keep the two in sync if this ever changes.
export const VAT_RATE = 0.12

function formatDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** Replaces a `[token]` inside a cell's existing text, keeping any literal
 * text around it (e.g. "Организация: [company_name]" → "Организация: X") —
 * both real merge templates in this file mix literal labels and tokens in
 * the same cell. Shared by both downloadOrderExcelWithPrice and
 * downloadWeeklyInvoiceExcel below. */
function fillToken(ws: ExcelJS.Worksheet, row: number, col: number, token: string, value: string) {
  const cell = ws.getCell(row, col)
  cell.value = String(cell.value ?? '').replace(token, value)
}

/** Writes one row of a template by column group, using styles captured
 * from that template's own example row (see downloadOrderExcelWithPrice and
 * downloadWeeklyInvoiceExcel) — reused by both, since the mechanics are the
 * same even though the two templates' column layouts differ. Only the
 * group's first column gets `values[i]`, matching how a merge only ever
 * carries its value on the master (top-left) cell. */
function writeTemplateRow(
  ws: ExcelJS.Worksheet,
  row: number,
  cols: [number, number][],
  values: (string | number)[],
  colStyles: Partial<ExcelJS.Style>[][],
) {
  cols.forEach(([start, end], i) => {
    if (end > start) ws.mergeCells(row, start, row, end)
    for (let col = start; col <= end; col++) ws.getCell(row, col).style = colStyles[i][col - start]
    ws.getCell(row, start).value = values[i]
  })
}

function captureTemplateColStyles(ws: ExcelJS.Worksheet, row: number, cols: [number, number][]): Partial<ExcelJS.Style>[][] {
  return cols.map(([start, end]) => {
    const styles: Partial<ExcelJS.Style>[] = []
    for (let col = start; col <= end; col++) styles.push(ws.getCell(row, col).style)
    return styles
  })
}

// The real merge template (order-invoice-with-price-template.xlsx, embedded
// unmodified under src/assets/templates/) — rows 1/12 are the `<order>`/
// `</order>` wrapper tags, rows 2-8 the header block (each mixing a literal
// label with a `[token]`), row 9 the (untemplated, literal) column headers,
// row 10 the one example line-item row, row 11 the "всего к оплате" total.
// The line-item row's 6 logical columns are all separate cells except the
// last (Сумма, merged F:G); the total row instead merges A:B for its label,
// leaving C/D/E blank and only F:G carrying the total.
const PRICE_PRODUCT_COLS: [number, number][] = [[1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [6, 7]]
const PRICE_TOTAL_COLS: [number, number][] = [[1, 2], [3, 3], [4, 4], [5, 5], [6, 7]]

let orderPriceTemplateCache: ArrayBuffer | null = null
async function loadOrderPriceTemplate(): Promise<ExcelJS.Workbook> {
  if (!orderPriceTemplateCache) {
    const res = await fetch(orderInvoiceWithPriceTemplateUrl)
    orderPriceTemplateCache = await res.arrayBuffer()
  }
  const wb = new ExcelJS.Workbook()
  // .slice(0) so each call gets its own copy — ExcelJS/JSZip may consume the
  // buffer while unzipping, and the cached bytes need to survive re-use.
  await wb.xlsx.load(orderPriceTemplateCache.slice(0))
  return wb
}

/** Variant 1 — one order, with price. */
export async function downloadOrderExcelWithPrice(
  order: OrderRow,
  customer: CustomerRow | undefined,
  lineItems: OrderLineItem[],
) {
  const wb = await loadOrderPriceTemplate()
  const ws = wb.worksheets[0]

  ws.getCell(1, 1).value = null
  ws.getCell(12, 1).value = null

  // "Номер накладной" — despite the template naming this token
  // [delivery_number], it's the order's own number: there's no separate
  // "delivery number" this business tracks, and this накладная is per order.
  fillToken(ws, 2, 1, '[delivery_number]', String(order.orderNumber))
  fillToken(ws, 3, 1, '[company_name]', 'Freshline')
  fillToken(ws, 4, 1, '[client_company_name]', customer?.companyName || customer?.name || order.customer)
  fillToken(ws, 5, 1, '[delivery_date]', formatDate(order.createdAt))
  fillToken(ws, 6, 1, '[client_position]', customer?.staffRole || '—')
  fillToken(ws, 7, 1, '[client_name]', customer?.contact || customer?.name || order.customer)
  fillToken(ws, 8, 1, '[client_tel]', customer?.phone || '—')

  // Capture styles from the template's one example line-item row (10) and
  // its totals row (11) before writing anything — every row this export
  // produces reuses these, so the output stays pixel-identical to the
  // template regardless of how many line items the order has.
  const productColStyles = captureTemplateColStyles(ws, 10, PRICE_PRODUCT_COLS)
  const totalColStyles = captureTemplateColStyles(ws, 11, PRICE_TOTAL_COLS)

  // Row 9 (the literal column headers) keeps its template merges untouched
  // — only rows 10+ (the line-item template, its total, and the closing
  // tag) get rewritten below, potentially across more or fewer rows than
  // the template shipped with, so clear that band's merges and values first.
  ws.unMergeCells(10, 1, 500, 7)
  for (let row = 10; row <= 12; row++) {
    for (let col = 1; col <= 7; col++) ws.getCell(row, col).value = null
  }

  let grandTotal = 0
  lineItems.forEach((line, i) => {
    const row = 10 + i
    // "Сумма без НДС" (pre-tax) vs "Сумма" (this line's payable total,
    // VAT included) — the template has no separate НДС column, just these
    // two, matching how downloadWeeklyInvoiceExcel below reads the same
    // pair of concepts.
    const sumWithoutVat = Math.round(line.qty * line.unitPrice)
    const lineTotal = Math.round(sumWithoutVat * (1 + VAT_RATE))
    grandTotal += lineTotal

    writeTemplateRow(ws, row, PRICE_PRODUCT_COLS, [i + 1, line.name, line.category, sumWithoutVat, line.qty, lineTotal], productColStyles)
  })

  writeTemplateRow(ws, 10 + lineItems.length, PRICE_TOTAL_COLS, ['всего к оплате', '', '', '', grandTotal], totalColStyles)

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
