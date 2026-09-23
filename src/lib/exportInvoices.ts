// Freshline — two накладная variants beyond the plain one in
// exportOrderExcel.ts, both reachable from the Analytics page:
//   1. One order, with price — a №/Название/Категория/Кол-во/Сумма без
//      НДС/НДС/Сумма table plus a total. Loads the real merge template
//      (orderInvoiceWithPriceTemplateUrl) unmodified and fills it in — see
//      downloadOrderExcelWithPrice.
//   2. A period summary for one customer — one row per order (date, order
//      number, sum without VAT, VAT, order total) plus a grand total row.
//      Same approach, its own template (weeklyInvoiceTemplate below) — see
//      downloadWeeklyInvoiceExcel.
//
// Both real templates have been revised by the business more than once
// (column layout, which totals label text, whether an order-number cell
// carries a literal prefix) — this file reads structural/textual details
// like that off the template itself wherever practical (fillToken's
// bracket-matching, the totalPrefix/orderNoPrefix extraction below) rather
// than hand-transcribing them, so the next revision needs fewer code changes.
import ExcelJS from 'exceljs'
import type { CustomerRow, OrderItemRow, OrderRow } from './types'
import type { OrderLineItem } from './data'
import { triggerXlsxDownload } from './xlsxShared'
import orderInvoiceWithPriceTemplateUrl from '../assets/templates/order-invoice-with-price-template.xlsx?url'
import weeklyInvoiceTemplateUrl from '../assets/templates/weekly-invoice-template.xlsx?url'
import orderInvoiceMarginTemplateUrl from '../assets/templates/order-invoice-margin-template.xlsx?url'
import weeklyInvoiceMarginTemplateUrl from '../assets/templates/weekly-invoice-margin-template.xlsx?url'

// Matches the app's own CartController.kVatRate (lib/state/cart_controller.dart) —
// keep the two in sync if this ever changes.
export const VAT_RATE = 0.12

// The business has no purchase-cost data on products to compute a real
// margin from (only a customer-facing "external" price tier, unrelated to
// what anything cost to acquire) — confirmed with the user directly. Until
// that exists, every product's margin/profit is a flat 12% of its pre-VAT
// price. Shares its numeric value with VAT_RATE by coincidence only; keep
// them as separate constants so a future change to either doesn't
// accidentally move the other.
export const MARGIN_RATE = 0.12

/** This customer's orders whose createdAt falls within [dateFrom, dateTo]
 * (inclusive, local-day boundaries), oldest first — the shared row set both
 * downloadWeeklyInvoiceExcel and downloadWeeklyInvoiceWithMarginExcel below
 * write one row per order for. */
function ordersInRange(orders: OrderRow[], customerId: string, dateFrom: string, dateTo: string): OrderRow[] {
  const from = new Date(`${dateFrom}T00:00:00`)
  const to = new Date(`${dateTo}T23:59:59`)
  return orders
    .filter((o) => o.customerId === customerId)
    .filter((o) => o.status !== 'cancelled')
    .filter((o) => {
      const d = new Date(o.createdAt)
      return d >= from && d <= to
    })
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** Replaces the one `[token]` inside a cell's existing text with `value`,
 * keeping whatever literal text surrounds it (e.g. "Организация:
 * [company_name]" → "Организация: X") — every real merge template in this
 * file mixes a literal label with exactly one bracketed token per cell.
 * Matches on the brackets themselves rather than a hardcoded token name —
 * a token's exact spelling isn't safe to hand-transcribe into source: one
 * of these templates' "[total_amount]" turned out to spell "amount" with a
 * Cyrillic а/о, invisible at a glance but silently never matching a
 * Latin-spelled literal. Shared by both downloadOrderExcelWithPrice and
 * downloadWeeklyInvoiceExcel below. */
function fillToken(ws: ExcelJS.Worksheet, row: number, col: number, value: string) {
  const cell = ws.getCell(row, col)
  cell.value = String(cell.value ?? '').replace(/\[[^\]]*\]/, value)
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

/** Writes a totals row: applies the captured (blank, in every template so
 * far) style to every column group first — so a totals row landing on a
 * former line-item row's line never shows that row's leftover borders —
 * then merges and fills just the named groups with their text, leaving the
 * rest blank. The price/weekly templates fold one "Итого"/total label plus
 * amount into a single trailing cell (one entry); the margin variants below
 * have two separate totals (Сумма and Прибыль, at different column groups)
 * on the same row, hence a list rather than one fixed trailing value. */
function writeTotalRow(
  ws: ExcelJS.Worksheet,
  row: number,
  cols: [number, number][],
  colStyles: Partial<ExcelJS.Style>[][],
  entries: { index: number; text: string }[],
) {
  cols.forEach(([start, end], i) => {
    for (let col = start; col <= end; col++) ws.getCell(row, col).style = colStyles[i][col - start]
  })
  for (const { index, text } of entries) {
    const [start, end] = cols[index]
    if (end > start) ws.mergeCells(row, start, row, end)
    ws.getCell(row, start).value = text
  }
}

// The real merge template (order-invoice-with-price-template.xlsx, embedded
// unmodified under src/assets/templates/) — rows 1/12 are the `<order>`/
// `</order>` wrapper tags, rows 2-8 the header block (each mixing a literal
// label with a `[token]`), row 9 the (untemplated, literal) column headers,
// row 10 the one example line-item row, row 11 the total ("Итого:[token]",
// folded into the same cell as the amount — no separate label cell here).
// Column layout — A(№) | B(Название) | C(Категория) | D(Кол-во) |
// E(Сумма без НДС) | F(НДС) | G:H(Сумма) — all single cells except the
// last, merged for both the line-item row and (blank except there) the
// totals row.
const PRICE_PRODUCT_COLS: [number, number][] = [[1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [6, 6], [7, 8]]
const PRICE_TOTAL_COL = PRICE_PRODUCT_COLS[PRICE_PRODUCT_COLS.length - 1]

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
  fillToken(ws, 2, 1, String(order.orderNumber))
  fillToken(ws, 3, 1, 'Freshline')
  fillToken(ws, 4, 1, customer?.companyName || customer?.name || order.customer)
  fillToken(ws, 5, 1, formatDate(order.createdAt))
  fillToken(ws, 6, 1, customer?.staffRole || '—')
  fillToken(ws, 7, 1, customer?.contact || customer?.name || order.customer)
  fillToken(ws, 8, 1, customer?.phone || '—')

  // "Итого:[total_amunt]" (row 11, last column group) — read off whatever
  // literal text actually precedes the token rather than hand-transcribing
  // it: across the real template revisions seen so far this has been
  // "всего к оплате" as a separate label, "Итого:" with no space, and
  // "Итого: " with one.
  const [totalColStart] = PRICE_TOTAL_COL
  const totalPrefix = String(ws.getCell(11, totalColStart).value ?? '').replace(/\[[^\]]*\]/, '')

  // Capture styles from the template's one example line-item row (10) and
  // its totals row (11) before writing anything — every row this export
  // produces reuses these, so the output stays pixel-identical to the
  // template regardless of how many line items the order has.
  const productColStyles = captureTemplateColStyles(ws, 10, PRICE_PRODUCT_COLS)
  const totalColStyles = captureTemplateColStyles(ws, 11, PRICE_PRODUCT_COLS)

  // Row 9 (the literal column headers) keeps its template merges untouched
  // — only rows 10+ (the line-item template, its total, and the closing
  // tag) get rewritten below, potentially across more or fewer rows than
  // the template shipped with, so clear that band's merges and values first.
  ws.unMergeCells(10, 1, 500, 8)
  for (let row = 10; row <= 12; row++) {
    for (let col = 1; col <= 8; col++) ws.getCell(row, col).value = null
  }

  let grandTotal = 0
  lineItems.forEach((line, i) => {
    const row = 10 + i
    // "Сумма без НДС" (pre-tax), "НДС" (the VAT on it), "Сумма" (the two
    // added together — this line's payable total).
    const sumWithoutVat = Math.round(line.qty * line.unitPrice)
    const vatAmount = Math.round(sumWithoutVat * VAT_RATE)
    const lineTotal = sumWithoutVat + vatAmount
    grandTotal += lineTotal

    writeTemplateRow(ws, row, PRICE_PRODUCT_COLS, [i + 1, line.name, line.category, line.qty, sumWithoutVat, vatAmount, lineTotal], productColStyles)
  })

  writeTotalRow(ws, 10 + lineItems.length, PRICE_PRODUCT_COLS, totalColStyles, [
    { index: PRICE_PRODUCT_COLS.length - 1, text: `${totalPrefix}${grandTotal.toLocaleString('ru-RU')}` },
  ])

  await triggerXlsxDownload(wb, `Накладная №${order.orderNumber} (с ценой).xlsx`)
}

// The real merge template (weekly-invoice-template.xlsx, embedded unmodified
// under src/assets/templates/) uses `<order>`/`<product>…</product>` tags and
// `[bracket]` placeholders — the convention of whatever external tool the
// business used to design накладные. It is never edited: the code below only
// ever swaps a placeholder's text or overwrites a cell it owns, so the file
// on disk stays byte-for-byte what was provided. Column layout — A(№) |
// B:C(Дата) | D:E(Номер заказа) | F:G(Сумма без ндс) | H:I(НДС) |
// J:L(Обшая сумма заказа) — is shared by the header (row 5), the one
// example product row (row 6) and the totals row (row 7).
const WEEKLY_COLS: [number, number][] = [[1, 1], [2, 3], [4, 5], [6, 7], [8, 9], [10, 12]]

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

/** Variant 2 — one row per order, for one customer, over a date range.
 * Loads the real накладная merge template unmodified and fills it in,
 * rather than hand-building the sheet's styling — see the comment above
 * WEEKLY_COLS for why. */
export async function downloadWeeklyInvoiceExcel(params: {
  customer: CustomerRow
  orders: OrderRow[]
  orderItems: OrderItemRow[]
  dateFrom: string // yyyy-mm-dd
  dateTo: string // yyyy-mm-dd
}) {
  const { customer, orders, orderItems, dateFrom, dateTo } = params
  const relevant = ordersInRange(orders, customer.id, dateFrom, dateTo)

  const wb = await loadWeeklyTemplate()
  const ws = wb.worksheets[0]

  // Rows 1 and 8 are pure structural tags in the template (<order>, </order>)
  // — not meant to ever be visible, so they're cleared rather than filled.
  ws.getCell(1, 1).value = null
  ws.getCell(8, 1).value = null

  fillToken(ws, 2, 1, 'Freshline')
  fillToken(ws, 3, 1, customer.companyName || customer.name)
  fillToken(ws, 4, 1, `${formatDate(dateFrom)} — ${formatDate(dateTo)}`)

  // "Номер заказа" (row 6, column group index 2) has carried a literal
  // prefix ahead of its [order_number] token in some revisions of this
  // template — e.g. "№:000[order_number]" (a Unicode "№", easy to mistype
  // as a plain "N") — and none in others. Read off whatever's actually
  // there instead of hand-transcribing a prefix that may or may not exist
  // this time. Same idea for "Итого"/the total label (column group 5),
  // which has appeared with and without a trailing space after the colon.
  const [orderNoColStart] = WEEKLY_COLS[2]
  const orderNoPrefix = String(ws.getCell(6, orderNoColStart).value ?? '').replace(/\[[^\]]*\]/, '')
  const [totalColStart] = WEEKLY_COLS[WEEKLY_COLS.length - 1]
  const totalPrefix = String(ws.getCell(7, totalColStart).value ?? '').replace(/\[[^\]]*\]/, '')

  // Capture every column's style from the template's one example product row
  // (6) and totals row (7) before writing anything — every row this export
  // produces (0, 1, or many) reuses these, so the output is pixel-identical
  // to the template regardless of how many orders fall in the range.
  const productColStyles = captureTemplateColStyles(ws, 6, WEEKLY_COLS)
  const totalColStyles = captureTemplateColStyles(ws, 7, WEEKLY_COLS)

  // Row 5 (the header) keeps its template merges untouched — only rows 6+
  // (the product-row template, its totals row, and the closing tag) get
  // rewritten below, potentially across more or fewer rows than the
  // template shipped with, so clear that band's merges first or re-merging
  // it would collide with a leftover merge definition.
  const lastCol = WEEKLY_COLS[WEEKLY_COLS.length - 1][1]
  ws.unMergeCells(6, 1, 200, lastCol)
  // Rows 6–8 held the template's one example product row, its totals row,
  // and the closing </order> tag — all three get fully rewritten below
  // (rows 6 alone when there are zero orders in range), so wipe every value
  // in that band first. Otherwise, with fewer orders than the template had
  // rows for, a leftover "[order_date]"-style placeholder or stray "Итого"
  // text would survive untouched past wherever this export stops writing.
  for (let row = 6; row <= 8; row++) {
    for (let col = 1; col <= lastCol; col++) ws.getCell(row, col).value = null
  }

  let grandTotal = 0
  relevant.forEach((order, i) => {
    const row = 6 + i
    const items = orderItems.filter((oi) => oi.orderId === order.id)
    const subtotal = items.reduce((s, oi) => s + oi.qty * oi.unitPrice, 0)
    const vat = Math.round(subtotal * VAT_RATE)
    // sum_without_vat + vat_sum = total_sum, matching what the sheet's own
    // visible columns add up to — delivery isn't a column here, so unlike
    // the single-order variant above it isn't folded into the total.
    const orderTotal = subtotal + vat
    grandTotal += orderTotal

    writeTemplateRow(
      ws,
      row,
      WEEKLY_COLS,
      [i + 1, formatDate(order.createdAt), `${orderNoPrefix}${order.orderNumber}`, subtotal, vat, orderTotal],
      productColStyles,
    )
  })

  writeTotalRow(ws, 6 + relevant.length, WEEKLY_COLS, totalColStyles, [
    { index: WEEKLY_COLS.length - 1, text: `${totalPrefix}${grandTotal.toLocaleString('ru-RU')}` },
  ])

  await triggerXlsxDownload(
    wb,
    `Накладная ${customer.name} ${formatDate(dateFrom)}-${formatDate(dateTo)}.xlsx`,
  )

  return relevant.length
}

// ---------------------------------------------------------------------------
// Internal ("для нас") variants — same idea as the two customer-facing
// exports above, but for the business's own eyes: everything those show,
// plus Маржа (this order/line's margin) and Прибыль (running profit, with
// its own "Итого" total). Never meant to leave the company, so they're
// reachable only from their own "для нас" controls, not next to the
// customer-facing download buttons.
// ---------------------------------------------------------------------------

// The real merge template (order-invoice-margin-template.xlsx, embedded
// unmodified under src/assets/templates/) — same row layout as the plain
// price template (header rows 2-8, column headers row 9, one example
// line-item row 10, totals row 11) with two columns inserted: Маржа right
// after НДС, Прибыль right after Сумма. Column layout — A(№) | B(Название) |
// C(Категория) | D(Кол-во) | E(Сумма без НДС) | F(НДС) | G:H(Маржа) |
// I:J(Сумма) | K:L(Прибыль). The totals row only fills the Сумма and
// Прибыль groups (indices 7 and 8) — Маржа has no running total here, only
// per line.
const MARGIN_ORDER_COLS: [number, number][] = [[1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [6, 6], [7, 8], [9, 10], [11, 12]]
const MARGIN_ORDER_SUM_INDEX = 7
const MARGIN_ORDER_PROFIT_INDEX = 8

let orderMarginTemplateCache: ArrayBuffer | null = null
async function loadOrderMarginTemplate(): Promise<ExcelJS.Workbook> {
  if (!orderMarginTemplateCache) {
    const res = await fetch(orderInvoiceMarginTemplateUrl)
    orderMarginTemplateCache = await res.arrayBuffer()
  }
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(orderMarginTemplateCache.slice(0))
  return wb
}

/** Internal variant of downloadOrderExcelWithPrice — same order, same
 * header fields, but with Маржа/Прибыль columns (see MARGIN_ORDER_COLS). */
export async function downloadOrderExcelWithMargin(
  order: OrderRow,
  customer: CustomerRow | undefined,
  lineItems: OrderLineItem[],
) {
  const wb = await loadOrderMarginTemplate()
  const ws = wb.worksheets[0]

  ws.getCell(1, 1).value = null
  ws.getCell(12, 1).value = null

  fillToken(ws, 2, 1, String(order.orderNumber))
  fillToken(ws, 3, 1, 'Freshline')
  fillToken(ws, 4, 1, customer?.companyName || customer?.name || order.customer)
  fillToken(ws, 5, 1, formatDate(order.createdAt))
  fillToken(ws, 6, 1, customer?.staffRole || '—')
  fillToken(ws, 7, 1, customer?.contact || customer?.name || order.customer)
  fillToken(ws, 8, 1, customer?.phone || '—')

  const [sumColStart] = MARGIN_ORDER_COLS[MARGIN_ORDER_SUM_INDEX]
  const [profitColStart] = MARGIN_ORDER_COLS[MARGIN_ORDER_PROFIT_INDEX]
  const sumPrefix = String(ws.getCell(11, sumColStart).value ?? '').replace(/\[[^\]]*\]/, '')
  const profitPrefix = String(ws.getCell(11, profitColStart).value ?? '').replace(/\[[^\]]*\]/, '')

  const productColStyles = captureTemplateColStyles(ws, 10, MARGIN_ORDER_COLS)
  const totalColStyles = captureTemplateColStyles(ws, 11, MARGIN_ORDER_COLS)

  ws.unMergeCells(10, 1, 500, 12)
  for (let row = 10; row <= 12; row++) {
    for (let col = 1; col <= 12; col++) ws.getCell(row, col).value = null
  }

  let grandTotal = 0
  let grandProfit = 0
  lineItems.forEach((line, i) => {
    const row = 10 + i
    const sumWithoutVat = Math.round(line.qty * line.unitPrice)
    const vatAmount = Math.round(sumWithoutVat * VAT_RATE)
    const marginAmount = Math.round(sumWithoutVat * MARGIN_RATE)
    // total_sum = sum_without_vat + vat_sum + margin_amount, straight from
    // the template's own token — unlike the plain price накладная, "Сумма"
    // here is marked up by margin too, not just base + VAT.
    const lineTotal = sumWithoutVat + vatAmount + marginAmount
    grandTotal += lineTotal
    grandProfit += marginAmount

    writeTemplateRow(
      ws,
      row,
      MARGIN_ORDER_COLS,
      [i + 1, line.name, line.category, line.qty, sumWithoutVat, vatAmount, marginAmount, lineTotal, marginAmount],
      productColStyles,
    )
  })

  writeTotalRow(ws, 10 + lineItems.length, MARGIN_ORDER_COLS, totalColStyles, [
    { index: MARGIN_ORDER_SUM_INDEX, text: `${sumPrefix}${grandTotal.toLocaleString('ru-RU')}` },
    { index: MARGIN_ORDER_PROFIT_INDEX, text: `${profitPrefix}${grandProfit.toLocaleString('ru-RU')}` },
  ])

  await triggerXlsxDownload(wb, `Накладная №${order.orderNumber} (для нас).xlsx`)
}

// The real merge template (weekly-invoice-margin-template.xlsx, embedded
// unmodified under src/assets/templates/) — same row layout as the plain
// weekly template, with Маржа inserted after НДС and Прибыль appended after
// Обшая сумма заказа. Column layout — A(№) | B:C(Дата) | D:E(Номер заказа) |
// F:G(Сумма без ндс) | H:I(НДС) | J:K(Маржа) | L:N(Обшая сумма заказа) |
// O:P(Прибыль). The totals row only fills Обшая сумма заказа and Прибыль
// (indices 6 and 7) — Маржа has no running total, only per order.
const MARGIN_WEEKLY_COLS: [number, number][] = [[1, 1], [2, 3], [4, 5], [6, 7], [8, 9], [10, 11], [12, 14], [15, 16]]
const MARGIN_WEEKLY_SUM_INDEX = 6
const MARGIN_WEEKLY_PROFIT_INDEX = 7

let weeklyMarginTemplateCache: ArrayBuffer | null = null
async function loadWeeklyMarginTemplate(): Promise<ExcelJS.Workbook> {
  if (!weeklyMarginTemplateCache) {
    const res = await fetch(weeklyInvoiceMarginTemplateUrl)
    weeklyMarginTemplateCache = await res.arrayBuffer()
  }
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(weeklyMarginTemplateCache.slice(0))
  return wb
}

/** Internal variant of downloadWeeklyInvoiceExcel — same one-row-per-order
 * period summary, plus Маржа/Прибыль columns (see MARGIN_WEEKLY_COLS). Same
 * params/return shape as downloadWeeklyInvoiceExcel so a caller can offer
 * both off the same customer/date-range picker. */
export async function downloadWeeklyInvoiceWithMarginExcel(params: {
  customer: CustomerRow
  orders: OrderRow[]
  orderItems: OrderItemRow[]
  dateFrom: string // yyyy-mm-dd
  dateTo: string // yyyy-mm-dd
}) {
  const { customer, orders, orderItems, dateFrom, dateTo } = params
  const relevant = ordersInRange(orders, customer.id, dateFrom, dateTo)

  const wb = await loadWeeklyMarginTemplate()
  const ws = wb.worksheets[0]

  ws.getCell(1, 1).value = null
  ws.getCell(8, 1).value = null

  fillToken(ws, 2, 1, 'Freshline')
  fillToken(ws, 3, 1, customer.companyName || customer.name)
  fillToken(ws, 4, 1, `${formatDate(dateFrom)} — ${formatDate(dateTo)}`)

  const [orderNoColStart] = MARGIN_WEEKLY_COLS[2]
  const orderNoPrefix = String(ws.getCell(6, orderNoColStart).value ?? '').replace(/\[[^\]]*\]/, '')
  const [sumColStart] = MARGIN_WEEKLY_COLS[MARGIN_WEEKLY_SUM_INDEX]
  const [profitColStart] = MARGIN_WEEKLY_COLS[MARGIN_WEEKLY_PROFIT_INDEX]
  const sumPrefix = String(ws.getCell(7, sumColStart).value ?? '').replace(/\[[^\]]*\]/, '')
  const profitPrefix = String(ws.getCell(7, profitColStart).value ?? '').replace(/\[[^\]]*\]/, '')

  const productColStyles = captureTemplateColStyles(ws, 6, MARGIN_WEEKLY_COLS)
  const totalColStyles = captureTemplateColStyles(ws, 7, MARGIN_WEEKLY_COLS)

  const lastCol = MARGIN_WEEKLY_COLS[MARGIN_WEEKLY_COLS.length - 1][1]
  ws.unMergeCells(6, 1, 200, lastCol)
  for (let row = 6; row <= 8; row++) {
    for (let col = 1; col <= lastCol; col++) ws.getCell(row, col).value = null
  }

  let grandTotal = 0
  let grandProfit = 0
  relevant.forEach((order, i) => {
    const row = 6 + i
    const items = orderItems.filter((oi) => oi.orderId === order.id)
    const subtotal = items.reduce((s, oi) => s + oi.qty * oi.unitPrice, 0)
    const vat = Math.round(subtotal * VAT_RATE)
    const marginAmount = Math.round(subtotal * MARGIN_RATE)
    // total_sum = sum_without_vat + vat_sum + margin_amount, straight from
    // the template's own token — unlike the plain weekly накладная,
    // "Обшая сумма заказа" here is marked up by margin too.
    const orderTotal = subtotal + vat + marginAmount
    grandTotal += orderTotal
    grandProfit += marginAmount

    writeTemplateRow(
      ws,
      row,
      MARGIN_WEEKLY_COLS,
      [i + 1, formatDate(order.createdAt), `${orderNoPrefix}${order.orderNumber}`, subtotal, vat, marginAmount, orderTotal, marginAmount],
      productColStyles,
    )
  })

  writeTotalRow(ws, 6 + relevant.length, MARGIN_WEEKLY_COLS, totalColStyles, [
    { index: MARGIN_WEEKLY_SUM_INDEX, text: `${sumPrefix}${grandTotal.toLocaleString('ru-RU')}` },
    { index: MARGIN_WEEKLY_PROFIT_INDEX, text: `${profitPrefix}${grandProfit.toLocaleString('ru-RU')}` },
  ])

  await triggerXlsxDownload(
    wb,
    `Накладная для нас ${customer.name} ${formatDate(dateFrom)}-${formatDate(dateTo)}.xlsx`,
  )

  return relevant.length
}
