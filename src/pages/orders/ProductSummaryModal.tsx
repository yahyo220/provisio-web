import { Download, Printer } from 'lucide-react'
import { useMemo, useState } from 'react'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import { useLanguage } from '../../i18n/LanguageContext'
import { downloadProductSummaryExcel, formatSummaryQty, printProductSummary, summarizeItems } from '../../lib/productSummary'
import { orderLabel } from '../../lib/format'
import type { OrderStatus } from '../../lib/types'
import { addDays, createDemoWarehouse, formatDay, formatQty, stockOf, toDateIso, todayIso } from '../../lib/warehouse'
import { useData } from '../../store/DataContext'
import { DateInput } from '../warehouse/shared'

type Mode = 'pending' | 'done'

/** Still has to leave the warehouse vs. already reached the customer. */
const MODE_STATUSES: Record<Mode, OrderStatus[]> = {
  pending: ['new', 'confirmed', 'preparing', 'ready', 'out'],
  done: ['delivered'],
}

const MODE_LABELS: Record<Mode, string> = {
  pending: 'Нужно списать',
  done: 'Списано',
}

/** "Товары по заказам": every product across the orders of the picked days,
 * added up — what still has to go out, or what already went. No per-customer
 * breakdown; print it or download it. */
export default function ProductSummaryModal({ onClose }: { onClose: () => void }) {
  const { orders, orderItems, products } = useData()
  const { unit } = useLanguage()
  const [from, setFrom] = useState(todayIso())
  const [to, setTo] = useState(todayIso())
  const [mode, setMode] = useState<Mode>('pending')
  const [exporting, setExporting] = useState(false)

  const chosen = useMemo(() => {
    const statuses = new Set(MODE_STATUSES[mode])
    return orders
      .filter((o) => {
        const day = toDateIso(new Date(o.createdAt))
        return statuses.has(o.status) && (!from || day >= from) && (!to || day <= to)
      })
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }, [orders, mode, from, to])

  // Current stock, from the same (demo, for now) warehouse the Склад page shows.
  const warehouse = useMemo(() => {
    const active = products.filter((p) => p.active)
    return createDemoWarehouse(active, orders.map((o) => o.orderNumber).slice(0, 40))
  }, [products, orders])

  const rows = useMemo(() => {
    const ids = new Set(chosen.map((o) => o.id))
    const categoryById = new Map(products.map((p) => [p.id, p.category]))
    const stockText = (productId: string) => {
      const settings = warehouse.settings[productId]
      return settings ? `${formatQty(stockOf(warehouse, productId))} ${unit(settings.baseUnit)}` : undefined
    }
    return summarizeItems(
      orderItems.filter((i) => ids.has(i.orderId)),
      (id) => categoryById.get(id),
      stockText,
    )
  }, [chosen, orderItems, products, warehouse, unit])

  const period = from === to ? formatDay(from) : `${formatDay(from)} – ${formatDay(to)}`
  const title = `Товары по заказам — ${MODE_LABELS[mode].toLowerCase()}`
  const subtitle = `${period} · заказов: ${chosen.length}${chosen.length ? ` (${chosen.map((o) => orderLabel(o)).join(', ')})` : ''}`

  function quick(days: number) {
    const end = todayIso()
    setFrom(days === 1 ? end : addDays(end, -(days - 1)))
    setTo(end)
  }

  async function exportExcel() {
    setExporting(true)
    try {
      await downloadProductSummaryExcel(title, subtitle, rows, unit, `Товары_${mode === 'pending' ? 'нужно_списать' : 'списано'}_${from}_${to}.xlsx`)
    } finally {
      setExporting(false)
    }
  }

  return (
    <Modal
      title="Товары по заказам"
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="text" onClick={onClose}>
            Закрыть
          </Button>
          <Button variant="ghost" icon={<Download />} onClick={exportExcel} disabled={rows.length === 0 || exporting}>
            {exporting ? 'Готовим файл…' : 'Скачать Excel'}
          </Button>
          <Button icon={<Printer />} onClick={() => printProductSummary(title, subtitle, rows, unit)} disabled={rows.length === 0}>
            Печать
          </Button>
        </>
      }
    >
      <div className="chip-row" role="tablist" aria-label="Что показать" style={{ marginBottom: 16 }}>
        {(Object.keys(MODE_LABELS) as Mode[]).map((m) => (
          <button key={m} type="button" className="chip" role="tab" aria-selected={mode === m} onClick={() => setMode(m)}>
            {MODE_LABELS[m]}
          </button>
        ))}
      </div>

      <div className="toolbar bare" style={{ marginBottom: 8 }}>
        <DateInput value={from} onChange={setFrom} label="С" />
        <span className="unit-muted">—</span>
        <DateInput value={to} onChange={setTo} label="По" />
        <button type="button" className="filter-chip" onClick={() => quick(1)}>
          Сегодня
        </button>
        <button
          type="button"
          className="filter-chip"
          onClick={() => {
            const y = addDays(todayIso(), -1)
            setFrom(y)
            setTo(y)
          }}
        >
          Вчера
        </button>
        <button type="button" className="filter-chip" onClick={() => quick(7)}>
          7 дней
        </button>
      </div>

      <p className="unit-muted" style={{ margin: '8px 0 16px' }}>
        {mode === 'pending'
          ? 'Заказы этих дней, которые ещё не доставлены, — всё, что нужно выдать со склада.'
          : 'Заказы этих дней, которые уже дошли до клиентов, — всё, что по ним списано.'}{' '}
        {subtitle}
      </p>

      {rows.length === 0 ? (
        <div className="empty-state">{chosen.length === 0 ? 'За эти дни таких заказов нет.' : 'В этих заказах нет товаров.'}</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>№</th>
                <th>Товар</th>
                <th style={{ textAlign: 'right' }}>Количество</th>
                <th style={{ textAlign: 'right' }}>На складе</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.productId ?? r.name}|${r.unit}`}>
                  <td className="unit-muted">{i + 1}</td>
                  <td style={{ fontWeight: 600 }}>{r.name}</td>
                  <td style={{ textAlign: 'right' }}>
                    <span className="wh-qty">
                      {formatSummaryQty(r.total)}
                      <span className="unit">{unit(r.unit)}</span>
                    </span>
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }} className="unit-muted">
                    {r.stock}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  )
}
