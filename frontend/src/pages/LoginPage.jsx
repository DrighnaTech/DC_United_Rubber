import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Logo from '../components/Logo'
import Icon from '../components/Icons'

/* ── Eye icon ── */
const IconEye = ({ off }) => off ? (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
) : (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

/* ── Check icon ── */
const IconCheck = ({ size = 11 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

/* ── Wavy SVG divider on left panel's right edge ── */
function WaveDivider() {
  return (
    <svg
      viewBox="0 0 80 560"
      preserveAspectRatio="none"
      style={{
        position: 'absolute', top: 0, right: -1,
        width: 80, height: '100%',
        zIndex: 3,
      }}
    >
      <path
        d="M80,0 C60,0 40,40 55,100 C70,160 80,180 60,240 C40,300 20,320 40,390 C60,460 80,480 65,520 C55,545 50,555 50,560 L80,560 Z"
        fill="white"
      />
    </svg>
  )
}

export default function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [agree, setAgree]       = useState(false)
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [mounted, setMounted]   = useState(false)
  const [focused, setFocused]   = useState(null)

  useEffect(() => { setTimeout(() => setMounted(true), 60) }, [])

  const handleLogin = (e) => {
    e.preventDefault()
    setError('')
    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.')
      return
    }
    setLoading(true)
    setTimeout(() => {
      if (email === 'admin@datacaffe.com' && password === 'admin123') {
        sessionStorage.setItem('dc_auth', JSON.stringify({ email, loggedIn: true }))
        navigate('/app/extractor')
      } else {
        setError('Invalid email or password.')
        setLoading(false)
      }
    }, 700)
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #e8eef7 0%, #dce6f5 50%, #eaf0fb 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      fontFamily: "'Inter', sans-serif",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap');
        * { box-sizing: border-box; }

        @keyframes cardIn {
          from { opacity: 0; transform: translateY(28px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes fadeSlide {
          from { opacity: 0; transform: translateX(-16px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes floatBubble {
          0%, 100% { transform: translateY(0); }
          50%       { transform: translateY(-10px); }
        }

        .field-input {
          width: 100%;
          background: transparent;
          border: none;
          border-bottom: 1.8px solid #d1dae8;
          padding: 10px 36px 10px 0;
          font-size: 14px;
          color: #1e293b;
          outline: none;
          transition: border-color 0.25s;
          font-family: 'Inter', sans-serif;
        }
        .field-input::placeholder { color: #b0bec5; }
        .field-input:focus { border-bottom-color: #2563eb; }

        .field-input:-webkit-autofill {
          -webkit-box-shadow: 0 0 0 100px #fff inset !important;
          -webkit-text-fill-color: #1e293b !important;
        }
      `}</style>

      {/* ══════════════ CARD ══════════════ */}
      <div style={{
        width: '100%',
        maxWidth: 860,
        minHeight: 520,
        borderRadius: 22,
        boxShadow: '0 24px 80px rgba(37,99,235,0.14), 0 4px 20px rgba(0,0,0,0.08)',
        display: 'flex',
        overflow: 'hidden',
        opacity: mounted ? 1 : 0,
        animation: mounted ? 'cardIn 0.7s cubic-bezier(0.22,1,0.36,1) both' : 'none',
      }}>

        {/* ══ LEFT PANEL ══ */}
        <div style={{
          width: '42%',
          flexShrink: 0,
          background: 'linear-gradient(155deg, #1a5dc8 0%, #2979e8 45%, #5ba4f5 100%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '52px 40px 52px 44px',
          position: 'relative',
          overflow: 'hidden',
        }}>

          {/* Decorative bubbles */}
          <div style={{
            position: 'absolute', bottom: -40, left: -40,
            width: 200, height: 200, borderRadius: '50%',
            background: 'rgba(255,255,255,0.07)',
            pointerEvents: 'none',
          }} />
          <div style={{
            position: 'absolute', top: -30, right: 50,
            width: 130, height: 130, borderRadius: '50%',
            background: 'rgba(255,255,255,0.06)',
            pointerEvents: 'none',
          }} />
          <div style={{
            position: 'absolute', top: '38%', left: -20,
            width: 90, height: 90, borderRadius: '50%',
            background: 'rgba(255,255,255,0.05)',
            pointerEvents: 'none',
          }} />

          {/* Wave divider */}
          <WaveDivider />

          {/* Content */}
          <div style={{ position: 'relative', zIndex: 2, textAlign: 'center' }}>
            {/* "Welcome to" */}
            <p style={{
              color: 'rgba(255,255,255,0.88)',
              fontSize: 17,
              fontWeight: 400,
              marginBottom: 28,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              letterSpacing: 0.3,
            }}>
              Welcome to
            </p>

            {/* Logo circle */}
            <div style={{
              width: 88, height: 88,
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.18)',
              backdropFilter: 'blur(8px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 22px',
              border: '2px solid rgba(255,255,255,0.3)',
              animation: 'floatBubble 4s ease-in-out infinite',
              boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
            }}>
              <Logo size={68} showText={false} light />
            </div>

            {/* Brand name */}
            <h2 style={{
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontSize: 26,
              fontWeight: 800,
              color: '#fff',
              marginBottom: 18,
              letterSpacing: -0.3,
            }}>
              United Rubber
            </h2>

            {/* Description */}
            <p style={{
              color: 'rgba(255,255,255,0.72)',
              fontSize: 12.5,
              lineHeight: 1.7,
              maxWidth: 210,
              margin: '0 auto 32px',
            }}>
              AI-powered Sales Analytics System — Est. 1976. Access real-time dashboards and intelligent data extraction.
            </p>

            {/* Feature badges */}
            {[
              { icon: 'brain', label: 'AI Extraction' },
              { icon: 'bar-chart', label: 'Live Analytics' },
              { icon: 'lock', label: 'Secure Access' },
            ].map((b, i) => (
              <div key={i} style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                padding: '5px 14px', borderRadius: 999,
                background: 'rgba(255,255,255,0.14)',
                border: '1px solid rgba(255,255,255,0.22)',
                marginBottom: 8,
                marginRight: i < 2 ? 6 : 0,
                animation: mounted ? `fadeSlide 0.5s ease ${0.3 + i * 0.1}s both` : 'none',
              }}>
                <Icon name={b.icon} size={12} color="#fff" />
                <span style={{ fontSize: 11, color: '#fff', fontWeight: 600 }}>{b.label}</span>
              </div>
            ))}
          </div>

          {/* Bottom credit */}
          <div style={{
            position: 'absolute', bottom: 18,
            display: 'flex', alignItems: 'center', gap: 10,
            zIndex: 2,
          }}>
            <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.45)', letterSpacing: 0.5 }}>
              POWERED BY
            </span>
            <div style={{ width: 1, height: 10, background: 'rgba(255,255,255,0.25)' }} />
            <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.65)', fontWeight: 600, letterSpacing: 0.8 }}>
              DATACAFFÉ AI
            </span>
          </div>
        </div>

        {/* ══ RIGHT PANEL ══ */}
        <div style={{
          flex: 1,
          background: '#fff',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '52px 52px 52px 60px',
        }}>

          {/* Heading */}
          <h2 style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontSize: 26, fontWeight: 700,
            color: '#0f172a',
            marginBottom: 6,
          }}>
            Sign In
          </h2>
          <p style={{ fontSize: 13.5, color: '#94a3b8', marginBottom: 36 }}>
            Access your AI Data Extractor dashboard
          </p>

          <form onSubmit={handleLogin} autoComplete="on">

            {/* Email field */}
            <div style={{ marginBottom: 28 }}>
              <label style={{
                display: 'block', fontSize: 13, fontWeight: 600,
                color: '#475569', marginBottom: 6,
              }}>
                E-mail Address
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  className="field-input"
                  type="email"
                  autoComplete="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onFocus={() => setFocused('email')}
                  onBlur={() => setFocused(null)}
                />
                {/* Right check icon when filled */}
                <span style={{
                  position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)',
                  color: email ? '#2563eb' : '#d1dae8',
                  transition: 'color 0.2s',
                }}>
                  <IconCheck size={14} />
                </span>
              </div>
            </div>

            {/* Password field */}
            <div style={{ marginBottom: 20 }}>
              <label style={{
                display: 'block', fontSize: 13, fontWeight: 600,
                color: '#475569', marginBottom: 6,
              }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  className="field-input"
                  type={showPw ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onFocus={() => setFocused('password')}
                  onBlur={() => setFocused(null)}
                  style={{ paddingRight: 56 }}
                />
                {/* Eye toggle */}
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  style={{
                    position: 'absolute', right: 20, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#94a3b8', display: 'flex', padding: 2,
                    transition: 'color 0.2s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.color = '#2563eb'}
                  onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}
                >
                  <IconEye off={showPw} />
                </button>
                {/* Check icon */}
                <span style={{
                  position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)',
                  color: password ? '#2563eb' : '#d1dae8',
                  transition: 'color 0.2s',
                }}>
                  <IconCheck size={14} />
                </span>
              </div>
            </div>

            {/* Agree checkbox */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 28 }}>
              <div
                onClick={() => setAgree(v => !v)}
                style={{
                  width: 17, height: 17, borderRadius: 4, marginTop: 1,
                  border: `2px solid ${agree ? '#2563eb' : '#cbd5e1'}`,
                  background: agree ? '#2563eb' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', transition: 'all 0.2s', flexShrink: 0,
                }}
              >
                {agree && <IconCheck />}
              </div>
              <span style={{ fontSize: 12.5, color: '#64748b', lineHeight: 1.5 }}>
                By Signing In, I agree with the{' '}
                <span style={{ color: '#2563eb', fontWeight: 600, cursor: 'pointer' }}>
                  Terms &amp; Conditions
                </span>
              </span>
            </div>

            {/* Error */}
            {error && (
              <div style={{
                padding: '10px 14px', borderRadius: 8, marginBottom: 18,
                background: '#fef2f2', border: '1px solid #fecaca',
                color: '#dc2626', fontSize: 13, fontWeight: 500,
              }}>
                {error}
              </div>
            )}

            {/* Buttons row */}
            <div style={{ display: 'flex', gap: 12 }}>
              {/* Sign In — filled blue */}
              <button
                type="submit"
                disabled={loading}
                style={{
                  flex: 1,
                  padding: '13px 24px',
                  borderRadius: 50,
                  border: 'none',
                  background: loading ? '#93c5fd' : 'linear-gradient(135deg, #1a5dc8, #2979e8)',
                  color: '#fff',
                  fontSize: 14, fontWeight: 700,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  transition: 'all 0.25s ease',
                  boxShadow: loading ? 'none' : '0 6px 20px rgba(37,99,235,0.35)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                }}
                onMouseEnter={e => {
                  if (!loading) {
                    e.currentTarget.style.transform = 'translateY(-2px)'
                    e.currentTarget.style.boxShadow = '0 10px 28px rgba(37,99,235,0.45)'
                  }
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'translateY(0)'
                  e.currentTarget.style.boxShadow = '0 6px 20px rgba(37,99,235,0.35)'
                }}
              >
                {loading ? (
                  <>
                    <div style={{
                      width: 16, height: 16,
                      border: '2px solid rgba(255,255,255,0.4)',
                      borderTop: '2px solid #fff',
                      borderRadius: '50%',
                      animation: 'spin 0.7s linear infinite',
                    }} />
                    Signing in…
                  </>
                ) : 'Sign In'}
              </button>

              {/* Back — outlined */}
              <button
                type="button"
                onClick={() => navigate('/')}
                style={{
                  flex: 1,
                  padding: '13px 24px',
                  borderRadius: 50,
                  border: '1.8px solid #d1dae8',
                  background: 'transparent',
                  color: '#475569',
                  fontSize: 14, fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.25s ease',
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = '#2563eb'
                  e.currentTarget.style.color = '#2563eb'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = '#d1dae8'
                  e.currentTarget.style.color = '#475569'
                }}
              >
                Back
              </button>
            </div>

          </form>
        </div>
      </div>
    </div>
  )
}
