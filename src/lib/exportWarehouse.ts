// Excel reports for the Склад page — one per tab, plus the overall
// warehouse statement (оборотная ведомость) for a period. Every report
// lists exactly what the tab shows with its current filters, so what you
// download matches what you see.
import ExcelJS from 'exceljs'
import { translateCategory, translateUnit } from '../i18n/translations'
import type { ProductRow } from './types'
import {
  byExpiry,
  daysUntil,
  EXPIRY_SOON_DAYS,
  formatDay,
  formatDayTime,
  inPeriod,
  liveBatches,
  MOVEMENT_LABELS,
  nearestExpiry,
  periodLabel,
  receiptTotal,
  stockOf,
  stockState,
  STOCK_STATE_LABELS,
  todayIso,
  WAREHOUSE_IS_DEMO,
  WRITE_OFF_REASONS,
  type Movement,
  type Receipt,
  type StockBatch,
  type WarehouseState,
  type WriteOff,
} from './warehouse'
import { THIN_BORDER, triggerXlsxDownload } from './xlsxShared'

type Cell = string | number | null
type Align = 'left' | 'right' | 'center'

interface Column {
  header: string
  width: number
  align?: Align
  /** Excel number format: QTY or MONEY below, or none for text. */
  format?: string
}

const QTY = '#,##0.###'
const MONEY = '#,##0'
const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EFE9' } }
const TOTAL_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F4F0' } }

const unitRu = (u: string) => translateUnit(u, 'ru')
const categoryRu = (c: string) => translateCategory(c, 'ru')
const reasonRu = (r: string) => WRITE_OFF_REASONS.find((x) => x.value === r)?.label ?? r

/** Title, subtitle, header row, data rows and an optional totals row, all
 * bordered — the same look as the other exports on the site. Returns the
 * next free row so a sheet can hold more than one table. */
function writeTable(
  ws: ExcelJS.Worksheet,
  startRow: number,
  title: string,
  subtitle: string,
  columns: Column[],
  rows: Cell[][],
  totals?: Cell[],
  emptyText = 'Нет данных за выбранный период или по выбранным фильтрам.',
): number {
  let r = startRow
  if (startRow === 1) ws.columns = columns.map((c) => ({ width: c.width }))

  const titleCell = ws.getCell(r, 1)
  titleCell.value = title
  titleCell.font = { bold: true, size: 14 }
  ws.mergeCells(r, 1, r, columns.length)
  r += 1
  const sub = WAREHOUSE_IS_DEMO ? `${subtitle} · тестовые данные: склад ещё не подключён к базе` : subtitle
  const subCell = ws.getCell(r, 1)
  subCell.value = sub
  subCell.font = { size: 10, color: { argb: 'FF55523F' } }
  ws.mergeCells(r, 1, r, columns.length)
  r += 2

  columns.forEach((c, i) => {
    const cell = ws.getCell(r, i + 1)
    cell.value = c.header
    cell.font = { bold: true, size: 11 }
    cell.fill = HEADER_FILL
    cell.alignment = { horizontal: c.align ?? 'left', vertical: 'middle', wrapText: true }
    cell.border = THIN_BORDER
  })
  r += 1

  const writeRow = (values: Cell[], isTotal: boolean) => {
    values.forEach((v, i) => {
      const cell = ws.getCell(r, i + 1)
      cell.value = v
      cell.font = { size: 11, bold: isTotal }
      cell.alignment = { horizontal: columns[i]?.align ?? 'left', vertical: 'middle' }
      if (typeof v === 'number' && columns[i]?.format) cell.numFmt = columns[i].format!
      cell.border = THIN_BORDER
      if (isTotal) cell.fill = TOTAL_FILL
    })
    r += 1
  }
  if (rows.length === 0) {
    const cell = ws.getCell(r, 1)
    cell.value = emptyText
    cell.font = { italic: true, size: 11, color: { argb: 'FF55523F' } }
    ws.mergeCells(r, 1, r, columns.length)
    r += 1
  }
  rows.forEach((row) => writeRow(row, false))
  if (totals) writeRow(totals, true)
  ws.views = [{ state: 'frozen', ySplit: startRow === 1 ? 4 : 0 }]
  return r + 1
}

function stamp(): string {
  return todayIso()
}

function batchValue(batches: StockBatch[]): number {
  return batches.reduce((sum, b) => sum + b.qtyLeft * b.purchasePrice, 0)
}

// ---------------------------------------------------------------------------
// Остатки
// ---------------------------------------------------------------------------

function stockSheet(wb: ExcelJS.Workbook, state: WarehouseState, products: ProductRow[], subtitle: string) {
  const ws = wb.addWorksheet('Остатки')
  let totalValue = 0
  const rows = products.map((p) => {
    const s = state.settings[p.id]
    const stock = stockOf(state, p.id)
    const value = batchValue(liveBatches(state, p.id))
    totalValue += value
    const expiry = nearestExpiry(state, p.id)
    return [
      p.name,
      p.sku,
      categoryRu(p.category),
      unitRu(s.baseUnit),
      stock,
      s.minStock,
      STOCK_STATE_LABELS[stockState(stock, s.minStock)],
      expiry ? formatDay(expiry) : s.tracksExpiry ? 'нет партий' : 'без срока',
      Math.round(value),
    ]
  })
  writeTable(
    ws,
    1,
    'Остатки на складе',
    subtitle,
    [
      { header: 'Товар', width: 34 },
      { header: 'Артикул', width: 12 },
      { header: 'Категория', width: 22 },
      { header: 'Ед.', width: 10 },
      { header: 'Остаток', width: 12, align: 'right', format: QTY },
      { header: 'Мин. запас', width: 12, align: 'right', format: QTY },
      { header: 'Статус', width: 16 },
      { header: 'Ближайший срок', width: 16 },
      { header: 'Стоимость остатка (по закупке), сум', width: 22, align: 'right', format: MONEY },
    ],
    rows,
    ['Итого', null, null, null, null, null, null, null, Math.round(totalValue)],
  )
}

export async function downloadStockReport(state: WarehouseState, products: ProductRow[]) {
  const wb = new ExcelJS.Workbook()
  stockSheet(wb, state, products, `На ${formatDay(stamp())} · товаров: ${products.length}`)
  await triggerXlsxDownload(wb, `Склад_Остатки_${stamp()}.xlsx`)
}

/** What's running low, empty or negative — and how much to buy back up to
 * the minimum stock, priced at each product's last purchase price. */
export async function downloadPurchaseList(state: WarehouseState, products: ProductRow[]) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Что закупить')
  let total = 0
  const rows = products
    .map((p) => ({ p, s: state.settings[p.id], stock: stockOf(state, p.id) }))
    .filter(({ s, stock }) => s && stockState(stock, s.minStock) !== 'in')
    .sort((a, b) => a.stock - a.s.minStock - (b.stock - b.s.minStock))
    .map(({ p, s, stock }) => {
      const need = Math.max(0, Math.round((s.minStock - stock) * 1000) / 1000)
      const last = state.batches.filter((b) => b.productId === p.id).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))[0]
      const supplier = last ? state.receipts.find((r) => r.id === last.receiptId)?.supplier ?? '' : ''
      const cost = last ? need * last.purchasePrice : 0
      total += cost
      return [p.name, p.sku, unitRu(s.baseUnit), stock, s.minStock, need, last ? last.purchasePrice : null, Math.round(cost), supplier || '—', STOCK_STATE_LABELS[stockState(stock, s.minStock)]]
    })
  writeTable(
    ws,
    1,
    'Что закупить',
    `На ${formatDay(stamp())} · товары ниже минимального запаса, пустые и в минусе · позиций: ${rows.length}`,
    [
      { header: 'Товар', width: 34 },
      { header: 'Артикул', width: 12 },
      { header: 'Ед.', width: 10 },
      { header: 'Остаток', width: 12, align: 'right', format: QTY },
      { header: 'Мин. запас', width: 12, align: 'right', format: QTY },
      { header: 'Не хватает до минимума', width: 16, align: 'right', format: QTY },
      { header: 'Последняя цена закупки, сум', width: 18, align: 'right', format: MONEY },
      { header: 'Примерная сумма, сум', width: 18, align: 'right', format: MONEY },
      { header: 'Последний поставщик', width: 22 },
      { header: 'Статус', width: 16 },
    ],
    rows,
    ['Итого', null, null, null, null, null, null, Math.round(total), null, null],
    'Всё в наличии — закупать нечего.',
  )
  await triggerXlsxDownload(wb, `Склад_Что_закупить_${stamp()}.xlsx`)
}

// ---------------------------------------------------------------------------
// Приходы
// ---------------------------------------------------------------------------

function receiptRows(receipts: Receipt[], productsById: Map<string, ProductRow>): { rows: Cell[][]; total: number } {
  let total = 0
  const rows: Cell[][] = []
  for (const r of receipts) {
    for (const l of r.lines) {
      const p = productsById.get(l.productId)
      const sum = l.qty * l.purchasePrice
      total += sum
      rows.push([
        formatDayTime(r.receivedAt),
        r.number,
        r.supplier || '—',
        p?.name ?? 'Товар удалён',
        l.qty,
        unitRu(p?.unit ?? ''),
        l.entered ? `${l.entered.qty} × ${unitRu(l.entered.unit)}` : '',
        l.purchasePrice,
        Math.round(sum),
        l.expiresAt ? formatDay(l.expiresAt) : 'без срока',
      ])
    }
  }
  return { rows, total }
}

const RECEIPT_COLUMNS: Column[] = [
  { header: 'Дата', width: 16 },
  { header: '№ прихода', width: 12 },
  { header: 'Поставщик', width: 22 },
  { header: 'Товар', width: 32 },
  { header: 'Количество', width: 12, align: 'right', format: QTY },
  { header: 'Ед.', width: 8 },
  { header: 'Как принято', width: 14 },
  { header: 'Цена закупки за ед., сум', width: 16, align: 'right', format: MONEY },
  { header: 'Сумма, сум', width: 16, align: 'right', format: MONEY },
  { header: 'Срок годности', width: 14 },
]

export async function downloadReceiptsReport(receipts: Receipt[], productsById: Map<string, ProductRow>, from: string, to: string) {
  const wb = new ExcelJS.Workbook()
  const { rows, total } = receiptRows(receipts, productsById)
  writeTable(wb.addWorksheet('Приходы'), 1, 'Приходы товара', `${periodLabel(from, to)} · приходов: ${receipts.length}`, RECEIPT_COLUMNS, rows, [
    'Итого', null, null, null, null, null, null, null, Math.round(total), null,
  ])
  await triggerXlsxDownload(wb, `Склад_Приходы_${from || 'начало'}_${to || stamp()}.xlsx`)
}

/** One receipt as a накладная: header details plus its lines. */
export async function downloadReceiptExcel(receipt: Receipt, productsById: Map<string, ProductRow>) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(receipt.number)
  const rows = receipt.lines.map((l, i) => {
    const p = productsById.get(l.productId)
    return [
      i + 1,
      p?.name ?? 'Товар удалён',
      p?.sku ?? '',
      l.qty,
      unitRu(p?.unit ?? ''),
      l.purchasePrice,
      Math.round(l.qty * l.purchasePrice),
      l.expiresAt ? formatDay(l.expiresAt) : 'без срока',
    ]
  })
  const details = [
    new Date(receipt.receivedAt).toLocaleString('ru-RU', { dateStyle: 'long', timeStyle: 'short' }),
    receipt.supplier ? `поставщик: ${receipt.supplier}` : '',
    receipt.comment ? `комментарий: ${receipt.comment}` : '',
  ].filter(Boolean)
  writeTable(
    ws,
    1,
    `Приходная накладная ${receipt.number}`,
    details.join(' · '),
    [
      { header: '№', width: 6, align: 'center' },
      { header: 'Товар', width: 34 },
      { header: 'Артикул', width: 12 },
      { header: 'Количество', width: 12, align: 'right', format: QTY },
      { header: 'Ед.', width: 8 },
      { header: 'Цена закупки за ед., сум', width: 16, align: 'right', format: MONEY },
      { header: 'Сумма, сум', width: 16, align: 'right', format: MONEY },
      { header: 'Срок годности', width: 14 },
    ],
    rows,
    ['', 'Итого', null, null, null, null, Math.round(receiptTotal(receipt)), null],
  )
  await triggerXlsxDownload(wb, `Приход_${receipt.number}.xlsx`)
}

// ---------------------------------------------------------------------------
// Списания
// ---------------------------------------------------------------------------

function writeOffSheet(wb: ExcelJS.Workbook, writeOffs: WriteOff[], productsById: Map<string, ProductRow>, subtitle: string) {
  const ws = wb.addWorksheet('Списания')
  let total = 0
  const byReason = new Map<string, number>()
  const rows = writeOffs.map((w) => {
    const p = productsById.get(w.productId)
    total += w.loss
    byReason.set(w.reason, (byReason.get(w.reason) ?? 0) + w.loss)
    return [formatDayTime(w.createdAt), p?.name ?? 'Товар удалён', w.qty, unitRu(p?.unit ?? ''), reasonRu(w.reason), w.comment, Math.round(w.loss)]
  })
  const next = writeTable(
    ws,
    1,
    'Списания',
    subtitle,
    [
      { header: 'Дата', width: 16 },
      { header: 'Товар', width: 32 },
      { header: 'Количество', width: 12, align: 'right', format: QTY },
      { header: 'Ед.', width: 8 },
      { header: 'Причина', width: 14 },
      { header: 'Комментарий', width: 30 },
      { header: 'Сумма потерь, сум', width: 18, align: 'right', format: MONEY },
    ],
    rows,
    ['Итого', null, null, null, null, null, Math.round(total)],
  )
  if (rows.length > 0) {
    writeTable(
      ws,
      next,
      'По причинам',
      'Сумма потерь по каждой причине',
      [
        { header: 'Причина', width: 16 },
        { header: 'Сумма потерь, сум', width: 18, align: 'right', format: MONEY },
      ],
      WRITE_OFF_REASONS.filter((r) => byReason.has(r.value)).map((r) => [r.label, Math.round(byReason.get(r.value)!)]),
    )
  }
}

export async function downloadWriteOffsReport(writeOffs: WriteOff[], productsById: Map<string, ProductRow>, from: string, to: string) {
  const wb = new ExcelJS.Workbook()
  writeOffSheet(wb, writeOffs, productsById, `${periodLabel(from, to)} · списаний: ${writeOffs.length}`)
  await triggerXlsxDownload(wb, `Склад_Списания_${from || 'начало'}_${to || stamp()}.xlsx`)
}

// ---------------------------------------------------------------------------
// Сроки годности
// ---------------------------------------------------------------------------

function expirySheet(wb: ExcelJS.Workbook, state: WarehouseState, productsById: Map<string, ProductRow>) {
  const ws = wb.addWorksheet('Сроки годности')
  const number = new Map(state.receipts.map((r) => [r.id, r.number]))
  let total = 0
  const rows = state.batches
    .filter((b) => b.qtyLeft > 0 && b.expiresAt && productsById.has(b.productId) && daysUntil(b.expiresAt) <= EXPIRY_SOON_DAYS)
    .sort(byExpiry)
    .map((b) => {
      const p = productsById.get(b.productId)!
      const days = daysUntil(b.expiresAt!)
      const value = b.qtyLeft * b.purchasePrice
      total += value
      return [
        days < 0 ? 'Истёк срок' : 'Истекает скоро',
        p.name,
        `${number.get(b.receiptId) ?? '—'} от ${formatDay(b.receivedAt)}`,
        b.qtyLeft,
        unitRu(p.unit),
        formatDay(b.expiresAt!),
        days,
        Math.round(value),
      ]
    })
  writeTable(
    ws,
    1,
    'Сроки годности',
    `На ${formatDay(stamp())} · просроченные партии и истекающие в ближайшие ${EXPIRY_SOON_DAYS} дня`,
    [
      { header: 'Группа', width: 16 },
      { header: 'Товар', width: 32 },
      { header: 'Партия', width: 20 },
      { header: 'Остаток', width: 12, align: 'right', format: QTY },
      { header: 'Ед.', width: 8 },
      { header: 'Срок годности', width: 14 },
      { header: 'Дней осталось', width: 14, align: 'right' },
      { header: 'Стоимость (по закупке), сум', width: 20, align: 'right', format: MONEY },
    ],
    rows,
    ['Итого', null, null, null, null, null, null, Math.round(total)],
  )
}

export async function downloadExpiryReport(state: WarehouseState, productsById: Map<string, ProductRow>) {
  const wb = new ExcelJS.Workbook()
  expirySheet(wb, state, productsById)
  await triggerXlsxDownload(wb, `Склад_Сроки_годности_${stamp()}.xlsx`)
}

// ---------------------------------------------------------------------------
// Журнал
// ---------------------------------------------------------------------------

function journalSheet(wb: ExcelJS.Workbook, movements: Movement[], productsById: Map<string, ProductRow>, subtitle: string) {
  const rows = movements.map((m) => {
    const p = productsById.get(m.productId)
    return [formatDayTime(m.at), p?.name ?? 'Товар удалён', MOVEMENT_LABELS[m.type], m.delta, m.balanceAfter, unitRu(p?.unit ?? ''), m.ref]
  })
  writeTable(
    wb.addWorksheet('Журнал'),
    1,
    'Журнал движения товара',
    subtitle,
    [
      { header: 'Дата и время', width: 16 },
      { header: 'Товар', width: 32 },
      { header: 'Тип', width: 14 },
      { header: 'Изменение', width: 12, align: 'right', format: '+#,##0.###;−#,##0.###;0' },
      { header: 'Остаток после', width: 14, align: 'right', format: QTY },
      { header: 'Ед.', width: 8 },
      { header: 'Основание', width: 20 },
    ],
    rows,
  )
}

export async function downloadJournalReport(movements: Movement[], productsById: Map<string, ProductRow>, from: string, to: string) {
  const wb = new ExcelJS.Workbook()
  journalSheet(wb, movements, productsById, `${periodLabel(from, to)} · движений: ${movements.length}`)
  await triggerXlsxDownload(wb, `Склад_Журнал_${from || 'начало'}_${to || stamp()}.xlsx`)
}

// ---------------------------------------------------------------------------
// Общий отчёт по складу
// ---------------------------------------------------------------------------

/**
 * The full warehouse statement for a period: a turnover sheet (остаток на
 * начало, приход, расход по заказам, списано, корректировки, остаток на
 * конец, стоимость остатка) per product, followed by the stock, purchase
 * list, receipts, write-offs, expiry and journal sheets for the same period.
 */
export async function downloadWarehouseReport(state: WarehouseState, products: ProductRow[], from: string, to: string) {
  const wb = new ExcelJS.Workbook()
  const productsById = new Map(products.map((p) => [p.id, p]))
  const before = (iso: string) => !!from && iso.slice(0, 10) < from

  let totalValue = 0
  const rows = products
    .filter((p) => state.settings[p.id])
    .map((p) => {
      let opening = 0
      const moved = { receipt: 0, order: 0, writeoff: 0, adjustment: 0 }
      for (const m of state.movements) {
        if (m.productId !== p.id) continue
        if (before(m.at)) opening += m.delta
        else if (inPeriod(m.at, from, to)) moved[m.type] += m.delta
      }
      const closing = opening + moved.receipt + moved.order + moved.writeoff + moved.adjustment
      const value = batchValue(liveBatches(state, p.id))
      totalValue += value
      const r3 = (n: number) => Math.round(n * 1000) / 1000
      return [p.name, p.sku, unitRu(state.settings[p.id].baseUnit), r3(opening), r3(moved.receipt), r3(-moved.order), r3(-moved.writeoff), r3(moved.adjustment), r3(closing), Math.round(value)]
    })

  writeTable(
    wb.addWorksheet('Сводка'),
    1,
    'Отчёт по складу — оборотная ведомость',
    `${periodLabel(from, to)} · ${state.warehouses[0]?.name ?? 'Склад'} · товаров: ${rows.length}`,
    [
      { header: 'Товар', width: 32 },
      { header: 'Артикул', width: 12 },
      { header: 'Ед.', width: 8 },
      { header: 'Остаток на начало', width: 14, align: 'right', format: QTY },
      { header: 'Приход', width: 12, align: 'right', format: QTY },
      { header: 'Расход по заказам', width: 14, align: 'right', format: QTY },
      { header: 'Списано', width: 12, align: 'right', format: QTY },
      { header: 'Корректировки', width: 14, align: 'right', format: QTY },
      { header: 'Остаток на конец', width: 14, align: 'right', format: QTY },
      { header: 'Стоимость остатка сейчас, сум', width: 20, align: 'right', format: MONEY },
    ],
    rows,
    ['Итого', null, null, null, null, null, null, null, null, Math.round(totalValue)],
  )

  const active = products.filter((p) => state.settings[p.id])
  stockSheet(wb, state, active, `На ${formatDay(stamp())} · товаров: ${active.length}`)
  const receipts = state.receipts.filter((r) => inPeriod(r.receivedAt, from, to))
  const rc = receiptRows(receipts, productsById)
  writeTable(wb.addWorksheet('Приходы'), 1, 'Приходы товара', `${periodLabel(from, to)} · приходов: ${receipts.length}`, RECEIPT_COLUMNS, rc.rows, [
    'Итого', null, null, null, null, null, null, null, Math.round(rc.total), null,
  ])
  const writeOffs = state.writeOffs.filter((w) => inPeriod(w.createdAt, from, to))
  writeOffSheet(wb, writeOffs, productsById, `${periodLabel(from, to)} · списаний: ${writeOffs.length}`)
  expirySheet(wb, state, productsById)
  const movements = state.movements.filter((m) => productsById.has(m.productId) && inPeriod(m.at, from, to))
  journalSheet(wb, movements, productsById, `${periodLabel(from, to)} · движений: ${movements.length}`)

  await triggerXlsxDownload(wb, `Склад_Отчёт_${from || 'начало'}_${to || stamp()}.xlsx`)
}
