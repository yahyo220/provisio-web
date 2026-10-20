import { Bell, Leaf } from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useLanguage } from '../../i18n/LanguageContext'
import { countNewSiteLeads, countUnreadSupportMessages } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import AccountMenu from './AccountMenu'

const NAV_LINKS = [
  { key: 'nav.dashboard', to: '/' },
  { key: 'nav.orders', to: '/orders' },
  { key: 'nav.products', to: '/products' },
  { key: 'nav.warehouse', to: '/warehouse' },
  { key: 'nav.customers', to: '/customers' },
  { key: 'nav.deliveries', to: '/deliveries' },
  { key: 'nav.couriers', to: '/couriers' },
  { key: 'nav.support', to: '/support' },
  { key: 'nav.leads', to: '/leads' },
  { key: 'nav.analytics', to: '/analytics' },
]

/** True while any customer/courier message (or order review) in Support hasn't
 * been opened — refreshes live as messages arrive and as they get read. */
function useSupportUnread() {
  const [unread, setUnread] = useState(false)

  useEffect(() => {
    if (!supabase) return
    const client = supabase
    let cancelled = false
    const refresh = () => {
      countUnreadSupportMessages()
        .then((n) => {
          if (!cancelled) setUnread(n > 0)
        })
        .catch(() => {})
    }
    refresh()
    const channel = client
      .channel('topbar-support-unread')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_messages' }, refresh)
      .subscribe()
    return () => {
      cancelled = true
      client.removeChannel(channel)
    }
  }, [])

  return unread
}

/** True while any request from the landing page is still marked 'new'. */
function useNewSiteLeads() {
  const [hasNew, setHasNew] = useState(false)

  useEffect(() => {
    if (!supabase) return
    const client = supabase
    let cancelled = false
    const refresh = () => {
      countNewSiteLeads()
        .then((n) => {
          if (!cancelled) setHasNew(n > 0)
        })
        .catch(() => {})
    }
    refresh()
    const channel = client
      .channel('topbar-site-leads')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'site_leads' }, refresh)
      .subscribe()
    return () => {
      cancelled = true
      client.removeChannel(channel)
    }
  }, [])

  return hasNew
}

export default function TopBar() {
  const { t } = useLanguage()
  const supportUnread = useSupportUnread()
  const newLeads = useNewSiteLeads()

  return (
    <div className="topbar">
      <div className="brand">
        <div className="brand-mark">
          <Leaf />
        </div>
        <div className="brand-text">
          <span className="name">Provisio</span>
          <span className="sub">B2B Supply</span>
        </div>
      </div>

      <nav className="nav-links">
        {NAV_LINKS.map((link) => (
          <NavLink key={link.to} to={link.to} end={link.to === '/'} className="nav-link">
            {t(link.key)}
            {link.to === '/support' && supportUnread && <span className="nav-dot" aria-label="Есть новые сообщения" />}
            {link.to === '/leads' && newLeads && <span className="nav-dot" aria-label="Есть новые заявки" />}
          </NavLink>
        ))}
      </nav>

      <div className="top-actions">
        <button type="button" className="icon-btn" aria-label="Notifications">
          <Bell />
        </button>
        <AccountMenu />
      </div>
    </div>
  )
}
