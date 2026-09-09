import { ArrowLeft, Check, ChevronDown, ImagePlus, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import Switch from '../components/ui/Switch'
import { useLanguage } from '../i18n/LanguageContext'
import { PRODUCT_CATEGORIES, PRODUCT_UNITS, placeholderImage } from '../lib/data'
import { uploadProductPhoto } from '../lib/api'
import type { ProductRow, StockStatus } from '../lib/types'
import { useData } from '../store/DataContext'

const STOCK_OPTIONS: StockStatus[] = ['in', 'low', 'out']
const ALL_CATEGORIES = PRODUCT_CATEGORIES

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
  const { updateProduct, removeProduct, products } = useData()
  const { t, category, unit } = useLanguage()

  const [name, setName] = useState(product.name)
  const [productCategory, setProductCategory] = useState(product.category)
  const [price, setPrice] = useState(product.price.replace(/[^\d.]/g, ''))
  const [priceExternal, setPriceExternal] = useState(product.priceExternal.replace(/[^\d.]/g, ''))
  const [selectedUnits, setSelectedUnits] = useState<string[]>(product.units.length > 0 ? product.units : [product.unit])
  const [unitPrices, setUnitPrices] = useState<Record<string, { price: string; priceExternal: string }>>(
    Object.fromEntries(
      product.unitPrices.map((u) => [u.unit, { price: u.price.replace(/[^\d.]/g, ''), priceExternal: u.priceExternal.replace(/[^\d.]/g, '') }]),
    ),
  )
  const extraUnits = selectedUnits.slice(1)
  const [variantGroupId, setVariantGroupId] = useState(product.variantGroupId)
  const [addVariantId, setAddVariantId] = useState('')
  const [stock, setStock] = useState<StockStatus>(product.stock)
  const [active, setActive] = useState(product.active)
  const [saved, setSaved] = useState(false)
  // `photo` = the currently *saved* image (existing hosted URL, or null if
  // there never was one / it was removed). Picking a new file doesn't touch
  // it or upload anything yet — it just previews locally (`pendingFile` +
  // its object URL) so a bad photo can be swapped before it's ever sent
  // anywhere; the real upload happens once, in handleSave, only if a new
  // file is still pending when the admin actually saves.
  const [photo, setPhoto] = useState<string | null>(product.image === placeholderImage ? null : product.image)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null)
  const pendingPreviewUrlRef = useRef<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const categoryOptions = Array.from(new Set([product.category, ...ALL_CATEGORIES]))
  const displayedPhoto = pendingPreviewUrl ?? photo

  function setPreview(url: string | null) {
    if (pendingPreviewUrlRef.current) URL.revokeObjectURL(pendingPreviewUrlRef.current)
    pendingPreviewUrlRef.current = url
    setPendingPreviewUrl(url)
  }

  function handlePhotoSelect(file: File) {
    setPhotoError(null)
    setPreview(URL.createObjectURL(file))
    setPendingFile(file)
  }

  function clearPhoto() {
    setPreview(null)
    setPendingFile(null)
    setPhoto(null)
  }

  useEffect(() => {
    return () => {
      if (pendingPreviewUrlRef.current) URL.revokeObjectURL(pendingPreviewUrlRef.current)
    }
  }, [])

  async function handleSave() {
    let image = photo ?? ''
    if (pendingFile) {
      setUploading(true)
      setPhotoError(null)
      try {
        image = await uploadProductPhoto(pendingFile, product.id)
      } catch {
        setUploading(false)
        setPhotoError(t('productDetail.photoUploadFailed'))
        return
      }
      setUploading(false)
    }
    updateProduct(product.id, {
      name,
      category: productCategory,
      price: String(Number(price || 0)),
      priceExternal,
      unit: selectedUnits[0] ?? product.unit,
      units: selectedUnits,
      unitPrices: extraUnits.map((u) => ({
        unit: u,
        price: unitPrices[u]?.price ?? '',
        priceExternal: unitPrices[u]?.priceExternal ?? '',
      })),
      stock,
      active,
      image,
      updated: 'Just now',
    })
    setSaved(true)
  }

  // Variant linking is immediate (not part of the Save-changes batch above)
  // since it touches OTHER products' rows too — mixing that into one
  // deferred patch would be confusing ("did saving this product just
  // silently edit that one too?").
  const siblings = variantGroupId ? products.filter((p) => p.variantGroupId === variantGroupId && p.id !== product.id) : []
  const availableForVariant = products.filter(
    (p) => p.id !== product.id && (variantGroupId === null || p.variantGroupId !== variantGroupId),
  )

  async function addVariant(otherId: string) {
    if (!otherId) return
    let gid = variantGroupId
    if (!gid) {
      gid = crypto.randomUUID()
      await updateProduct(product.id, { variantGroupId: gid })
      setVariantGroupId(gid)
    }
    await updateProduct(otherId, { variantGroupId: gid })
    setAddVariantId('')
  }

  async function removeVariant(otherId: string) {
    await updateProduct(otherId, { variantGroupId: null })
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
          <Button variant="primary" icon={<Check />} onClick={handleSave} disabled={uploading}>
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
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handlePhotoSelect(file)
                e.target.value = ''
              }}
            />
            {displayedPhoto ? (
              <div className="thumb-strip" style={{ gridTemplateColumns: '1fr', marginTop: 20 }}>
                <div className="thumb">
                  <img src={displayedPhoto} alt={product.name} />
                  <button
                    type="button"
                    className="remove-btn"
                    aria-label={t('productDetail.removePhoto')}
                    onClick={clearPhoto}
                  >
                    <X />
                  </button>
                </div>
              </div>
            ) : (
              <div
                className="upload-zone"
                style={{ marginTop: 20 }}
                tabIndex={0}
                role="button"
                aria-label={t('addProduct.dropImages')}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click()
                }}
              >
                <div className="upload-icon">
                  <ImagePlus />
                </div>
                <div className="up-title">{t('addProduct.dropImages')}</div>
                <div className="up-sub">{t('addProduct.uploadHint')}</div>
              </div>
            )}
            {displayedPhoto && (
              <Button
                variant="ghost"
                icon={<ImagePlus />}
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                block
                style={{ marginTop: 12 }}
              >
                {uploading ? t('productDetail.uploadingPhoto') : t('productDetail.changePhoto')}
              </Button>
            )}
            {photoError && (
              <p style={{ color: 'var(--gesso-danger)', fontSize: 13, marginTop: 8 }}>{photoError}</p>
            )}
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

            {extraUnits.length > 0 && (
              <div className="field">
                <label>Цены по остальным единицам — {unit(selectedUnits[0])} использует цену выше</label>
                {extraUnits.map((u) => (
                  <div key={u} className="field-row" style={{ alignItems: 'flex-end' }}>
                    <div className="field" style={{ flex: '0 0 88px' }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{unit(u)}</span>
                    </div>
                    <div className="field">
                      <label htmlFor={`pd-up-price-${u}`}>{t('common.price')}</label>
                      <div className="price-input suffixed">
                        <input
                          id={`pd-up-price-${u}`}
                          type="text"
                          placeholder="0"
                          value={unitPrices[u]?.price ?? ''}
                          onChange={(e) =>
                            setUnitPrices((prev) => ({
                              ...prev,
                              [u]: { price: e.target.value, priceExternal: prev[u]?.priceExternal ?? '' },
                            }))
                          }
                        />
                        <span className="suffix">сум</span>
                      </div>
                    </div>
                    <div className="field">
                      <label htmlFor={`pd-up-price-ext-${u}`}>Для внешних (необяз.)</label>
                      <div className="price-input suffixed">
                        <input
                          id={`pd-up-price-ext-${u}`}
                          type="text"
                          placeholder="Как обычная"
                          value={unitPrices[u]?.priceExternal ?? ''}
                          onChange={(e) =>
                            setUnitPrices((prev) => ({
                              ...prev,
                              [u]: { price: prev[u]?.price ?? '', priceExternal: e.target.value },
                            }))
                          }
                        />
                        <span className="suffix">сум</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

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
              <Button variant="primary" icon={<Check />} onClick={handleSave} disabled={uploading}>
                {t('common.saveChanges')}
              </Button>
            </div>
          </Card>

          <Card>
            <p className="section-label">Варианты товара</p>
            <p style={{ fontSize: 13, color: 'var(--gesso-fg-muted)', marginTop: 4 }}>
              Свяжи с другими товарами, которые на самом деле один и тот же товар, только другой вид (например 3 вида
              помидоров) — в приложении покупатель сможет переключаться между ними прямо внутри карточки товара.
              Изменения здесь применяются сразу, без кнопки «Сохранить».
            </p>
            {siblings.length > 0 && (
              <div className="chip-row" style={{ marginTop: 12 }}>
                {siblings.map((s) => (
                  <span key={s.id} className="chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {s.name}
                    <button
                      type="button"
                      onClick={() => removeVariant(s.id)}
                      aria-label={`Убрать «${s.name}» из вариантов`}
                      style={{ display: 'inline-flex', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    >
                      <X size={14} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="field-row" style={{ marginTop: 12, alignItems: 'flex-end' }}>
              <div className="field">
                <label htmlFor="pd-add-variant">Добавить товар в варианты</label>
                <div className="select-wrap">
                  <select id="pd-add-variant" value={addVariantId} onChange={(e) => setAddVariantId(e.target.value)}>
                    <option value="">Выбери товар…</option>
                    {availableForVariant.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.sku} — {p.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown />
                </div>
              </div>
              <Button variant="ghost" onClick={() => addVariant(addVariantId)} disabled={!addVariantId}>
                Добавить
              </Button>
            </div>
          </Card>
        </div>
      </section>
    </>
  )
}
