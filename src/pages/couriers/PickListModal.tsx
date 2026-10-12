import { Download, Printer } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import { useLanguage } from '../../i18n/LanguageContext'
import { fetchPickLines, type PickSourceLine } from '../../lib/api'
import { buildPickList, downloadPickListExcel, formatPickQty, formatShares, printPickList, type PickOrder } from '../../lib/pickList'

interface PickListModalProps {
  courier: string
  /** The courier's orders not collected from the warehouse yet. */
  orders: PickOrder[]
  onClose: () => void
}

/** "Сборочный лист": everything the courier collects at the warehouse for
 * the ticked orders, added up — print it or download it for them. */
export default function PickListModal({ courier, orders, onClose }: PickListModalProps) {
  const { unit } = useLanguage()
  const [selected, setSelected] = useState<Set<string>>(() => new Set(orders.map((o) => o.id)))
  const [lines, setLines] = useState<PickSourceLine[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchPickLines(orders.map((o) => o.id))
      .then((l) => {
        if (!cancelled) setLines(l)
      })
      .catch((err) => {
        console.error(err)
        if (!cancelled) setError('Не удалось загрузить товары заказов. Попробуйте ещё раз.')
      })
    return () => {
      cancelled = true
    }
  }, [orders])

  const chosen = useMemo(() => orders.filter((o) => selected.has(o.id)), [orders, selected])
  const rows = useMemo(() => {
    if (!lines) return []
    const numbers = new Map(chosen.map((o) => [o.id, o.orderNumber]))
    return buildPickList(
      lines.filter((l) => numbers.has(l.orderId)),
      numbers,
    )
  }, [lines, chosen])

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function exportExcel() {
    setExporting(true)
    try {
      await downloadPickListExcel(courier, chosen, rows, unit)
    } catch (err) {
      console.error(err)
      setError('Не удалось подготовить файл.')
    } finally {
      setExporting(false)
    }
  }

  const ready = lines !== null && rows.length > 0

  return (
    <Modal
      title={`Сборочный лист — ${courier}`}
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="text" onClick={onClose}>
            Закрыть
          </Button>
          <Button variant="ghost" icon={<Download />} onClick={exportExcel} disabled={!ready || exporting}>
            {exporting ? 'Готовим файл…' : 'Скачать Excel'}
          </Button>
          <Button icon={<Printer />} onClick={() => printPickList(courier, chosen, rows, unit)} disabled={!ready}>
            Печать
          </Button>
        </>
      }
    >
      <p className="unit-muted" style={{ marginBottom: 16 }}>
        Все товары из отмеченных заказов, сложенные вместе: доставщик забирает их на складе одним списком, а потом раздаёт клиентам по их накладным.
      </p>

      <p className="section-label">Заказы, которые ещё не забраны со склада</p>
      <div className="pick-orders">
        {orders.map((o) => (
          <label key={o.id} className="pick-order">
            <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggle(o.id)} />
            <span className="pick-order-num">№{o.orderNumber ?? '—'}</span>
            <span className="unit-muted">
              {o.customer} · {o.address}
            </span>
          </label>
        ))}
      </div>

      <p className="section-label" style={{ marginTop: 20 }}>
        Забрать на складе
      </p>
      {error && <div className="wh-error">{error}</div>}
      {!error && lines === null && <div className="empty-state">Загружаем товары…</div>}
      {lines !== null && rows.length === 0 && <div className="empty-state">Отметьте хотя бы один заказ.</div>}
      {rows.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>№</th>
                <th>Товар</th>
                <th style={{ textAlign: 'right' }}>Всего</th>
                <th>По заказам</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.name}|${r.unit}`}>
                  <td className="unit-muted">{i + 1}</td>
                  <td style={{ fontWeight: 600 }}>{r.name}</td>
                  <td style={{ textAlign: 'right' }}>
                    <span className="wh-qty">
                      {formatPickQty(r.total)}
                      <span className="unit">{unit(r.unit)}</span>
                    </span>
                  </td>
                  <td className="unit-muted">{formatShares(r.shares)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  )
}
