import { FileSpreadsheet, Minus, Plus, Warehouse as WarehouseIcon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Button from '../components/ui/Button'
import Dropdown from '../components/ui/Dropdown'
import Modal from '../components/ui/Modal'
import { downloadWarehouseReport } from '../lib/exportWarehouse'
import { formatMoney } from '../lib/format'
import { addDays, orderWriteOffViews, todayIso, type WarehouseState, type WriteOffReason } from '../lib/warehouse'
import { loadWarehouse, postReceiptDb, postWriteOffsDb, saveSettingsDb } from '../lib/warehouseDb'
import { useData } from '../store/DataContext'
import ExpiryTab from './warehouse/ExpiryTab'
import { DateInput, ExportButton } from './warehouse/shared'
import JournalTab from './warehouse/JournalTab'
import ProductStockModal from './warehouse/ProductStockModal'
import ReceiptModal from './warehouse/ReceiptModal'
import ReceiptsTab from './warehouse/ReceiptsTab'
import StockTab from './warehouse/StockTab'
import WriteOffModal from './warehouse/WriteOffModal'
import WriteOffsTab from './warehouse/WriteOffsTab'

const TABS = [
  { key: 'stock', label: 'Остатки' },
  { key: 'receipts', label: 'Приходы' },
  { key: 'writeoffs', label: 'Списания' },
  { key: 'expiry', label: 'Сроки годности' },
  { key: 'journal', label: 'Журнал' },
] as const
type TabKey = (typeof TABS)[number]['key']

type Dialog =
  | { kind: 'receipt'; productId?: string }
  | { kind: 'writeoff'; productId?: string; batchId?: string; reason?: WriteOffReason }
  | { kind: 'product'; productId: string }
  | { kind: 'report' }
  | null

export default function Warehouse() {
  const { products, loading: dataLoading, refresh } = useData()
  const [params, setParams] = useSearchParams()
  const tab: TabKey = TABS.some((t) => t.key === params.get('tab')) ? (params.get('tab') as TabKey) : 'stock'

  const activeProducts = useMemo(() => products.filter((p) => p.active), [products])
  const productsById = useMemo(() => new Map(activeProducts.map((p) => [p.id, p])), [activeProducts])

  const [state, setState] = useState<WarehouseState | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const reload = useCallback(async () => {
    try {
      setState(await loadWarehouse(activeProducts))
      setLoadError(null)
    } catch (err) {
      console.error(err)
      setLoadError('Не удалось загрузить склад. Обновите страницу.')
    }
  }, [activeProducts])
  useEffect(() => {
    if (!dataLoading) reload()
  }, [dataLoading, reload])

  const [warehouseId, setWarehouseId] = useState<string | null>(null)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // A receipt or write-off is being saved — a second click must not post it twice.
  const posting = useRef(false)
  const loading = dataLoading || (!state && !loadError)

  function openTab(key: TabKey) {
    setParams(key === 'stock' ? {} : { tab: key }, { replace: true })
  }

  const dialogProduct = dialog?.kind === 'product' ? productsById.get(dialog.productId) : undefined

  return (
    <>
      <div className="header">
        <div>
          <h1>Склад</h1>
          <p>Остатки, сроки годности и статусы товаров в одном месте</p>
        </div>
        <div className="header-actions">
          <Dropdown
            allLabel="Склад"
            icon={<WarehouseIcon />}
            variant="pill"
            hideAllOption
            options={(state?.warehouses ?? []).map((w) => ({ label: w.name, value: w.id }))}
            value={warehouseId ?? state?.warehouses[0]?.id ?? null}
            onChange={setWarehouseId}
          />
          <Button variant="ghost" icon={<FileSpreadsheet />} onClick={() => setDialog({ kind: 'report' })}>
            Отчёт по складу
          </Button>
          <Button variant="ghost" icon={<Minus />} onClick={() => setDialog({ kind: 'writeoff' })}>
            Списать
          </Button>
          <Button icon={<Plus />} onClick={() => setDialog({ kind: 'receipt' })}>
            Приход
          </Button>
        </div>
      </div>

      {loadError && <div className="wh-demo-note">{loadError}</div>}

      {notice && (
        <div className="wh-notice" role="status">
          {notice}
          <button type="button" className="btn btn-text" onClick={() => setNotice(null)}>
            Закрыть
          </button>
        </div>
      )}

      {loading && <div className="empty-state">Загружаем склад…</div>}

      <div className="chip-row" role="tablist" aria-label="Разделы склада" hidden={loading}>
        {TABS.map((t) => (
          <button key={t.key} type="button" className="chip" role="tab" aria-selected={tab === t.key} onClick={() => openTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {!loading && state && tab === 'stock' && (
        <StockTab
          state={state}
          products={activeProducts}
          onReceive={(productId) => setDialog({ kind: 'receipt', productId })}
          onWriteOff={(productId) => setDialog({ kind: 'writeoff', productId })}
          onOpenProduct={(productId) => setDialog({ kind: 'product', productId })}
        />
      )}
      {!loading && state && tab === 'receipts' && <ReceiptsTab state={state} productsById={productsById} onNewReceipt={() => setDialog({ kind: 'receipt' })} />}
      {!loading && state && tab === 'writeoffs' && <WriteOffsTab state={state} productsById={productsById} />}
      {!loading && state && tab === 'expiry' && (
        <ExpiryTab
          state={state}
          productsById={productsById}
          onWriteOff={(productId, batchId) => setDialog({ kind: 'writeoff', productId, batchId, reason: 'expired' })}
        />
      )}
      {!loading && state && tab === 'journal' && <JournalTab state={state} productsById={productsById} />}

      {state && dialog?.kind === 'receipt' && (
        <ReceiptModal
          state={state}
          products={activeProducts}
          initialProductId={dialog.productId}
          onClose={() => setDialog(null)}
          onSubmit={async (input) => {
            if (posting.current) return
            posting.current = true
            try {
              const result = await postReceiptDb(input)
              setDialog(null)
              const prices = result.priceChanges.map((c) => `${c.name} ${formatMoney(c.oldPrice)} → ${formatMoney(c.newPrice)}`)
              setNotice(
                `Приход ${result.number} проведён: ${result.lines} поз.` +
                  (prices.length > 0 ? ` Цены продажи подняты (закупка + ${state.pricing.marginPercent}%): ${prices.join('; ')}.` : ''),
              )
              await Promise.all([reload(), result.priceChanges.length > 0 ? refresh() : Promise.resolve()])
            } catch (err) {
              console.error(err)
              setNotice('Не удалось провести приход. Проверьте интернет и попробуйте ещё раз.')
            } finally {
              posting.current = false
            }
          }}
        />
      )}
      {state && dialog?.kind === 'writeoff' && (
        <WriteOffModal
          state={state}
          products={activeProducts}
          initial={dialog}
          onClose={() => setDialog(null)}
          onSubmit={async (inputs) => {
            if (posting.current) return
            posting.current = true
            try {
              await postWriteOffsDb(inputs)
              setDialog(null)
              setNotice(inputs.length === 1 ? `Списано: ${productsById.get(inputs[0].productId)?.name ?? 'товар'}.` : `Списано позиций: ${inputs.length}.`)
              await reload()
            } catch (err) {
              console.error(err)
              setNotice('Не удалось списать. Проверьте интернет и попробуйте ещё раз.')
            } finally {
              posting.current = false
            }
          }}
        />
      )}
      {state && dialog?.kind === 'report' && <ReportModal state={state} onClose={() => setDialog(null)} />}
      {state && dialog?.kind === 'product' && dialogProduct && (
        <ProductStockModal
          state={state}
          product={dialogProduct}
          onClose={() => setDialog(null)}
          onSaveSettings={async (settings) => {
            await saveSettingsDb(settings)
            await reload()
          }}
          onReceive={() => setDialog({ kind: 'receipt', productId: dialogProduct.id })}
          onWriteOff={() => setDialog({ kind: 'writeoff', productId: dialogProduct.id })}
        />
      )}
    </>
  )
}

/** "Отчёт по складу": pick a period, get the whole warehouse in one workbook. */
function ReportModal({ state, onClose }: { state: WarehouseState; onClose: () => void }) {
  const { products, orders, orderItems } = useData()
  const [from, setFrom] = useState(addDays(todayIso(), -30))
  const [to, setTo] = useState(todayIso())
  const active = products.filter((p) => p.active)
  return (
    <Modal
      title="Отчёт по складу"
      onClose={onClose}
      footer={
        <>
          <Button variant="text" onClick={onClose}>
            Отмена
          </Button>
          <ExportButton label="Скачать Excel" variant="ghost" onExport={() => downloadWarehouseReport(state, active, from, to, orderWriteOffViews(orders, orderItems))} />
        </>
      }
    >
      <p className="unit-muted" style={{ marginBottom: 16 }}>
        Один файл со всем складом за период: оборотная ведомость по каждому товару (остаток на начало, приход, расход по заказам, списано, остаток на
        конец), а также остатки, приходы, списания, сроки годности и журнал.
      </p>
      <div className="wh-form-row">
        <div className="field">
          <label>С</label>
          <DateInput value={from} onChange={setFrom} label="Период, с" />
        </div>
        <div className="field">
          <label>По</label>
          <DateInput value={to} onChange={setTo} label="Период, по" />
        </div>
      </div>
    </Modal>
  )
}
