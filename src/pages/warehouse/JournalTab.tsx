import { ListFilter, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import Card from '../../components/ui/Card'
import Dropdown from '../../components/ui/Dropdown'
import Pagination from '../../components/ui/Pagination'
import { downloadJournalReport } from '../../lib/exportWarehouse'
import type { ProductRow } from '../../lib/types'
import { addDays, formatDayTime, inPeriod, MOVEMENT_LABELS, todayIso, type MovementType, type WarehouseState } from '../../lib/warehouse'
import { DateInput, ExportButton, ProductCell, Qty } from './shared'

const PAGE_SIZE = 25

export default function JournalTab({ state, productsById }: { state: WarehouseState; productsById: Map<string, ProductRow> }) {
  const [from, setFrom] = useState(addDays(todayIso(), -30))
  const [to, setTo] = useState(todayIso())
  const [type, setType] = useState<MovementType | null>(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return state.movements.filter((m) => {
      const product = productsById.get(m.productId)
      return (
        product &&
        inPeriod(m.at, from, to) &&
        (!type || m.type === type) &&
        (!q || product.name.toLowerCase().includes(q) || product.sku.toLowerCase().includes(q))
      )
    })
  }, [state.movements, productsById, from, to, type, search])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  return (
    <>
      <Card>
        <div className="toolbar bare">
          <DateInput value={from} onChange={(v) => { setFrom(v); setPage(1) }} label="Период, с" />
          <DateInput value={to} onChange={(v) => { setTo(v); setPage(1) }} label="Период, по" />
          <Dropdown
            allLabel="Все движения"
            icon={<ListFilter />}
            variant="pill"
            options={(Object.keys(MOVEMENT_LABELS) as MovementType[]).map((k) => ({ label: MOVEMENT_LABELS[k], value: k }))}
            value={type}
            onChange={(v) => { setType(v as MovementType | null); setPage(1) }}
          />
          <div className="search-field on-canvas">
            <Search />
            <input
              type="text"
              placeholder="Поиск по товару…"
              aria-label="Поиск по товару"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            />
          </div>
          <ExportButton label="Скачать Excel" onExport={() => downloadJournalReport(filtered, productsById, from, to)} />
        </div>
      </Card>

      <Card>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Дата и время</th>
                <th>Товар</th>
                <th>Тип</th>
                <th style={{ textAlign: 'right' }}>Изменение</th>
                <th style={{ textAlign: 'right' }}>Остаток после</th>
                <th>Основание</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">За этот период движений нет.</div>
                  </td>
                </tr>
              )}
              {pageRows.map((m) => {
                const product = productsById.get(m.productId)
                return (
                  <tr key={m.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDayTime(m.at)}</td>
                    <td>
                      <ProductCell product={product} />
                    </td>
                    <td>{MOVEMENT_LABELS[m.type]}</td>
                    <td style={{ textAlign: 'right' }}>
                      <Qty value={m.delta} unit={product?.unit ?? ''} signed />
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Qty value={m.balanceAfter} unit={product?.unit ?? ''} />
                    </td>
                    <td className="unit-muted">{m.ref}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <Pagination
          page={safePage}
          pageCount={pageCount}
          onChange={setPage}
          totalLabel={`Показано ${pageRows.length} из ${filtered.length}`}
          prevLabel="Предыдущая страница"
          nextLabel="Следующая страница"
        />
      </Card>
    </>
  )
}
