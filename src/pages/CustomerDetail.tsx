import { ArrowLeft, Check, Mail, MapPin, Phone } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import StatusBadge from '../components/ui/StatusBadge'
import Switch from '../components/ui/Switch'
import { useLanguage } from '../i18n/LanguageContext'
import type { CustomerRow } from '../lib/types'
import { useData } from '../store/DataContext'

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>()
  const { customers } = useData()
  const { t } = useLanguage()
  const customer = customers.find((c) => c.id === id)

  if (!customer) {
    return (
      <div className="empty-state">
        <p>{t('customerDetail.notFound')}</p>
        <Link to="/customers" className="btn btn-ghost" style={{ marginTop: 16, display: 'inline-flex' }}>
          {t('customerDetail.backToCustomers')}
        </Link>
      </div>
    )
  }

  return <CustomerDetailForm key={customer.id} customer={customer} />
}

function CustomerDetailForm({ customer }: { customer: CustomerRow }) {
  const { orders, updateCustomer } = useData()
  const { t, customerType } = useLanguage()

  const [name, setName] = useState(customer.name)
  const [contact, setContact] = useState(customer.contact)
  const [location, setLocation] = useState(customer.location)
  const [type, setType] = useState(customer.type)
  const [active, setActive] = useState(customer.status === 'active')
  const [saved, setSaved] = useState(false)

  const customerOrders = orders.filter((o) => o.customer === customer.name)

  function handleSave() {
    updateCustomer(customer.id, { name, contact, location, type, status: active ? 'active' : 'inactive' })
    setSaved(true)
  }

  return (
    <>
      <div className="header">
        <div className="back-row">
          <Link to="/customers" className="back-btn" aria-label={t('customerDetail.backToCustomers')}>
            <ArrowLeft />
          </Link>
          <div>
            <h1>{customer.name}</h1>
            <p className="order-meta" style={{ fontSize: 14, color: 'var(--gesso-fg-muted)', marginTop: 8 }}>
              {customer.id} · {customerType(customer.type)} · {customer.orders} {t('nav.orders').toLowerCase()} ·{' '}
              {customer.spent} {t('customerDetail.lifetimeSpend')}
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
            <p className="section-label">{t('customerDetail.companyDetails')}</p>

            <div className="field">
              <label htmlFor="cd-name">{t('customerDetail.companyName')}</label>
              <input id="cd-name" type="text" value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            <div className="field-row">
              <div className="field">
                <label htmlFor="cd-type">{t('common.type')}</label>
                <input id="cd-type" type="text" value={type} onChange={(e) => setType(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="cd-contact">{t('customerDetail.contactPerson')}</label>
                <input id="cd-contact" type="text" value={contact} onChange={(e) => setContact(e.target.value)} />
              </div>
            </div>

            <div className="field">
              <label htmlFor="cd-loc">{t('common.location')}</label>
              <input id="cd-loc" type="text" value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>
          </Card>

          <Card>
            <p className="section-label">{t('customerDetail.orderHistory')}</p>
            {customerOrders.length === 0 ? (
              <div className="empty-state" style={{ padding: '24px 0' }}>
                {t('customerDetail.noOrders')}
              </div>
            ) : (
              <div className="related-list">
                {customerOrders.map((order) => (
                  <Link className="related-row" to={`/orders/${order.id.replace('#', '')}`} key={order.id}>
                    <div className="related-left">
                      <div className="related-icon">
                        <MapPin />
                      </div>
                      <div className="related-text">
                        <div className="related-title">
                          {t('common.order')} {order.id}
                        </div>
                        <div className="related-meta">{order.date}</div>
                      </div>
                    </div>
                    <div className="related-right">
                      <StatusBadge status={order.status} />
                      <span className="related-amount">{order.total}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="detail-col">
          <Card>
            <div className="status-row" style={{ paddingTop: 0, marginTop: 0, borderTop: 'none' }}>
              <div>
                <div className="lbl">{t('customerDetail.activeAccount')}</div>
                <div className="sub">{t('customerDetail.canPlaceOrders')}</div>
              </div>
              <Switch checked={active} onChange={setActive} label={t('customerDetail.activeAccount')} />
            </div>
          </Card>

          <Card>
            <p className="section-label">{t('common.contact')}</p>
            <div className="info-list">
              <div className="info-row">
                <span className="k">
                  <Phone style={{ width: 14, height: 14, display: 'inline', marginRight: 6 }} />
                  {t('common.phone')}
                </span>
                <span className="v">—</span>
              </div>
              <div className="info-row">
                <span className="k">
                  <Mail style={{ width: 14, height: 14, display: 'inline', marginRight: 6 }} />
                  {t('common.email')}
                </span>
                <span className="v">—</span>
              </div>
            </div>
          </Card>

          <Card>
            <p className="section-label">{t('customerDetail.lifetimeValue')}</p>
            <div className="kpi-value" style={{ fontSize: 34 }}>
              {customer.spent}
            </div>
            <div className="kpi-delta up" style={{ marginTop: 8 }}>
              <span className="ref">
                {customer.orders} {t('customerDetail.ordersTotal')}
              </span>
            </div>
          </Card>
        </div>
      </section>
    </>
  )
}
