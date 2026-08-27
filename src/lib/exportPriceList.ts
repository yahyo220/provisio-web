// Freshline — price list export/import as a real .xlsx (was a plain CSV —
// the business works in Excel day to day, and a styled sheet is easier to
// check by eye before re-uploading).
import ExcelJS from 'exceljs'
import { THIN_BORDER, triggerXlsxDownload } from './xlsxShared'
import type { ProductRow } from './types'

export async function downloadPriceListExcel(products: ProductRow[]) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Цены')
  ws.columns = [{ width: 16 }, { width: 40 }, { width: 16 }, { width: 16 }]

  const headers = ['SKU', 'Название', 'Цена', 'Цена (внешняя)']
  headers.forEach((text, i) => {
    const cell = ws.getCell(1, i + 1)
    cell.value = text
    cell.font = { bold: true, size: 11 }
    cell.alignment = { horizontal: i >= 2 ? 'right' : 'left' }
    cell.border = THIN_BORDER
  })

  products.forEach((p, i) => {
    const r = i + 2
    const priceNum = Number(p.price.replace(/[^\d.]/g, '')) || 0
    const priceExtNum = Number(p.priceExternal.replace(/[^\d.]/g, '')) || null
    const values = [p.sku, p.name, priceNum, priceExtNum ?? '']
    values.forEach((v, col) => {
      const cell = ws.getCell(r, col + 1)
      cell.value = v
      cell.font = { size: 11 }
      cell.alignment = { horizontal: col >= 2 ? 'right' : 'left' }
      cell.border = THIN_BORDER
    })
  })

  await triggerXlsxDownload(wb, `freshline-prices-${new Date().toISOString().slice(0, 10)}.xlsx`)
}

export interface PriceImportRow {
  sku: string
  price: number
  priceExternal: number | null
}

/** Reads sku / price / price_external from the first sheet of an .xlsx —
 * columns in that order, header row optional (detected by SKU not being a
 * finite price-less string — same "does row 1 look like data" heuristic
 * the old CSV importer used). Also accepts .csv for anyone still holding an
 * old export. */
export async function parsePriceFile(file: File): Promise<PriceImportRow[]> {
  const isCsv = file.name.toLowerCase().endsWith('.csv') || file.type === 'text/csv'
  if (isCsv) return parsePriceCsv(await file.text())

  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await file.arrayBuffer())
  const ws = wb.worksheets[0]
  if (!ws) return []

  const rows: PriceImportRow[] = []
  ws.eachRow((row, rowNumber) => {
    const sku = String(row.getCell(1).value ?? '').trim()
    if (rowNumber === 1 && (sku.toLowerCase() === 'sku' || !Number.isFinite(Number(row.getCell(3).value)))) return
    const price = Number(row.getCell(3).value)
    const priceExternalRaw = row.getCell(4).value
    const priceExternal = priceExternalRaw === null || priceExternalRaw === undefined || priceExternalRaw === '' ? null : Number(priceExternalRaw)
    if (sku && Number.isFinite(price)) rows.push({ sku, price, priceExternal })
  })
  return rows
}

// Matches the old CSV export's column order: sku,name,price,price_external
// (the previous importer actually read price/price_external one column too
// early — cols[1]/cols[2] instead of cols[2]/cols[3] — so re-importing your
// own exported file silently read "name" as "price"; fixed here).
function parsePriceCsv(text: string): PriceImportRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length === 0) return []
  const rows = lines[0].toLowerCase().includes('sku') ? lines.slice(1) : lines
  return rows
    .map((line) => {
      const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''))
      const sku = cols[0] ?? ''
      const price = Number((cols[2] ?? '').replace(/[^\d.]/g, ''))
      const priceExternalRaw = (cols[3] ?? '').replace(/[^\d.]/g, '')
      return { sku, price, priceExternal: priceExternalRaw ? Number(priceExternalRaw) : null }
    })
    .filter((r) => r.sku && Number.isFinite(r.price))
}
