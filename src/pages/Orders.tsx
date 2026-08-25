import { ArrowDown, ArrowLeft, ArrowUp, Calendar, CreditCard, Download, Pencil, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import Dropdown from '../components/ui/Dropdown'
import Modal from '../components/ui/Modal'
import Pagination from '../components/ui/Pagination'
import PaymentLabel from '../components/ui/PaymentLabel'
import StatusBadge from '../components/ui/StatusBadge'
import { useLanguage } from '../i18n/LanguageContext'
import type { OrderStatus, PaymentStatus } from '../lib/types'
import { useData } from '../store/DataContext'

const PAGE_SIZE = 4

const ORDER_STATUSES: OrderStatus[] = ['new', 'confirmed', 'preparing', 'ready', 'out', 'delivered', 'cancelled']
const PAYMENT_STATUSES: PaymentStatus[] = ['paid', 'pending', 'overdue']
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

export default function Orders() {
  const { orders, removeOrder } = useData()
  const { t } = useLanguage()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [payment, setPayment] = useState<string | null>(null)
  const [thisWeek, setThisWeek] = useState(false)
  const [sortAsc, setSortAsc] = useState(false)
  const [page, setPage] = useState(1)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; orderNumber: number } | null>(null)
  const [deleting, setDeleting] = useState(false)

  const statusOptions = ORDER_STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) }))
  const paymentOptions = PAYMENT_STATUSES.map((p) => ({ value: p, label: t(`payment.${p}`) }))

  const latestTime = useMemo(
    () => Math.max(0, ...orders.map((o) => new Date(o.createdAt).getTime())),
    [orders],
  )

  const filtered = useMemo(() => {
    let list = orders
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (o) =>
          String(o.orderNumber).includes(q) ||
          o.customer.toLowerCase().includes(q) ||
          o.meta.toLowerCase().includes(q),
      )
    }
    if (status) list = list.filter((o) => o.status === status)
    if (payment) list = list.filter((o) => o.payment === payment)
    if (thisWeek) list = list.filter((o) => latestTime - new Date(o.createdAt).getTime() <= WEEK_MS)

    list = [...list].sort((a, b) => {
      const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      return sortAsc ? diff : -diff
    })
    return list
  }, [orders, search, status, payment, thisWeek, sortAsc, latestTime])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  function resetPage() {
    setPage(1)
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await removeOrder(deleteTarget.id)
      setDeleteTarget(null)
    } finally {
      setDeleting(false)
    }
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
            <Link className="order-row" to={`/orders/${order.id}`} key={order.id}>
              <span className="order-id">#{order.orderNumber}</span>
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
              <span className="action-cell" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="row-action round"
                  aria-label="Удалить заказ"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setDeleteTarget({ id: order.id, orderNumber: order.orderNumber })
                  }}
                  style={{ color: 'var(--gesso-error, #c02828)' }}
                >
                  <Trash2 />
                </button>
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

      {deleteTarget && (
        <Modal
          title={`Удалить заказ #${deleteTarget.orderNumber}?`}
          onClose={() => setDeleteTarget(null)}
          footer={
            <>
              <Button variant="text" onClick={() => setDeleteTarget(null)}>
                {t('common.cancel')}
              </Button>
              <Button variant="danger-text" onClick={handleConfirmDelete} disabled={deleting}>
                {deleting ? 'Удаляем…' : 'Удалить'}
              </Button>
            </>
          }
        >
          <p style={{ fontSize: 14, color: 'var(--gesso-fg-muted)' }}>Если удалите, восстановить будет нельзя.</p>
        </Modal>
      )}
    </>
  )
}
