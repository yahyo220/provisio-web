import { Minus } from 'lucide-react'
import { useMemo } from 'react'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import { downloadExpiryReport } from '../../lib/exportWarehouse'
import type { ProductRow } from '../../lib/types'
import { daysUntil, EXPIRY_SOON_DAYS, formatDay, type StockBatch, type WarehouseState } from '../../lib/warehouse'
import { ExportButton, ProductCell, Qty } from './shared'

type DatedBatch = StockBatch & { expiresAt: string }

interface ExpiryTabProps {
  state: WarehouseState
  productsById: Map<string, ProductRow>
  onWriteOff: (productId: string, batchId: string) => void
}

export default function ExpiryTab({ state, productsById, onWriteOff }: ExpiryTabProps) {
  const receiptNumber = useMemo(() => new Map(state.receipts.map((r) => [r.id, r.number])), [state.receipts])
  // Only batches that expire at all — kitchen equipment, cleaning supplies
  // and packaging carry no date and never show up here.
  const live = useMemo(
    () =>
      state.batches
        .filter((b): b is DatedBatch => b.qtyLeft > 0 && b.expiresAt != null && productsById.has(b.productId))
        .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt)),
    [state.batches, productsById],
  )
  const expired = live.filter((b) => daysUntil(b.expiresAt) < 0)
  const soon = live.filter((b) => {
    const d = daysUntil(b.expiresAt)
    return d >= 0 && d <= EXPIRY_SOON_DAYS
  })

  function group(title: string, tone: 'late' | 'soon', batches: DatedBatch[], empty: string) {
    return (
      <Card>
        <p className="section-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="wh-badge" data-tone={tone === 'late' ? 'out' : 'low'}>
            {batches.length}
          </span>
          {title}
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Товар</th>
                <th>Партия</th>
                <th style={{ textAlign: 'right' }}>Остаток</th>
                <th>Срок годности</th>
                <th style={{ textAlign: 'right' }}>Дней</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {batches.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">{empty}</div>
                  </td>
                </tr>
              )}
              {batches.map((b) => {
                const product = productsById.get(b.productId)
                const days = daysUntil(b.expiresAt)
                return (
                  <tr key={b.id}>
                    <td>
                      <ProductCell product={product} />
                    </td>
                    <td className="unit-muted">
                      {receiptNumber.get(b.receiptId) ?? '—'} · от {formatDay(b.receivedAt)}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Qty value={b.qtyLeft} unit={product?.unit ?? ''} />
                    </td>
                    <td className={tone === 'late' ? 'wh-exp-late' : 'wh-exp-soon'}>{formatDay(b.expiresAt)}</td>
                    <td style={{ textAlign: 'right' }} className={tone === 'late' ? 'wh-exp-late' : 'wh-exp-soon'}>
                      {days < 0 ? `просрочено ${-days}` : days === 0 ? 'сегодня' : days}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Button variant="ghost" icon={<Minus />} onClick={() => onWriteOff(b.productId, b.id)}>
                        Списать
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    )
  }

  return (
    <>
      <div className="wh-summary-row" style={{ justifyContent: 'flex-end' }}>
        <ExportButton label="Скачать Excel" onExport={() => downloadExpiryReport(state, productsById)} />
      </div>
      {group('Истёк срок', 'late', expired, 'Просроченных партий нет.')}
      {group(`Истекает в ближайшие ${EXPIRY_SOON_DAYS} дня`, 'soon', soon, 'В ближайшие дни ничего не истекает.')}
    </>
  )
}
