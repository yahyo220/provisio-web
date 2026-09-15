import { BarChart3, Download, TrendingDown, TrendingUp } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import RevenueChart from '../components/ui/RevenueChart'
import { useLanguage } from '../i18n/LanguageContext'
import { fetchOrderItems } from '../lib/api'
import { downloadOrderExcelWithPrice, downloadWeeklyInvoiceExcel } from '../lib/exportInvoices'
import {
  computeAnalyticsKpis,
  computeCategoryBreakdown,
  computeDailyRevenueSeries,
  computePaymentBreakdown,
  computeProductPerformance,
  computeTopCustomersBySpend,
} from '../lib/stats'
import type { RevenueRange } from '../lib/stats'
import { useData } from '../store/DataContext'

const RANGES: RevenueRange[] = ['1W', '1M', '3M', '1Y']

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}
function daysAgoIso(days: number) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

export default function Analytics() {
  const { orders, orderItems, customers, products } = useData()
  const { t, label, ref: refText, category } = useLanguage()
  const [range, setRange] = useState<RevenueRange>('1M')

  const sortedOrders = useMemo(
    () => [...orders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [orders],
  )
  const [invoiceOrderId, setInvoiceOrderId] = useState('')
  const [downloadingOrderInvoice, setDownloadingOrderInvoice] = useState(false)

  const [invoiceCustomerId, setInvoiceCustomerId] = useState('')
  const [dateFrom, setDateFrom] = useState(daysAgoIso(7))
  const [dateTo, setDateTo] = useState(todayIso())
  const [downloadingWeekly, setDownloadingWeekly] = useState(false)
  const [weeklyError, setWeeklyError] = useState<string | null>(null)

  async function handleDownloadOrderInvoice() {
    const order = orders.find((o) => o.id === invoiceOrderId)
    if (!order) return
    setDownloadingOrderInvoice(true)
    try {
      const customer = customers.find((c) => c.id === order.customerId)
      const lineItems = await fetchOrderItems(order.id)
      await downloadOrderExcelWithPrice(order, customer, lineItems)
    } catch (err) {
      console.error(err)
    } finally {
      setDownloadingOrderInvoice(false)
    }
  }

  async function handleDownloadWeeklyInvoice() {
    const customer = customers.find((c) => c.id === invoiceCustomerId)
    if (!customer) return
    setWeeklyError(null)
    setDownloadingWeekly(true)
    try {
      const count = await downloadWeeklyInvoiceExcel({ customer, orders, orderItems, products, dateFrom, dateTo })
      if (count === 0) setWeeklyError(t('analytics.invoices.noOrdersInRange'))
    } catch (err) {
      console.error(err)
    } finally {
      setDownloadingWeekly(false)
    }
  }

  const dailyRevenue = useMemo(() => computeDailyRevenueSeries(orders), [orders])
  const kpis = useMemo(() => computeAnalyticsKpis(orders, range), [orders, range])
  const categories = useMemo(() => computeCategoryBreakdown(orders, orderItems, products, range), [orders, orderItems, products, range])
  const paymentBreakdown = useMemo(() => computePaymentBreakdown(orders, range), [orders, range])
  const productPerformance = useMemo(
    () => computeProductPerformance(orders, orderItems, products, range),
    [orders, orderItems, products, range],
  )
  const topCustomersBySpend = useMemo(() => computeTopCustomersBySpend(orders, range), [orders, range])

  return (
    <>
      <div className="header">
        <div>
          <h1>{t('analytics.title')}</h1>
          <p>{t('analytics.subtitle')}</p>
        </div>
        <div className="header-actions">
          {/* Still drives the KPIs / category / payment / product-performance
              / top-customers stats below — only the revenue chart itself
              moved off fixed presets, onto its own free zoom/pan. */}
          <div className="range-pills" role="tablist" aria-label="Stats time range">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                className="range-pill"
                role="tab"
                aria-selected={range === r}
                onClick={() => setRange(r)}
              >
                {r}
              </button>
            ))}
          </div>
          <Button variant="ghost" icon={<Download />}>
            {t('common.exportReport')}
          </Button>
        </div>
      </div>

      <section className="kpi-grid">
        {kpis.map((kpi) => {
          const DeltaIcon = kpi.direction === 'up' ? TrendingUp : TrendingDown
          return (
            <Card key={kpi.label} className="kpi-card">
              <div className="kpi-top">
                <span className="kpi-label">{label(kpi.label)}</span>
                <div className="kpi-icon">
                  <BarChart3 />
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

      <Card>
        <div className="chart-head">
          <div className="stat-line">
            <span className="stat-cap">{t('common.revenue')} · {t('dashboard.scrollToZoom')}</span>
          </div>
        </div>
        <RevenueChart data={dailyRevenue} />
      </Card>

      <section className="charts-grid">
        <Card>
          <p className="section-label">{t('analytics.salesByCategory')}</p>
          <div className="cat-list scroll-list">
            {categories.length === 0 && <div className="empty-state">{t('common.noData')}</div>}
            {categories.map((cat) => (
              <div className="cat-row" key={cat.name}>
                <div className="cat-top">
                  <span className="name">{category(cat.name)}</span>
                  <span className="val">{cat.pct}%</span>
                </div>
                <div className="cat-track">
                  <div className="cat-fill" style={{ width: `${cat.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <p className="section-label">{t('analytics.paymentStatus')}</p>
          <div className="cat-list">
            {paymentBreakdown.length === 0 && <div className="empty-state">{t('common.noData')}</div>}
            {paymentBreakdown.map((row) => (
              <div className="cat-row" key={row.name}>
                <div className="cat-top">
                  <span className="name">{t(`payment.${row.name.toLowerCase()}`)}</span>
                  <span className="val">{row.pct}%</span>
                </div>
                <div className="cat-track">
                  <div className="cat-fill" style={{ width: `${row.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section className="charts-grid">
        <Card>
          <div className="table-head">
            <p className="section-label" style={{ margin: 0 }}>
              {t('analytics.productPerformance')}
            </p>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('common.product')}</th>
                  <th>{t('analytics.unitsSold')}</th>
                  <th>{t('common.revenue')}</th>
                  <th>{t('analytics.growth')}</th>
                </tr>
              </thead>
              <tbody>
                {productPerformance.length === 0 && (
                  <tr>
                    <td colSpan={4}>
                      <div className="empty-state">{t('common.noData')}</div>
                    </td>
                  </tr>
                )}
                {productPerformance.map((row) => {
                  const DeltaIcon = row.direction === 'up' ? TrendingUp : TrendingDown
                  return (
                    <tr key={row.name}>
                      <td className="cust">{row.name}</td>
                      <td>
                        <span className="unit-muted">{row.unitsSold}</span>
                      </td>
                      <td className="amount">{row.revenue}</td>
                      <td>
                        <span className={`kpi-delta ${row.direction}`} style={{ fontSize: 13 }}>
                          <DeltaIcon />
                          {row.growth}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <p className="section-label">{t('analytics.topCustomers')}</p>
          <div className="products-row">
            {topCustomersBySpend.length === 0 && <div className="empty-state">{t('common.noData')}</div>}
            {topCustomersBySpend.map((customer) => (
              <Link className="product-item" to={`/customers/${customer.id}`} key={customer.id}>
                <div>
                  <div className="p-name">{customer.name}</div>
                  <div className="p-meta">{customer.meta}</div>
                </div>
                <div className="p-units">{customer.value}</div>
              </Link>
            ))}
          </div>
        </Card>
      </section>

      <Card>
        <p className="section-label">{t('analytics.invoices.title')}</p>
        <div className="charts-grid" style={{ marginTop: 8 }}>
          <div>
            <p className="sub" style={{ marginBottom: 12 }}>
              {t('analytics.invoices.singleOrder')}
            </p>
            <div className="field">
              <div className="select-wrap">
                <select value={invoiceOrderId} onChange={(e) => setInvoiceOrderId(e.target.value)}>
                  <option value="">{t('analytics.invoices.selectOrder')}</option>
                  {sortedOrders.map((o) => (
                    <option key={o.id} value={o.id}>
                      #{o.orderNumber} · {o.customer} · {o.date}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <Button
              variant="primary"
              icon={<Download />}
              disabled={!invoiceOrderId || downloadingOrderInvoice}
              onClick={handleDownloadOrderInvoice}
              style={{ marginTop: 12 }}
            >
              {downloadingOrderInvoice ? '…' : t('analytics.invoices.download')}
            </Button>
          </div>

          <div>
            <p className="sub" style={{ marginBottom: 12 }}>
              {t('analytics.invoices.weekly')}
            </p>
            <div className="field">
              <div className="select-wrap">
                <select value={invoiceCustomerId} onChange={(e) => setInvoiceCustomerId(e.target.value)}>
                  <option value="">{t('analytics.invoices.selectCustomer')}</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
              <div className="field" style={{ flex: 1 }}>
                <label htmlFor="an-date-from">{t('analytics.invoices.from')}</label>
                <input id="an-date-from" type="date" value={dateFrom} max={dateTo} onChange={(e) => setDateFrom(e.target.value)} />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label htmlFor="an-date-to">{t('analytics.invoices.to')}</label>
                <input id="an-date-to" type="date" value={dateTo} min={dateFrom} onChange={(e) => setDateTo(e.target.value)} />
              </div>
            </div>
            {weeklyError && (
              <p className="sub" style={{ color: 'var(--gesso-danger, #d33)', marginTop: 8 }}>
                {weeklyError}
              </p>
            )}
            <Button
              variant="primary"
              icon={<Download />}
              disabled={!invoiceCustomerId || downloadingWeekly}
              onClick={handleDownloadWeeklyInvoice}
              style={{ marginTop: 12 }}
            >
              {downloadingWeekly ? '…' : t('analytics.invoices.download')}
            </Button>
          </div>
        </div>
      </Card>
    </>
  )
}
