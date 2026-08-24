import { Outlet, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import TopBar from './TopBar'

export default function AppLayout() {
  const location = useLocation()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  return (
    <div className="page">
      <TopBar />
      <div className="wrap" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <Outlet />
      </div>
    </div>
  )
}
