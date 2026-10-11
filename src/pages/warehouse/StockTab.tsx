import { Minus, Plus, Search, SlidersHorizontal } from 'lucide-react'
import { useMemo, useState } from 'react'
import Card from '../../components/ui/Card'
import Dropdown from '../../components/ui/Dropdown'
import Pagination from '../../components/ui/Pagination'
import Switch from '../../components/ui/Switch'
import { useLanguage } from '../../i18n/LanguageContext'
import { downloadPurchaseList, downloadStockReport } from '../../lib/exportWarehouse'
import type { ProductRow } from '../../lib/types'
import {
  expiryTone,
  formatQty,
  liveBatches,
  nearestExpiry,
  stockOf,
  stockState,
  STOCK_STATE_LABELS,
  type StockState,
  type WarehouseState,
} from '../../lib/warehouse'
import { ExpiryText, ExportButton, ProductCell, Qty, StockStateBadge } from './shared'

const PAGE_SIZE = 20
// Problems first: negative, then empty, then running low.
const STATE_ORDER: Record<StockState, number> = { negative: 0, out: 1, low: 2, in: 3 }

interface StockTabProps {
  state: WarehouseState
  products: ProductRow[]
  onReceive: (productId: string) => void
  onWriteOff: (productId: string) => void
  onOpenProduct: (productId: string) => void
}

export default function StockTab({ state, products, onReceive, onWriteOff, onOpenProduct }: StockTabProps) {
  const { category, unit } = useLanguage()
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [stateFilter, setStateFilter] = useState<StockState | null>(null)
  const [expiringOnly, setExpiringOnly] = useState(false)
  const [page, setPage] = useState(1)

  const rows = useMemo(
    () =>
      products
        .filter((p) => state.settings[p.id])
        .map((p) => {
          const settings = state.settings[p.id]
          const stock = stockOf(state, p.id)
          const expiry = nearestExpiry(state, p.id)
          const hasBatches = liveBatches(state, p.id).length > 0
          return { product: p, settings, stock, expiry, hasBatches, status: stockState(stock, settings.minStock) }
        }),
    [products, state],
  )

  const categories = useMemo(() => [...new Set(rows.map((r) => r.product.category))].sort(), [rows])

  const kpis = useMemo(
    () => ({
      inStock: rows.filter((r) => r.stock > 0).length,
      low: rows.filter((r) => r.status === 'low').length,
      out: rows.filter((r) => r.status === 'out' || r.status === 'negative').length,
      expiring: rows.filter((r) => r.expiry && expiryTone(r.expiry) !== 'ok').length,
    }),
    [rows],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows
      .filter((r) => !q || r.product.name.toLowerCase().includes(q) || r.product.sku.toLowerCase().includes(q))
      .filter((r) => !activeCategory || r.product.category === activeCategory)
      .filter((r) => !stateFilter || r.status === stateFilter)
      .filter((r) => !expiringOnly || (r.expiry && expiryTone(r.expiry) !== 'ok'))
      .sort((a, b) => STATE_ORDER[a.status] - STATE_ORDER[b.status] || a.product.name.localeCompare(b.product.name, 'ru'))
  }, [rows, search, activeCategory, stateFilter, expiringOnly])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  return (
    <>
      <section className="kpi-grid">
        <Card className="kpi-card">
          <span className="kpi-label">Товаров на складе</span>
          <div className="kpi-value">{kpis.inStock}</div>
        </Card>
        <Card className="kpi-card">
          <span className="kpi-label">Заканчивается</span>
          <div className="kpi-value wh-tone-warn">{kpis.low}</div>
        </Card>
        <Card className="kpi-card">
          <span className="kpi-label">Нет в наличии</span>
          <div className="kpi-value wh-tone-danger">{kpis.out}</div>
        </Card>
        <Card className="kpi-card">
          <span className="kpi-label">Истекает срок (3 дня)</span>
          <div className="kpi-value wh-tone-warn">{kpis.expiring}</div>
        </Card>
      </section>

      <Card style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="toolbar bare">
          <div className="search-field on-canvas">
            <Search />
            <input
              type="text"
              placeholder="Поиск по названию или артикулу…"
              aria-label="Поиск по названию или артикулу"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
            />
          </div>
          <Dropdown
            allLabel="Все категории"
            icon={<SlidersHorizontal />}
            variant="pill"
            options={categories.map((c) => ({ label: category(c), value: c }))}
            value={activeCategory}
            onChange={(v) => {
              setActiveCategory(v)
              setPage(1)
            }}
          />
          <label className="wh-toggle">
            <span>Только с истекающим сроком</span>
            <Switch
              checked={expiringOnly}
              onChange={(v) => {
                setExpiringOnly(v)
                setPage(1)
              }}
              label="Только с истекающим сроком"
              size="sm"
            />
          </label>
        </div>
        <div className="chip-row" role="listbox" aria-label="Статус">
          {([null, 'in', 'low', 'out', 'negative'] as (StockState | null)[]).map((s) => (
            <button
              key={s ?? 'all'}
              type="button"
              className="chip"
              role="option"
              aria-selected={stateFilter === s}
              onClick={() => {
                setStateFilter(s)
                setPage(1)
              }}
            >
              {s ? STOCK_STATE_LABELS[s] : 'Все'}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <div className="table-head">
          <p className="section-label" style={{ margin: 0 }}>
            Остатки на складе
          </p>
          <div className="wh-actions">
            <ExportButton label="Скачать остатки" onExport={() => downloadStockReport(state, filtered.map((r) => r.product))} />
            <ExportButton label="Что закупить" onExport={() => downloadPurchaseList(state, rows.map((r) => r.product))} />
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Товар</th>
                <th>Категория</th>
                <th style={{ textAlign: 'right' }}>Остаток</th>
                <th style={{ textAlign: 'right' }}>Мин. остаток</th>
                <th>Ближайший срок</th>
                <th>Статус</th>
                <th style={{ textAlign: 'right' }}>Действия</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state">Ничего не найдено — измените фильтры.</div>
                  </td>
                </tr>
              )}
              {pageRows.map(({ product, settings, stock, expiry, hasBatches, status }) => {
                const box = Object.entries(settings.unitSize)[0]
                return (
                  <tr
                    key={product.id}
                    className="row-link"
                    tabIndex={0}
                    onClick={() => onOpenProduct(product.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && e.target === e.currentTarget) onOpenProduct(product.id)
                    }}
                  >
                    <td>
                      <ProductCell product={product} />
                    </td>
                    <td>
                      <span className="unit-muted">{category(product.category)}</span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Qty value={stock} unit={settings.baseUnit} />
                      {box && stock > 0 && (
                        <span className="wh-sub">
                          ≈ {formatQty(Math.round((stock / box[1]) * 10) / 10)} {unit(box[0])}
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="unit-muted">
                        {formatQty(settings.minStock)} {unit(settings.baseUnit)}
                      </span>
                    </td>
                    <td>
                      <ExpiryText date={expiry} none={hasBatches ? 'без срока' : 'нет партий'} />
                    </td>
                    <td>
                      <StockStateBadge state={status} />
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="wh-actions">
                        <button type="button" className="action-btn" aria-label={`Приход: ${product.name}`} title="Приход" onClick={() => onReceive(product.id)}>
                          <Plus />
                        </button>
                        <button type="button" className="action-btn" aria-label={`Списать: ${product.name}`} title="Списать" onClick={() => onWriteOff(product.id)}>
                          <Minus />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <Pagination
          page={safePage}
          pageCount={pageCount}
          onChange={setPage}
          totalLabel={`Показано ${pageRows.length} из ${filtered.length} товаров`}
          prevLabel="Предыдущая страница"
          nextLabel="Следующая страница"
        />
      </Card>
    </>
  )
}
