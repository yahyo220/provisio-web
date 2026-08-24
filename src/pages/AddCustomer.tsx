import { Check } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import { useLanguage } from '../i18n/LanguageContext'
import { useData } from '../store/DataContext'

const TYPES = ['Restaurant', 'Hotel', 'Café', 'School', 'Institution']

export default function AddCustomer() {
  const { addCustomer } = useData()
  const { t, customerType } = useLanguage()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [type, setType] = useState('Restaurant')
  const [contact, setContact] = useState('')
  const [location, setLocation] = useState('')

  async function handleSave() {
    if (!name.trim()) return
    await addCustomer({
      name,
      type,
      contact: contact || '—',
      location: location || '—',
    })
    navigate('/customers')
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
          <Button variant="primary" icon={<Check />} onClick={handleSave}>
            {t('addCustomer.saveCustomer')}
          </Button>
        </div>
      </div>

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

        <div className="form-footer">
          <Link to="/customers" className="btn btn-text">
            {t('common.cancel')}
          </Link>
          <Button variant="primary" icon={<Check />} onClick={handleSave}>
            {t('addCustomer.saveCustomer')}
          </Button>
        </div>
      </Card>
    </>
  )
}
