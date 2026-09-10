import { Check, ChevronDown, ImagePlus, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import LangField from '../components/ui/LangField'
import Switch from '../components/ui/Switch'
import { useLanguage } from '../i18n/LanguageContext'
import { uploadProductPhoto } from '../lib/api'
import { PRODUCT_CATEGORIES, PRODUCT_UNITS, suggestNextSku } from '../lib/data'
import type { StockStatus } from '../lib/types'
import { useData } from '../store/DataContext'

const UNITS = PRODUCT_UNITS
const CATEGORIES = PRODUCT_CATEGORIES
const STOCK_OPTIONS: StockStatus[] = ['in', 'low', 'out']

export default function AddProduct() {
  const { products, addProduct } = useData()
  const { t, category, unit } = useLanguage()
  const navigate = useNavigate()

  const [active, setActive] = useState(true)
  const [selectedUnits, setSelectedUnits] = useState<string[]>(['box'])
  const [stock, setStock] = useState<StockStatus>('in')
  const [name, setName] = useState('')
  const [nameUzCyrl, setNameUzCyrl] = useState('')
  const [nameUzLatn, setNameUzLatn] = useState('')
  const [nameEn, setNameEn] = useState('')
  const [description, setDescription] = useState('')
  const [descriptionUzCyrl, setDescriptionUzCyrl] = useState('')
  const [descriptionUzLatn, setDescriptionUzLatn] = useState('')
  const [descriptionEn, setDescriptionEn] = useState('')
  const [selectedCategory, setSelectedCategory] = useState(CATEGORIES[0])
  const [sku, setSku] = useState('')
  const [price, setPrice] = useState('')
  const [priceExternal, setPriceExternal] = useState('')
  // Price override per unit beyond the first — the first selected unit
  // always uses price/priceExternal above. Keyed by unit so toggling units
  // off and back on doesn't lose what was already typed.
  const [unitPrices, setUnitPrices] = useState<Record<string, { price: string; priceExternal: string }>>({})
  const extraUnits = selectedUnits.slice(1)
  // Selecting a file just previews it locally (an object URL, nothing sent
  // anywhere yet) — so a bad photo can be swapped out before it's actually
  // uploaded. The real upload happens once, in handleSave, only for a photo
  // that's still selected when the admin actually saves.
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null)
  const photoPreviewUrlRef = useRef<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function setPreview(url: string | null) {
    if (photoPreviewUrlRef.current) URL.revokeObjectURL(photoPreviewUrlRef.current)
    photoPreviewUrlRef.current = url
    setPhotoPreviewUrl(url)
  }

  function handlePhotoSelect(file: File) {
    setPhotoError(null)
    setPreview(URL.createObjectURL(file))
    setPhotoFile(file)
  }

  function clearPhoto() {
    setPreview(null)
    setPhotoFile(null)
  }

  // Revoke whatever preview URL is live when the form goes away, so a
  // discarded add-product visit doesn't leak the blob.
  useEffect(() => {
    return () => {
      if (photoPreviewUrlRef.current) URL.revokeObjectURL(photoPreviewUrlRef.current)
    }
  }, [])

  // The SKU field is pre-filled with the next suggested code for whichever
  // category is selected (e.g. "F-0001" for the first fruit), so admins get
  // a consistent, sortable SKU by default without typing one — but they can
  // still overwrite it by hand. `skuTouched` tracks whether the current text
  // is still "ours": once the admin edits it directly, switching category no
  // longer overwrites their choice.
  const skuTouched = useRef(false)

  useEffect(() => {
    if (skuTouched.current) return
    setSku(suggestNextSku(selectedCategory, products))
  }, [selectedCategory, products])

  async function handleSave(andAddAnother: boolean) {
    if (!name.trim() || !sku.trim()) return
    let imageUrl: string | undefined
    if (photoFile) {
      setUploading(true)
      setPhotoError(null)
      try {
        // No product id yet — group the upload under a throwaway random one;
        // nothing else needs it to match the product's eventual id.
        imageUrl = await uploadProductPhoto(photoFile, crypto.randomUUID())
      } catch {
        setUploading(false)
        setPhotoError(t('productDetail.photoUploadFailed'))
        return
      }
      setUploading(false)
    }
    await addProduct({
      name,
      sku,
      category: selectedCategory,
      price: Number(price || 0),
      priceExternal: priceExternal.trim() ? Number(priceExternal) : null,
      unit: selectedUnits[0] ?? 'box',
      units: selectedUnits,
      unitPrices: extraUnits.map((u) => ({
        unit: u,
        price: Number(unitPrices[u]?.price || 0),
        priceExternal: unitPrices[u]?.priceExternal?.trim() ? Number(unitPrices[u]!.priceExternal) : null,
      })),
      description,
      nameUzCyrl,
      nameUzLatn,
      nameEn,
      descriptionUzCyrl,
      descriptionUzLatn,
      descriptionEn,
      stock,
      active,
      imageUrl,
    })
    if (andAddAnother) {
      setName('')
      setNameUzCyrl('')
      setNameUzLatn('')
      setNameEn('')
      setDescription('')
      setDescriptionUzCyrl('')
      setDescriptionUzLatn('')
      setDescriptionEn('')
      skuTouched.current = false
      setSku(suggestNextSku(selectedCategory, [...products, { sku }]))
      setPrice('')
      setPriceExternal('')
      setUnitPrices({})
      clearPhoto()
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
          <Button variant="ghost" onClick={() => handleSave(true)} disabled={uploading}>
            {t('addProduct.saveAndAddAnother')}
          </Button>
          <Button variant="primary" icon={<Check />} onClick={() => handleSave(false)} disabled={uploading}>
            {t('addProduct.saveProduct')}
          </Button>
        </div>
      </div>

      <section className="form-grid">
        <div className="col">
          <Card>
            <p className="section-label">{t('addProduct.productPhotos')}</p>
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
            {photoPreviewUrl ? (
              <div className="thumb-strip" style={{ gridTemplateColumns: '1fr', marginTop: 20 }}>
                <div className="thumb">
                  <img src={photoPreviewUrl} alt="" />
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
            {photoError && <p style={{ color: 'var(--gesso-danger)', fontSize: 13, marginTop: 8 }}>{photoError}</p>}
            {uploading && (
              <p style={{ color: 'var(--gesso-fg-muted)', fontSize: 13, marginTop: 8 }}>{t('productDetail.uploadingPhoto')}</p>
            )}
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

            <LangField
              id="p-name"
              label={t('productDetail.productName')}
              placeholder="e.g. Heirloom Tomatoes, 5kg crate"
              values={{ ru: name, uzCyrl: nameUzCyrl, uzLatn: nameUzLatn, en: nameEn }}
              onChange={(lang, value) => {
                if (lang === 'ru') setName(value)
                else if (lang === 'uzCyrl') setNameUzCyrl(value)
                else if (lang === 'uzLatn') setNameUzLatn(value)
                else setNameEn(value)
              }}
            />

            <LangField
              id="p-desc"
              label={t('addProduct.description')}
              placeholder="Origin, quality grade, storage notes…"
              multiline
              values={{ ru: description, uzCyrl: descriptionUzCyrl, uzLatn: descriptionUzLatn, en: descriptionEn }}
              onChange={(lang, value) => {
                if (lang === 'ru') setDescription(value)
                else if (lang === 'uzCyrl') setDescriptionUzCyrl(value)
                else if (lang === 'uzLatn') setDescriptionUzLatn(value)
                else setDescriptionEn(value)
              }}
            />

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
                  placeholder="e.g. F-0001"
                  value={sku}
                  onChange={(e) => {
                    skuTouched.current = true
                    setSku(e.target.value)
                  }}
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
              <label>{t('common.unit')} — можно выбрать до 3, покупатель выберет одну при заказе</label>
              <div className="chip-row" role="listbox" aria-label={t('common.unit')} aria-multiselectable="true">
                {UNITS.map((u) => {
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
                            return next.length > 0 ? next : prev // keep at least one
                          }
                          if (prev.length >= 3) return prev // cap at 3
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
                  <div key={u} className="unit-price-row">
                    <div className="field unit-price-tag-field">
                      <label>{t('common.unit')}</label>
                      <div className="unit-price-tag">{unit(u)}</div>
                    </div>
                    <div className="field">
                      <label htmlFor={`up-price-${u}`}>{t('common.price')}</label>
                      <div className="price-input suffixed">
                        <input
                          id={`up-price-${u}`}
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
                      <label htmlFor={`up-price-ext-${u}`}>Для внешних (необяз.)</label>
                      <div className="price-input suffixed">
                        <input
                          id={`up-price-ext-${u}`}
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
              <Button variant="ghost" onClick={() => handleSave(true)} disabled={uploading}>
                {t('addProduct.saveAndAddAnother')}
              </Button>
              <Button variant="primary" icon={<Check />} onClick={() => handleSave(false)} disabled={uploading}>
                {t('addProduct.saveProduct')}
              </Button>
            </div>
          </Card>
        </div>
      </section>
    </>
  )
}
