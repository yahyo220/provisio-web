// "Печать заказа" on the Order page: a clean one-page order sheet — no
// sidebar, buttons or dashboard chrome — printed from a hidden iframe, so
// it needs no popup permission and leaves the page itself untouched.
import type { OrderLineItem } from './data'
import { formatMoney } from './format'
import type { CustomerRow, OrderRow } from './types'
import { vatOf } from './vat'

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cash: 'Наличные',
  transfer: 'Перечисление',
  card: 'Карта',
}

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

function formatQty(qty: number): string {
  return qty.toLocaleString('ru-RU', { maximumFractionDigits: 3 })
}

export function orderSheetHtml(order: OrderRow, customer: CustomerRow | undefined, lines: OrderLineItem[], unitLabel: (u: string) => string): string {
  const net = lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0) + order.deliveryFee
  const vat = vatOf(net)
  const info: [string, string][] = [
    ['Клиент', customer?.companyName || order.customer],
    ['Контакт', [customer?.contact !== '—' ? customer?.contact : '', customer?.phone].filter(Boolean).join(', ')],
    ['Адрес доставки', order.deliveryAddress ?? ''],
    ['Время доставки', order.deliverySlot ?? ''],
    ['Оплата', PAYMENT_METHOD_LABEL[order.paymentMethod ?? ''] ?? ''],
  ]
  const rows = lines
    .map(
      (l, i) => `<tr>
        <td>${i + 1}</td>
        <td>${esc(l.name)}</td>
        <td class="num">${esc(formatQty(l.qty))}</td>
        <td>${esc(unitLabel(l.unit))}</td>
        <td class="num">${esc(formatMoney(l.unitPrice))}</td>
        <td class="num">${esc(formatMoney(l.qty * l.unitPrice))}</td>
      </tr>`,
    )
    .join('')
  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>Заказ №${order.orderNumber}</title>
<style>
  @page { size: A4; margin: 16mm; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color: #111; font-size: 12pt; }
  h1 { font-size: 18pt; margin: 0 0 4px; }
  .muted { color: #555; font-size: 10pt; margin-bottom: 16px; }
  .info { border-collapse: collapse; margin-bottom: 16px; }
  .info td { padding: 2px 16px 2px 0; vertical-align: top; }
  .info td:first-child { color: #555; white-space: nowrap; }
  table.items { width: 100%; border-collapse: collapse; }
  table.items th, table.items td { border: 1px solid #999; padding: 6px 8px; text-align: left; }
  table.items th { background: #eee; font-size: 10pt; }
  .num { text-align: right !important; white-space: nowrap; }
  .totals { margin-top: 12px; margin-left: auto; border-collapse: collapse; }
  .totals td { padding: 3px 0 3px 24px; text-align: right; }
  .totals tr:last-child td { font-weight: 700; font-size: 13pt; border-top: 1px solid #999; padding-top: 6px; }
</style></head>
<body>
  <h1>Заказ №${order.orderNumber}</h1>
  <div class="muted">Оформлен ${esc(new Date(order.createdAt).toLocaleString('ru-RU', { dateStyle: 'long', timeStyle: 'short' }))}</div>
  <table class="info">${info
    .filter(([, v]) => v)
    .map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`)
    .join('')}</table>
  <table class="items">
    <thead><tr><th>№</th><th>Товар</th><th class="num">Кол-во</th><th>Ед.</th><th class="num">Цена</th><th class="num">Сумма</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <table class="totals">
    ${order.deliveryFee > 0 ? `<tr><td>Доставка</td><td>${esc(formatMoney(order.deliveryFee))}</td></tr>` : ''}
    <tr><td>Сумма без НДС</td><td>${esc(formatMoney(net))}</td></tr>
    <tr><td>НДС 12%</td><td>${esc(formatMoney(vat))}</td></tr>
    <tr><td>Итого с НДС</td><td>${esc(formatMoney(net + vat))}</td></tr>
  </table>
</body></html>`
}

export function printOrder(order: OrderRow, customer: CustomerRow | undefined, lines: OrderLineItem[], unitLabel: (u: string) => string) {
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;'
  document.body.appendChild(frame)
  const doc = frame.contentDocument
  const win = frame.contentWindow
  if (!doc || !win) {
    frame.remove()
    return
  }
  doc.open()
  doc.write(orderSheetHtml(order, customer, lines, unitLabel))
  doc.close()
  // Remove the frame once the print dialog is closed (afterprint), with a
  // fallback for browsers that don't fire it on iframes.
  const cleanup = () => setTimeout(() => frame.remove(), 0)
  win.addEventListener('afterprint', cleanup, { once: true })
  setTimeout(cleanup, 60_000)
  win.focus()
  win.print()
}
