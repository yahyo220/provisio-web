import { BarChart3, Download, TrendingDown, TrendingUp } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import { useLanguage } from '../i18n/LanguageContext'
import {
  analyticsKpisByRange,
  categoryBreakdownByRange,
  paymentBreakdown,
  productPerformanceByRange,
  revenueByRange,
  topCustomersBySpend,
} from '../lib/data'
import type { RevenueRange } from '../lib/data'
import { useData } from '../store/DataContext'

const RANGES: RevenueRange[] = ['1W', '1M', '3M', '1Y']

export default function Analytics() {
  const { customers } = useData()
  const { t, label, ref: refText, category } = useLanguage()
  const [range, setRange] = useState<RevenueRange>('1M')

  const chart = revenueByRange[range]
  const kpis = analyticsKpisByRange[range]
  const categories = categoryBreakdownByRange[range]
  const productPerformance = productPerformanceByRange[range]
  const periodLabel = t(`period.${chart.periodKey}`)

  const chartTop = useMemo(() => {
    const ys = chart.points.split(' ').map((p) => Number(p.split(',')[1]))
    return Math.min(...ys)
  }, [chart])

  return (
    <>
      <div className="header">
        <div>
          <h1>{t('analytics.title')}</h1>
          <p>{t('analytics.subtitle')}</p>
        </div>
        <div className="header-actions">
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
            <span className="stat-val">{chart.stat}</span>
            <span className="stat-cap">
              {t('common.revenue')} · {periodLabel}
            </span>
          </div>
          <div className="range-pills" role="tablist" aria-label="Revenue chart time range">
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
        </div>
        <svg
          viewBox="0 0 640 220"
          width="100%"
          height="220"
          preserveAspectRatio="none"
          role="img"
          aria-label={`${t('common.revenue')} · ${periodLabel}`}
        >
          <line x1="0" y1="40" x2="640" y2="40" stroke="var(--gesso-divider)" strokeWidth="1" />
          <line x1="0" y1="100" x2="640" y2="100" stroke="var(--gesso-divider)" strokeWidth="1" />
          <line x1="0" y1="160" x2="640" y2="160" stroke="var(--gesso-divider)" strokeWidth="1" />
          <polyline
            fill="none"
            stroke="var(--gesso-accent)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={chart.points}
          />
          <circle cx="640" cy={chartTop} r="5" fill="var(--gesso-accent)" />
          {chart.axis.map((axisLabel, i) => (
            <text
              key={`${axisLabel}-${i}`}
              x={i === chart.axis.length - 1 ? 615 : (i * 640) / (chart.axis.length - 1)}
              y="212"
              className="axis-label"
            >
              {axisLabel}
            </text>
          ))}
        </svg>
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
            {topCustomersBySpend.map((customer) => {
              const match = customers.find((c) => c.name === customer.name)
              const content = (
                <>
                  <div>
                    <div className="p-name">{customer.name}</div>
                    <div className="p-meta">{customer.meta}</div>
                  </div>
                  <div className="p-units">{customer.value}</div>
                </>
              )
              return match ? (
                <Link className="product-item" to={`/customers/${match.id}`} key={customer.name}>
                  {content}
                </Link>
              ) : (
                <div className="product-item" key={customer.name}>
                  {content}
                </div>
              )
            })}
          </div>
        </Card>
      </section>
    </>
  )
}
