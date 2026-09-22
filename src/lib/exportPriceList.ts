// Freshline — product list export/import as a real .xlsx (was a plain CSV —
// the business works in Excel day to day, and a styled sheet is easier to
// check by eye before re-uploading).
//
// Originally this only touched price/price_external for products that
// already existed (matched by SKU) — everything else in the row was
// ignored, so there was no way to actually add new products from a
// spreadsheet, only reprice existing ones. Category and Unit columns were
// added so a re-uploaded row can also create a brand-new product (SKU
// blank or not found) as long as name/category/unit/price are all present;
// an existing SKU still just updates in place, now syncing name/category/
// unit too, not only price.
import ExcelJS from 'exceljs'
import { PRODUCT_CATEGORIES, PRODUCT_UNITS } from './data'
import { translateCategory, translateUnit } from '../i18n/translations'
import { THIN_BORDER, triggerXlsxDownload } from './xlsxShared'
import type { ProductRow } from './types'

const CATEGORY_BY_KEY = new Map(PRODUCT_CATEGORIES.map((c) => [c.toLowerCase(), c]))
const CATEGORY_BY_RU = new Map(PRODUCT_CATEGORIES.map((c) => [translateCategory(c, 'ru').toLowerCase(), c]))
const UNIT_BY_KEY = new Map(PRODUCT_UNITS.map((u) => [u.toLowerCase(), u]))
const UNIT_BY_RU = new Map(PRODUCT_UNITS.map((u) => [translateUnit(u, 'ru').toLowerCase(), u]))

/** Accepts either the English key (`Groceries`) or the Russian label
 * (`Бакалея`) a person would actually type in Excel — whichever the sheet
 * has. Unrecognized text (typo, category renamed since) resolves to null,
 * so the caller can skip the row instead of silently mis-filing it. */
function resolveCategory(raw: string): string | null {
  const v = raw.trim().toLowerCase()
  if (!v) return null
  return CATEGORY_BY_KEY.get(v) ?? CATEGORY_BY_RU.get(v) ?? null
}

function resolveUnit(raw: string): string | null {
  const v = raw.trim().toLowerCase()
  if (!v) return null
  return UNIT_BY_KEY.get(v) ?? UNIT_BY_RU.get(v) ?? null
}

/** A price/price-external cell's value, robustly. `downloadPriceListExcel`
 * always writes a clean number, but a re-uploaded file has usually been
 * hand-edited in Excel — retyping "20000" as "20 000" (a thousands
 * separator, sometimes a non-breaking space) turns the cell into text, and
 * `Number("20 000")` is `NaN`, not 20000. Strip everything but digits/dot
 * first, the same way the legacy CSV importer below already did — a plain
 * `Number(cell.value)` silently dropped every row someone had actually
 * retyped a price in, which is what made this import look like it had
 * stopped updating prices at all. */
function parseMoneyCell(raw: unknown): number {
  if (typeof raw === 'number') return raw
  return Number(String(raw ?? '').replace(/[^\d.]/g, ''))
}

export async function downloadPriceListExcel(products: ProductRow[]) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Товары')
  ws.columns = [{ width: 16 }, { width: 40 }, { width: 22 }, { width: 14 }, { width: 16 }, { width: 16 }]

  const headers = ['SKU', 'Название', 'Категория', 'Ед. изм.', 'Цена', 'Цена (внешняя)']
  headers.forEach((text, i) => {
    const cell = ws.getCell(1, i + 1)
    cell.value = text
    cell.font = { bold: true, size: 11 }
    cell.alignment = { horizontal: i >= 4 ? 'right' : 'left' }
    cell.border = THIN_BORDER
  })

  products.forEach((p, i) => {
    const r = i + 2
    const priceNum = Number(p.price.replace(/[^\d.]/g, '')) || 0
    const priceExtNum = Number(p.priceExternal.replace(/[^\d.]/g, '')) || null
    const values = [p.sku, p.name, translateCategory(p.category, 'ru'), translateUnit(p.unit, 'ru'), priceNum, priceExtNum ?? '']
    values.forEach((v, col) => {
      const cell = ws.getCell(r, col + 1)
      cell.value = v
      cell.font = { size: 11 }
      cell.alignment = { horizontal: col >= 4 ? 'right' : 'left' }
      cell.border = THIN_BORDER
    })
  })

  await triggerXlsxDownload(wb, `freshline-products-${new Date().toISOString().slice(0, 10)}.xlsx`)
}

export interface ProductImportRow {
  /** Blank when the sheet leaves SKU empty for a new product — the caller
   * assigns one (see suggestNextSku) once it's confirmed as a create. */
  sku: string
  name: string
  /** Resolved to one of PRODUCT_CATEGORIES, or null if the cell didn't match
   * any known category (typo, or a category renamed since this was exported). */
  category: string | null
  /** Resolved to one of PRODUCT_UNITS, or null — same idea as category. */
  unit: string | null
  price: number
  priceExternal: number | null
}

/** Reads sku / name / category / unit / price / price_external from the
 * first sheet of an .xlsx — same 6-column order downloadPriceListExcel
 * writes. Header row optional (detected by SKU not being a finite
 * price-less string — same "does row 1 look like data" heuristic the old
 * CSV importer used). Also accepts .csv for anyone still holding an old
 * export (sku/name/price/price_external only — no category/unit, since the
 * CSV format predates those columns). */
export async function parsePriceFile(file: File): Promise<ProductImportRow[]> {
  const isCsv = file.name.toLowerCase().endsWith('.csv') || file.type === 'text/csv'
  if (isCsv) return parsePriceCsv(await file.text())

  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await file.arrayBuffer())
  const ws = wb.worksheets[0]
  if (!ws) return []

  const rows: ProductImportRow[] = []
  ws.eachRow((row, rowNumber) => {
    const sku = String(row.getCell(1).value ?? '').trim()
    if (rowNumber === 1 && (sku.toLowerCase() === 'sku' || !Number.isFinite(Number(row.getCell(5).value)))) return
    const name = String(row.getCell(2).value ?? '').trim()
    const category = resolveCategory(String(row.getCell(3).value ?? ''))
    const unit = resolveUnit(String(row.getCell(4).value ?? ''))
    const price = parseMoneyCell(row.getCell(5).value)
    const priceExternalRaw = row.getCell(6).value
    const priceExternal = priceExternalRaw === null || priceExternalRaw === undefined || priceExternalRaw === '' ? null : parseMoneyCell(priceExternalRaw)
    // A row needs at least a SKU (to update something that already exists)
    // or a name (to be worth creating) — anything with neither is just a
    // blank spreadsheet row and is silently skipped, not reported as an error.
    if ((sku || name) && Number.isFinite(price)) rows.push({ sku, name, category, unit, price, priceExternal })
  })
  return rows
}

// Matches the old CSV export's column order: sku,name,price,price_external
// (the previous importer actually read price/price_external one column too
// early — cols[1]/cols[2] instead of cols[2]/cols[3] — so re-importing your
// own exported file silently read "name" as "price"; fixed here). No
// category/unit in this legacy format, so those always come back null —
// fine for updating an existing product's price, not enough to create one.
function parsePriceCsv(text: string): ProductImportRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length === 0) return []
  const rows = lines[0].toLowerCase().includes('sku') ? lines.slice(1) : lines
  return rows
    .map((line) => {
      const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''))
      const sku = cols[0] ?? ''
      const name = cols[1] ?? ''
      const price = Number((cols[2] ?? '').replace(/[^\d.]/g, ''))
      const priceExternalRaw = (cols[3] ?? '').replace(/[^\d.]/g, '')
      return { sku, name, category: null, unit: null, price, priceExternal: priceExternalRaw ? Number(priceExternalRaw) : null }
    })
    .filter((r) => (r.sku || r.name) && Number.isFinite(r.price))
}
