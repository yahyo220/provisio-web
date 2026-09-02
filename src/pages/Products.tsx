import { ArrowUpDown, CircleCheck, Copy, Download, Pencil, Plus, Search, SlidersHorizontal, Trash2, Upload } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import Dropdown from '../components/ui/Dropdown'
import Pagination from '../components/ui/Pagination'
import StockBadge from '../components/ui/StockBadge'
import Switch from '../components/ui/Switch'
import { useLanguage } from '../i18n/LanguageContext'
import { downloadPriceListExcel, parsePriceFile } from '../lib/exportPriceList'
import { useData } from '../store/DataContext'

const PAGE_SIZE = 20

// Column widths shared between the header table and the body table below —
// see the comment by their markup for why there are two separate tables.
const COLUMN_WIDTHS = ['26%', '11%', '7%', '6%', '12%', '9%', '15%', '14%']

function ProductColgroup() {
  return (
    <colgroup>
      {COLUMN_WIDTHS.map((w, i) => (
        <col key={i} style={{ width: w }} />
      ))}
    </colgroup>
  )
}

export default function Products() {
  const { products, toggleProductActive, removeProduct, updateProduct } = useData()
  const { t, category, unit } = useLanguage()
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [sortByUpdated, setSortByUpdated] = useState(false)
  const [page, setPage] = useState(1)
  const [importMsg, setImportMsg] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const categories = useMemo(
    () => Array.from(new Set(products.map((p) => p.category))).sort(),
    [products],
  )

  const filtered = useMemo(() => {
    let list = products
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
    }
    if (activeCategory) list = list.filter((p) => p.category === activeCategory)
    if (status) list = list.filter((p) => (status === 'active' ? p.active : !p.active))
    if (sortByUpdated) {
      list = [...list].sort((a, b) => a.updated.localeCompare(b.updated))
    }
    return list
  }, [products, search, activeCategory, status, sortByUpdated])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  function resetPage() {
    setPage(1)
  }

  const [exporting, setExporting] = useState(false)

  async function handleExport() {
    setExporting(true)
    try {
      await downloadPriceListExcel(products)
    } finally {
      setExporting(false)
    }
  }

  async function handleImportFile(file: File) {
    setImporting(true)
    setImportMsg(null)
    try {
      const rows = await parsePriceFile(file)
      const bySku = new Map(products.map((p) => [p.sku, p]))
      let updated = 0
      let skipped = 0
      for (const row of rows) {
        const product = bySku.get(row.sku)
        if (!product) {
          skipped++
          continue
        }
        await updateProduct(product.id, {
          price: String(row.price),
          priceExternal: row.priceExternal != null ? String(row.priceExternal) : '',
        })
        updated++
      }
      setImportMsg(skipped > 0 ? `Обновлено: ${updated}. Не найдено по SKU: ${skipped}.` : `Обновлено цен: ${updated}.`)
    } catch (err) {
      setImportMsg(`Не удалось прочитать файл: ${(err as Error).message}`)
    } finally {
      setImporting(false)
    }
  }

  return (
    <>
      <div className="header">
        <div>
          <h1>{t('products.title')}</h1>
          <p>{t('products.subtitle', { count: products.length, categories: categories.length })}</p>
        </div>
        <div className="header-actions">
          <Button variant="ghost" icon={<Upload />} onClick={() => fileInputRef.current?.click()} disabled={importing}>
            {importing ? 'Загружаем…' : 'Импорт цен'}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.csv"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleImportFile(file)
              e.target.value = ''
            }}
          />
          <Button variant="ghost" icon={<Download />} onClick={handleExport} disabled={exporting}>
            {exporting ? 'Готовим файл…' : t('common.export')}
          </Button>
          <Link to="/products/new" className="btn btn-primary">
            <Plus />
            {t('products.addProduct')}
          </Link>
        </div>
      </div>
      {importMsg && (
        <div
          style={{
            background: 'rgba(30,92,62,0.08)',
            color: 'var(--gesso-accent, #1E5C3E)',
            borderRadius: 'var(--gesso-radius-md)',
            padding: '10px 16px',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {importMsg}
        </div>
      )}

      <Card style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="toolbar bare">
          <div className="search-field on-canvas">
            <Search />
            <input
              type="text"
              placeholder={t('products.searchPlaceholder')}
              aria-label={t('products.searchPlaceholder')}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                resetPage()
              }}
            />
          </div>
          <Dropdown
            allLabel={t('products.allCategories')}
            icon={<SlidersHorizontal />}
            variant="pill"
            options={categories.map((c) => ({ label: category(c), value: c }))}
            value={activeCategory}
            onChange={(v) => {
              setActiveCategory(v)
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
          <button
            type="button"
            className="filter-pill"
            aria-current={sortByUpdated ? 'true' : undefined}
            onClick={() => setSortByUpdated((s) => !s)}
          >
            <ArrowUpDown />
            {t('products.lastUpdated')}
          </button>
        </div>
        <div className="chip-row" role="listbox" aria-label={t('products.allCategories')}>
          <button
            type="button"
            className="chip"
            role="option"
            aria-selected={!activeCategory}
            onClick={() => {
              setActiveCategory(null)
              resetPage()
            }}
          >
            {t('products.all')}
          </button>
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              className="chip"
              role="option"
              aria-selected={activeCategory === c}
              onClick={() => {
                setActiveCategory(c)
                resetPage()
              }}
            >
              {category(c)}
            </button>
          ))}
        </div>
      </Card>

      <div className="table-card">
        {/* Split into two tables (matching column widths via ProductColgroup)
            instead of one table with a sticky <thead>: the header needs to
            stay visible while scrolling through up to 20 rows, but a sticky
            header sitting *over* scrolling rows is what caused rows to show
            through it (tried opaque backgrounds, blur, a fade — all either
            looked wrong or didn't render reliably everywhere). With the
            header in its own non-scrolling table above a separately
            scrolling body, rows simply can't reach behind it — there's
            nothing to hide, so the header can stay the same plain
            translucent style as every other table on the site. */}
        <div className="split-table">
          <div className="table-scroll">
            <table>
              <ProductColgroup />
              <thead>
                <tr>
                  <th>{t('common.product')}</th>
                  <th>{t('common.category')}</th>
                  <th>{t('common.price')}</th>
                  <th>{t('common.unit')}</th>
                  <th>{t('common.stock')}</th>
                  <th>{t('products.tableActive')}</th>
                  <th>{t('products.lastUpdated')}</th>
                  <th style={{ textAlign: 'right' }}>{t('common.actions')}</th>
                </tr>
              </thead>
            </table>
          </div>
          <div className="table-scroll tall">
            <table>
              <ProductColgroup />
              <tbody>
              {pageItems.length === 0 && (
                <tr>
                  <td colSpan={8}>
                    <div className="empty-state">{t('products.empty')}</div>
                  </td>
                </tr>
              )}
              {pageItems.map((product) => (
                <tr key={product.sku}>
                  <td>
                    <div className="prod-cell">
                      <div className="prod-thumb sm" style={{ overflow: 'hidden' }}>
                        <img src={product.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </div>
                      <div>
                        <div className="prod-name">{product.name}</div>
                        <div className="prod-sku">{product.sku}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="cat-tag">{category(product.category)}</span>
                  </td>
                  <td>
                    <span className="price-val">{product.price}</span>
                  </td>
                  <td>
                    <span className="unit-muted">{unit(product.unit)}</span>
                  </td>
                  <td>
                    <StockBadge status={product.stock} />
                  </td>
                  <td>
                    <Switch
                      checked={product.active}
                      onChange={() => toggleProductActive(product.id)}
                      label="Toggle active status"
                      size="sm"
                    />
                  </td>
                  <td>
                    <span className="updated-cell">{product.updated}</span>
                  </td>
                  <td>
                    <div className="row-actions">
                      <Link to={`/products/${product.id}`} className="action-btn" aria-label="Edit product">
                        <Pencil />
                      </Link>
                      <button type="button" className="action-btn" aria-label="Duplicate product">
                        <Copy />
                      </button>
                      <button
                        type="button"
                        className="action-btn danger"
                        aria-label="Delete product"
                        onClick={() => removeProduct(product.id)}
                      >
                        <Trash2 />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              </tbody>
            </table>
          </div>
        </div>
        <Pagination
          page={safePage}
          pageCount={pageCount}
          onChange={setPage}
          totalLabel={t('common.showingOf', {
            shown: pageItems.length,
            total: filtered.length,
            noun: t('common.productsCount'),
          })}
          prevLabel={t('common.previousPage')}
          nextLabel={t('common.nextPage')}
          bordered
        />
      </div>
    </>
  )
}
