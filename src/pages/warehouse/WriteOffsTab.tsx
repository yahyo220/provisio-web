import { CircleAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import Card from '../../components/ui/Card'
import Dropdown from '../../components/ui/Dropdown'
import Pagination from '../../components/ui/Pagination'
import { downloadWriteOffsReport } from '../../lib/exportWarehouse'
import { formatMoney } from '../../lib/format'
import type { ProductRow } from '../../lib/types'
import { addDays, formatDay, inPeriod, periodLabel, todayIso, WRITE_OFF_REASONS, type WarehouseState, type WriteOffReason } from '../../lib/warehouse'
import { DateInput, ExportButton, ProductCell, Qty } from './shared'

const PAGE_SIZE = 15

export default function WriteOffsTab({ state, productsById }: { state: WarehouseState; productsById: Map<string, ProductRow> }) {
  const [from, setFrom] = useState(addDays(todayIso(), -30))
  const [to, setTo] = useState(todayIso())
  const [reason, setReason] = useState<WriteOffReason | null>(null)
  const [page, setPage] = useState(1)

  const filtered = useMemo(
    () => state.writeOffs.filter((w) => inPeriod(w.createdAt, from, to) && (!reason || w.reason === reason)),
    [state.writeOffs, from, to, reason],
  )
  const loss = filtered.reduce((sum, w) => sum + w.loss, 0)
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  return (
    <>
      <div className="wh-summary-row">
        <Card className="kpi-card wh-summary">
          <span className="kpi-label">Потери за период</span>
          <div className="kpi-value wh-tone-danger">{formatMoney(loss)}</div>
          <span className="unit-muted">
            {filtered.length} {filtered.length === 1 ? 'списание' : filtered.length < 5 && filtered.length > 1 ? 'списания' : 'списаний'} · {periodLabel(from, to)}
          </span>
        </Card>
        <ExportButton label="Скачать Excel" onExport={() => downloadWriteOffsReport(filtered, productsById, from, to)} />
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
                <th style={{ textAlign: 'right' }}>Сумма потерь</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <div className="empty-state">За этот период списаний нет.</div>
                  </td>
                </tr>
              )}
              {pageRows.map((w) => {
                const product = productsById.get(w.productId)
                return (
                  <tr key={w.id}>
                    <td>{formatDay(w.createdAt)}</td>
                    <td>
                      <ProductCell product={product} sub={w.comment || product?.sku} />
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Qty value={w.qty} unit={product?.unit ?? ''} />
                    </td>
                    <td>
                      <span className="wh-badge" data-tone={w.reason === 'expired' ? 'low' : 'out'}>
                        {WRITE_OFF_REASONS.find((r) => r.value === w.reason)?.label}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }} className="wh-exp-late">
                      −{formatMoney(w.loss)}
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
