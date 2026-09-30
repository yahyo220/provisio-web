import { Check } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import { useLanguage } from '../i18n/LanguageContext'
import type { PriceTier } from '../lib/types'
import { useData } from '../store/DataContext'

const TYPES = ['Restaurant', 'Hotel', 'Café', 'School', 'Institution']

// Same three choices as the app's registration screen — kept as free text in
// the DB, so this list only has to match by convention, not by constraint.
const STAFF_ROLES = ['Повар', 'Бармен', 'Руководитель']

const PRICE_TIER_LABEL: Record<PriceTier, string> = {
  with_price: 'С ценой',
  no_price: 'Без цены (скрыта)',
  external: 'Для внешних клиентов',
}

export default function AddCustomer() {
  const { addCustomer } = useData()
  const { t, customerType } = useLanguage()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [type, setType] = useState('Restaurant')
  const [contact, setContact] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [location, setLocation] = useState('')
  const [staffRole, setStaffRole] = useState('')
  const [priceTier, setPriceTier] = useState<PriceTier>('no_price')
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  async function handleSave() {
    if (!name.trim() || saving) return
    // Either both login and password are set (real account, approved right
    // away) or neither is — a login without a password (or vice versa)
    // can't create anything, so catch it here rather than let the edge
    // function reject it.
    if ((login.trim() || password) && (!login.trim() || password.length < 8)) {
      setSaveError('Для входа в приложение укажите и логин, и пароль (минимум 8 символов).')
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      await addCustomer({
        name,
        type,
        contact: contact || '—',
        phone,
        email,
        location: location || '—',
        companyName: name,
        staffRole: staffRole || undefined,
        priceTier,
        login: login.trim() || undefined,
        password: password || undefined,
      })
      navigate('/customers')
    } catch (err) {
      setSaveError((err as Error).message || t('common.saveFailed'))
      setSaving(false)
    }
  }

  return (
    <>
      <div className="header">
        <div>
          <h1>{t('addCustomer.title')}</h1>
          <p>{t('addCustomer.subtitle')}</p>
        </div>
        <div className="header-actions">
          <Link to="/customers" className="btn btn-text">
            {t('common.discard')}
          </Link>
          <Button variant="primary" icon={<Check />} onClick={handleSave} disabled={saving}>
            {saving ? 'Сохраняем…' : t('addCustomer.saveCustomer')}
          </Button>
        </div>
      </div>

      {saveError && (
        <div
          style={{
            background: 'rgba(192,40,40,0.08)',
            color: 'var(--gesso-danger, #c02828)',
            borderRadius: 'var(--gesso-radius-md)',
            padding: '12px 16px',
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          {saveError}
        </div>
      )}

      <Card style={{ maxWidth: 560 }}>
        <p className="section-label">{t('customerDetail.companyDetails')}</p>

        <div className="field">
          <label htmlFor="ac-name">{t('customerDetail.companyName')}</label>
          <input
            id="ac-name"
            type="text"
            placeholder={t('addCustomer.companyNamePlaceholder')}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="ac-type">{t('common.type')}</label>
            <div className="select-wrap">
              <select id="ac-type" value={type} onChange={(e) => setType(e.target.value)}>
                {TYPES.map((tp) => (
                  <option key={tp} value={tp}>
                    {customerType(tp)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="ac-contact">{t('customerDetail.contactPerson')}</label>
            <input
              id="ac-contact"
              type="text"
              placeholder={t('addCustomer.contactPlaceholder')}
              value={contact}
              onChange={(e) => setContact(e.target.value)}
            />
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="ac-phone">{t('common.phone')}</label>
            <input
              id="ac-phone"
              type="tel"
              placeholder="+998 90 123 45 67"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="ac-email">{t('common.email')}</label>
            <input
              id="ac-email"
              type="email"
              placeholder="name@company.uz"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="ac-loc">{t('common.location')}</label>
          <input
            id="ac-loc"
            type="text"
            placeholder={t('addCustomer.locationPlaceholder')}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </div>

        <p className="section-label" style={{ marginTop: 24 }}>
          Доступ в приложение (необязательно)
        </p>
        <p style={{ fontSize: 13, color: 'var(--gesso-fg-muted)', marginTop: -8, marginBottom: 16 }}>
          Укажите логин и пароль, если клиент сам будет заходить в приложение — аккаунт создастся сразу одобренным.
          Оставьте пустыми, если это просто карточка для учёта.
        </p>

        <div className="field-row">
          <div className="field">
            <label htmlFor="ac-role">Должность</label>
            <div className="select-wrap">
              <select id="ac-role" value={staffRole} onChange={(e) => setStaffRole(e.target.value)}>
                <option value="">—</option>
                {STAFF_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="ac-price-tier">Тип цены</label>
            <div className="select-wrap">
              <select id="ac-price-tier" value={priceTier} onChange={(e) => setPriceTier(e.target.value as PriceTier)}>
                {(Object.keys(PRICE_TIER_LABEL) as PriceTier[]).map((tier) => (
                  <option key={tier} value={tier}>
                    {PRICE_TIER_LABEL[tier]}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="ac-login">Логин</label>
            <input id="ac-login" type="text" placeholder="login" value={login} onChange={(e) => setLogin(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="ac-password">Пароль</label>
            <input
              id="ac-password"
              type="password"
              placeholder="минимум 8 символов"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        </div>

        <div className="form-footer">
          <Link to="/customers" className="btn btn-text">
            {t('common.cancel')}
          </Link>
          <Button variant="primary" icon={<Check />} onClick={handleSave} disabled={saving}>
            {saving ? 'Сохраняем…' : t('addCustomer.saveCustomer')}
          </Button>
        </div>
      </Card>
    </>
  )
}
