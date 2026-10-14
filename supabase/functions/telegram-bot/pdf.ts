// Freshline — the PDFs the bot sends: an order's накладная and the daily
// "Товары по заказам" summary. Same layout and product order as the
// website's printed sheets (src/lib/printOrder.ts, productSummary.ts).
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'npm:pdf-lib@1.17.1'
import fontkit from 'npm:@pdf-lib/fontkit@1.1.1'

const FONT_URL = 'https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans.ttf'
const BOLD_URL = 'https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans-Bold.ttf'
let fontCache: Promise<[ArrayBuffer, ArrayBuffer]> | null = null
function fonts() {
  fontCache ??= Promise.all([FONT_URL, BOLD_URL].map((u) => fetch(u).then((r) => r.arrayBuffer()))) as Promise<[ArrayBuffer, ArrayBuffer]>
  return fontCache
}

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

export function money(n: number) {
  return `${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} сум`
}
export function qty(n: number) {
  return String(Math.round(n * 1000) / 1000).replace('.', ',')
}

const A4: [number, number] = [595.28, 841.89]
const M = 40

interface Column {
  title: string
  width: number
  align?: 'left' | 'right'
}

/** A tiny page writer: text lines and a table that continues on new pages. */
class Sheet {
  pages: PDFPage[] = []
  y = 0
  constructor(private doc: PDFDocument, private font: PDFFont, private bold: PDFFont) {
    this.newPage()
  }
  newPage() {
    this.pages.push(this.doc.addPage(A4))
    this.y = A4[1] - M
  }
  get page() {
    return this.pages[this.pages.length - 1]
  }
  ensure(h: number) {
    if (this.y - h < M) this.newPage()
  }
  fit(text: string, size: number, width: number, font = this.font) {
    let t = text
    while (t.length > 1 && font.widthOfTextAtSize(t, size) > width) t = t.slice(0, -2) + '…'
    return t
  }
  text(text: string, size = 10, opts: { bold?: boolean; color?: number; gap?: number } = {}) {
    this.ensure(size + 4)
    const font = opts.bold ? this.bold : this.font
    this.page.drawText(this.fit(text, size, A4[0] - 2 * M, font), { x: M, y: this.y - size, size, font, color: rgb(opts.color ?? 0.07, opts.color ?? 0.07, opts.color ?? 0.07) })
    this.y -= size + (opts.gap ?? 6)
  }
  table(columns: Column[], rows: string[][], size = 9.5) {
    const rowH = size + 9
    const drawRow = (cells: string[], header: boolean) => {
      this.ensure(rowH)
      let x = M
      if (header) this.page.drawRectangle({ x: M, y: this.y - rowH, width: A4[0] - 2 * M, height: rowH, color: rgb(0.92, 0.92, 0.92) })
      columns.forEach((c, i) => {
        const font = header ? this.bold : this.font
        const t = this.fit(cells[i] ?? '', size, c.width - 8, font)
        const w = font.widthOfTextAtSize(t, size)
        this.page.drawText(t, { x: c.align === 'right' ? x + c.width - 4 - w : x + 4, y: this.y - rowH + 5, size, font, color: rgb(0.07, 0.07, 0.07) })
        this.page.drawRectangle({ x, y: this.y - rowH, width: c.width, height: rowH, borderColor: rgb(0.6, 0.6, 0.6), borderWidth: 0.6 })
        x += c.width
      })
      this.y -= rowH
    }
    drawRow(columns.map((c) => c.title), true)
    for (const r of rows) {
      if (this.y - rowH < M) {
        this.newPage()
        drawRow(columns.map((c) => c.title), true)
      }
      drawRow(r, false)
    }
    this.y -= 8
  }
  signatures(left: string, right: string) {
    this.ensure(70)
    this.y -= 30
    const w = (A4[0] - 2 * M - 40) / 2
    ;[left, right].forEach((label, i) => {
      const x = M + i * (w + 40)
      this.page.drawText(this.fit(label, 10, w), { x, y: this.y, size: 10, font: this.font })
      this.page.drawLine({ start: { x, y: this.y - 22 }, end: { x: x + w, y: this.y - 22 }, thickness: 0.8 })
      this.page.drawText('подпись / ФИО', { x, y: this.y - 34, size: 8, font: this.font, color: rgb(0.45, 0.45, 0.45) })
    })
    this.y -= 44
  }
}

async function start() {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const [regular, boldBytes] = await fonts()
  const font = await doc.embedFont(regular, { subset: true })
  const bold = await doc.embedFont(boldBytes, { subset: true })
  return { doc, sheet: new Sheet(doc, font, bold) }
}

export interface OrderLine {
  name: string
  category?: string | null
  qty: number
  unit: string
  price: number
}

export async function orderPdf(o: {
  number: number
  company: string
  placedBy: string
  createdAt: string
  address: string
  slot: string
  payment: string
  lines: OrderLine[]
}): Promise<Uint8Array> {
  const { doc, sheet } = await start()
  const net = o.lines.reduce((s, l) => s + l.qty * l.price, 0)
  const vat = Math.round(net * 0.12)
  sheet.text(`Заказ №${o.number}`, 18, { bold: true, gap: 4 })
  sheet.text(o.company, 13, { bold: true, gap: 4 })
  sheet.text(`Оформлен ${new Date(o.createdAt).toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent', dateStyle: 'long', timeStyle: 'short' })}`, 9, { color: 0.35, gap: 10 })
  for (const [k, v] of [
    ['Заказал', o.placedBy !== o.company ? o.placedBy : ''],
    ['Адрес доставки', o.address],
    ['Время доставки', o.slot],
    ['Оплата', o.payment],
  ]) {
    if (v) sheet.text(`${k}: ${v}`, 10, { gap: 4 })
  }
  sheet.y -= 8
  sheet.table(
    [
      { title: '№', width: 28 },
      { title: 'Товар', width: 215 },
      { title: 'Кол-во', width: 58, align: 'right' },
      { title: 'Ед.', width: 50 },
      { title: 'Цена', width: 82, align: 'right' },
      { title: 'Сумма', width: 82, align: 'right' },
    ],
    byCatalog(o.lines).map((l, i) => [String(i + 1), l.name, qty(l.qty), l.unit, money(l.price), money(l.qty * l.price)]),
  )
  sheet.text(`Сумма без НДС: ${money(net)}`, 10, { gap: 3 })
  sheet.text(`НДС 12%: ${money(vat)}`, 10, { gap: 3 })
  sheet.text(`Итого с НДС: ${money(net + vat)}`, 12, { bold: true })
  sheet.signatures('Сдал (Freshline)', `Принял (${o.company})`)
  return doc.save()
}

export interface SummaryRow {
  name: string
  category?: string | null
  unit: string
  total: number
  price: number | null
}

export async function summaryPdf(title: string, subtitle: string, rows: SummaryRow[]): Promise<Uint8Array> {
  const { doc, sheet } = await start()
  sheet.text(title, 16, { bold: true, gap: 4 })
  sheet.text(subtitle, 9, { color: 0.35, gap: 12 })
  sheet.table(
    [
      { title: '', width: 22 },
      { title: '№', width: 28 },
      { title: 'Товар', width: 245 },
      { title: 'Ед.', width: 60 },
      { title: 'Количество', width: 80, align: 'right' },
      { title: 'Цена', width: 80, align: 'right' },
    ],
    byCatalog(rows).map((r, i) => ['☐', String(i + 1), r.name, r.unit, qty(r.total), r.price != null ? money(r.price) : '—']),
  )
  sheet.text(`Позиций: ${rows.length}`, 9, { color: 0.35 })
  return doc.save()
}
