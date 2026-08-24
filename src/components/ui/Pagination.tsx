import { ChevronLeft, ChevronRight } from 'lucide-react'
import clsx from '../../lib/clsx'

interface PaginationProps {
  page: number
  pageCount: number
  onChange: (page: number) => void
  totalLabel: string
  prevLabel?: string
  nextLabel?: string
  /** Adds the card's own inset padding + top divider — use when Pagination sits directly
   * inside an unpadded container (e.g. `.table-card`) rather than inside a `Card`. */
  bordered?: boolean
}

export default function Pagination({
  page,
  pageCount,
  onChange,
  totalLabel,
  prevLabel = 'Previous page',
  nextLabel = 'Next page',
  bordered = false,
}: PaginationProps) {
  const pages = Array.from({ length: pageCount }, (_, i) => i + 1)

  return (
    <div className={clsx('pagination', bordered && 'table-footer')}>
      <span className="count">{totalLabel}</span>
      <div className="page-btns">
        <button
          type="button"
          className="page-btn round"
          aria-label={prevLabel}
          disabled={page <= 1}
          onClick={() => onChange(Math.max(1, page - 1))}
        >
          <ChevronLeft />
        </button>
        {pages.map((p) => (
          <button
            key={p}
            type="button"
            className="page-btn round"
            aria-current={p === page ? 'true' : undefined}
            onClick={() => onChange(p)}
          >
            {p}
          </button>
        ))}
        <button
          type="button"
          className="page-btn round"
          aria-label={nextLabel}
          disabled={page >= pageCount}
          onClick={() => onChange(Math.min(pageCount, page + 1))}
        >
          <ChevronRight />
        </button>
      </div>
    </div>
  )
}
