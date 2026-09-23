import { ArrowLeft, Download, Minus, Package, PackageX, Plus, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import Dropdown from '../components/ui/Dropdown'
import Modal from '../components/ui/Modal'
import StatusPill from '../components/ui/StatusPill'
import { useLanguage } from '../i18n/LanguageContext'
import { fetchOrderFeedback, fetchOrderItems, updateOrderItemPrice, updateOrderItemQty, type OrderFeedbackRow } from '../lib/api'
import type { OrderLineItem } from '../lib/data'
import { downloadOrderExcel } from '../lib/exportOrderExcel'
import { formatMoney } from '../lib/format'
import { supabase } from '../lib/supabase'
import type { OrderRow, OrderStatus, PaymentStatus } from '../lib/types'
import { useData } from '../store/DataContext'

const ORDER_STATUSES: OrderStatus[] = ['new', 'confirmed', 'preparing', 'ready', 'out', 'delivered', 'cancelled']

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
  const { updateOrderStatus, updateOrderPayment, customers, orders } = useData()
  const { t, unit } = useLanguage()
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
  // While a price field is mid-edit, its displayed text is tracked here
  // instead of coming straight from lineItems — otherwise clearing the
  // field to type a new number snaps back to "0" on every keystroke
  // (Number('') is 0), making it impossible to actually clear and retype.
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({})

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

  const subtotal = useMemo(
    () => lineItems.reduce((sum, item) => sum + item.qty * item.unitPrice, 0),
    [lineItems],
  )
  const total = subtotal + order.deliveryFee

  function changeQty(item: OrderLineItem, delta: number) {
    applyQty(item, Math.max(0, item.qty + delta))
  }

  function setQty(item: OrderLineItem, qty: number) {
    applyQty(item, Math.max(0, qty))
  }

  // Shared by changeQty/setQty — optimistic update with a rollback + a
  // visible error if the write fails, instead of silently drifting from
  // what's actually saved (found in a fresh audit pass: this and setPrice/
  // changeStatus below used to just console.error and leave the UI showing
  // an edit that was never persisted).
  function applyQty(item: OrderLineItem, qty: number) {
    const prevQty = item.qty
    setLineItems((items) => items.map((i) => (i === item ? { ...i, qty } : i)))
    if (!item.id) return
    updateOrderItemQty(item.id, qty).catch(() => {
      setLineItems((items) => items.map((i) => (i === item ? { ...i, qty: prevQty } : i)))
      setStatusError(t('common.saveFailed'))
    })
  }

  function setPrice(item: OrderLineItem, unitPrice: number) {
    const safePrice = Math.max(0, unitPrice)
    const prevPrice = item.unitPrice
    setLineItems((items) => items.map((i) => (i === item ? { ...i, unitPrice: safePrice } : i)))
    if (!item.id) return
    updateOrderItemPrice(item.id, safePrice).catch(() => {
      setLineItems((items) => items.map((i) => (i === item ? { ...i, unitPrice: prevPrice } : i)))
      setStatusError(t('common.saveFailed'))
    })
  }

  function lineKey(item: OrderLineItem) {
    return item.id ?? item.sku
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
          <Button variant="text">{t('orderDetail.printOrder')}</Button>
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
            <div style={{ overflowX: 'auto' }}>
              <table className="line-table">
                <thead>
                  <tr>
                    <th>{t('common.product')}</th>
                    <th style={{ textAlign: 'right' }}>{t('common.qty')}</th>
                    <th style={{ textAlign: 'right' }}>{t('common.unit')}</th>
                    <th style={{ textAlign: 'right' }}>{t('common.price')}</th>
                    <th style={{ textAlign: 'right' }}>{t('common.total')}</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((line) => (
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
                      <td className="num">
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <button
                            type="button"
                            className="action-btn"
                            aria-label={`Decrease quantity of ${line.name}`}
                            onClick={() => changeQty(line, -1)}
                          >
                            <Minus style={{ width: 14, height: 14 }} />
                          </button>
                          <input
                            className="qty-input"
                            type="number"
                            min={0}
                            value={line.qty}
                            onChange={(e) => setQty(line, Number(e.target.value))}
                            aria-label={`Quantity of ${line.name}`}
                          />
                          <button
                            type="button"
                            className="action-btn"
                            aria-label={`Increase quantity of ${line.name}`}
                            onClick={() => changeQty(line, 1)}
                          >
                            <Plus style={{ width: 14, height: 14 }} />
                          </button>
                        </div>
                      </td>
                      <td className="num">{unit(line.unit)}</td>
                      <td className="num">
                        <input
                          className="price-cell-input"
                          type="text"
                          inputMode="decimal"
                          value={priceDrafts[lineKey(line)] ?? String(line.unitPrice)}
                          onChange={(e) => {
                            const raw = e.target.value
                            if (raw !== '' && !/^\d*\.?\d*$/.test(raw)) return
                            setPriceDrafts((d) => ({ ...d, [lineKey(line)]: raw }))
                            const parsed = Number(raw)
                            if (raw !== '' && !Number.isNaN(parsed)) setPrice(line, parsed)
                          }}
                          onBlur={() =>
                            setPriceDrafts((d) => {
                              const rest = { ...d }
                              delete rest[lineKey(line)]
                              return rest
                            })
                          }
                          aria-label={`Price of ${line.name}`}
                        />
                      </td>
                      <td className="num">{formatMoney(line.qty * line.unitPrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!itemsLoading && lineItems.length === 0 && <div className="empty-state">{t('common.noData')}</div>}
            </div>
            <div className="totals-row">
              <div className="t-block">
                <div className="t-label">{t('orderDetail.deliveryFee')}</div>
                <div className="t-value" style={{ fontSize: 'var(--gesso-text-lg)' }}>
                  {formatMoney(order.deliveryFee)}
                </div>
              </div>
              <div className="t-block">
                <div className="t-label">{t('orderDetail.orderTotal')}</div>
                <div className="t-value">{formatMoney(total)}</div>
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
              <Button variant="ghost" block>
                {t('orderDetail.editOrder')}
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
                  <span className="related-amount">{related.total}</span>
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
