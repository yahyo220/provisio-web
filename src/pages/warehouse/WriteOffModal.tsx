import { Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import { useLanguage } from '../../i18n/LanguageContext'
import type { ProductRow } from '../../lib/types'
import { formatDay, formatQty, liveBatches, parseAmount, MANUAL_WRITE_OFF_REASONS, stockOf, type WarehouseState, type WriteOffReason } from '../../lib/warehouse'
import type { ImportedRow } from '../../lib/warehouseImport'
import { ImportBar } from './shared'

export interface WriteOffInput {
  productId: string
  batchId: string | null
  qty: number
  reason: WriteOffReason
  comment: string
}

/** One row loaded from a file — several products written off at once. */
interface BulkLine {
  key: string
  productId: string
  qtyText: string
  reason: WriteOffReason
  comment: string
}

interface WriteOffModalProps {
  state: WarehouseState
  products: ProductRow[]
  initial?: { productId?: string; batchId?: string; reason?: WriteOffReason }
  onClose: () => void
  onSubmit: (inputs: WriteOffInput[]) => void
}

export default function WriteOffModal({ state, products, initial, onClose, onSubmit }: WriteOffModalProps) {
  const { unit } = useLanguage()
  const receiptNumber = useMemo(() => new Map(state.receipts.map((r) => [r.id, r.number])), [state.receipts])
  const selectable = useMemo(() => products.filter((p) => state.settings[p.id]).sort((a, b) => a.name.localeCompare(b.name, 'ru')), [products, state.settings])

  const [productId, setProductId] = useState(initial?.productId ?? '')
  const batches = productId ? liveBatches(state, productId) : []
  const [batchId, setBatchId] = useState(initial?.batchId ?? (initial?.productId ? liveBatches(state, initial.productId)[0]?.id ?? '' : ''))
  const preset = initial?.batchId ? state.batches.find((b) => b.id === initial.batchId) : undefined
  const [qtyText, setQtyText] = useState(preset ? formatQty(preset.qtyLeft) : '')
  const [reason, setReason] = useState<WriteOffReason>(initial?.reason ?? 'spoiled')
  const [comment, setComment] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [bulk, setBulk] = useState<BulkLine[]>([])
  const productsById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])

  function addImported(rows: ImportedRow[]) {
    setBulk((ls) => [
      ...ls,
      ...rows.map((r) => ({
        key: `${r.productId}-${r.row}-${Math.random()}`,
        productId: r.productId,
        qtyText: String(r.qty).replace('.', ','),
        reason: r.reason ?? reason,
        comment: r.comment,
      })),
    ])
    setError(null)
  }

  function submitBulk() {
    const out: WriteOffInput[] = []
    for (const l of bulk) {
      const n = parseAmount(l.qtyText, 3)
      if (n === null || n <= 0) {
        setError(`Проверьте количество у «${productsById.get(l.productId)?.name ?? 'товар'}» — нужно число больше нуля.`)
        return
      }
      // The batch that expires first goes first.
      out.push({ productId: l.productId, batchId: liveBatches(state, l.productId)[0]?.id ?? null, qty: n, reason: l.reason, comment: l.comment || comment.trim() })
    }
    onSubmit(out)
  }

  const product = selectable.find((p) => p.id === productId)
  const baseUnit = state.settings[productId]?.baseUnit ?? product?.unit ?? ''
  const batch = batches.find((b) => b.id === batchId)
  const qty = parseAmount(qtyText, 3)

  function chooseProduct(id: string) {
    setProductId(id)
    setBatchId(id ? liveBatches(state, id)[0]?.id ?? '' : '')
    setQtyText('')
  }

  function submit() {
    if (!productId) {
      setError('Выберите товар.')
      return
    }
    if (qty === null || qty <= 0) {
      setError('Укажите количество больше нуля, например 2,5.')
      return
    }
    onSubmit([{ productId, batchId: batchId || null, qty, reason, comment: comment.trim() }])
  }

  if (bulk.length > 0) {
    return (
      <Modal
        title={`Списание — ${bulk.length} поз. из файла`}
        onClose={onClose}
        wide
        footer={
          <>
            <Button variant="text" onClick={onClose}>
              Отмена
            </Button>
            <Button onClick={submitBulk}>Списать всё</Button>
          </>
        }
      >
        <ImportBar kind="writeoff" state={state} products={products} onRows={addImported} />
        <div className="table-wrap">
          <table className="wh-lines">
            <thead>
              <tr>
                <th>Товар</th>
                <th style={{ textAlign: 'right' }}>На складе</th>
                <th style={{ textAlign: 'right' }}>Списать</th>
                <th>Причина</th>
                <th aria-label="Удалить" />
              </tr>
            </thead>
            <tbody>
              {bulk.map((l) => {
                const p = productsById.get(l.productId)
                const base = state.settings[l.productId]?.baseUnit ?? p?.unit ?? ''
                const n = parseAmount(l.qtyText, 3)
                const edit = (patch: Partial<BulkLine>) => setBulk((ls) => ls.map((x) => (x.key === l.key ? { ...x, ...patch } : x)))
                return (
                  <tr key={l.key}>
                    <td>
                      <div className="prod-name">{p?.name}</div>
                      <div className="prod-sku">{l.comment || p?.sku}</div>
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }} className="unit-muted">
                      {formatQty(stockOf(state, l.productId))} {unit(base)}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="wh-qty-input">
                        <input
                          className="qty-input"
                          type="text"
                          inputMode="decimal"
                          value={l.qtyText}
                          onChange={(e) => edit({ qtyText: e.target.value })}
                          style={n === null || n <= 0 ? { boxShadow: '0 0 0 2px var(--gesso-danger)' } : undefined}
                          aria-label={`Количество: ${p?.name}`}
                        />
                        <span className="unit-muted">{unit(base)}</span>
                      </div>
                    </td>
                    <td>
                      <div className="select-wrap">
                        <select value={l.reason} onChange={(e) => edit({ reason: e.target.value as WriteOffReason })} aria-label={`Причина: ${p?.name}`}>
                          {MANUAL_WRITE_OFF_REASONS.map((r) => (
                            <option key={r.value} value={r.value}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td>
                      <button type="button" className="action-btn" aria-label={`Убрать ${p?.name}`} onClick={() => setBulk((ls) => ls.filter((x) => x.key !== l.key))}>
                        <Trash2 />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="field" style={{ marginTop: 16 }}>
          <label htmlFor="wo-bulk-comment">Комментарий (для строк без своего)</label>
          <input id="wo-bulk-comment" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Например, инвентаризация 14.10" />
        </div>
        {error && <div className="wh-error">{error}</div>}
      </Modal>
    )
  }

  return (
    <Modal
      title="Списание"
      onClose={onClose}
      footer={
        <>
          <Button variant="text" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={submit}>Списать</Button>
        </>
      }
    >
      <ImportBar kind="writeoff" state={state} products={products} onRows={addImported} />

      <div className="field">
        <label htmlFor="wo-product">Товар</label>
        <div className="select-wrap">
          <select id="wo-product" value={productId} onChange={(e) => chooseProduct(e.target.value)}>
            <option value="">Выберите товар…</option>
            {selectable.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        {product && (
          <span className="wh-sub" style={{ marginTop: 6 }}>
            На складе: {formatQty(stockOf(state, productId))} {unit(baseUnit)}
          </span>
        )}
      </div>

      {productId && (
        <div className="field">
          <label htmlFor="wo-batch">Партия</label>
          <div className="select-wrap">
            <select id="wo-batch" value={batchId} onChange={(e) => setBatchId(e.target.value)}>
              {batches.length === 0 && <option value="">Нет партий с остатком</option>}
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {receiptNumber.get(b.receiptId) ?? 'Партия'} · осталось {formatQty(b.qtyLeft)} {unit(baseUnit)}
                  {b.expiresAt ? ` · до ${formatDay(b.expiresAt)}` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="wh-form-row">
        <div className="field">
          <label htmlFor="wo-qty">Количество{baseUnit ? `, ${unit(baseUnit)}` : ''}</label>
          <input id="wo-qty" type="text" inputMode="decimal" value={qtyText} onChange={(e) => setQtyText(e.target.value)} placeholder="0" />
        </div>
        <div className="field">
          <label htmlFor="wo-reason">Причина</label>
          <div className="select-wrap">
            <select id="wo-reason" value={reason} onChange={(e) => setReason(e.target.value as WriteOffReason)}>
              {MANUAL_WRITE_OFF_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {batch && qty !== null && qty > batch.qtyLeft && (
        <div className="wh-warning">
          В этой партии осталось только {formatQty(batch.qtyLeft)} {unit(baseUnit)}. Остаток товара уменьшится на всё указанное количество.
        </div>
      )}

      <div className="field">
        <label htmlFor="wo-comment">Комментарий</label>
        <input id="wo-comment" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Например, помялись при разгрузке" />
      </div>

      {error && <div className="wh-error">{error}</div>}
    </Modal>
  )
}
