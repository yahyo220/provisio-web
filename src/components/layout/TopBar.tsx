import { Bell, Leaf } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useLanguage } from '../../i18n/LanguageContext'
import AccountMenu from './AccountMenu'

const NAV_LINKS = [
  { key: 'nav.dashboard', to: '/' },
  { key: 'nav.orders', to: '/orders' },
  { key: 'nav.products', to: '/products' },
  { key: 'nav.customers', to: '/customers' },
  { key: 'nav.deliveries', to: '/deliveries' },
  { key: 'nav.couriers', to: '/couriers' },
  { key: 'nav.analytics', to: '/analytics' },
]

export default function TopBar() {
  const { t } = useLanguage()

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
