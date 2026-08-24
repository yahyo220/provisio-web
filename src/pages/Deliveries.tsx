import { ChevronDown, Download, Pencil, Search, SlidersHorizontal, Truck, TrendingDown, TrendingUp } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import DeliveryStatusBadge from '../components/ui/DeliveryStatusBadge'
import Dropdown from '../components/ui/Dropdown'
import Modal from '../components/ui/Modal'
import { useLanguage } from '../i18n/LanguageContext'
import { deliveryKpis } from '../lib/data'
import type { DeliveryStatus } from '../lib/types'
import { useData } from '../store/DataContext'

const DELIVERY_STATUSES: DeliveryStatus[] = ['scheduled', 'in-transit', 'delayed', 'delivered', 'cancelled']

export default function Deliveries() {
  const { deliveries, drivers, assignDriver } = useData()
  const { t, label, ref: refText } = useLanguage()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [todayOnly, setTodayOnly] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [assignDelivery, setAssignDelivery] = useState('')
  const [assignDriverName, setAssignDriverName] = useState('')

  const statusOptions = DELIVERY_STATUSES.map((s) => ({ value: s, label: t(`deliveryStatus.${s}`) }))

  const filtered = useMemo(() => {
    let list = deliveries
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (d) =>
          d.id.toLowerCase().includes(q) ||
          d.orderId.toLowerCase().includes(q) ||
          d.customer.toLowerCase().includes(q) ||
          d.driver.toLowerCase().includes(q),
      )
    }
    if (status) list = list.filter((d) => d.status === status)
    if (todayOnly) list = list.filter((d) => d.eta.startsWith('Today'))
    return list
  }, [deliveries, search, status, todayOnly])

  function handleAssign() {
    assignDriver(assignDelivery, assignDriverName)
    setAssignOpen(false)
  }

  return (
    <>
      <div className="header">
        <div>
          <h1>{t('deliveries.title')}</h1>
          <p>{t('deliveries.subtitle')}</p>
        </div>
        <div className="header-actions">
          <Button variant="ghost" icon={<Download />}>
            {t('common.export')}
          </Button>
          <Button
            variant="primary"
            icon={<Truck />}
            disabled={deliveries.length === 0}
            onClick={() => {
              setAssignDelivery(deliveries[0]?.id ?? '')
              setAssignDriverName(drivers[0] ?? '')
              setAssignOpen(true)
            }}
          >
            {t('deliveries.assignRoute')}
          </Button>
        </div>
      </div>

      <section className="kpi-grid">
        {deliveryKpis.map((kpi) => {
          const DeltaIcon = kpi.direction === 'up' ? TrendingUp : TrendingDown
          return (
            <Card key={kpi.label} className="kpi-card">
              <div className="kpi-top">
                <span className="kpi-label">{label(kpi.label)}</span>
                <div className="kpi-icon">
                  <Truck />
                </div>
              </div>
              <div className="kpi-value">{kpi.value}</div>
              <div className={`kpi-delta ${kpi.direction}`}>
                <DeltaIcon />
                {kpi.delta} <span className="ref">{refText(kpi.ref)}</span>
              </div>
            </Card>
          )
        })}
      </section>

      <Card style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="toolbar" style={{ background: 'transparent', padding: 0 }}>
          <div className="search-field on-canvas">
            <Search />
            <input
              type="text"
              placeholder={t('deliveries.searchPlaceholder')}
              aria-label={t('deliveries.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Dropdown
            allLabel={t('deliveries.allStatuses')}
            icon={<SlidersHorizontal />}
            variant="pill"
            options={statusOptions}
            value={status}
            onChange={setStatus}
          />
          <button
            type="button"
            className="filter-pill"
            aria-current={todayOnly ? 'true' : undefined}
            onClick={() => setTodayOnly((t2) => !t2)}
          >
            {t('deliveries.today')}
          </button>
        </div>
      </Card>

      <div className="table-card">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{t('deliveries.delivery')}</th>
                <th>{t('common.order')}</th>
                <th>{t('common.customer')}</th>
                <th>{t('deliveries.driver')}</th>
                <th>{t('deliveries.eta')}</th>
                <th>{t('common.status')}</th>
                <th style={{ textAlign: 'right' }}>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state">{t('deliveries.empty')}</div>
                  </td>
                </tr>
              )}
              {filtered.map((delivery) => (
                <tr key={delivery.id}>
                  <td className="order-id">{delivery.id}</td>
                  <td>
                    <span className="unit-muted">{delivery.orderId}</span>
                  </td>
                  <td>
                    <div className="cust">{delivery.customer}</div>
                    <div className="cust-sub">{delivery.address}</div>
                  </td>
                  <td>{delivery.driver}</td>
                  <td>
                    <span className="unit-muted">{delivery.eta}</span>
                  </td>
                  <td>
                    <DeliveryStatusBadge status={delivery.status} />
                  </td>
                  <td>
                    <div className="row-actions">
                      <Link to={`/deliveries/${delivery.id}`} className="action-btn" aria-label="Edit delivery">
                        <Pencil />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="table-footer">
          <span className="count">
            {t('common.showingOf', { shown: filtered.length, total: deliveries.length, noun: t('common.deliveriesCount') })}
          </span>
        </div>
      </div>

      {assignOpen && (
        <Modal
          title={t('deliveries.modal.title')}
          onClose={() => setAssignOpen(false)}
          footer={
            <>
              <Button variant="text" onClick={() => setAssignOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button variant="primary" onClick={handleAssign}>
                {t('deliveries.modal.assign')}
              </Button>
            </>
          }
        >
          <div className="field">
            <label htmlFor="assign-delivery">{t('deliveries.modal.delivery')}</label>
            <div className="select-wrap">
              <select
                id="assign-delivery"
                value={assignDelivery}
                onChange={(e) => setAssignDelivery(e.target.value)}
              >
                {deliveries.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.id} · {d.customer}
                  </option>
                ))}
              </select>
              <ChevronDown />
            </div>
          </div>
          <div className="field">
            <label htmlFor="assign-driver">{t('deliveries.modal.driver')}</label>
            <input
              id="assign-driver"
              type="text"
              list="driver-names"
              placeholder="e.g. R. Castillo"
              value={assignDriverName}
              onChange={(e) => setAssignDriverName(e.target.value)}
            />
            <datalist id="driver-names">
              {drivers.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
          </div>
        </Modal>
      )}
    </>
  )
}
