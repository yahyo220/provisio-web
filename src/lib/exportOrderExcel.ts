// Freshline — order → Excel export, replacing the (previously non-functional)
// "Download PDF" button on the order detail page. The layout mirrors a
// waybill template the business already uses elsewhere ("Номер накладной /
// Организация / Дата заявки / Контрагент" + a №/Название/Кол-во/Сумма
// table), just filled in with this order's real data instead of merge
// placeholders, so the exported file drops straight into whatever process
// already expects that shape.
import ExcelJS from 'exceljs'
import type { CustomerRow, OrderRow } from './types'
import type { OrderLineItem } from './data'

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin' },
  bottom: { style: 'thin' },
  left: { style: 'thin' },
  right: { style: 'thin' },
}

export async function downloadOrderExcel(
  order: OrderRow,
  customer: CustomerRow | undefined,
  lineItems: OrderLineItem[],
) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Накладная')

  ws.columns = [
    { width: 7.14 },
    { width: 34.29 },
    { width: 18.14 },
    { width: 12 },
    { width: 11.43 },
    { width: 10 },
    { width: 10 },
  ]

  const addLabelRow = (rowIndex: number, text: string, span: number, bold: boolean) => {
    ws.mergeCells(rowIndex, 1, rowIndex, span)
    const cell = ws.getCell(rowIndex, 1)
    cell.value = text
    cell.font = { bold, size: 11 }
    cell.alignment = { horizontal: 'left' }
  }

  const orderDate = new Date(order.createdAt)
  const dateLabel = Number.isNaN(orderDate.getTime())
    ? order.date
    : orderDate.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })

  addLabelRow(1, `Номер накладной: ${order.orderNumber}`, 2, false)
  addLabelRow(2, `Организация: ${customer?.name ?? order.customer}`, 5, true)
  addLabelRow(3, `Дата заявки: ${dateLabel}`, 2, true)
  addLabelRow(4, `Контрагент: ${customer?.contact || customer?.name || order.customer}`, 5, true)

  const headerRow = 5
  ws.mergeCells(headerRow, 6, headerRow, 7) // F:G — "Сумма"
  const headers: [number, string][] = [
    [1, '№'],
    [2, 'Название'],
    [5, 'Кол-во'],
    [6, 'Сумма'],
  ]
  for (const [col, text] of headers) {
    const cell = ws.getCell(headerRow, col)
    cell.value = text
    cell.font = { bold: true, size: 8 }
    cell.alignment = { horizontal: 'center' }
  }
  for (let col = 1; col <= 7; col++) {
    ws.getCell(headerRow, col).border = THIN_BORDER
  }

  const aligns: Record<number, 'left' | 'right' | 'center'> = { 1: 'right', 2: 'left', 3: 'left', 4: 'left', 5: 'right', 6: 'center' }
  lineItems.forEach((line, i) => {
    const r = headerRow + 1 + i
    ws.mergeCells(r, 6, r, 7)
    const values: Record<number, string | number> = {
      1: i + 1,
      2: line.name,
      3: line.category,
      4: line.unit,
      5: line.qty,
      6: line.qty * line.unitPrice,
    }
    for (let col = 1; col <= 6; col++) {
      const cell = ws.getCell(r, col)
      cell.value = values[col]
      cell.font = { size: 8 }
      cell.alignment = { horizontal: aligns[col] }
      cell.border = THIN_BORDER
    }
    ws.getCell(r, 7).border = THIN_BORDER
  })

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Накладная №${order.orderNumber}.xlsx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
