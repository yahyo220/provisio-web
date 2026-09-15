import { Box, CircleAlert, Download, Package, TrendingDown, TrendingUp } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import PaymentLabel from '../components/ui/PaymentLabel'
import RevenueChart from '../components/ui/RevenueChart'
import StatusBadge from '../components/ui/StatusBadge'
import { useLanguage } from '../i18n/LanguageContext'
import { computeCategoryBreakdown, computeDailyRevenueSeries, computeDashboardKpis, computeTopProducts, PERIOD_KEY } from '../lib/stats'
import type { RevenueRange } from '../lib/stats'
import { useData } from '../store/DataContext'

const KPI_ICON = {
  package: Package,
  box: Box,
  alert: CircleAlert,
}

const RANGES: RevenueRange[] = ['1W', '1M', '3M', '1Y']

export default function Dashboard() {
  const { orders, orderItems, customers, products } = useData()
  const { t, label, ref: refText, category, unit } = useLanguage()
  const navigate = useNavigate()
  const [range, setRange] = useState<RevenueRange>('1M')

  const kpis = useMemo(() => computeDashboardKpis(orders, customers), [orders, customers])
  const dailyRevenue = useMemo(() => computeDailyRevenueSeries(orders), [orders])
  const topProducts = useMemo(
    () => computeTopProducts(orders, orderItems, products, range),
    [orders, orderItems, products, range],
  )
  const categories = useMemo(
    () => computeCategoryBreakdown(orders, orderItems, products, range),
    [orders, orderItems, products, range],
  )
  const recentOrders = orders.slice(0, 5)
  const periodLabel = t(`period.${PERIOD_KEY[range]}`)

  return (
    <>
      <div className="header">
        <div>
          <h1>{t('dashboard.title')}</h1>
          <p>{t('dashboard.subtitle')}</p>
        </div>
        <div className="header-actions">
          {/* Still drives the KPIs / top products / category breakdown below
              — only the revenue chart itself moved off fixed presets, onto
              its own free zoom/pan. */}
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
          const Icon = KPI_ICON[kpi.icon]
          const DeltaIcon = kpi.direction === 'up' ? TrendingUp : TrendingDown
          return (
            <Card key={kpi.label} className="kpi-card">
              <div className="kpi-top">
                <span className="kpi-label">{label(kpi.label)}</span>
                <div className="kpi-icon">
                  <Icon />
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

      <section className="charts-grid">
        <Card>
          <div className="chart-head">
            <div className="stat-line">
              <span className="stat-cap">{t('common.revenue')} · {t('dashboard.scrollToZoom')}</span>
            </div>
          </div>
          <RevenueChart data={dailyRevenue} />
        </Card>

        <Card style={{ display: 'flex', flexDirection: 'column' }}>
          <p className="section-label">{t('dashboard.salesByCategory')}</p>
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
      </section>

      <Card>
        <p className="section-label">
          {t('dashboard.mostOrderedProducts')} · {periodLabel}
        </p>
        <div className="products-row">
          {topProducts.length === 0 && <div className="empty-state">{t('common.noData')}</div>}
          {topProducts.map((product) => (
            <Link className="product-item" to={`/products/${product.id}`} key={product.id}>
              <img src={product.image} alt="" />
              <div>
                <div className="p-name">{product.name}</div>
                <div className="p-meta">
                  {category(product.category)} · {product.price} / {unit(product.unit)}
                </div>
              </div>
              <div className="p-units">{product.units}</div>
            </Link>
          ))}
        </div>
      </Card>

      <Card>
        <div className="table-head">
          <p className="section-label" style={{ margin: 0 }}>
            {t('dashboard.recentOrders')}
          </p>
          <Link to="/orders" className="btn btn-text">
            {t('dashboard.viewAllOrders')}
          </Link>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('common.order')}</th>
                <th>{t('common.customer')}</th>
                <th>{t('common.date')}</th>
                <th>{t('table.products')}</th>
                <th>{t('common.total')}</th>
                <th>{t('common.payment')}</th>
                <th>{t('common.status')}</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state">{t('common.noData')}</div>
                  </td>
                </tr>
              )}
              {recentOrders.map((order) => (
                <tr
                  key={order.id}
                  className="row-link"
                  tabIndex={0}
                  onClick={() => navigate(`/orders/${order.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') navigate(`/orders/${order.id}`)
                  }}
                >
                  <td className="order-id">#{order.orderNumber}</td>
                  <td>
                    <div className="cust">{order.customer}</div>
                    <div className="cust-sub">{order.meta}</div>
                  </td>
                  <td>{order.date}</td>
                  <td>{order.products}</td>
                  <td className="amount">{order.total}</td>
                  <td>
                    <PaymentLabel status={order.payment} />
                  </td>
                  <td>
                    <StatusBadge status={order.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )
}
