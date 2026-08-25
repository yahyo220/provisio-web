import { LogOut, Settings, User } from 'lucide-react'
import { useState } from 'react'
import { useLanguage } from '../../i18n/LanguageContext'
import useClickOutside from '../../lib/useClickOutside'
import { useAuth } from '../../store/AuthContext'
import Button from '../ui/Button'
import Modal from '../ui/Modal'

export default function AccountMenu() {
  const { t, lang, setLang } = useLanguage()
  const { session, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const ref = useClickOutside<HTMLDivElement>(open, () => setOpen(false))

  const [name, setName] = useState('Admin')
  const [email, setEmail] = useState(session?.user.email ?? '')
  const [role, setRole] = useState('Operations manager')

  const [emailNotifications, setEmailNotifications] = useState(true)
  const [smsAlerts, setSmsAlerts] = useState(false)

  const initials =
    name
      .trim()
      .split(/\s+/)
      .map((p) => p[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'MK'

  return (
    <div className="account-wrap" ref={ref}>
      <button
        type="button"
        className="avatar account-trigger"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {initials}
      </button>

      {open && (
        <div className="account-menu" role="menu">
          <div className="account-head">
            <div className="avatar" style={{ width: 40, height: 40 }}>
              {initials}
            </div>
            <div>
              <div className="account-name">{name}</div>
              <div className="account-email">{email}</div>
            </div>
          </div>

          <div className="account-divider" />

          <div className="account-section-label">{t('account.language')}</div>
          <div className="lang-row">
            <button type="button" className="lang-btn" aria-selected={lang === 'ru'} onClick={() => setLang('ru')}>
              {t('account.russian')}
            </button>
            <button type="button" className="lang-btn" aria-selected={lang === 'en'} onClick={() => setLang('en')}>
              {t('account.english')}
            </button>
          </div>

          <div className="account-divider" />

          <button
            type="button"
            className="account-item"
            role="menuitem"
            onClick={() => {
              setProfileOpen(true)
              setOpen(false)
            }}
          >
            <User />
            {t('account.myProfile')}
          </button>
          <button
            type="button"
            className="account-item"
            role="menuitem"
            onClick={() => {
              setSettingsOpen(true)
              setOpen(false)
            }}
          >
            <Settings />
            {t('account.accountSettings')}
          </button>

          <div className="account-divider" />

          <button type="button" className="account-item" role="menuitem" onClick={() => signOut()}>
            <LogOut />
            {t('account.logOut')}
          </button>
        </div>
      )}

      {profileOpen && (
        <Modal
          title={t('account.profileTitle')}
          onClose={() => setProfileOpen(false)}
          footer={
            <Button variant="primary" onClick={() => setProfileOpen(false)}>
              {t('common.saveChanges')}
            </Button>
          }
        >
          <div className="field">
            <label htmlFor="profile-name">{t('account.fullName')}</label>
            <input id="profile-name" type="text" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="profile-role">{t('account.role')}</label>
            <input id="profile-role" type="text" value={role} onChange={(e) => setRole(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="profile-email">{t('common.email')}</label>
            <input id="profile-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        </Modal>
      )}

      {settingsOpen && (
        <Modal
          title={t('account.settingsTitle')}
          onClose={() => setSettingsOpen(false)}
          footer={
            <Button variant="primary" onClick={() => setSettingsOpen(false)}>
              {t('common.saveChanges')}
            </Button>
          }
        >
          <div className="status-row" style={{ paddingTop: 0, marginTop: 0, borderTop: 'none' }}>
            <div>
              <div className="lbl">{t('account.emailNotifications')}</div>
              <div className="sub">{t('account.emailNotificationsHint')}</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={emailNotifications}
              aria-label={t('account.emailNotifications')}
              className="switch"
              onClick={() => setEmailNotifications((v) => !v)}
            />
          </div>
          <div className="status-row">
            <div>
              <div className="lbl">{t('account.smsAlerts')}</div>
              <div className="sub">{t('account.smsAlertsHint')}</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={smsAlerts}
              aria-label={t('account.smsAlerts')}
              className="switch"
              onClick={() => setSmsAlerts((v) => !v)}
            />
          </div>
          <div className="status-row">
            <div>
              <div className="lbl">{t('account.darkMode')}</div>
              <div className="sub">{t('account.darkModeHint')}</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={false}
              aria-label={t('account.darkMode')}
              className="switch"
              disabled
              style={{ opacity: 0.4, cursor: 'not-allowed' }}
            />
          </div>
        </Modal>
      )}
    </div>
  )
}
