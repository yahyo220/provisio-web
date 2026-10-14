// Small pieces every Склад tab and dialog shares.
import { Download, FileUp } from 'lucide-react'
import { useRef, useState } from 'react'
import Button from '../../components/ui/Button'
import { useLanguage } from '../../i18n/LanguageContext'
import type { ProductRow } from '../../lib/types'
import { expiryTone, formatDay, formatQty, STOCK_STATE_LABELS, type StockState, type WarehouseState } from '../../lib/warehouse'
import { downloadImportTemplate, importWarehouseFile, type ImportedRow } from '../../lib/warehouseImport'

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

/** "Импорт из Excel" + "Шаблон" for the receipt and write-off dialogs: reads
 * the picked file, hands the matched rows to [onRows] and says which rows
 * weren't found in the catalog. */
export function ImportBar({
  kind,
  state,
  products,
  onRows,
}: {
  kind: 'receipt' | 'writeoff'
  state: WarehouseState
  products: ProductRow[]
  onRows: (rows: ImportedRow[]) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'warn' | 'error'; text: string } | null>(null)

  async function pick(file: File | undefined) {
    if (!file) return
    setBusy(true)
    setMessage(null)
    try {
      const result = await importWarehouseFile(file, state, products)
      if (result.error) {
        setMessage({ tone: 'error', text: result.error })
        return
      }
      onRows(result.rows)
      const added = `Загружено из файла: ${result.rows.length} поз.`
      setMessage(
        result.unmatched.length
          ? { tone: 'warn', text: `${added} Не нашли в каталоге склада (${result.unmatched.length}): ${result.unmatched.join('; ')}.` }
          : { tone: 'ok', text: `${added} Проверьте и проведите.` },
      )
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <div className="wh-import">
      <div className="wh-import-buttons">
        <Button variant="ghost" icon={<FileUp />} disabled={busy} onClick={() => input.current?.click()}>
          {busy ? 'Читаем файл…' : 'Импорт из Excel'}
        </Button>
        <ExportButton variant="text" label="Скачать шаблон" onExport={() => downloadImportTemplate(kind, state, products)} />
        <input
          ref={input}
          type="file"
          accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          hidden
          onChange={(e) => pick(e.target.files?.[0])}
        />
      </div>
      {message && <div className={message.tone === 'error' ? 'wh-error' : message.tone === 'warn' ? 'wh-warning' : 'wh-sub'}>{message.text}</div>}
    </div>
  )
}
