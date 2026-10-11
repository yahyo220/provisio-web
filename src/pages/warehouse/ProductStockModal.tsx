import { ArrowDown, ArrowUp, Minus, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Switch from '../../components/ui/Switch'
import { useLanguage } from '../../i18n/LanguageContext'
import { formatMoney } from '../../lib/format'
import type { ProductRow } from '../../lib/types'
import { formatDay, formatDayTime, MOVEMENT_LABELS, parseAmount, stockOf, stockState, type StockSettings, type WarehouseState } from '../../lib/warehouse'
import { ExpiryText, ProductCell, Qty, StockStateBadge } from './shared'

interface ProductStockModalProps {
  state: WarehouseState
  product: ProductRow
  onClose: () => void
  onSaveSettings: (settings: StockSettings) => void
  onReceive: () => void
  onWriteOff: () => void
}

export default function ProductStockModal({ state, product, onClose, onSaveSettings, onReceive, onWriteOff }: ProductStockModalProps) {
  const { unit } = useLanguage()
  const settings = state.settings[product.id]
  const stock = stockOf(state, product.id)
  const receiptNumber = useMemo(() => new Map(state.receipts.map((r) => [r.id, r.number])), [state.receipts])

  const otherUnits = product.units.filter((u) => u !== settings.baseUnit)
  const [minText, setMinText] = useState(String(settings.minStock).replace('.', ','))
  const [tracksExpiry, setTracksExpiry] = useState(settings.tracksExpiry)
  const [shelfText, setShelfText] = useState(settings.shelfLifeDays != null ? String(settings.shelfLifeDays) : '')
  const [sizeText, setSizeText] = useState<Record<string, string>>(() =>
    Object.fromEntries(otherUnits.map((u) => [u, settings.unitSize[u] != null ? String(settings.unitSize[u]).replace('.', ',') : ''])),
  )
  const [settingsMsg, setSettingsMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const batches = state.batches.filter((b) => b.productId === product.id).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
  const purchases = state.receipts
    .flatMap((r) => r.lines.filter((l) => l.productId === product.id).map((l) => ({ receipt: r, line: l })))
    .sort((a, b) => b.receipt.receivedAt.localeCompare(a.receipt.receivedAt))
  const lastPrice = purchases[0]?.line.purchasePrice
  const prevPrice = purchases[1]?.line.purchasePrice
  const priceDelta = lastPrice != null && prevPrice ? Math.round(((lastPrice - prevPrice) / prevPrice) * 100) : null
  const movements = state.movements.filter((m) => m.productId === product.id).slice(0, 30)

  function saveSettings() {
    const minStock = parseAmount(minText, 3)
    if (minStock === null) {
      setSettingsMsg({ ok: false, text: 'Минимальный запас — число, например 20 или 12,5.' })
      return
    }
    let shelfLifeDays: number | null = null
    if (tracksExpiry && shelfText.trim()) {
      const days = parseAmount(shelfText, 0)
      if (days === null || days <= 0) {
        setSettingsMsg({ ok: false, text: 'Срок хранения — целое число дней. Для упаковки оставьте пустым.' })
        return
      }
      shelfLifeDays = days
    }
    const unitSize: Record<string, number> = {}
    for (const u of otherUnits) {
      const raw = sizeText[u]?.trim()
      if (!raw) continue
      const size = parseAmount(raw, 3)
      if (size === null || size <= 0) {
        setSettingsMsg({ ok: false, text: `Проверьте, сколько ${unit(settings.baseUnit)} в 1 ${unit(u)}.` })
        return
      }
      unitSize[u] = size
    }
    onSaveSettings({ ...settings, minStock, tracksExpiry, shelfLifeDays, unitSize })
    setSettingsMsg({ ok: true, text: 'Сохранено.' })
  }

  return (
    <Modal title={product.name} onClose={onClose} wide>
      <div className="wh-card-head">
        <ProductCell product={product} />
        <div className="wh-card-stock">
          <span className="kpi-label">Остаток</span>
          <Qty value={stock} unit={settings.baseUnit} />
          <StockStateBadge state={stockState(stock, settings.minStock)} />
        </div>
        <div className="wh-actions">
          <Button variant="ghost" icon={<Minus />} onClick={onWriteOff}>
            Списать
          </Button>
          <Button icon={<Plus />} onClick={onReceive}>
            Приход
          </Button>
        </div>
      </div>

      <p className="section-label" style={{ marginTop: 20 }}>
        Настройки
      </p>
      <div className="wh-form-row">
        <div className="field">
          <label htmlFor="ps-min">Минимальный запас, {unit(settings.baseUnit)}</label>
          <input id="ps-min" inputMode="decimal" value={minText} onChange={(e) => setMinText(e.target.value)} />
        </div>
        {tracksExpiry && (
          <div className="field">
            <label htmlFor="ps-shelf">Срок хранения, дней</label>
            <input id="ps-shelf" inputMode="numeric" value={shelfText} onChange={(e) => setShelfText(e.target.value)} placeholder="Упаковка — дата с упаковки" />
          </div>
        )}
        {otherUnits.map((u) => (
          <div className="field" key={u}>
            <label htmlFor={`ps-size-${u}`}>
              Сколько {unit(settings.baseUnit)} в 1 {unit(u)}
            </label>
            <input
              id={`ps-size-${u}`}
              inputMode="decimal"
              value={sizeText[u] ?? ''}
              onChange={(e) => setSizeText((s) => ({ ...s, [u]: e.target.value }))}
              placeholder="не задано"
            />
          </div>
        ))}
      </div>
      <label className="wh-toggle" style={{ marginBottom: 16 }}>
        <Switch checked={tracksExpiry} onChange={setTracksExpiry} label="Есть срок годности" size="sm" />
        <span>Есть срок годности (выключите для оборудования, химии, упаковки)</span>
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Button variant="ghost" onClick={saveSettings}>
          Сохранить настройки
        </Button>
        {settingsMsg && <span className={settingsMsg.ok ? 'unit-muted' : 'wh-exp-late'}>{settingsMsg.text}</span>}
      </div>

      <p className="section-label" style={{ marginTop: 24 }}>
        Партии
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Приход</th>
              <th style={{ textAlign: 'right' }}>Пришло</th>
              <th style={{ textAlign: 'right' }}>Осталось</th>
              <th style={{ textAlign: 'right' }}>Цена закупки</th>
              <th>Срок годности</th>
            </tr>
          </thead>
          <tbody>
            {batches.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <div className="empty-state">Приходов этого товара ещё не было.</div>
                </td>
              </tr>
            )}
            {batches.map((b) => (
              <tr key={b.id}>
                <td>
                  {receiptNumber.get(b.receiptId) ?? '—'} · {formatDay(b.receivedAt)}
                </td>
                <td style={{ textAlign: 'right' }}>
                  <Qty value={b.qtyReceived} unit={settings.baseUnit} />
                </td>
                <td style={{ textAlign: 'right' }}>
                  <Qty value={b.qtyLeft} unit={settings.baseUnit} />
                </td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{formatMoney(b.purchasePrice)}</td>
                <td>
                  {b.qtyLeft > 0 || !b.expiresAt ? <ExpiryText date={b.expiresAt} /> : <span className="unit-muted">{formatDay(b.expiresAt)}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="section-label" style={{ marginTop: 24 }}>
        История закупок
      </p>
      {lastPrice != null && (
        <div className="wh-price-box">
          <span className="unit-muted">Последняя цена закупки</span>
          <strong>
            {formatMoney(lastPrice)} / {unit(settings.baseUnit)}
          </strong>
          {priceDelta != null && priceDelta !== 0 && (
            <span className={priceDelta > 0 ? 'wh-exp-late' : 'wh-tone-good'} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
              {priceDelta > 0 ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
              {priceDelta > 0 ? '+' : ''}
              {priceDelta}%
            </span>
          )}
          {prevPrice != null && <span className="unit-muted">к прошлой закупке ({formatMoney(prevPrice)})</span>}
        </div>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Дата</th>
              <th>Поставщик</th>
              <th style={{ textAlign: 'right' }}>Количество</th>
              <th style={{ textAlign: 'right' }}>Цена за ед.</th>
            </tr>
          </thead>
          <tbody>
            {purchases.length === 0 && (
              <tr>
                <td colSpan={4}>
                  <div className="empty-state">Закупок ещё не было.</div>
                </td>
              </tr>
            )}
            {purchases.map(({ receipt, line }) => (
              <tr key={line.batchId}>
                <td>
                  {formatDay(receipt.receivedAt)} · {receipt.number}
                </td>
                <td>{receipt.supplier || '—'}</td>
                <td style={{ textAlign: 'right' }}>
                  <Qty value={line.qty} unit={settings.baseUnit} />
                </td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{formatMoney(line.purchasePrice)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="section-label" style={{ marginTop: 24 }}>
        Движение товара
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Дата и время</th>
              <th>Тип</th>
              <th style={{ textAlign: 'right' }}>Изменение</th>
              <th style={{ textAlign: 'right' }}>Остаток после</th>
              <th>Основание</th>
            </tr>
          </thead>
          <tbody>
            {movements.map((m) => (
              <tr key={m.id}>
                <td style={{ whiteSpace: 'nowrap' }}>{formatDayTime(m.at)}</td>
                <td>{MOVEMENT_LABELS[m.type]}</td>
                <td style={{ textAlign: 'right' }}>
                  <Qty value={m.delta} unit={settings.baseUnit} signed />
                </td>
                <td style={{ textAlign: 'right' }}>
                  <Qty value={m.balanceAfter} unit={settings.baseUnit} />
                </td>
                <td className="unit-muted">{m.ref}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  )
}
