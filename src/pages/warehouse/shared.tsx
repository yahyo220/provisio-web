// Small pieces every Склад tab and dialog shares.
import { Download } from 'lucide-react'
import { useState } from 'react'
import Button from '../../components/ui/Button'
import { useLanguage } from '../../i18n/LanguageContext'
import type { ProductRow } from '../../lib/types'
import { expiryTone, formatDay, formatQty, STOCK_STATE_LABELS, type StockState } from '../../lib/warehouse'

export function ProductCell({ product, sub }: { product: ProductRow | undefined; sub?: string }) {
  if (!product) return <span className="unit-muted">Товар удалён</span>
  return (
    <div className="prod-cell">
      <div className="prod-thumb sm" style={{ overflow: 'hidden' }}>
        <img src={product.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
      <div>
        <div className="prod-name">{product.name}</div>
        <div className="prod-sku">{sub ?? product.sku}</div>
      </div>
    </div>
  )
}

export function StockStateBadge({ state }: { state: StockState }) {
  return (
    <span className="wh-badge" data-tone={state}>
      {STOCK_STATE_LABELS[state]}
    </span>
  )
}

/** "124,5 кг" with the unit set small, red when below zero. */
export function Qty({ value, unit, signed = false }: { value: number; unit: string; signed?: boolean }) {
  const { unit: unitLabel } = useLanguage()
  const text = signed && value > 0 ? `+${formatQty(value)}` : formatQty(value)
  return (
    <span className={`wh-qty${value < 0 ? ' neg' : ''}`}>
      {text}
      <span className="unit">{unitLabel(unit)}</span>
    </span>
  )
}

/** An expiry date, orange when it's within EXPIRY_SOON_DAYS, red once past;
 * [none] when there is no date (no batches left, or goods that don't expire). */
export function ExpiryText({ date, none = 'без срока' }: { date: string | null; none?: string }) {
  if (!date) return <span className="unit-muted">{none}</span>
  const tone = expiryTone(date)
  return (
    <span className={tone === 'late' ? 'wh-exp-late' : tone === 'soon' ? 'wh-exp-soon' : undefined}>
      {tone === 'late' ? `истёк ${formatDay(date)}` : formatDay(date)}
    </span>
  )
}

/** Pill-shaped date input for the filter bars. */
export function DateInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return <input type="date" className="wh-date" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} />
}


/** "Скачать Excel"-style button: shows "Готовим файл…" while the report is
 * built and a short error if it fails. */
export function ExportButton({ label, onExport, variant = 'ghost' }: { label: string; onExport: () => Promise<void>; variant?: 'ghost' | 'text' }) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  return (
    <Button
      variant={variant}
      icon={<Download />}
      disabled={busy}
      title={failed ? 'Не удалось подготовить файл — попробуйте ещё раз' : undefined}
      onClick={async () => {
        setBusy(true)
        setFailed(false)
        try {
          await onExport()
        } catch (err) {
          console.error(err)
          setFailed(true)
        } finally {
          setBusy(false)
        }
      }}
    >
      {busy ? 'Готовим файл…' : failed ? 'Ошибка — ещё раз' : label}
    </Button>
  )
}
