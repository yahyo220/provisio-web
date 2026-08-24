import { useLanguage } from '../../i18n/LanguageContext'
import type { OrderStatus } from '../../lib/types'

/** Larger status pill — used in the Order detail header. */
export default function StatusPill({ status }: { status: OrderStatus }) {
  const { t } = useLanguage()
  return (
    <span className={`status-pill st-${status}`}>
      <span className="dot" />
      {t(`status.${status}`)}
    </span>
  )
}
