import { ArrowLeft, Download, Package, PackageX, RefreshCw, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import Dropdown from '../components/ui/Dropdown'
import Modal from '../components/ui/Modal'
import StatusPill from '../components/ui/StatusPill'
import { useLanguage } from '../i18n/LanguageContext'
import { fetchOrderFeedback, fetchOrderItems, saveOrderItems, type OrderFeedbackRow, type SaveOrderItemInput } from '../lib/api'
import { placeholderImage, type OrderLineItem } from '../lib/data'
import { downloadOrderExcel } from '../lib/exportOrderExcel'
import { formatMoney, parseMoney } from '../lib/format'
import { printOrder } from '../lib/printOrder'
import { supabase } from '../lib/supabase'
import type { OrderRow, OrderStatus, PaymentStatus } from '../lib/types'
import { vatOf } from '../lib/vat'
import { useData } from '../store/DataContext'

const ORDER_STATUSES: OrderStatus[] = ['new', 'confirmed', 'preparing', 'ready', 'out', 'delivered', 'cancelled']

/** One row of the "Редактировать заказ" draft. Quantities and prices stay
 * as the typed text until Save, so "1," on the way to "1,2" isn't rejected
 * or rewritten mid-typing. */
interface DraftLine {
  key: string
  /** order_items.id — absent for a line added in this edit. */
  id?: string
  productId?: string
  name: string
  sku: string
  unit: string
  image: string
  qtyText: string
  priceText: string
}

/** "1,2" or "1.2" → 1.2. Null unless it's above zero with at most 3
 * decimals (order_items.qty is numeric(10,3)). */
function parseQty(text: string): number | null {
  const s = text.trim().replace(',', '.')
  if (!/^\d+(\.\d{1,3})?$/.test(s)) return null
  const n = Number(s)
  return n > 0 ? n : null
}

/** "12 000", "950,5" → number. Null unless zero or more with at most 2
 * decimals (order_items.unit_price is numeric(10,2)). */
function parsePrice(text: string): number | null {
  const s = text.replace(/\s/g, '').replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null
  return Number(s)
}

function formatQty(qty: number, lang: string): string {
  return qty.toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US', { maximumFractionDigits: 3 })
}

function qtyToText(qty: number, lang: string): string {
  const s = String(qty)
  return lang === 'ru' ? s.replace('.', ',') : s
}

export default function OrderDetail() {
  const { orderId } = useParams<{ orderId: string }>()
  const { orders } = useData()
  const { t } = useLanguage()
  const match = orders.find((o) => o.id === orderId)

  if (!match) {
    return (
      <div className="empty-state">
        <p>{t('orderDetail.notFound')}</p>
        <Link to="/orders" className="btn btn-ghost" style={{ marginTop: 16, display: 'inline-flex' }}>
          {t('orderDetail.backToOrdersLink')}
        </Link>
      </div>
    )
  }

  return <OrderDetailForm key={match.id} order={match} />
}

function OrderDetailForm({ order }: { order: OrderRow }) {
  const { updateOrderStatus, updateOrderPayment, customers, orders, products } = useData()
  const { t, unit, lang } = useLanguage()
  const customer = customers.find((c) => c.id === order.customerId)
  const relatedOrders = orders
    .filter((o) => o.customerId === order.customerId && o.id !== order.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  const [lineItems, setLineItems] = useState<OrderLineItem[]>([])
  const [itemsLoading, setItemsLoading] = useState(Boolean(supabase))
  const [status, setStatus] = useState<OrderStatus>(order.status)
  const [payment, setPayment] = useState<PaymentStatus>(order.payment)
  const [markingPaid, setMarkingPaid] = useState(false)
  const [feedback, setFeedback] = useState<OrderFeedbackRow[]>([])
  const [exportingExcel, setExportingExcel] = useState(false)
  const [confirmingCancel, setConfirmingCancel] = useState(false)
  const [statusError, setStatusError] = useState<string | null>(null)
  // "Редактировать заказ": the item list is edited as a draft and saved in
  // one go (admin_save_order_items, migration 0061). Nothing reaches the
  // database — or the customer's app and invoices — before Save.
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<DraftLine[]>([])
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase) {
      setItemsLoading(false)
      return
    }
    let cancelled = false
    setItemsLoading(true)
    fetchOrderItems(order.id)
      .then((items) => {
        if (!cancelled) setLineItems(items)
      })
      .finally(() => {
        if (!cancelled) setItemsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [order.id])

  useEffect(() => {
    if (!supabase) return
    let cancelled = false
    fetchOrderFeedback(order.id)
      .then((rows) => {
        if (!cancelled) setFeedback(rows)
      })
      .catch((err) => console.error(err))
    return () => {
      cancelled = true
    }
  }, [order.id])

  const statusOptions = ORDER_STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) }))

  // What the table and totals show: the draft while editing (lines with a
  // not-yet-valid number count as 0), the saved items otherwise.
  const shownLines = useMemo(
    () =>
      editing
        ? draft.map((l) => ({ qty: parseQty(l.qtyText) ?? 0, unitPrice: parsePrice(l.priceText) ?? 0 }))
        : lineItems,
    [editing, draft, lineItems],
  )
  const subtotal = shownLines.reduce((sum, item) => sum + item.qty * item.unitPrice, 0)
  const totalNet = subtotal + order.deliveryFee
  const vat = vatOf(totalNet)

  const addableProducts = useMemo(
    () => products.filter((p) => p.active).sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    [products],
  )

  function startEditing() {
    setDraft(
      lineItems.map((l, i) => ({
        key: l.id ?? `line-${i}`,
        id: l.id,
        name: l.name,
        sku: l.sku,
        unit: l.unit,
        image: l.image,
        qtyText: qtyToText(l.qty, lang),
        priceText: String(l.unitPrice),
      })),
    )
    setEditError(null)
    setEditing(true)
  }

  function cancelEditing() {
    setEditing(false)
    setDraft([])
    setEditError(null)
  }

  function updateDraft(key: string, patch: Partial<DraftLine>) {
    setDraft((lines) => lines.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  function addProduct(productId: string) {
    const p = products.find((x) => x.id === productId)
    if (!p) return
    // Same price the customer would get when ordering it in the app.
    const price = customer?.priceTier === 'external' && p.priceExternal ? parseMoney(p.priceExternal) : parseMoney(p.price)
    setDraft((lines) => [
      ...lines,
      {
        key: `new-${p.id}-${Date.now()}`,
        productId: p.id,
        name: p.name,
        sku: p.sku,
        unit: p.unit,
        image: p.image,
        qtyText: '1',
        priceText: String(price),
      },
    ])
  }

  async function saveEditing() {
    if (draft.length === 0) {
      setEditError('В заказе должен остаться хотя бы один товар. Чтобы убрать всё — отмените заказ.')
      return
    }
    const items: SaveOrderItemInput[] = []
    for (const l of draft) {
      const qty = parseQty(l.qtyText)
      if (qty === null) {
        setEditError(`Проверьте количество у «${l.name}»: нужно число больше нуля, например 1,2.`)
        return
      }
      const price = parsePrice(l.priceText)
      if (price === null) {
        setEditError(`Проверьте цену у «${l.name}».`)
        return
      }
      items.push({
        id: l.id ?? null,
        product_id: l.productId ?? null,
        name: l.name,
        sku: l.sku,
        unit: l.unit,
        image_url: l.image === placeholderImage ? '' : l.image,
        qty,
        unit_price: price,
      })
    }
    setSavingEdit(true)
    setEditError(null)
    try {
      await saveOrderItems(order.id, items)
      setLineItems(await fetchOrderItems(order.id))
      setEditing(false)
      setDraft([])
    } catch (err) {
      console.error(err)
      setEditError('Не удалось сохранить изменения — заказ остался прежним. Попробуйте ещё раз.')
    } finally {
      setSavingEdit(false)
    }
  }

  function changeStatus(next: OrderStatus) {
    const prevStatus = status
    setStatus(next)
    updateOrderStatus(order.id, next).catch(() => {
      setStatus(prevStatus)
      setStatusError(t('common.saveFailed'))
    })
  }

  async function markPaid() {
    setMarkingPaid(true)
    try {
      await updateOrderPayment(order.id, 'paid')
      setPayment('paid')
    } finally {
      setMarkingPaid(false)
    }
  }

  async function handleExportExcel() {
    setExportingExcel(true)
    try {
      await downloadOrderExcel(order, customer, lineItems)
    } catch (err) {
      console.error(err)
    } finally {
      setExportingExcel(false)
    }
  }

  return (
    <>
      <div className="header">
        <div className="back-row">
          <Link to="/orders" className="back-btn" aria-label={t('orderDetail.backToOrders')}>
            <ArrowLeft />
          </Link>
          <div>
            <h1>
              {t('common.order')} #{order.orderNumber}
            </h1>
            <p className="order-meta" style={{ fontSize: 14, color: 'var(--gesso-fg-muted)', marginTop: 8 }}>
              {t('orderDetail.placed')} {order.date} · {order.customer}
            </p>
          </div>
        </div>
        <div className="header-actions">
          <Button variant="text" onClick={() => printOrder(order, customer, lineItems, unit)} disabled={editing || lineItems.length === 0}>
            {t('orderDetail.printOrder')}
          </Button>
          <Button variant="ghost" icon={<Download />} onClick={handleExportExcel} disabled={exportingExcel || lineItems.length === 0}>
            {exportingExcel ? 'Готовим файл…' : 'Скачать Excel'}
          </Button>
          <Dropdown
            allLabel={t('orderDetail.changeStatus')}
            variant="pill"
            align="right"
            icon={<RefreshCw />}
            options={statusOptions}
            value={status}
            onChange={(v) => changeStatus((v as OrderStatus) ?? status)}
          />
        </div>
      </div>

      {statusError && (
        <div
          style={{
            background: 'rgba(192,40,40,0.08)',
            color: 'var(--gesso-danger, #c02828)',
            borderRadius: 'var(--gesso-radius-md)',
            padding: '12px 16px',
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          {statusError}
        </div>
      )}

      <section className="detail-grid">
        <div className="detail-col">
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <p className="section-label" style={{ margin: 0 }}>
                {t('orderDetail.orderedProducts')}
              </p>
              <StatusPill status={status} />
            </div>
            {editing && (
              <p style={{ fontSize: 13, color: 'var(--gesso-fg-muted)', margin: '0 0 12px' }}>
                Количество можно вводить с запятой, например 1,2. Изменения увидят клиент и накладные только после «Сохранить».
              </p>
            )}
            <div style={{ overflowX: 'auto' }}>
              <table className="line-table">
                <thead>
                  <tr>
                    <th>{t('common.product')}</th>
                    <th style={{ textAlign: 'right' }}>{t('common.qty')}</th>
                    <th style={{ textAlign: 'right' }}>{t('common.unit')}</th>
                    <th style={{ textAlign: 'right' }}>{t('common.price')}</th>
                    <th style={{ textAlign: 'right' }}>{t('common.total')}</th>
                    {editing && <th aria-label="Удалить" />}
                  </tr>
                </thead>
                <tbody>
                  {editing
                    ? draft.map((line) => {
                        const qty = parseQty(line.qtyText)
                        const price = parsePrice(line.priceText)
                        const invalid = { boxShadow: '0 0 0 2px var(--gesso-danger, #c02828)' }
                        return (
                          <tr key={line.key}>
                            <td>
                              <div className="prod-cell">
                                <img className="prod-thumb" src={line.image} alt="" />
                                <div>
                                  <div className="prod-name">{line.name}</div>
                                  <div className="prod-sku">{line.sku}</div>
                                </div>
                              </div>
                            </td>
                            <td className="num">
                              <input
                                className="qty-input"
                                type="text"
                                inputMode="decimal"
                                value={line.qtyText}
                                onChange={(e) => updateDraft(line.key, { qtyText: e.target.value })}
                                style={qty === null ? invalid : undefined}
                                aria-label={`Количество: ${line.name}`}
                              />
                            </td>
                            <td className="num">{unit(line.unit)}</td>
                            <td className="num">
                              <input
                                className="price-cell-input"
                                type="text"
                                inputMode="decimal"
                                value={line.priceText}
                                onChange={(e) => updateDraft(line.key, { priceText: e.target.value })}
                                style={price === null ? invalid : undefined}
                                aria-label={`Цена: ${line.name}`}
                              />
                            </td>
                            <td className="num">{formatMoney((qty ?? 0) * (price ?? 0))}</td>
                            <td className="num">
                              <button
                                type="button"
                                className="action-btn"
                                aria-label={`Убрать ${line.name} из заказа`}
                                onClick={() => setDraft((lines) => lines.filter((l) => l.key !== line.key))}
                              >
                                <Trash2 style={{ width: 14, height: 14 }} />
                              </button>
                            </td>
                          </tr>
                        )
                      })
                    : lineItems.map((line) => (
                        <tr key={line.id ?? line.sku}>
                          <td>
                            <div className="prod-cell">
                              <img className="prod-thumb" src={line.image} alt="" />
                              <div>
                                <div className="prod-name">{line.name}</div>
                                <div className="prod-sku">{line.sku}</div>
                              </div>
                            </div>
                          </td>
                          <td className="num">{formatQty(line.qty, lang)}</td>
                          <td className="num">{unit(line.unit)}</td>
                          <td className="num">{formatMoney(line.unitPrice)}</td>
                          <td className="num">{formatMoney(line.qty * line.unitPrice)}</td>
                        </tr>
                      ))}
                </tbody>
              </table>
              {!itemsLoading && !editing && lineItems.length === 0 && <div className="empty-state">{t('common.noData')}</div>}
            </div>
            {editing && (
              <div style={{ marginTop: 16 }}>
                <div className="field">
                  <label htmlFor="od-add-product">Добавить товар</label>
                  <div className="select-wrap">
                    <select
                      id="od-add-product"
                      value=""
                      onChange={(e) => {
                        if (e.target.value) addProduct(e.target.value)
                      }}
                    >
                      <option value="">Выберите товар…</option>
                      {addableProducts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} — {p.price} / {unit(p.unit)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {editError && (
                  <div style={{ color: 'var(--gesso-danger, #c02828)', fontSize: 14, fontWeight: 600, marginTop: 12 }}>{editError}</div>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                  <Button variant="text" onClick={cancelEditing} disabled={savingEdit}>
                    {t('common.cancel')}
                  </Button>
                  <Button variant="primary" onClick={saveEditing} disabled={savingEdit}>
                    {savingEdit ? 'Сохраняем…' : 'Сохранить'}
                  </Button>
                </div>
              </div>
            )}
            <div className="totals-row">
              {order.deliveryFee > 0 && (
                <div className="t-block">
                  <div className="t-label">{t('orderDetail.deliveryFee')}</div>
                  <div className="t-value" style={{ fontSize: 'var(--gesso-text-lg)' }}>
                    {formatMoney(order.deliveryFee)}
                  </div>
                </div>
              )}
              <div className="t-block">
                <div className="t-label">{t('common.totalNet')}</div>
                <div className="t-value" style={{ fontSize: 'var(--gesso-text-lg)' }}>
                  {formatMoney(totalNet)}
                </div>
              </div>
              <div className="t-block">
                <div className="t-label">{t('orderDetail.vat')}</div>
                <div className="t-value" style={{ fontSize: 'var(--gesso-text-lg)' }}>
                  {formatMoney(vat)}
                </div>
              </div>
              <div className="t-block">
                <div className="t-label">{t('orderDetail.totalWithVat')}</div>
                <div className="t-value">{formatMoney(totalNet + vat)}</div>
              </div>
            </div>
          </Card>

          {feedback.length > 0 && (
            <Card>
              <p className="section-label">Отзыв клиента</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {feedback.map((f) => (
                  <div
                    key={f.id}
                    style={{
                      background: 'var(--gesso-surface-recessed, rgba(0,0,0,0.03))',
                      borderRadius: 'var(--gesso-radius-md)',
                      padding: '12px 16px',
                    }}
                  >
                    <div style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>{f.message}</div>
                    {f.photoUrls.length > 0 && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                        {f.photoUrls.map((url) => (
                          <a key={url} href={url} target="_blank" rel="noreferrer">
                            <img
                              src={url}
                              alt="Фото от клиента"
                              style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 'var(--gesso-radius-sm)' }}
                            />
                          </a>
                        ))}
                      </div>
                    )}
                    <div style={{ fontSize: 12, color: 'var(--gesso-fg-muted)', marginTop: 6 }}>
                      {new Date(f.createdAt).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

        </div>

        <div className="detail-col">
          <Card>
            <p className="section-label">{t('orderDetail.customerAndDelivery')}</p>
            <div className="info-list">
              <div className="info-row">
                <span className="k">{t('common.company')}</span>
                <span className="v">{order.customer}</span>
              </div>
              <div className="info-row">
                <span className="k">{t('common.contact')}</span>
                <span className="v">{order.meta}</span>
              </div>
              {order.deliverySlot && (
                <div className="info-row">
                  <span className="k">{t('orderDetail.deliveryTime')}</span>
                  <span className="v">{order.deliverySlot}</span>
                </div>
              )}
              <div className="info-row">
                <span className="k">{t('orderDetail.paymentStatus')}</span>
                <span className="v" style={payment === 'paid' ? { color: 'var(--gesso-accent)' } : undefined}>
                  {t(`payment.${payment}`)}
                </span>
              </div>
            </div>
            {payment !== 'paid' && (
              <Button variant="ghost" block onClick={markPaid} disabled={markingPaid} style={{ marginTop: 12 }}>
                {markingPaid ? 'Отмечаем…' : 'Отметить как оплачено'}
              </Button>
            )}
          </Card>

          <Card>
            <p className="section-label">{t('orderDetail.manageOrder')}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Button variant="ghost" block onClick={startEditing} disabled={editing || itemsLoading || status === 'cancelled'}>
                {editing ? 'Идёт редактирование…' : t('orderDetail.editOrder')}
              </Button>
              <Button
                variant="danger-text"
                block
                onClick={() => setConfirmingCancel(true)}
                disabled={status === 'cancelled'}
                style={{
                  justifyContent: 'center',
                  border: '1px solid var(--gesso-divider)',
                  borderRadius: 'var(--gesso-radius-full)',
                }}
              >
                {t('orderDetail.cancelOrder')}
              </Button>
            </div>
          </Card>
        </div>
      </section>

      {confirmingCancel && (
        <Modal
          title={`Отменить заказ #${order.orderNumber}?`}
          onClose={() => setConfirmingCancel(false)}
          footer={
            <>
              <Button variant="text" onClick={() => setConfirmingCancel(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="danger-text"
                onClick={() => {
                  changeStatus('cancelled')
                  setConfirmingCancel(false)
                }}
              >
                {t('orderDetail.cancelOrder')}
              </Button>
            </>
          }
        >
          <p style={{ fontSize: 14, color: 'var(--gesso-fg-muted)' }}>
            Клиент и курьер будут уведомлены об отмене. Отменить действие потом можно только сменив статус заново.
          </p>
        </Modal>
      )}

      <Card>
        <div className="related-header">
          <p className="section-label" style={{ margin: 0 }}>
            {t('orderDetail.otherOrdersFrom')} {order.customer}
          </p>
          <span className="count">
            {relatedOrders.length} {t('orderDetail.ordersTotal')}
          </span>
        </div>
        <div className="related-list">
          {relatedOrders.length === 0 && <div className="empty-state">{t('common.noData')}</div>}
          {relatedOrders.map((related) => {
            const Icon = related.status === 'cancelled' ? PackageX : Package
            return (
              <Link className="related-row" to={`/orders/${related.id}`} key={related.id}>
                <div className="related-left">
                  <div className="related-icon">
                    <Icon />
                  </div>
                  <div className="related-text">
                    <div className="related-title">
                      {t('common.order')} #{related.orderNumber}
                    </div>
                    <div className="related-meta">{related.date}</div>
                  </div>
                </div>
                <div className="related-right">
                  <span className="related-amount">
                    {related.total}
                    <span className="total-with-vat">{t('common.withVat')} {related.totalWithVat}</span>
                  </span>
                  <ChevronRightIcon />
                </div>
              </Link>
            )
          })}
        </div>
      </Card>
    </>
  )
}

function ChevronRightIcon() {
  return (
    <svg
      className="chev"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}
