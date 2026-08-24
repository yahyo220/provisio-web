import { useLanguage } from '../../i18n/LanguageContext'
import type { OrderStatus } from '../../lib/types'

/** Small pill badge — used in the Orders list and Dashboard recent-orders table. */
export default function StatusBadge({ status }: { status: OrderStatus }) {
  const { t } = useLanguage()
  return <span className={`status-badge st-${status}`}>{t(`status.${status}`)}</span>
}
