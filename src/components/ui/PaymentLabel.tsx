import { useLanguage } from '../../i18n/LanguageContext'
import type { PaymentStatus } from '../../lib/types'

export default function PaymentLabel({ status }: { status: PaymentStatus }) {
  const { t } = useLanguage()
  return <span className={`pay-${status}`}>{t(`payment.${status}`)}</span>
}
