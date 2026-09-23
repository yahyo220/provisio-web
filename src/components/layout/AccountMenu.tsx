import { LogOut, Settings, User } from 'lucide-react'
import { useState } from 'react'
import { useLanguage } from '../../i18n/LanguageContext'
import useClickOutside from '../../lib/useClickOutside'
import { useAuth } from '../../store/AuthContext'
import Button from '../ui/Button'
import Modal from '../ui/Modal'

// AccountMenu's "Сохранить изменения" used to just close the modal — name/
// role/notification toggles reset to these defaults on every reload with
// nothing telling the admin that never actually saved. There's no backend
// field for any of this except admin_users.name, and adding one just for a
// header-avatar display name felt like more production surface than a
// cosmetic preference warrants — localStorage genuinely does persist it
// (per browser, which is the honest scope for "remember my preference"
// here), it just doesn't sync across devices. Email is deliberately NOT
// editable here — it's session.user.email, the real login identity, and
// changing that needs a real Supabase Auth flow, not a cosmetic form field.
const LOCAL_STORAGE_KEY = 'provisio_account_prefs'

interface StoredPrefs {
  name: string
  role: string
  emailNotifications: boolean
  smsAlerts: boolean
}

function loadPrefs(): StoredPrefs {
  const fallback: StoredPrefs = { name: 'Admin', role: 'Operations manager', emailNotifications: true, smsAlerts: false }
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY)
    if (!raw) return fallback
    return { ...fallback, ...JSON.parse(raw) }
  } catch {
    return fallback
  }
}

function savePrefs(prefs: StoredPrefs) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // Private browsing / storage disabled — the form still works for this
    // session, it just won't remember across reloads.
  }
}

export default function AccountMenu() {
  const { t, lang, setLang } = useLanguage()
  const { session, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const ref = useClickOutside<HTMLDivElement>(open, () => setOpen(false))

  const [prefs, setPrefs] = useState<StoredPrefs>(loadPrefs)
  const { name, role, emailNotifications, smsAlerts } = prefs
  const email = session?.user.email ?? ''

  function setName(next: string) {
    setPrefs((p) => ({ ...p, name: next }))
  }
  function setRole(next: string) {
    setPrefs((p) => ({ ...p, role: next }))
  }
  function setEmailNotifications(next: boolean | ((v: boolean) => boolean)) {
    setPrefs((p) => ({ ...p, emailNotifications: typeof next === 'function' ? next(p.emailNotifications) : next }))
  }
  function setSmsAlerts(next: boolean | ((v: boolean) => boolean)) {
    setPrefs((p) => ({ ...p, smsAlerts: typeof next === 'function' ? next(p.smsAlerts) : next }))
  }

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
            <Button
              variant="primary"
              onClick={() => {
                savePrefs(prefs)
                setProfileOpen(false)
              }}
            >
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
            <input id="profile-email" type="email" value={email} disabled />
          </div>
        </Modal>
      )}

      {settingsOpen && (
        <Modal
          title={t('account.settingsTitle')}
          onClose={() => setSettingsOpen(false)}
          footer={
            <Button
              variant="primary"
              onClick={() => {
                savePrefs(prefs)
                setSettingsOpen(false)
              }}
            >
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
