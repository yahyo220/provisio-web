import { Check, ChevronDown, ImagePlus } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import Switch from '../components/ui/Switch'
import { useLanguage } from '../i18n/LanguageContext'
import { placeholderImage } from '../lib/data'
import type { StockStatus } from '../lib/types'
import { useData } from '../store/DataContext'

const UNITS = ['kg', 'gram', 'box', 'piece', 'bottle', 'bunch', 'package']
const CATEGORIES = ['Vegetables', 'Fruits', 'Dairy', 'Meat', 'Bread', 'Oil', 'Nuts', 'Eggs', 'Cleaning', 'Herbs']
const STOCK_OPTIONS: StockStatus[] = ['in', 'low', 'out']

export default function AddProduct() {
  const { addProduct } = useData()
  const { t, category, unit } = useLanguage()
  const navigate = useNavigate()

  const [active, setActive] = useState(true)
  const [selectedUnit, setSelectedUnit] = useState('box')
  const [stock, setStock] = useState<StockStatus>('in')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [selectedCategory, setSelectedCategory] = useState(CATEGORIES[0])
  const [sku, setSku] = useState('')
  const [price, setPrice] = useState('')
  const [priceExternal, setPriceExternal] = useState('')

  async function handleSave(andAddAnother: boolean) {
    if (!name.trim() || !sku.trim()) return
    await addProduct({
      name,
      sku,
      category: selectedCategory,
      price: Number(price || 0),
      priceExternal: priceExternal.trim() ? Number(priceExternal) : null,
      unit: selectedUnit,
      stock,
      active,
      imageUrl: placeholderImage,
    })
    if (andAddAnother) {
      setName('')
      setDescription('')
      setSku('')
      setPrice('')
      setPriceExternal('')
    } else {
      navigate('/products')
    }
  }

  return (
    <>
      <div className="header">
        <div>
          <h1>{t('addProduct.title')}</h1>
          <p>{t('addProduct.subtitle')}</p>
        </div>
        <div className="header-actions">
          <Link to="/products" className="btn btn-text">
            {t('common.discard')}
          </Link>
          <Button variant="ghost" onClick={() => handleSave(true)}>
            {t('addProduct.saveAndAddAnother')}
          </Button>
          <Button variant="primary" icon={<Check />} onClick={() => handleSave(false)}>
            {t('addProduct.saveProduct')}
          </Button>
        </div>
      </div>

      <section className="form-grid">
        <div className="col">
          <Card>
            <p className="section-label">{t('addProduct.productPhotos')}</p>
            <div className="upload-zone" tabIndex={0} role="button" aria-label={t('addProduct.dropImages')}>
              <div className="upload-icon">
                <ImagePlus />
              </div>
              <div className="up-title">{t('addProduct.dropImages')}</div>
              <div className="up-sub">{t('addProduct.uploadHint')}</div>
            </div>
          </Card>

          <Card>
            <div className="status-row">
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
              <label htmlFor="p-name">{t('productDetail.productName')}</label>
              <input
                id="p-name"
                type="text"
                placeholder="e.g. Heirloom Tomatoes, 5kg crate"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="p-desc">{t('addProduct.description')}</label>
              <textarea
                id="p-desc"
                placeholder="Origin, quality grade, storage notes…"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="field-row">
              <div className="field">
                <label htmlFor="p-cat">{t('common.category')}</label>
                <div className="select-wrap">
                  <select id="p-cat" value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {category(c)}
                      </option>
                    ))}
                  </select>
                  <ChevronDown />
                </div>
              </div>
              <div className="field">
                <label htmlFor="p-sku">{t('common.sku')}</label>
                <input
                  id="p-sku"
                  type="text"
                  placeholder="e.g. VEG-0142"
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                />
              </div>
            </div>

            <div className="field-row">
              <div className="field">
                <label htmlFor="p-price">{t('common.price')}</label>
                <div className="price-input suffixed">
                  <input
                    id="p-price"
                    type="text"
                    placeholder="0"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                  />
                  <span className="suffix">сум</span>
                </div>
              </div>
              <div className="field">
                <label htmlFor="p-moq">{t('addProduct.minOrderQty')}</label>
                <input id="p-moq" type="text" placeholder="1" />
              </div>
            </div>

            <div className="field">
              <label htmlFor="p-price-ext">Цена для внешних клиентов (необязательно)</label>
              <div className="price-input suffixed">
                <input
                  id="p-price-ext"
                  type="text"
                  placeholder="Как обычная цена, если не указано"
                  value={priceExternal}
                  onChange={(e) => setPriceExternal(e.target.value)}
                />
                <span className="suffix">сум</span>
              </div>
            </div>

            <div className="field">
              <label>{t('common.unit')}</label>
              <div className="chip-row" role="listbox" aria-label={t('common.unit')}>
                {UNITS.map((u) => (
                  <button
                    key={u}
                    type="button"
                    className="chip"
                    role="option"
                    aria-selected={selectedUnit === u}
                    onClick={() => setSelectedUnit(u)}
                  >
                    {unit(u)}
                  </button>
                ))}
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
              <Button variant="ghost" onClick={() => handleSave(true)}>
                {t('addProduct.saveAndAddAnother')}
              </Button>
              <Button variant="primary" icon={<Check />} onClick={() => handleSave(false)}>
                {t('addProduct.saveProduct')}
              </Button>
            </div>
          </Card>
        </div>
      </section>
    </>
  )
}
