import { useLanguage } from '../../i18n/LanguageContext'
import type { CustomerStatus } from '../../lib/types'

export default function CustomerStatusBadge({ status }: { status: CustomerStatus }) {
  const { t } = useLanguage()
  return <span className={`status-badge st-${status}`}>{t(`customerStatus.${status}`)}</span>
}
