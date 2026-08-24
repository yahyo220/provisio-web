import { useLanguage } from '../../i18n/LanguageContext'
import type { DeliveryStatus } from '../../lib/types'

export default function DeliveryStatusBadge({ status }: { status: DeliveryStatus }) {
  const { t } = useLanguage()
  return <span className={`status-badge st-${status}`}>{t(`deliveryStatus.${status}`)}</span>
}
