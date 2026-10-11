import { Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import { useLanguage } from '../../i18n/LanguageContext'
import { formatMoney } from '../../lib/format'
import type { ProductRow } from '../../lib/types'
import { addDays, formatQty, parseAmount, todayIso, type NewReceiptLine, type WarehouseState } from '../../lib/warehouse'

interface DraftLine {
  key: string
  productId: string
  /** The sales unit the quantity is typed in — the base unit or e.g. "коробка". */
  unit: string
  qtyText: string
  /** Price per [unit]. */
  priceText: string
  expiresAt: string
  /** Set once the expiry is typed by hand, so changing the date stops refilling it. */
  expiryTouched: boolean
}

interface ReceiptModalProps {
  state: WarehouseState
  products: ProductRow[]
  initialProductId?: string
  onClose: () => void
  onSubmit: (input: { receivedAt: string; supplier: string; comment: string; lines: NewReceiptLine[] }) => void
}

export default function ReceiptModal({ state, products, initialProductId, onClose, onSubmit }: ReceiptModalProps) {
  const { unit: unitLabel } = useLanguage()
  const productsById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])
  const suppliers = useMemo(() => [...new Set(state.receipts.map((r) => r.supplier).filter(Boolean))].sort(), [state.receipts])
  const [date, setDate] = useState(todayIso())
  const [supplier, setSupplier] = useState('')
  const [comment, setComment] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [lines, setLines] = useState<DraftLine[]>(() => (initialProductId ? [newLine(initialProductId, todayIso())] : []))

  function autoExpiry(productId: string, receivedDate: string): string {
    const settings = state.settings[productId]
    return settings?.tracksExpiry && settings.shelfLifeDays != null ? addDays(receivedDate, settings.shelfLifeDays) : ''
  }

  function lastPrice(productId: string): number | null {
    const latest = state.batches.filter((b) => b.productId === productId).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))[0]
    return latest?.purchasePrice ?? null
  }

  function newLine(productId: string, receivedDate: string): DraftLine {
    const settings = state.settings[productId]
    const price = lastPrice(productId)
    return {
      key: `${productId}-${Date.now()}-${Math.random()}`,
      productId,
      unit: settings?.baseUnit ?? productsById.get(productId)?.unit ?? '',
      qtyText: '',
      priceText: price != null ? String(price) : '',
      expiresAt: autoExpiry(productId, receivedDate),
      expiryTouched: false,
    }
  }

  function update(key: string, patch: Partial<DraftLine>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  function changeDate(next: string) {
    setDate(next)
    setLines((ls) => ls.map((l) => (l.expiryTouched ? l : { ...l, expiresAt: autoExpiry(l.productId, next) })))
  }

  function factor(line: DraftLine): number {
    const settings = state.settings[line.productId]
    if (!settings || line.unit === settings.baseUnit) return 1
    return settings.unitSize[line.unit] ?? 1
  }

  const total = lines.reduce((sum, l) => sum + (parseAmount(l.qtyText, 3) ?? 0) * (parseAmount(l.priceText, 2) ?? 0), 0)

  function submit() {
    if (lines.length === 0) {
      setError('Добавьте хотя бы один товар.')
      return
    }
    const out: NewReceiptLine[] = []
    for (const l of lines) {
      const name = productsById.get(l.productId)?.name ?? 'товар'
      const qty = parseAmount(l.qtyText, 3)
      if (qty === null || qty <= 0) {
        setError(`Проверьте количество у «${name}» — нужно число больше нуля, например 12,5.`)
        return
      }
      const price = parseAmount(l.priceText, 2)
      if (price === null) {
        setError(`Укажите цену закупки у «${name}».`)
        return
      }
      const tracksExpiry = state.settings[l.productId]?.tracksExpiry ?? true
      if (tracksExpiry && !l.expiresAt) {
        setError(`Укажите срок годности у «${name}».`)
        return
      }
      const f = factor(l)
      const baseUnit = state.settings[l.productId]?.baseUnit ?? ''
      out.push({
        productId: l.productId,
        qty: Math.round(qty * f * 1000) / 1000,
        entered: l.unit !== baseUnit ? { qty, unit: l.unit } : undefined,
        purchasePrice: Math.round((price / f) * 100) / 100,
        expiresAt: tracksExpiry ? l.expiresAt : null,
      })
    }
    const now = new Date()
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    onSubmit({ receivedAt: `${date}T${time}:00`, supplier: supplier.trim(), comment: comment.trim(), lines: out })
  }

  const addable = products.filter((p) => state.settings[p.id]).sort((a, b) => a.name.localeCompare(b.name, 'ru'))

  return (
    <Modal
      title="Новый приход"
      onClose={onClose}
      wide
      footer={
        <>
          <span className="wh-footer-total">
            Итого: <strong>{formatMoney(total)}</strong>
          </span>
          <Button variant="text" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={submit}>Провести приход</Button>
        </>
      }
    >
      <div className="wh-form-row">
        <div className="field">
          <label htmlFor="rc-date">Дата прихода</label>
          <input id="rc-date" type="date" value={date} onChange={(e) => changeDate(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="rc-supplier">Поставщик (необязательно)</label>
          <input id="rc-supplier" list="rc-suppliers" value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Например, ООО «Агрофуд»" />
          <datalist id="rc-suppliers">
            {suppliers.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
      </div>

      <div className="table-wrap" style={{ marginTop: 8 }}>
        <table className="wh-lines">
          <thead>
            <tr>
              <th>Товар</th>
              <th style={{ textAlign: 'right' }}>Количество</th>
              <th style={{ textAlign: 'right' }}>Цена закупки</th>
              <th>Срок годности</th>
              <th style={{ textAlign: 'right' }}>Сумма</th>
              <th aria-label="Удалить" />
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <div className="empty-state" style={{ padding: 24 }}>
                    Выберите товар ниже.
                  </div>
                </td>
              </tr>
            )}
            {lines.map((l) => {
              const product = productsById.get(l.productId)
              const settings = state.settings[l.productId]
              const units = settings ? [settings.baseUnit, ...Object.keys(settings.unitSize)] : [l.unit]
              const qty = parseAmount(l.qtyText, 3)
              const price = parseAmount(l.priceText, 2)
              const f = factor(l)
              const invalid = { boxShadow: '0 0 0 2px var(--gesso-danger)' }
              return (
                <tr key={l.key}>
                  <td>
                    <div className="prod-name">{product?.name}</div>
                    <div className="prod-sku">{product?.sku}</div>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div className="wh-qty-input">
                      <input
                        className="qty-input"
                        type="text"
                        inputMode="decimal"
                        value={l.qtyText}
                        placeholder="0"
                        onChange={(e) => update(l.key, { qtyText: e.target.value })}
                        style={l.qtyText && (qty === null || qty <= 0) ? invalid : undefined}
                        aria-label={`Количество: ${product?.name}`}
                      />
                      {units.length > 1 ? (
                        <select value={l.unit} onChange={(e) => update(l.key, { unit: e.target.value })} aria-label="Единица">
                          {units.map((u) => (
                            <option key={u} value={u}>
                              {unitLabel(u)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="unit-muted">{unitLabel(l.unit)}</span>
                      )}
                    </div>
                    {f !== 1 && qty !== null && qty > 0 && settings && (
                      <span className="wh-sub">
                        = {formatQty(Math.round(qty * f * 1000) / 1000)} {unitLabel(settings.baseUnit)}
                      </span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <input
                      className="price-cell-input"
                      type="text"
                      inputMode="decimal"
                      value={l.priceText}
                      placeholder="0"
                      onChange={(e) => update(l.key, { priceText: e.target.value })}
                      style={l.priceText && price === null ? invalid : undefined}
                      aria-label={`Цена закупки: ${product?.name}`}
                    />
                    <span className="wh-sub">сум / {unitLabel(l.unit)}</span>
                  </td>
                  <td>
                    {settings && !settings.tracksExpiry ? (
                      <span className="unit-muted">без срока</span>
                    ) : (
                      <>
                        <input
                          type="date"
                          className="wh-date"
                          value={l.expiresAt}
                          onChange={(e) => update(l.key, { expiresAt: e.target.value, expiryTouched: true })}
                          aria-label={`Срок годности: ${product?.name}`}
                        />
                        {!l.expiryTouched && settings?.shelfLifeDays != null && l.expiresAt && (
                          <span className="wh-sub">рассчитано автоматически ({settings.shelfLifeDays} дн.), можно изменить</span>
                        )}
                        {settings?.shelfLifeDays == null && !l.expiresAt && <span className="wh-sub">укажите дату с упаковки</span>}
                      </>
                    )}
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 600 }}>{formatMoney((qty ?? 0) * (price ?? 0))}</td>
                  <td>
                    <button
                      type="button"
                      className="action-btn"
                      aria-label={`Убрать ${product?.name}`}
                      onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                    >
                      <Trash2 />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="wh-form-row" style={{ marginTop: 16 }}>
        <div className="field">
          <label htmlFor="rc-add">Добавить товар</label>
          <div className="select-wrap">
            <select
              id="rc-add"
              value=""
              onChange={(e) => {
                if (e.target.value) setLines((ls) => [...ls, newLine(e.target.value, date)])
              }}
            >
              <option value="">Выберите товар…</option>
              {addable.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({unitLabel(p.unit)})
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="rc-comment">Комментарий</label>
          <input id="rc-comment" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Например, еженедельная поставка" />
        </div>
      </div>

      {error && <div className="wh-error">{error}</div>}
    </Modal>
  )
}
