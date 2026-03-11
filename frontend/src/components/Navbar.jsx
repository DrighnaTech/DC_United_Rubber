import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Logo from './Logo'
import { useScrollPosition } from '../hooks/useAnimations'

const NAV_LINKS = [
  { label: "Home", href: "#top" },
  { label: "What is AI Extractor?", href: "#what-is" },
  { label: "Extract", href: "#extract" },
  { label: "History", href: "#history" },
  { label: "Analytics", href: "#analytics" },
]

export default function Navbar() {
  const scrollY = useScrollPosition()
  const [hoverIdx, setHoverIdx] = useState(null)
  const navigate = useNavigate()
  const isScrolled = scrollY > 60

  return (
    <nav
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        padding: isScrolled ? '10px 40px' : '14px 40px',
        background: isScrolled
          ? 'linear-gradient(135deg, rgba(255,255,255,0.97) 0%, rgba(248,250,255,0.97) 100%)'
          : 'linear-gradient(135deg, rgba(255,255,255,0.85) 0%, rgba(248,250,255,0.8) 100%)',
        backdropFilter: 'blur(20px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(20px) saturate(1.4)',
        borderBottom: isScrolled
          ? '1px solid rgba(124, 58, 237, 0.08)'
          : '1px solid rgba(255, 255, 255, 0.3)',
        boxShadow: isScrolled
          ? '0 4px 30px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(124, 58, 237, 0.04)'
          : '0 2px 20px rgba(0, 0, 0, 0.03)',
        transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        animation: 'slideDown 0.6s ease-out',
      }}
    >
      {/* Logo */}
      <a href="#top" style={{ textDecoration: 'none' }}>
        <Logo size={60} />
      </a>

      {/* Nav Links */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {NAV_LINKS.map((item, i) => (
          <a
            key={i}
            href={item.href}
            onMouseEnter={() => setHoverIdx(i)}
            onMouseLeave={() => setHoverIdx(null)}
            style={{
              color: hoverIdx === i ? '#1A5EA8' : '#475569',
              textDecoration: 'none',
              fontSize: 14,
              fontWeight: hoverIdx === i ? 600 : 500,
              padding: '8px 16px',
              borderRadius: 8,
              transition: 'all 0.25s ease',
              cursor: 'pointer',
              position: 'relative',
              background: hoverIdx === i ? 'rgba(124, 58, 237, 0.06)' : 'transparent',
            }}
          >
            {item.label}
            {hoverIdx === i && (
              <span
                style={{
                  position: 'absolute',
                  bottom: 2,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: 20,
                  height: 2.5,
                  background: 'linear-gradient(90deg, #1A5EA8, #3b82f6)',
                  borderRadius: 2,
                  transition: 'all 0.2s ease',
                }}
              />
            )}
          </a>
        ))}
      </div>

      {/* Right actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          style={{
            width: 38,
            height: 38,
            borderRadius: '50%',
            background: 'rgba(124, 58, 237, 0.04)',
            border: '1px solid rgba(124, 58, 237, 0.1)',
            color: '#64748b',
            fontSize: 15,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.25s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(124, 58, 237, 0.1)'
            e.currentTarget.style.borderColor = 'rgba(124, 58, 237, 0.25)'
            e.currentTarget.style.color = '#1A5EA8'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(124, 58, 237, 0.04)'
            e.currentTarget.style.borderColor = 'rgba(124, 58, 237, 0.1)'
            e.currentTarget.style.color = '#64748b'
          }}
        >
          🔍
        </button>

        <button
          style={{
            padding: '9px 22px',
            borderRadius: 10,
            background: 'linear-gradient(135deg, #1A5EA8, #1552A0)',
            border: 'none',
            color: '#fff',
            fontSize: 13.5,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            transition: 'all 0.3s ease',
            boxShadow: '0 2px 12px rgba(124, 58, 237, 0.25)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'linear-gradient(135deg, #1552A0, #0F4490)'
            e.currentTarget.style.boxShadow = '0 4px 20px rgba(124, 58, 237, 0.35)'
            e.currentTarget.style.transform = 'translateY(-1px)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'linear-gradient(135deg, #1A5EA8, #1552A0)'
            e.currentTarget.style.boxShadow = '0 2px 12px rgba(124, 58, 237, 0.25)'
            e.currentTarget.style.transform = 'translateY(0)'
          }}
          onClick={() => navigate('/login')}
        >
          <span>👤</span>
          Login
        </button>
      </div>
    </nav>
  )
}
