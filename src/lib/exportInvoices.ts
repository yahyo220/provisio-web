// Freshline — two накладная variants beyond the plain one in
// exportOrderExcel.ts, both reachable from the Analytics page:
//   1. One order, with a Сумма column + "всего к оплате" total (matches
//      the same header block as exportOrderExcel.ts's накладная, just with
//      price added back).
//   2. A period summary for one customer — one row per order (date, items,
//      units, VAT rate, VAT amount, order total) plus a grand "Итого" row.
import ExcelJS from 'exceljs'
import type { CustomerRow, OrderItemRow, OrderRow, ProductRow } from './types'
import type { OrderLineItem } from './data'
import { MEDIUM_BORDER, triggerXlsxDownload } from './xlsxShared'

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

/** Variant 2 — one row per order, for one customer, over a date range. */
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

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Лист1')

  addLabelRow(ws, 1, 4, `Организация: Freshline`, false)
  addLabelRow(ws, 2, 4, `Организация: ${customer.companyName || '—'}`, true)
  addLabelRow(ws, 3, 3, `Дата заявки: ${formatDate(dateFrom)} — ${formatDate(dateTo)}`, true)

  const headerRow = 4
  const headerSpans: [number, number, string][] = [
    [1, 1, '№'],
    [2, 3, 'Дата'],
    [4, 6, 'Заказы'],
    [7, 9, 'Единицы измерения'],
    [10, 11, 'Ставка'],
    [12, 13, 'НДС'],
    [14, 16, 'Обшая сумма заказа'],
  ]
  for (const [start, end, text] of headerSpans) {
    if (end > start) ws.mergeCells(headerRow, start, headerRow, end)
    const cell = ws.getCell(headerRow, start)
    cell.value = text
    cell.font = { name: 'sans-serif', size: 8, bold: true }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
  }
  for (let col = 1; col <= 16; col++) {
    ws.getCell(headerRow, col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD5D5D5' } }
    ws.getCell(headerRow, col).border = MEDIUM_BORDER
  }

  let grandTotal = 0
  relevant.forEach((order, i) => {
    const r = headerRow + 1 + i
    const items = orderItems.filter((oi) => oi.orderId === order.id)
    const names = items.map((oi) => productById.get(oi.productId ?? '')?.name).filter(Boolean).join(', ') || '—'
    const units = [...new Set(items.map((oi) => productById.get(oi.productId ?? '')?.unit).filter(Boolean))].join(', ') || '—'
    const subtotal = items.reduce((s, oi) => s + oi.qty * oi.unitPrice, 0)
    const vat = Math.round(subtotal * VAT_RATE)
    const orderTotal = subtotal + vat + order.deliveryFee
    grandTotal += orderTotal

    const rowSpans: [number, number, string | number][] = [
      [1, 1, i + 1],
      [2, 3, `Дата заказа: ${formatDate(order.createdAt)}`],
      [4, 6, names],
      [7, 9, units],
      [10, 11, `${Math.round(VAT_RATE * 100)}%`],
      [12, 13, vat],
      [14, 16, orderTotal],
    ]
    for (const [start, end, value] of rowSpans) {
      if (end > start) ws.mergeCells(r, start, r, end)
      const cell = ws.getCell(r, start)
      cell.value = value
      cell.font = { name: 'sans-serif', size: 8 }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
      if (start === 12 || start === 14) cell.numFmt = '#,##0'
    }
    for (let col = 1; col <= 16; col++) ws.getCell(r, col).border = MEDIUM_BORDER
  })

  const totalRow = headerRow + 1 + relevant.length + 1
  ws.mergeCells(totalRow, 14, totalRow, 16)
  const totalCell = ws.getCell(totalRow, 14)
  totalCell.value = `Итого: ${grandTotal.toLocaleString('ru-RU')}`
  totalCell.font = { name: 'Calibri', size: 11 }
  totalCell.alignment = { horizontal: 'center', vertical: 'middle' }
  totalCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF92D050' } }
  totalCell.border = MEDIUM_BORDER

  await triggerXlsxDownload(
    wb,
    `Накладная ${customer.name} ${formatDate(dateFrom)}-${formatDate(dateTo)}.xlsx`,
  )

  return relevant.length
}
