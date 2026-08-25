import { ArrowLeft, Check, ChevronDown, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import Switch from '../components/ui/Switch'
import { useLanguage } from '../i18n/LanguageContext'
import { PRODUCT_UNITS } from '../lib/data'
import type { ProductRow, StockStatus } from '../lib/types'
import { useData } from '../store/DataContext'

const STOCK_OPTIONS: StockStatus[] = ['in', 'low', 'out']
const ALL_CATEGORIES = ['Vegetables', 'Fruits', 'Dairy', 'Meat', 'Bread', 'Oil', 'Nuts', 'Eggs', 'Cleaning', 'Herbs']

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>()
  const { products } = useData()
  const { t } = useLanguage()
  const product = products.find((p) => p.id === id)

  if (!product) {
    return (
      <div className="empty-state">
        <p>{t('productDetail.notFound')}</p>
        <Link to="/products" className="btn btn-ghost" style={{ marginTop: 16, display: 'inline-flex' }}>
          {t('productDetail.backToProducts')}
        </Link>
      </div>
    )
  }

  // Keyed by id so navigating between two products resets the form instead of leaking state.
  return <ProductDetailForm key={product.id} product={product} />
}

function ProductDetailForm({ product }: { product: ProductRow }) {
  const navigate = useNavigate()
  const { updateProduct, removeProduct } = useData()
  const { t, category, unit } = useLanguage()

  const [name, setName] = useState(product.name)
  const [productCategory, setProductCategory] = useState(product.category)
  const [price, setPrice] = useState(product.price.replace(/[^\d.]/g, ''))
  const [priceExternal, setPriceExternal] = useState(product.priceExternal.replace(/[^\d.]/g, ''))
  const [selectedUnits, setSelectedUnits] = useState<string[]>(product.units.length > 0 ? product.units : [product.unit])
  const [stock, setStock] = useState<StockStatus>(product.stock)
  const [active, setActive] = useState(product.active)
  const [saved, setSaved] = useState(false)

  const categoryOptions = Array.from(new Set([product.category, ...ALL_CATEGORIES]))

  function handleSave() {
    updateProduct(product.id, {
      name,
      category: productCategory,
      price: String(Number(price || 0)),
      priceExternal,
      unit: selectedUnits[0] ?? product.unit,
      units: selectedUnits,
      stock,
      active,
      updated: 'Just now',
    })
    setSaved(true)
  }

  return (
    <>
      <div className="header">
        <div className="back-row">
          <Link to="/products" className="back-btn" aria-label={t('productDetail.backToProducts')}>
            <ArrowLeft />
          </Link>
          <div>
            <h1>{product.name}</h1>
            <p className="order-meta" style={{ fontSize: 14, color: 'var(--gesso-fg-muted)', marginTop: 8 }}>
              {t('common.sku')} {product.sku} · {category(product.category)} · {t('common.updated')} {product.updated}
            </p>
          </div>
        </div>
        <div className="header-actions">
          <Button
            variant="danger-text"
            icon={<Trash2 />}
            onClick={() => {
              removeProduct(product.id)
              navigate('/products')
            }}
          >
            {t('productDetail.delete')}
          </Button>
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

      <section className="form-grid">
        <div className="col">
          <Card>
            <p className="section-label">{t('productDetail.photo')}</p>
            <div className="thumb-strip" style={{ gridTemplateColumns: '1fr' }}>
              <div className="thumb">
                <img src={product.image} alt={product.name} />
              </div>
            </div>
          </Card>

          <Card>
            <div className="status-row" style={{ paddingTop: 0, marginTop: 0, borderTop: 'none' }}>
              <div>
                <div className="lbl">{t('productDetail.activeStatus')}</div>
                <div className="sub">{t('productDetail.visibleToCustomers')}</div>
              </div>
              <Switch checked={active} onChange={setActive} label={t('productDetail.activeStatus')} />
            </div>
          </Card>
        </div>

        <div className="col">
          <Card>
            <p className="section-label">{t('productDetail.productDetails')}</p>

            <div className="field">
              <label htmlFor="pd-name">{t('productDetail.productName')}</label>
              <input id="pd-name" type="text" value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            <div className="field-row">
              <div className="field">
                <label htmlFor="pd-cat">{t('common.category')}</label>
                <div className="select-wrap">
                  <select id="pd-cat" value={productCategory} onChange={(e) => setProductCategory(e.target.value)}>
                    {categoryOptions.map((c) => (
                      <option key={c} value={c}>
                        {category(c)}
                      </option>
                    ))}
                  </select>
                  <ChevronDown />
                </div>
              </div>
              <div className="field">
                <label htmlFor="pd-sku">{t('common.sku')}</label>
                <input id="pd-sku" type="text" defaultValue={product.sku} disabled />
              </div>
            </div>

            <div className="field">
              <label htmlFor="pd-price">{t('common.price')}</label>
              <div className="price-input suffixed">
                <input id="pd-price" type="text" value={price} onChange={(e) => setPrice(e.target.value)} />
                <span className="suffix">сум</span>
              </div>
            </div>

            <div className="field">
              <label>{t('common.unit')} — можно выбрать до 3, покупатель выберет одну при заказе</label>
              <div className="chip-row" role="listbox" aria-label={t('common.unit')} aria-multiselectable="true">
                {PRODUCT_UNITS.map((u) => {
                  const selected = selectedUnits.includes(u)
                  return (
                    <button
                      key={u}
                      type="button"
                      className="chip"
                      role="option"
                      aria-selected={selected}
                      onClick={() =>
                        setSelectedUnits((prev) => {
                          if (prev.includes(u)) {
                            const next = prev.filter((x) => x !== u)
                            return next.length > 0 ? next : prev
                          }
                          if (prev.length >= 3) return prev
                          return [...prev, u]
                        })
                      }
                    >
                      {unit(u)}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="field">
              <label htmlFor="pd-price-ext">Цена для внешних клиентов (необязательно)</label>
              <div className="price-input suffixed">
                <input
                  id="pd-price-ext"
                  type="text"
                  placeholder="Как обычная цена, если не указано"
                  value={priceExternal}
                  onChange={(e) => setPriceExternal(e.target.value)}
                />
                <span className="suffix">сум</span>
              </div>
            </div>

            <div className="field">
              <label>{t('productDetail.stockAvailability')}</label>
              <div className="toggle-row" role="listbox" aria-label={t('productDetail.stockAvailability')}>
                {STOCK_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    className="toggle-opt"
                    role="option"
                    aria-selected={stock === opt}
                    onClick={() => setStock(opt)}
                  >
                    {t(`stock.${opt}`)}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-footer">
              <Link to="/products" className="btn btn-text">
                {t('common.cancel')}
              </Link>
              <Button variant="primary" icon={<Check />} onClick={handleSave}>
                {t('common.saveChanges')}
              </Button>
            </div>
          </Card>
        </div>
      </section>
    </>
  )
}
