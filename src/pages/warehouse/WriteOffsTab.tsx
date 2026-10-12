import { CircleAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import Card from '../../components/ui/Card'
import Dropdown from '../../components/ui/Dropdown'
import Pagination from '../../components/ui/Pagination'
import { useLanguage } from '../../i18n/LanguageContext'
import { downloadWriteOffsReport } from '../../lib/exportWarehouse'
import { formatMoney } from '../../lib/format'
import type { ProductRow } from '../../lib/types'
import {
  addDays,
  formatDay,
  formatQty,
  inPeriod,
  manualWriteOffViews,
  orderWriteOffViews,
  periodLabel,
  todayIso,
  WRITE_OFF_REASONS,
  type WarehouseState,
  type WriteOffReason,
} from '../../lib/warehouse'
import { useData } from '../../store/DataContext'
import { DateInput, ExportButton, ProductCell } from './shared'

const PAGE_SIZE = 15

const REASON_TONE: Record<WriteOffReason, string> = {
  spoiled: 'out',
  damaged: 'out',
  expired: 'low',
  other: 'low',
  order: 'in',
}

export default function WriteOffsTab({ state, productsById }: { state: WarehouseState; productsById: Map<string, ProductRow> }) {
  const { orders, orderItems } = useData()
  const { unit } = useLanguage()
  const [from, setFrom] = useState(addDays(todayIso(), -30))
  const [to, setTo] = useState(todayIso())
  const [reason, setReason] = useState<WriteOffReason | null>(null)
  const [page, setPage] = useState(1)

  // Manual write-offs (demo, like the rest of the warehouse) plus every line
  // of a delivered order — those are real orders from the database.
  const all = useMemo(
    () => [...manualWriteOffViews(state, productsById), ...orderWriteOffViews(orders, orderItems)].sort((a, b) => b.at.localeCompare(a.at)),
    [state, productsById, orders, orderItems],
  )
  const filtered = useMemo(() => all.filter((w) => inPeriod(w.at, from, to) && (!reason || w.reason === reason)), [all, from, to, reason])

  const losses = filtered.filter((w) => w.reason !== 'order')
  const byOrder = filtered.filter((w) => w.reason === 'order')
  const lossSum = losses.reduce((sum, w) => sum + w.amount, 0)
  const orderSum = byOrder.reduce((sum, w) => sum + w.amount, 0)
  const orderCount = new Set(byOrder.map((w) => w.orderNumber)).size

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  return (
    <>
      <div className="wh-summary-row">
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <Card className="kpi-card wh-summary">
            <span className="kpi-label">Потери за период</span>
            <div className="kpi-value wh-tone-danger">{formatMoney(lossSum)}</div>
            <span className="unit-muted">
              списаний: {losses.length} · {periodLabel(from, to)}
            </span>
          </Card>
          <Card className="kpi-card wh-summary">
            <span className="kpi-label">По заказам (доставлено)</span>
            <div className="kpi-value">{formatMoney(orderSum)}</div>
            <span className="unit-muted">
              заказов: {orderCount} · без НДС · {periodLabel(from, to)}
            </span>
          </Card>
        </div>
        <ExportButton label="Скачать Excel" onExport={() => downloadWriteOffsReport(filtered, from, to)} />
      </div>

      <Card>
        <div className="toolbar bare">
          <DateInput value={from} onChange={(v) => { setFrom(v); setPage(1) }} label="Период, с" />
          <DateInput value={to} onChange={(v) => { setTo(v); setPage(1) }} label="Период, по" />
          <Dropdown
            allLabel="Все причины"
            icon={<CircleAlert />}
            variant="pill"
            options={WRITE_OFF_REASONS}
            value={reason}
            onChange={(v) => { setReason(v as WriteOffReason | null); setPage(1) }}
          />
        </div>
      </Card>

      <Card>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Дата</th>
                <th>Товар</th>
                <th style={{ textAlign: 'right' }}>Количество</th>
                <th>Причина</th>
                <th style={{ textAlign: 'right' }}>Сумма</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <div className="empty-state">{reason === 'order' ? 'За этот период доставленных заказов нет.' : 'За этот период списаний нет.'}</div>
                  </td>
                </tr>
              )}
              {pageRows.map((w) => {
                const product = w.productId ? productsById.get(w.productId) : undefined
                return (
                  <tr key={w.id}>
                    <td>{formatDay(w.at)}</td>
                    <td>
                      {product ? (
                        <ProductCell product={product} sub={w.note || product.sku} />
                      ) : (
                        <>
                          <div className="prod-name">{w.name}</div>
                          <div className="prod-sku">{w.note}</div>
                        </>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="wh-qty">
                        {formatQty(w.qty)}
                        <span className="unit">{unit(w.unit)}</span>
                      </span>
                    </td>
                    <td>
                      <span className="wh-badge" data-tone={REASON_TONE[w.reason]}>
                        {WRITE_OFF_REASONS.find((r) => r.value === w.reason)?.label}
                        {w.orderNumber != null ? ` №${w.orderNumber}` : ''}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }} className={w.reason === 'order' ? undefined : 'wh-exp-late'}>
                      {w.reason === 'order' ? formatMoney(w.amount) : `−${formatMoney(w.amount)}`}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <Pagination
          page={safePage}
          pageCount={pageCount}
          onChange={setPage}
          totalLabel={`Показано ${pageRows.length} из ${filtered.length}`}
          prevLabel="Предыдущая страница"
          nextLabel="Следующая страница"
        />
      </Card>
    </>
  )
}
