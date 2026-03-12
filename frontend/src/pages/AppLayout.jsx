import { useState, useEffect } from 'react'
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
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('dc_theme') || 'light' } catch { return 'light' }
  })

  const isDark = theme === 'dark'

  useEffect(() => {
    try { localStorage.setItem('dc_theme', theme) } catch {}
  }, [theme])

  // Read logged-in user info
  const auth = (() => {
    try { return JSON.parse(sessionStorage.getItem('dc_auth') || '{}') } catch { return {} }
  })()
  const userEmail = auth.email || ''
  const userInitial = userEmail ? userEmail.charAt(0).toUpperCase() : '?'

  const handleLogout = () => {
    sessionStorage.removeItem('dc_auth')
    navigate('/', { replace: true })
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: isDark ? '#0f172a' : '#ffffff',
      position: 'relative',
      transition: 'background 0.3s ease',
    }}>
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
          background: isDark ? '#0f172a' : '#ffffff',
          borderBottom: isDark ? '1px solid #1e293b' : '1px solid #e2e8f0',
          boxShadow: isDark ? '0 1px 4px rgba(0,0,0,0.3)' : '0 1px 4px rgba(0,0,0,0.06)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          transition: 'all 0.3s ease',
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
                  color: isActive
                    ? '#F07621'
                    : isDark
                      ? (hoverIdx === i ? '#ffffff' : '#94a3b8')
                      : (hoverIdx === i ? '#0f172a' : '#475569'),
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
              width: 38,
              height: 38,
              borderRadius: '50%',
              border: isDark ? '1px solid rgba(255,255,255,0.15)' : '1px solid #e2e8f0',
              background: isDark ? 'rgba(255,255,255,0.08)' : '#f8fafc',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.3s ease',
              padding: 0,
            }}
          >
            {isDark ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F07621" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>

          {/* User info + Logout */}
          <div style={{
            marginLeft: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '6px 6px 6px 14px',
            borderRadius: 10,
            border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid #e2e8f0',
            background: isDark ? 'rgba(255,255,255,0.04)' : '#f9fafb',
          }}>
            {/* Avatar */}
            <div style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #1A5EA8, #F07621)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: 13,
              fontWeight: 700,
              fontFamily: "'DM Sans', sans-serif",
              flexShrink: 0,
            }}>
              {userInitial}
            </div>
            {/* Email */}
            <span style={{
              fontSize: 12,
              color: isDark ? '#94a3b8' : '#475569',
              fontWeight: 500,
              fontFamily: "'DM Sans', sans-serif",
              maxWidth: 160,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {userEmail}
            </span>
            {/* Logout icon button */}
            <button
              onClick={handleLogout}
              title="Logout"
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                border: 'none',
                background: isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease',
                padding: 0,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(239,68,68,0.1)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9'
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke={isDark ? '#94a3b8' : '#64748b'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </div>
        </div>
      </nav>

      {/* ── Main Content Area ── */}
      <main style={{ paddingTop: 70, minHeight: '100vh', position: 'relative', zIndex: 1 }}>
        <Outlet context={{ theme, isDark }} />
      </main>
    </div>
  )
}
