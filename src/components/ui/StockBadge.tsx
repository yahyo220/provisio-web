import { useLanguage } from '../../i18n/LanguageContext'
import type { StockStatus } from '../../lib/types'

export default function StockBadge({ status }: { status: StockStatus }) {
  const { t } = useLanguage()
  return (
    <span className="stock-badge" data-state={status}>
      <span className="stock-dot" />
      {t(`stock.${status}`)}
    </span>
  )
}
