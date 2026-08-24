import { ArrowDown, ArrowLeft, ArrowUp, Calendar, CreditCard, Download, Pencil, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import Dropdown from '../components/ui/Dropdown'
import Pagination from '../components/ui/Pagination'
import PaymentLabel from '../components/ui/PaymentLabel'
import StatusBadge from '../components/ui/StatusBadge'
import { useLanguage } from '../i18n/LanguageContext'
import type { OrderStatus, PaymentStatus } from '../lib/types'
import { useData } from '../store/DataContext'

const PAGE_SIZE = 4

const ORDER_STATUSES: OrderStatus[] = ['new', 'confirmed', 'preparing', 'ready', 'out', 'delivered', 'cancelled']
const PAYMENT_STATUSES: PaymentStatus[] = ['paid', 'pending', 'overdue']

/** Very rough "day in March" extractor so the mock dates can be filtered/sorted without a real calendar. */
function dayOf(dateStr: string): number {
  const match = dateStr.match(/(\d{1,2}),/)
  return match ? Number(match[1]) : 0
}

export default function Orders() {
  const { orders } = useData()
  const { t } = useLanguage()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [payment, setPayment] = useState<string | null>(null)
  const [thisWeek, setThisWeek] = useState(false)
  const [sortAsc, setSortAsc] = useState(false)
  const [page, setPage] = useState(1)

  const statusOptions = ORDER_STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) }))
  const paymentOptions = PAYMENT_STATUSES.map((p) => ({ value: p, label: t(`payment.${p}`) }))

  const latestDay = useMemo(() => Math.max(...orders.map((o) => dayOf(o.date))), [orders])

  const filtered = useMemo(() => {
    let list = orders
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (o) => o.id.toLowerCase().includes(q) || o.customer.toLowerCase().includes(q) || o.meta.toLowerCase().includes(q),
      )
    }
    if (status) list = list.filter((o) => o.status === status)
    if (payment) list = list.filter((o) => o.payment === payment)
    if (thisWeek) list = list.filter((o) => latestDay - dayOf(o.date) <= 6)

    list = [...list].sort((a, b) => (sortAsc ? dayOf(a.date) - dayOf(b.date) : dayOf(b.date) - dayOf(a.date)))
    return list
  }, [orders, search, status, payment, thisWeek, sortAsc, latestDay])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  function resetPage() {
    setPage(1)
  }

  return (
    <>
      <Link to="/" className="back-link">
        <ArrowLeft />
        {t('orders.backToDashboard')}
      </Link>

      <div className="header">
        <div>
          <h1>{t('orders.title')}</h1>
          <p>{t('orders.subtitle')}</p>
        </div>
        <div className="header-actions">
          <Button variant="ghost" icon={<Download />}>
            {t('common.export')}
          </Button>
          <Button variant="primary" icon={<Plus />}>
            {t('orders.newOrder')}
          </Button>
        </div>
      </div>

      <div className="toolbar">
        <div className="search-field">
          <Calendar />
          <input
            type="text"
            placeholder={t('orders.searchPlaceholder')}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              resetPage()
            }}
          />
        </div>
        <Dropdown
          allLabel={t('orders.allStatuses')}
          options={statusOptions}
          value={status}
          onChange={(v) => {
            setStatus(v)
            resetPage()
          }}
        />
        <button
          type="button"
          className="filter-chip"
          aria-selected={thisWeek}
          onClick={() => {
            setThisWeek((w) => !w)
            resetPage()
          }}
        >
          {t('orders.thisWeek')}
        </button>
        <Dropdown
          allLabel={t('orders.payment')}
          icon={<CreditCard />}
          options={paymentOptions}
          value={payment}
          onChange={(v) => {
            setPayment(v)
            resetPage()
          }}
        />
        <button type="button" className="filter-chip" onClick={() => setSortAsc((s) => !s)}>
          {sortAsc ? <ArrowUp /> : <ArrowDown />}
          {sortAsc ? t('orders.sortOldest') : t('orders.sortNewest')}
        </button>
      </div>

      <Card>
        <div className="list-header">
          <span className="section-label">{t('orders.orderQueue')}</span>
        </div>

        <div className="order-table">
          <div className="order-row head">
            <span>{t('common.order')}</span>
            <span>{t('common.customer')}</span>
            <span>{t('common.date')}</span>
            <span>{t('common.total')}</span>
            <span>{t('common.payment')}</span>
            <span>{t('common.status')}</span>
            <span style={{ textAlign: 'right' }}>{t('common.actions')}</span>
          </div>

          {pageItems.length === 0 && <div className="empty-state">{t('orders.empty')}</div>}

          {pageItems.map((order) => (
            <Link className="order-row" to={`/orders/${order.id.replace('#', '')}`} key={order.id}>
              <span className="order-id">{order.id}</span>
              <div className="order-cust">
                <span className="name">{order.customer}</span>
                <span className="meta">{order.meta}</span>
              </div>
              <span className="order-date">{order.date}</span>
              <span className="order-total">{order.total}</span>
              <span className="pay-cell">
                <PaymentLabel status={order.payment} />
              </span>
              <span className="status-cell">
                <StatusBadge status={order.status} />
              </span>
              <span className="action-cell">
                <span className="row-action round" aria-hidden>
                  <Pencil />
                </span>
              </span>
            </Link>
          ))}
        </div>

        <Pagination
          page={safePage}
          pageCount={pageCount}
          onChange={setPage}
          totalLabel={t('common.showingOf', {
            shown: pageItems.length,
            total: filtered.length,
            noun: t('common.orders'),
          })}
          prevLabel={t('common.previousPage')}
          nextLabel={t('common.nextPage')}
        />
      </Card>
    </>
  )
}
