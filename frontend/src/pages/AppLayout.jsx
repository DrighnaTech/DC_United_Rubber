import { useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import Logo from '../components/Logo'
import ParticleField from '../components/ParticleField'

const APP_NAV_ITEMS = [
  { label: 'Dashboard', path: '/app/dashboard' },
  { label: 'AI Data Extractor', path: '/app/extractor' },
]

export default function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const [hoverIdx, setHoverIdx] = useState(null)
  const [theme, setTheme] = useState('light') // 'light' | 'dark'

  const isDark = theme === 'dark'

  const handleLogout = () => {
    sessionStorage.removeItem('dc_auth')
    navigate('/', { replace: true })
  }

  return (
    <div style={{ minHeight: '100vh', background: isDark ? '#020617' : '#F0F4F9', position: 'relative' }}>
      {isDark && <ParticleField />}

      {/* ── Top Navigation Bar ── */}
      <nav
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          padding: '0 40px',
          height: 70,
          background: '#1A3C5E',
          backdropFilter: 'none',
          WebkitBackdropFilter: 'none',
          borderBottom: '1px solid #0F2540',
          boxShadow: '0 2px 8px rgba(15, 37, 64, 0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        {/* Left: Logo */}
        <div onClick={() => navigate('/app/extractor')} style={{ cursor: 'pointer' }}>
          <Logo size={58} light={isDark} />
        </div>

        {/* Right: Nav items + Theme toggle + Logout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          {APP_NAV_ITEMS.map((item, i) => {
            const isActive = location.pathname.startsWith(item.path)
            return (
              <button
                key={i}
                onClick={() => navigate(item.path)}
                onMouseEnter={() => setHoverIdx(i)}
                onMouseLeave={() => setHoverIdx(null)}
                style={{
                  padding: '24px 20px',
                  border: 'none',
                  borderBottom: isActive ? '3px solid #F07621' : '3px solid transparent',
                  background: 'transparent',
                  color: isActive ? '#F07621' : hoverIdx === i ? '#ffffff' : '#b0c8e0',
                  fontSize: 15,
                  fontWeight: isActive ? 600 : 500,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  fontFamily: "'DM Sans', sans-serif",
                  letterSpacing: '0.01em',
                }}
              >
                {item.label}
              </button>
            )
          })}

          {/* Theme Toggle */}
          <button
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            style={{
              marginLeft: 16,
              width: 40,
              height: 40,
              borderRadius: '50%',
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'rgba(255,255,255,0.08)',
              color: '#F07621',
              fontSize: 18,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.3s ease',
            }}
          >
            {isDark ? '\u2600\uFE0F' : '\uD83C\uDF19'}
          </button>

          {/* Logout Button */}
          <button
            onClick={handleLogout}
            title="Logout"
            style={{
              marginLeft: 10,
              padding: '8px 18px',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.2)',
              background: 'rgba(255,255,255,0.08)',
              color: '#F07621',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif",
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(240,118,33,0.15)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
            }}
          >
            Logout
          </button>
        </div>
      </nav>

      {/* ── Main Content Area ── */}
      <main style={{ paddingTop: 70, minHeight: '100vh', position: 'relative', zIndex: 1 }}>
        <Outlet context={{ theme, isDark }} />
      </main>
    </div>
  )
}
