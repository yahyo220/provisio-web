import { useMemo, useState } from 'react'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import { useLanguage } from '../../i18n/LanguageContext'
import type { ProductRow } from '../../lib/types'
import { formatDay, formatQty, liveBatches, parseAmount, stockOf, WRITE_OFF_REASONS, type WarehouseState, type WriteOffReason } from '../../lib/warehouse'

interface WriteOffModalProps {
  state: WarehouseState
  products: ProductRow[]
  initial?: { productId?: string; batchId?: string; reason?: WriteOffReason }
  onClose: () => void
  onSubmit: (input: { productId: string; batchId: string | null; qty: number; reason: WriteOffReason; comment: string }) => void
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
    onSubmit({ productId, batchId: batchId || null, qty, reason, comment: comment.trim() })
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
              {WRITE_OFF_REASONS.map((r) => (
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
