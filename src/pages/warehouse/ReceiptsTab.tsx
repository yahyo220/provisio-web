import { Plus, Search, Truck } from 'lucide-react'
import { useMemo, useState } from 'react'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Dropdown from '../../components/ui/Dropdown'
import Modal from '../../components/ui/Modal'
import Pagination from '../../components/ui/Pagination'
import { useLanguage } from '../../i18n/LanguageContext'
import { downloadReceiptExcel, downloadReceiptsReport } from '../../lib/exportWarehouse'
import { formatMoney } from '../../lib/format'
import type { ProductRow } from '../../lib/types'
import { addDays, formatDay, formatDayTime, formatQty, inPeriod, periodLabel, receiptTotal, todayIso, type Receipt, type WarehouseState } from '../../lib/warehouse'
import { DateInput, ExportButton, ProductCell, Qty } from './shared'

const PAGE_SIZE = 15

interface ReceiptsTabProps {
  state: WarehouseState
  productsById: Map<string, ProductRow>
  onNewReceipt: () => void
}

export default function ReceiptsTab({ state, productsById, onNewReceipt }: ReceiptsTabProps) {
  const [from, setFrom] = useState(addDays(todayIso(), -30))
  const [to, setTo] = useState(todayIso())
  const [supplier, setSupplier] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [openReceipt, setOpenReceipt] = useState<Receipt | null>(null)

  const suppliers = useMemo(() => [...new Set(state.receipts.map((r) => r.supplier).filter(Boolean))].sort(), [state.receipts])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return state.receipts.filter(
      (r) =>
        inPeriod(r.receivedAt, from, to) &&
        (!supplier || r.supplier === supplier) &&
        (!q || r.lines.some((l) => productsById.get(l.productId)?.name.toLowerCase().includes(q))),
    )
  }, [state.receipts, from, to, supplier, search, productsById])

  const total = filtered.reduce((sum, r) => sum + receiptTotal(r), 0)
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  return (
    <>
      <div className="wh-summary-row">
        <Card className="kpi-card wh-summary">
          <span className="kpi-label">Закуплено за период</span>
          <div className="kpi-value">{formatMoney(total)}</div>
          <span className="unit-muted">
            {filtered.length} {filtered.length === 1 ? 'приход' : filtered.length < 5 && filtered.length > 1 ? 'прихода' : 'приходов'} · {periodLabel(from, to)}
          </span>
        </Card>
        <div className="wh-actions">
          <ExportButton label="Скачать Excel" onExport={() => downloadReceiptsReport(filtered, productsById, from, to)} />
          <Button icon={<Plus />} onClick={onNewReceipt}>
            Приход
          </Button>
        </div>
      </div>

      <Card>
        <div className="toolbar bare">
          <DateInput value={from} onChange={(v) => { setFrom(v); setPage(1) }} label="Период, с" />
          <DateInput value={to} onChange={(v) => { setTo(v); setPage(1) }} label="Период, по" />
          <Dropdown
            allLabel="Все поставщики"
            icon={<Truck />}
            variant="pill"
            options={suppliers.map((s) => ({ label: s, value: s }))}
            value={supplier}
            onChange={(v) => { setSupplier(v); setPage(1) }}
          />
          <div className="search-field on-canvas">
            <Search />
            <input
              type="text"
              placeholder="Поиск по товару…"
              aria-label="Поиск по товару"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            />
          </div>
        </div>
      </Card>

      <Card>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Дата</th>
                <th>№ прихода</th>
                <th>Поставщик</th>
                <th style={{ textAlign: 'right' }}>Позиций</th>
                <th style={{ textAlign: 'right' }}>Сумма</th>
                <th>Провёл</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">За этот период приходов нет.</div>
                  </td>
                </tr>
              )}
              {pageRows.map((r) => (
                <tr
                  key={r.id}
                  className="row-link"
                  tabIndex={0}
                  onClick={() => setOpenReceipt(r)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setOpenReceipt(r)
                  }}
                >
                  <td>{formatDayTime(r.receivedAt)}</td>
                  <td style={{ fontWeight: 600 }}>{r.number}</td>
                  <td>{r.supplier || '—'}</td>
                  <td style={{ textAlign: 'right' }}>{r.lines.length}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>{formatMoney(receiptTotal(r))}</td>
                  <td className="unit-muted">{r.postedBy}</td>
                </tr>
              ))}
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

      {openReceipt && <ReceiptDetailModal receipt={openReceipt} productsById={productsById} onClose={() => setOpenReceipt(null)} />}
    </>
  )
}

function ReceiptDetailModal({ receipt, productsById, onClose }: { receipt: Receipt; productsById: Map<string, ProductRow>; onClose: () => void }) {
  const { unit } = useLanguage()
  return (
    <Modal
      title={`Приход ${receipt.number}`}
      onClose={onClose}
      wide
      footer={<ExportButton label="Скачать накладную" onExport={() => downloadReceiptExcel(receipt, productsById)} />}
    >
      <p className="unit-muted" style={{ marginBottom: 16 }}>
        {new Date(receipt.receivedAt).toLocaleString('ru-RU', { dateStyle: 'long', timeStyle: 'short' })}
        {receipt.supplier ? ` · ${receipt.supplier}` : ''}
        {receipt.comment ? ` · ${receipt.comment}` : ''}
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Товар</th>
              <th style={{ textAlign: 'right' }}>Количество</th>
              <th style={{ textAlign: 'right' }}>Цена закупки</th>
              <th style={{ textAlign: 'right' }}>Сумма</th>
              <th>Срок годности</th>
            </tr>
          </thead>
          <tbody>
            {receipt.lines.map((l) => {
              const product = productsById.get(l.productId)
              const baseUnit = product?.unit ?? ''
              return (
                <tr key={l.batchId}>
                  <td>
                    <ProductCell product={product} />
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <Qty value={l.qty} unit={baseUnit} />
                    {l.entered && (
                      <span className="wh-sub">
                        {formatQty(l.entered.qty)} × {unit(l.entered.unit)}
                      </span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {formatMoney(l.purchasePrice)} / {unit(baseUnit)}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>{formatMoney(l.qty * l.purchasePrice)}</td>
                  <td>{l.expiresAt ? formatDay(l.expiresAt) : <span className="unit-muted">без срока</span>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="wh-total-line">
        <span>Итого по приходу</span>
        <strong>{formatMoney(receiptTotal(receipt))}</strong>
      </div>
    </Modal>
  )
}
