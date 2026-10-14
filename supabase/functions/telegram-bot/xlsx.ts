// Freshline — the Excel files the bot sends: an order's накладная (the
// website's "Скачать Excel" on the order page, src/lib/exportOrderExcel.ts)
// and "Товары по заказам" (src/lib/productSummary.ts) — without prices.
import ExcelJS from 'npm:exceljs@4.4.0'

// Fruits, vegetables, greens, then the catalog's category order — lib/catalogOrder.ts on the website.
const CATEGORY_ORDER = [
  'Fruits', 'Vegetables', 'Herbs', 'Dairy', 'Meat', 'Seafood', 'Eggs', 'Bread', 'Bakery / Confectionery', 'Spices', 'Oil', 'Nuts',
  'Legumes & Cereals', 'Grains & Pasta', 'Sauces & Condiments', 'Sweets & Snacks', 'Honey & Preserves', 'Pickles & Marinades',
  'Canned Goods', 'Frozen', 'Semi-finished Products', 'Beverages', 'Tea & Coffee', 'Groceries', 'Cleaning',
  'Kitchen Supplies / Disposables', 'Packaging & Disposables', 'Kitchen Equipment',
]
export function byCatalog<T extends { category?: string | null; name: string }>(rows: T[]): T[] {
  const rank = (c?: string | null) => {
    const i = CATEGORY_ORDER.indexOf(c ?? '')
    return i < 0 ? CATEGORY_ORDER.length : i
  }
  return [...rows].sort((a, b) => rank(a.category) - rank(b.category) || a.name.localeCompare(b.name, 'ru'))
}

const MEDIUM: Partial<ExcelJS.Borders> = {
  top: { style: 'medium' },
  bottom: { style: 'medium' },
  left: { style: 'medium' },
  right: { style: 'medium' },
}
const THIN: Partial<ExcelJS.Borders> = {
  top: { style: 'thin' },
  bottom: { style: 'thin' },
  left: { style: 'thin' },
  right: { style: 'thin' },
}

export interface XlsxLine {
  name: string
  category?: string | null
  qty: number
  unit: string
}

export async function orderXlsx(o: {
  number: number
  company: string
  createdAt: string
  staffRole: string
  contact: string
  phone: string
  lines: XlsxLine[]
}): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Накладная')
  ws.columns = [{ width: 7.14 }, { width: 34.29 }, { width: 11.43 }, { width: 11.43 }]
  const dateLabel = new Date(o.createdAt).toLocaleDateString('ru-RU', { timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', year: 'numeric' })

  const label = (row: number, text: string, bold: boolean) => {
    ws.mergeCells(row, 1, row, 2)
    const cell = ws.getCell(row, 1)
    cell.value = text
    cell.font = { name: 'Calibri', size: 11, bold }
    cell.alignment = { horizontal: 'left', vertical: bold ? 'top' : undefined }
  }
  label(1, `Номер накладной: ${o.number}`, false)
  label(2, 'Организация: Freshline', false)
  label(3, `Организация: ${o.company}`, true)
  label(4, `Дата заявки: ${dateLabel}`, true)
  label(5, `Должность: ${o.staffRole || '—'}`, true)
  label(6, `Контрагент: ${o.contact || '—'}`, true)
  label(7, `Телефон: ${o.phone || '—'}`, true)

  const header = 8
  ;['№', 'Название', 'Ед. изм.', 'Кол-во'].forEach((t, i) => {
    const cell = ws.getCell(header, i + 1)
    cell.value = t
    cell.font = { name: 'sans-serif', size: 8, bold: true }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD5D5D5' } }
    cell.border = MEDIUM
  })
  const aligns = ['right', 'left', 'left', 'right'] as const
  const sorted = byCatalog(o.lines)
  sorted.forEach((l, i) => {
    ;[i + 1, l.name, l.unit, l.qty].forEach((v, c) => {
      const cell = ws.getCell(header + 1 + i, c + 1)
      cell.value = v
      cell.font = { name: 'sans-serif', size: 8 }
      cell.alignment = { horizontal: aligns[c], vertical: 'top' }
      cell.border = MEDIUM
      if (c === 0) cell.numFmt = '#,##0'
      if (c === 3) cell.numFmt = '#,##0.###'
    })
  })

  const signRow = header + sorted.length + 3
  const sign = (row: number, text: string) => {
    ws.getCell(row, 1).value = text
    ws.getCell(row, 1).font = { name: 'Calibri', size: 11 }
    ws.mergeCells(row, 2, row, 4)
    ws.getCell(row, 2).border = { bottom: { style: 'thin' } }
    ws.getCell(row + 1, 2).value = 'подпись / ФИО'
    ws.getCell(row + 1, 2).font = { name: 'Calibri', size: 8, color: { argb: 'FF777777' } }
  }
  sign(signRow, 'Сдал:')
  sign(signRow + 3, 'Принял:')
  return new Uint8Array(await wb.xlsx.writeBuffer())
}

export interface XlsxSummaryRow {
  name: string
  category?: string | null
  unit: string
  total: number
}

export async function summaryXlsx(title: string, subtitle: string, rows: XlsxSummaryRow[]): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Товары')
  ws.columns = [{ width: 6 }, { width: 40 }, { width: 10 }, { width: 14 }]
  ws.getCell(1, 1).value = title
  ws.getCell(1, 1).font = { bold: true, size: 14 }
  ws.mergeCells(1, 1, 1, 4)
  ws.getCell(2, 1).value = subtitle
  ws.getCell(2, 1).font = { size: 10, color: { argb: 'FF55523F' } }
  ws.mergeCells(2, 1, 2, 4)
  ;['№', 'Товар', 'Ед.', 'Количество'].forEach((h, i) => {
    const cell = ws.getCell(4, i + 1)
    cell.value = h
    cell.font = { bold: true, size: 11 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EFE9' } }
    cell.alignment = { horizontal: i === 3 ? 'right' : 'left' }
    cell.border = THIN
  })
  byCatalog(rows).forEach((r, i) => {
    ;[i + 1, r.name, r.unit, Math.round(r.total * 1000) / 1000].forEach((v, c) => {
      const cell = ws.getCell(5 + i, c + 1)
      cell.value = v
      cell.font = { size: 11 }
      cell.alignment = { horizontal: c === 3 ? 'right' : 'left' }
      if (c === 3) cell.numFmt = '#,##0.###'
      cell.border = THIN
    })
  })
  ws.views = [{ state: 'frozen', ySplit: 4 }]
  return new Uint8Array(await wb.xlsx.writeBuffer())
}
