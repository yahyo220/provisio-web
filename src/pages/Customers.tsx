import { Box, CircleCheck, Download, Pencil, Plus, Search, SlidersHorizontal, TrendingDown, TrendingUp } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import CustomerStatusBadge from '../components/ui/CustomerStatusBadge'
import Dropdown from '../components/ui/Dropdown'
import Pagination from '../components/ui/Pagination'
import { useLanguage } from '../i18n/LanguageContext'
import { customerKpis } from '../lib/data'
import { useData } from '../store/DataContext'

const PAGE_SIZE = 5

export default function Customers() {
  const { customers } = useData()
  const { t, label, ref: refText, customerType } = useLanguage()
  const [search, setSearch] = useState('')
  const [type, setType] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [page, setPage] = useState(1)

  const types = useMemo(() => Array.from(new Set(customers.map((c) => c.type))).sort(), [customers])

  const filtered = useMemo(() => {
    let list = customers
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter((c) => c.name.toLowerCase().includes(q) || c.contact.toLowerCase().includes(q))
    }
    if (type) list = list.filter((c) => c.type === type)
    if (status) list = list.filter((c) => c.status === status)
    return list
  }, [customers, search, type, status])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  function resetPage() {
    setPage(1)
  }

  return (
    <>
      <div className="header">
        <div>
          <h1>{t('customers.title')}</h1>
          <p>{t('customers.subtitle')}</p>
        </div>
        <div className="header-actions">
          <Button variant="ghost" icon={<Download />}>
            {t('common.export')}
          </Button>
          <Link to="/customers/new" className="btn btn-primary">
            <Plus />
            {t('customers.addCustomer')}
          </Link>
        </div>
      </div>

      <section className="kpi-grid">
        {customerKpis.map((kpi) => {
          const DeltaIcon = kpi.direction === 'up' ? TrendingUp : TrendingDown
          return (
            <Card key={kpi.label} className="kpi-card">
              <div className="kpi-top">
                <span className="kpi-label">{label(kpi.label)}</span>
                <div className="kpi-icon">
                  <Box />
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
              placeholder={t('customers.searchPlaceholder')}
              aria-label={t('customers.searchPlaceholder')}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                resetPage()
              }}
            />
          </div>
          <Dropdown
            allLabel={t('customers.allTypes')}
            icon={<SlidersHorizontal />}
            variant="pill"
            options={types.map((t2) => ({ label: customerType(t2), value: t2 }))}
            value={type}
            onChange={(v) => {
              setType(v)
              resetPage()
            }}
          />
          <Dropdown
            allLabel={t('products.anyStatus')}
            icon={<CircleCheck />}
            variant="pill"
            options={[
              { label: t('customerStatus.active'), value: 'active' },
              { label: t('customerStatus.inactive'), value: 'inactive' },
            ]}
            value={status}
            onChange={(v) => {
              setStatus(v)
              resetPage()
            }}
          />
        </div>
      </Card>

      <div className="table-card">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{t('common.customer')}</th>
                <th>{t('common.type')}</th>
                <th>{t('common.location')}</th>
                <th>{t('nav.orders')}</th>
                <th>{t('common.totalSpent')}</th>
                <th>{t('common.status')}</th>
                <th style={{ textAlign: 'right' }}>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state">{t('customers.empty')}</div>
                  </td>
                </tr>
              )}
              {pageItems.map((customer) => (
                <tr key={customer.id}>
                  <td>
                    <div className="prod-cell">
                      <div className="avatar">{customer.initials}</div>
                      <div>
                        <div className="prod-name" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {customer.name}
                          {customer.approvalStatus === 'pending' && (
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                color: '#a35b00',
                                background: 'rgba(200,130,0,0.12)',
                                borderRadius: 'var(--gesso-radius-full)',
                                padding: '2px 8px',
                              }}
                            >
                              Ожидает
                            </span>
                          )}
                        </div>
                        <div className="prod-sku">{customer.contact}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="cat-tag">{customerType(customer.type)}</span>
                  </td>
                  <td>
                    <span className="unit-muted">{customer.location}</span>
                  </td>
                  <td>
                    <span className="price-val">{customer.orders}</span>
                  </td>
                  <td>
                    <span className="price-val">{customer.spent}</span>
                  </td>
                  <td>
                    <CustomerStatusBadge status={customer.status} />
                  </td>
                  <td>
                    <div className="row-actions">
                      <Link to={`/customers/${customer.id}`} className="action-btn" aria-label="Edit customer">
                        <Pencil />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination
          page={safePage}
          pageCount={pageCount}
          onChange={setPage}
          totalLabel={t('common.showingOf', {
            shown: pageItems.length,
            total: filtered.length,
            noun: t('common.customersCount'),
          })}
          prevLabel={t('common.previousPage')}
          nextLabel={t('common.nextPage')}
          bordered
        />
      </div>
    </>
  )
}
