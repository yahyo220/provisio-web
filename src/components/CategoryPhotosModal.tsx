import { ImagePlus, RotateCcw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useLanguage } from '../i18n/LanguageContext'
import { fetchCategoryPhotos, setCategoryPhoto, uploadProductPhoto } from '../lib/api'
import { categoryRank } from '../lib/catalogOrder'
import Button from './ui/Button'
import Modal from './ui/Modal'

/** The app's own photo for each category (bundled with the app, copied to
 * public/categories/) — what shows until a photo is set here. */
const APP_PHOTO: Record<string, string> = {
  Vegetables: 'veg',
  Fruits: 'fruit',
  Dairy: 'dairy',
  Meat: 'meat',
  Seafood: 'seafood',
  Eggs: 'eggs',
  Bread: 'bread',
  'Bakery / Confectionery': 'bakery',
  Herbs: 'herbs',
  Spices: 'spices',
  Oil: 'oil',
  Nuts: 'nuts',
  'Legumes & Cereals': 'legumes',
  'Grains & Pasta': 'grains',
  'Sauces & Condiments': 'sauces',
  'Sweets & Snacks': 'sweets',
  'Honey & Preserves': 'honey',
  'Pickles & Marinades': 'pickles',
  'Canned Goods': 'canned',
  Frozen: 'frozen',
  'Semi-finished Products': 'semifinished',
  Beverages: 'drinks',
  'Tea & Coffee': 'teacoffee',
  Groceries: 'kitchen',
  Cleaning: 'clean',
  'Kitchen Supplies / Disposables': 'supplies',
  'Packaging & Disposables': 'packaging',
  'Kitchen Equipment': 'equipment',
}

/** "Фото категорий" on the Products page: the photo each category tile shows in the app. */
export default function CategoryPhotosModal({ categories, onClose }: { categories: string[]; onClose: () => void }) {
  const { category } = useLanguage()
  const [photos, setPhotos] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const target = useRef<string | null>(null)

  useEffect(() => {
    fetchCategoryPhotos()
      .then(setPhotos)
      .catch((e) => setError((e as Error).message))
  }, [])

  const ordered = [...categories].sort((a, b) => categoryRank(a) - categoryRank(b))

  async function upload(cat: string, file: File) {
    setBusy(cat)
    setError(null)
    try {
      const url = await uploadProductPhoto(file, 'categories')
      await setCategoryPhoto(cat, url)
      setPhotos((p) => ({ ...p, [cat]: url }))
    } catch (e) {
      setError(`Не удалось загрузить фото: ${(e as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  async function reset(cat: string) {
    setBusy(cat)
    setError(null)
    try {
      await setCategoryPhoto(cat, null)
      setPhotos((p) => {
        const next = { ...p }
        delete next[cat]
        return next
      })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Modal title="Фото категорий" onClose={onClose} wide>
      <p style={{ fontSize: 13, color: 'var(--gesso-fg-muted, #6b6b6b)', marginBottom: 16 }}>
        Эти фото видны в приложении на главной и во вкладке «Категории». Новое фото появится у клиентов после перезапуска приложения.
      </p>
      {error && <p style={{ color: '#b3261e', fontSize: 13, marginBottom: 12 }}>{error}</p>}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file && target.current) upload(target.current, file)
          e.target.value = ''
        }}
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 16 }}>
        {ordered.map((cat) => {
          const custom = photos[cat]
          const src = custom ?? (APP_PHOTO[cat] ? `/categories/${APP_PHOTO[cat]}.jpg` : '')
          return (
            <div key={cat} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div
                style={{
                  aspectRatio: '10 / 11',
                  borderRadius: 14,
                  overflow: 'hidden',
                  background: 'rgba(0,0,0,0.05)',
                  opacity: busy === cat ? 0.5 : 1,
                }}
              >
                {src && <img src={src} alt={category(cat)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
              </div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{category(cat)}</div>
              <div style={{ fontSize: 12, color: 'var(--gesso-fg-muted, #6b6b6b)' }}>{custom ? 'Своё фото' : 'Стандартное фото'}</div>
              <Button
                variant="ghost"
                icon={<ImagePlus />}
                disabled={busy !== null}
                onClick={() => {
                  target.current = cat
                  fileRef.current?.click()
                }}
              >
                {busy === cat ? 'Загружаем…' : custom ? 'Заменить' : 'Поставить фото'}
              </Button>
              {custom && (
                <Button variant="text" icon={<RotateCcw />} disabled={busy !== null} onClick={() => reset(cat)}>
                  Вернуть стандартное
                </Button>
              )}
            </div>
          )
        })}
      </div>
    </Modal>
  )
}
