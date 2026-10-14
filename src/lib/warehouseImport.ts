// Склад — import of a receipt (приход) or a write-off (списание) from an
// Excel or CSV file. The file only needs a header row naming its columns
// ("Товар", "Количество", "Цена", "Срок годности", "Причина"…, in any order
// and any case); products are found by article (SKU) or by name. Rows that
// match nothing come back separately so the page can say which ones.
import ExcelJS from 'exceljs'
import { translateUnit } from '../i18n/translations'
import { byCatalog } from './catalogOrder'
import type { ProductRow } from './types'
import { MANUAL_WRITE_OFF_REASONS, toDateIso, type WarehouseState, type WriteOffReason } from './warehouse'
import { THIN_BORDER, triggerXlsxDownload } from './xlsxShared'

type Field = 'product' | 'sku' | 'qty' | 'unit' | 'price' | 'expiry' | 'reason' | 'comment'

/** Header words → column meaning. Checked in this order, first match wins. */
const HEADER_WORDS: [Field, RegExp][] = [
  ['sku', /артикул|sku|код/i],
  ['product', /товар|наимен|назван|продукт|mahsulot|nomi/i],
  ['qty', /кол|qty|miqdor|сони/i],
  ['unit', /^ед|единиц|birlik|o.?lchov/i],
  ['price', /цен|стоим|narx/i],
  ['expiry', /срок|годн|muddat/i],
  ['reason', /причин|sabab/i],
  ['comment', /коммент|примеч|izoh/i],
]

export interface ImportedRow {
  /** Row number in the file, for messages. */
  row: number
  productId: string
  qty: number
  unit: string | null
  price: number | null
  expiresAt: string | null
  reason: WriteOffReason | null
  comment: string
}

export interface ImportResult {
  rows: ImportedRow[]
  /** Rows whose product isn't in the warehouse catalog: "строка 5: Помидорка". */
  unmatched: string[]
  /** Set when the file itself couldn't be read. */
  error: string | null
}

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return ''
  if (value instanceof Date) return toDateIso(value)
  if (typeof value === 'object') {
    if ('result' in value && value.result != null) return cellText(value.result as ExcelJS.CellValue)
    if ('text' in value) return String(value.text)
    if ('richText' in value) return value.richText.map((r) => r.text).join('')
    return ''
  }
  return String(value)
}

async function readRows(file: File): Promise<string[][]> {
  if (/\.csv$/i.test(file.name) || file.type === 'text/csv') {
    const text = (await file.text()).replace(/^﻿/, '')
    const lines = text.split(/\r?\n/).filter((l) => l.trim())
    const sep = (lines[0]?.split(';').length ?? 0) > (lines[0]?.split(',').length ?? 0) ? ';' : ','
    return lines.map((l) => l.split(sep).map((c) => c.trim().replace(/^"(.*)"$/, '$1')))
  }
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await file.arrayBuffer())
  const ws = wb.worksheets[0]
  const out: string[][] = []
  ws?.eachRow({ includeEmpty: true }, (row, n) => {
    const cells: string[] = []
    for (let c = 1; c <= row.cellCount; c++) cells.push(cellText(row.getCell(c).value).trim())
    out[n - 1] = cells
  })
  return Array.from(out, (r) => r ?? [])
}

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/[«»"']/g, '').replace(/\s+/g, ' ').trim()

function parseNumber(text: string): number | null {
  const cleaned = text.replace(/\s/g, '').replace(/[^\d.,-]/g, '').replace(',', '.')
  if (!cleaned) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

/** "2026-11-05", "05.11.2026", "5/11/26" → "2026-11-05". */
function parseDate(text: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10)
  const m = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/)
  if (!m) return null
  const year = m[3].length === 2 ? `20${m[3]}` : m[3]
  return `${year}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
}

function parseReason(text: string): WriteOffReason | null {
  const t = norm(text)
  if (!t) return null
  return MANUAL_WRITE_OFF_REASONS.find((r) => norm(r.label) === t || t.startsWith(norm(r.label).slice(0, 4)))?.value ?? null
}

/** Reads [file] and matches each row to a product the warehouse tracks. */
export async function importWarehouseFile(file: File, state: WarehouseState, products: ProductRow[]): Promise<ImportResult> {
  let table: string[][]
  try {
    table = await readRows(file)
  } catch (err) {
    console.error(err)
    return { rows: [], unmatched: [], error: 'Не удалось прочитать файл. Нужен Excel (.xlsx) или CSV.' }
  }

  // Header: the first row that names a product column within the first 10.
  const headerIndex = table.slice(0, 10).findIndex((r) => r.some((c) => /товар|наимен|назван|продукт|артикул|mahsulot/i.test(c)))
  if (headerIndex < 0) {
    return { rows: [], unmatched: [], error: 'В файле нет строки с заголовками. Первая строка таблицы должна быть, например: Товар | Количество | Цена закупки | Срок годности.' }
  }
  const columns = new Map<Field, number>()
  table[headerIndex].forEach((header, i) => {
    const field = HEADER_WORDS.find(([f, re]) => !columns.has(f) && re.test(header))?.[0]
    if (field) columns.set(field, i)
  })
  if (!columns.has('product') && !columns.has('sku')) {
    return { rows: [], unmatched: [], error: 'Не нашли колонку «Товар» (или «Артикул»).' }
  }

  const tracked = products.filter((p) => state.settings[p.id])
  const bySku = new Map(tracked.filter((p) => p.sku).map((p) => [norm(p.sku), p]))
  const byName = new Map(tracked.map((p) => [norm(p.name), p]))
  const find = (sku: string, name: string): ProductRow | undefined => {
    if (sku && bySku.has(norm(sku))) return bySku.get(norm(sku))
    const n = norm(name)
    if (!n) return undefined
    if (byName.has(n)) return byName.get(n)
    // A unique product whose name starts with what's written ("Помидор черри" → "Помидор черри красный").
    const close = tracked.filter((p) => norm(p.name).startsWith(n))
    return close.length === 1 ? close[0] : undefined
  }

  const get = (r: string[], f: Field) => (columns.has(f) ? (r[columns.get(f)!] ?? '').trim() : '')
  const rows: ImportedRow[] = []
  const unmatched: string[] = []
  table.slice(headerIndex + 1).forEach((r, i) => {
    const rowNumber = headerIndex + i + 2
    const name = get(r, 'product')
    const sku = get(r, 'sku')
    // Rows left without a quantity (the template lists every product) are skipped.
    const qty = parseNumber(get(r, 'qty'))
    if ((!name && !sku) || !qty) return
    const product = find(sku, name)
    if (!product) {
      unmatched.push(`строка ${rowNumber}: ${name || sku}`)
      return
    }
    const settings = state.settings[product.id]
    const unitText = norm(get(r, 'unit'))
    const units = [settings.baseUnit, ...Object.keys(settings.unitSize)]
    const unit = unitText ? units.find((u) => norm(u) === unitText || norm(translateUnit(u, 'ru')) === unitText) ?? null : null
    rows.push({
      row: rowNumber,
      productId: product.id,
      qty,
      unit,
      price: parseNumber(get(r, 'price')),
      expiresAt: parseDate(get(r, 'expiry')),
      reason: parseReason(get(r, 'reason')),
      comment: get(r, 'comment'),
    })
  })
  return { rows, unmatched, error: rows.length || unmatched.length ? null : 'В файле нет строк с товарами и количеством.' }
}

/** An empty file to fill in: the headers the import understands, plus every
 * tracked product (in catalog order) so only the numbers need typing. */
export async function downloadImportTemplate(kind: 'receipt' | 'writeoff', state: WarehouseState, products: ProductRow[]) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(kind === 'receipt' ? 'Приход' : 'Списание')
  const headers =
    kind === 'receipt'
      ? ['Товар', 'Артикул', 'Ед.', 'Количество', 'Цена закупки за ед., сум', 'Срок годности (дд.мм.гггг)']
      : ['Товар', 'Артикул', 'Ед.', 'Количество', 'Причина (Порча / Брак / Просрочка / Другое)', 'Комментарий']
  ws.columns = [{ width: 36 }, { width: 12 }, { width: 10 }, { width: 14 }, { width: 28 }, { width: 28 }]
  headers.forEach((h, i) => {
    const cell = ws.getCell(1, i + 1)
    cell.value = h
    cell.font = { bold: true }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EFE9' } }
    cell.border = THIN_BORDER
  })
  byCatalog(
    products.filter((p) => state.settings[p.id]),
    (p) => p.category,
    (p) => p.name,
  ).forEach((p, i) => {
    const values = [p.name, p.sku, translateUnit(state.settings[p.id].baseUnit, 'ru')]
    values.forEach((v, c) => {
      const cell = ws.getCell(i + 2, c + 1)
      cell.value = v
      cell.border = THIN_BORDER
    })
    for (let c = 4; c <= 6; c++) ws.getCell(i + 2, c).border = THIN_BORDER
  })
  ws.views = [{ state: 'frozen', ySplit: 1 }]
  await triggerXlsxDownload(wb, kind === 'receipt' ? 'Шаблон_приход.xlsx' : 'Шаблон_списание.xlsx')
}
