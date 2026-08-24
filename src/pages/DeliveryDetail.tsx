import { ArrowLeft, Check, MapPin, Package, Truck } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import DeliveryStatusBadge from '../components/ui/DeliveryStatusBadge'
import { useLanguage } from '../i18n/LanguageContext'
import type { DeliveryRow, DeliveryStatus } from '../lib/types'
import { useData } from '../store/DataContext'

const DELIVERY_STATUSES: DeliveryStatus[] = ['scheduled', 'in-transit', 'delayed', 'delivered', 'cancelled']

export default function DeliveryDetail() {
  const { id } = useParams<{ id: string }>()
  const { deliveries } = useData()
  const { t } = useLanguage()
  const delivery = deliveries.find((d) => d.id === id)

  if (!delivery) {
    return (
      <div className="empty-state">
        <p>{t('deliveryDetail.notFound')}</p>
        <Link to="/deliveries" className="btn btn-ghost" style={{ marginTop: 16, display: 'inline-flex' }}>
          {t('deliveryDetail.backToDeliveries')}
        </Link>
      </div>
    )
  }

  return <DeliveryDetailForm key={delivery.id} delivery={delivery} />
}

function DeliveryDetailForm({ delivery }: { delivery: DeliveryRow }) {
  const { orders, drivers, updateDelivery } = useData()
  const { t } = useLanguage()

  const [driver, setDriver] = useState(delivery.driver)
  const [status, setStatus] = useState<DeliveryStatus>(delivery.status)
  const [address, setAddress] = useState(delivery.address)
  const [eta, setEta] = useState(delivery.eta)
  const [saved, setSaved] = useState(false)

  const order = orders.find((o) => o.id === delivery.orderDbId)

  async function handleSave() {
    await updateDelivery(delivery.id, { driver, status, address, eta })
    setSaved(true)
  }

  return (
    <>
      <div className="header">
        <div className="back-row">
          <Link to="/deliveries" className="back-btn" aria-label={t('deliveryDetail.backToDeliveries')}>
            <ArrowLeft />
          </Link>
          <div>
            <h1>
              {t('deliveries.delivery')} {delivery.id}
            </h1>
            <p className="order-meta" style={{ fontSize: 14, color: 'var(--gesso-fg-muted)', marginTop: 8 }}>
              {t('common.order')} {delivery.orderId} · {delivery.customer}
            </p>
          </div>
        </div>
        <div className="header-actions">
          <Button variant="primary" icon={<Check />} onClick={handleSave}>
            {t('common.saveChanges')}
          </Button>
        </div>
      </div>

      {saved && (
        <div
          style={{
            background: 'rgba(30,92,62,0.08)',
            color: 'var(--gesso-accent)',
            borderRadius: 'var(--gesso-radius-md)',
            padding: '12px 16px',
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          {t('common.changesSaved')}
        </div>
      )}

      <section className="detail-grid">
        <div className="detail-col">
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <p className="section-label" style={{ margin: 0 }}>
                {t('deliveryDetail.routeDetails')}
              </p>
              <DeliveryStatusBadge status={status} />
            </div>

            <div className="field">
              <label htmlFor="dd-driver">{t('deliveries.driver')}</label>
              <input
                id="dd-driver"
                type="text"
                list="dd-driver-names"
                value={driver}
                onChange={(e) => setDriver(e.target.value)}
              />
              <datalist id="dd-driver-names">
                {drivers.map((d) => (
                  <option key={d} value={d} />
                ))}
              </datalist>
            </div>

            <div className="field">
              <label htmlFor="dd-status">{t('common.status')}</label>
              <div
                className="toggle-row"
                role="listbox"
                aria-label={t('common.status')}
                style={{ flexWrap: 'wrap' }}
              >
                {DELIVERY_STATUSES.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    className="toggle-opt"
                    role="option"
                    aria-selected={status === opt}
                    onClick={() => setStatus(opt)}
                    style={{ flex: '1 1 30%' }}
                  >
                    {t(`deliveryStatus.${opt}`)}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <label htmlFor="dd-address">{t('orderDetail.deliveryAddress')}</label>
              <input id="dd-address" type="text" value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>

            <div className="field">
              <label htmlFor="dd-eta">{t('deliveries.eta')}</label>
              <input id="dd-eta" type="text" value={eta} onChange={(e) => setEta(e.target.value)} />
            </div>
          </Card>
        </div>

        <div className="detail-col">
          <Card>
            <p className="section-label">{t('deliveryDetail.customer')}</p>
            <div className="info-list">
              <div className="info-row">
                <span className="k">{t('common.company')}</span>
                <span className="v">{delivery.customer}</span>
              </div>
              <div className="info-row">
                <span className="k">{t('deliveryDetail.address')}</span>
                <span className="v">{delivery.address}</span>
              </div>
            </div>
          </Card>

          {order && (
            <Card>
              <p className="section-label">{t('deliveryDetail.linkedOrder')}</p>
              <Link className="related-row" to={`/orders/${order.id}`}>
                <div className="related-left">
                  <div className="related-icon">
                    <Package />
                  </div>
                  <div className="related-text">
                    <div className="related-title">
                      {t('common.order')} #{order.orderNumber}
                    </div>
                    <div className="related-meta">
                      {order.date} · {order.total}
                    </div>
                  </div>
                </div>
                <div className="related-right">
                  <ChevronRightIcon />
                </div>
              </Link>
            </Card>
          )}

          <Card>
            <p className="section-label">{t('deliveryDetail.vehicle')}</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--gesso-fg-muted)', fontSize: 14 }}>
              <Truck style={{ color: 'var(--gesso-accent)' }} />
              {t('deliveryDetail.vehicleInfo')}
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                color: 'var(--gesso-fg-muted)',
                fontSize: 14,
                marginTop: 12,
              }}
            >
              <MapPin style={{ color: 'var(--gesso-accent)' }} />
              {t('deliveryDetail.trackingHint')}
            </div>
          </Card>
        </div>
      </section>
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
