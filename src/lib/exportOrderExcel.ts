// Freshline — order → Excel export, matching the business's own накладная
// merge-template exactly (Номер накладной / Организация (нашa) / Организация
// (клиента) / Дата заявки / Должность / Контрагент / Телефон, then a
// №-Название-Категория-Ед.изм.-Кол-во table — deliberately no price/sum
// column, this template never had one).
import ExcelJS from 'exceljs'
import type { CustomerRow, OrderRow } from './types'
import type { OrderLineItem } from './data'
import { MEDIUM_BORDER, triggerXlsxDownload } from './xlsxShared'

export async function downloadOrderExcel(
  order: OrderRow,
  customer: CustomerRow | undefined,
  lineItems: OrderLineItem[],
) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Накладная')

  ws.columns = [{ width: 7.14 }, { width: 34.29 }, { width: 18.14 }, {}, { width: 11.43 }]

  const orderDate = new Date(order.createdAt)
  const dateLabel = Number.isNaN(orderDate.getTime())
    ? order.date
    : orderDate.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })

  const addLabelRow = (rowIndex: number, text: string, bold: boolean) => {
    ws.mergeCells(rowIndex, 1, rowIndex, 2)
    const cell = ws.getCell(rowIndex, 1)
    cell.value = text
    cell.font = { name: 'Calibri', size: 11, bold }
    cell.alignment = { horizontal: 'left', vertical: bold ? 'top' : undefined }
  }

  // Rows 1-2: our own info, regular weight. Rows 3-6: the client's own
  // info, bold — same distinction the source template makes.
  addLabelRow(1, `Номер накладной: ${order.orderNumber}`, false)
  addLabelRow(2, `Организация: Freshline`, false)
  addLabelRow(3, `Организация: ${customer?.companyName || '—'}`, true)
  addLabelRow(4, `Дата заявки: ${dateLabel}`, true)
  addLabelRow(5, `Должность: ${customer?.staffRole || '—'}`, true)
  addLabelRow(6, `Контрагент: ${customer?.contact || customer?.name || order.customer}`, true)
  addLabelRow(7, `Телефон: ${customer?.phone || '—'}`, true)

  // Header row — only №/Название/Кол-во are labeled in the source template;
  // the Категория/Ед. изм. header cells are left blank there too.
  const headerRow = 8
  const headers: [number, string][] = [
    [1, '№'],
    [2, 'Название'],
    [5, 'Кол-во'],
  ]
  for (const [col, text] of headers) {
    const cell = ws.getCell(headerRow, col)
    cell.value = text
    cell.font = { name: 'sans-serif', size: 8, bold: true }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
  }
  for (let col = 1; col <= 5; col++) {
    const cell = ws.getCell(headerRow, col)
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD5D5D5' } }
    cell.border = MEDIUM_BORDER
  }

  const aligns: Record<number, 'left' | 'right' | 'center'> = { 1: 'right', 2: 'left', 3: 'left', 4: 'left', 5: 'right' }
  lineItems.forEach((line, i) => {
    const r = headerRow + 1 + i
    const values: Record<number, string | number> = {
      1: i + 1,
      2: line.name,
      3: line.category,
      4: line.unit,
      5: line.qty,
    }
    for (let col = 1; col <= 5; col++) {
      const cell = ws.getCell(r, col)
      cell.value = values[col]
      cell.font = { name: 'sans-serif', size: 8 }
      cell.alignment = { horizontal: aligns[col], vertical: 'top' }
      cell.border = MEDIUM_BORDER
      if (col === 1 || col === 5) cell.numFmt = '#,##0'
    }
  })

  await triggerXlsxDownload(wb, `Накладная №${order.orderNumber}.xlsx`)
}
