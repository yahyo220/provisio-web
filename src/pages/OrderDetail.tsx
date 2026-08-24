import { ArrowLeft, Download, Minus, Package, PackageX, Plus, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import Dropdown from '../components/ui/Dropdown'
import StatusPill from '../components/ui/StatusPill'
import { useLanguage } from '../i18n/LanguageContext'
import { fetchOrderItems, updateOrderItemQty } from '../lib/api'
import type { OrderLineItem } from '../lib/data'
import { orderTimeline, relatedOrders } from '../lib/data'
import { supabase } from '../lib/supabase'
import type { OrderRow, OrderStatus } from '../lib/types'
import { useData } from '../store/DataContext'

const RELATED_ICON = { package: Package, 'package-x': PackageX }
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
  const { updateOrderStatus } = useData()
  const { t, unit } = useLanguage()

  const [lineItems, setLineItems] = useState<OrderLineItem[]>([])
  const [itemsLoading, setItemsLoading] = useState(Boolean(supabase))
  const [status, setStatus] = useState<OrderStatus>(order.status)

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

  const statusOptions = ORDER_STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) }))

  const subtotal = useMemo(
    () => lineItems.reduce((sum, item) => sum + item.qty * item.unitPrice, 0),
    [lineItems],
  )
  const total = subtotal + order.deliveryFee

  function changeQty(item: OrderLineItem, delta: number) {
    const qty = Math.max(0, item.qty + delta)
    setLineItems((items) => items.map((i) => (i === item ? { ...i, qty } : i)))
    if (item.id) updateOrderItemQty(item.id, qty).catch((err) => console.error(err))
  }

  function setQty(item: OrderLineItem, qty: number) {
    const safeQty = Math.max(0, qty)
    setLineItems((items) => items.map((i) => (i === item ? { ...i, qty: safeQty } : i)))
    if (item.id) updateOrderItemQty(item.id, safeQty).catch((err) => console.error(err))
  }

  function changeStatus(next: OrderStatus) {
    setStatus(next)
    updateOrderStatus(order.id, next).catch((err) => console.error(err))
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
          <Button variant="ghost" icon={<Download />}>
            {t('orderDetail.downloadPdf')}
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
                      <td className="num">${line.unitPrice.toFixed(2)}</td>
                      <td className="num">${(line.qty * line.unitPrice).toFixed(2)}</td>
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
                  ${order.deliveryFee.toFixed(2)}
                </div>
              </div>
              <div className="t-block">
                <div className="t-label">{t('orderDetail.orderTotal')}</div>
                <div className="t-value">${total.toFixed(2)}</div>
              </div>
            </div>
          </Card>

          <Card>
            <p className="section-label">{t('orderDetail.orderTimeline')}</p>
            {orderTimeline.length === 0 && <div className="empty-state">{t('common.noData')}</div>}
            <div className="timeline">
              {orderTimeline.map((step) => (
                <div className="tl-row" key={step.titleKey}>
                  <div className="tl-marker">
                    <div className={`tl-dot ${step.done ? '' : 'pending'}`} />
                    <div className="tl-line" />
                  </div>
                  <div className={`tl-content ${step.done ? '' : 'muted'}`}>
                    <div className="tl-title">{t(step.titleKey)}</div>
                    <div className="tl-time">{step.time}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
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
                <span className="v" style={order.payment === 'paid' ? { color: 'var(--gesso-accent)' } : undefined}>
                  {t(`payment.${order.payment}`)}
                </span>
              </div>
            </div>
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
                onClick={() => changeStatus('cancelled')}
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
            const Icon = RELATED_ICON[related.icon]
            return (
              <div className="related-row" key={related.id}>
                <div className="related-left">
                  <div className="related-icon">
                    <Icon />
                  </div>
                  <div className="related-text">
                    <div className="related-title">
                      {t('common.order')} {related.id}
                    </div>
                    <div className="related-meta">{related.meta}</div>
                  </div>
                </div>
                <div className="related-right">
                  <span className="related-amount">{related.amount}</span>
                  <ChevronRightIcon />
                </div>
              </div>
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
