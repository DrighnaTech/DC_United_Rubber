import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import Logo from '../components/Logo'
import Icon from '../components/Icons'
import Footer from '../components/Footer'

/* ─────────────────────────────────────────────
   THEME DEFINITIONS
───────────────────────────────────────────── */
const DARK = {
  pageBg: 'linear-gradient(135deg, #0d1218 0%, #111827 50%, #0d1829 100%)',
  navBg: 'linear-gradient(90deg, #0f1e35 0%, #1a2f4e 50%, #0f1e35 100%)',
  navBorder: 'rgba(255,255,255,0.07)',
  navShadow: '0 2px 20px rgba(15,30,53,0.6)',
  navLinkColor: 'rgba(176,200,224,0.75)',
  navLinkHover: '#fff',
  navLinkHoverBg: 'rgba(255,255,255,0.07)',
  h1Color: '#fff',
  descColor: 'rgba(176,200,224,0.75)',
  statValue: '#fff',
  statLabel: 'rgba(176,200,224,0.65)',
  statBorder: 'rgba(255,255,255,0.07)',
  chipBg: 'rgba(13,18,31,0.85)',
  chipBorder: 'rgba(255,255,255,0.1)',
  chipColor: '#fff',
  featureSectionBg: 'linear-gradient(180deg, #0d1218 0%, #111827 100%)',
  featureSectionBorder: 'rgba(255,255,255,0.05)',
  featureH2: '#fff',
  cardBg: 'rgba(255,255,255,0.03)',
  cardBorder: 'rgba(255,255,255,0.07)',
  cardTextTitle: '#f1f5f9',
  cardTextDesc: 'rgba(148,163,184,0.75)',
  ctaSectionBg: 'linear-gradient(135deg, #0d1218 0%, #111827 100%)',
  ctaSectionBorder: 'rgba(255,255,255,0.05)',
  ctaCardBg: 'linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(59,130,246,0.08) 100%)',
  ctaCardBorder: 'rgba(99,102,241,0.25)',
  ctaH2: '#fff',
  ctaP: 'rgba(176,200,224,0.7)',
  dotGrid: 'radial-gradient(rgba(255,255,255,0.035) 1px, transparent 1px)',
  toggleBg: 'rgba(255,255,255,0.1)',
  toggleBorder: 'rgba(255,255,255,0.15)',
  toggleColor: '#f8fafc',
  toggleHoverBg: 'rgba(255,255,255,0.18)',
  // Accent colors
  badgeBg: 'rgba(99,102,241,0.15)',
  badgeBorder: 'rgba(99,102,241,0.35)',
  badgeDot: '#818cf8',
  badgeText: '#a5b4fc',
  accentGradient: 'linear-gradient(135deg, #6366f1, #3b82f6)',
  accentLine: 'linear-gradient(90deg, #6366f1, #3b82f6)',
  offerBadgeBg: 'rgba(99,102,241,0.12)',
  offerBadgeBorder: 'rgba(99,102,241,0.3)',
  offerBadgeText: '#a5b4fc',
  ctaGlowOrb: 'radial-gradient(circle, rgba(99,102,241,0.2), transparent 70%)',
}

const LIGHT = {
  pageBg: 'linear-gradient(135deg, #f0f4f8 0%, #f8fafc 50%, #eef2f7 100%)',
  navBg: 'linear-gradient(90deg, #ffffff 0%, #f8fafc 50%, #ffffff 100%)',
  navBorder: 'rgba(0,0,0,0.08)',
  navShadow: '0 2px 20px rgba(0,0,0,0.08)',
  navLinkColor: '#475569',
  navLinkHover: '#0f172a',
  navLinkHoverBg: 'rgba(0,0,0,0.05)',
  h1Color: '#0f172a',
  descColor: '#475569',
  statValue: '#0f172a',
  statLabel: '#64748b',
  statBorder: 'rgba(0,0,0,0.08)',
  chipBg: 'rgba(255,255,255,0.95)',
  chipBorder: 'rgba(0,0,0,0.1)',
  chipColor: '#0f172a',
  featureSectionBg: 'linear-gradient(180deg, #f0f4f8 0%, #e8edf5 100%)',
  featureSectionBorder: 'rgba(0,0,0,0.06)',
  featureH2: '#0f172a',
  cardBg: '#ffffff',
  cardBorder: 'rgba(0,0,0,0.08)',
  cardTextTitle: '#0f172a',
  cardTextDesc: '#64748b',
  ctaSectionBg: 'linear-gradient(135deg, #f0f4f8 0%, #e8edf5 100%)',
  ctaSectionBorder: 'rgba(0,0,0,0.06)',
  ctaCardBg: 'linear-gradient(135deg, rgba(26,94,168,0.06) 0%, rgba(59,130,246,0.04) 100%)',
  ctaCardBorder: 'rgba(26,94,168,0.2)',
  ctaH2: '#0f172a',
  ctaP: '#475569',
  dotGrid: 'radial-gradient(rgba(0,0,0,0.06) 1px, transparent 1px)',
  toggleBg: 'rgba(15,23,42,0.08)',
  toggleBorder: 'rgba(15,23,42,0.15)',
  toggleColor: '#0f172a',
  toggleHoverBg: 'rgba(15,23,42,0.14)',
  // Accent colors
  badgeBg: 'rgba(26,94,168,0.08)',
  badgeBorder: 'rgba(26,94,168,0.2)',
  badgeDot: '#1A5EA8',
  badgeText: '#1A5EA8',
  accentGradient: 'linear-gradient(135deg, #4f46e5, #2563eb)',
  accentLine: 'linear-gradient(90deg, #1A5EA8, #3b82f6)',
  offerBadgeBg: 'rgba(26,94,168,0.08)',
  offerBadgeBorder: 'rgba(26,94,168,0.2)',
  offerBadgeText: '#1A5EA8',
  ctaGlowOrb: 'radial-gradient(circle, rgba(26,94,168,0.1), transparent 70%)',
}

/* ─────────────────────────────────────────────
   STATS
───────────────────────────────────────────── */
const STATS = [
  { value: '10K+', label: 'Documents Processed' },
  { value: '98%',  label: 'Accuracy Rate' },
  { value: '150+', label: 'Enterprise Clients' },
]

/* ─────────────────────────────────────────────
   ANIMATED COUNTER HOOK
───────────────────────────────────────────── */
function useCounter(target, duration = 1600, start = false) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!start) return
    const num = parseFloat(target.replace(/[^0-9.]/g, ''))
    const suffix = target.replace(/[0-9.]/g, '')
    let startTime = null
    const step = (ts) => {
      if (!startTime) startTime = ts
      const progress = Math.min((ts - startTime) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setCount(Math.floor(eased * num) + suffix)
      if (progress < 1) requestAnimationFrame(step)
      else setCount(target)
    }
    requestAnimationFrame(step)
  }, [start, target, duration])
  return count
}

function StatItem({ stat, animate, theme }) {
  const val = useCounter(stat.value, 1600, animate)
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{
        fontSize: 32, fontWeight: 800, color: theme.statValue,
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        lineHeight: 1,
        transition: 'color 0.4s ease',
      }}>
        {animate ? val : stat.value}
      </div>
      <div style={{
        fontSize: 11.5, color: theme.statLabel,
        marginTop: 6, letterSpacing: 0.5,
        fontWeight: 500,
        transition: 'color 0.4s ease',
      }}>
        {stat.label}
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────
   DECORATIVE RING ARCS (right side)
───────────────────────────────────────────── */
function RingArcs({ size }) {
  return (
    <svg
      width={size * 1.38}
      height={size * 1.38}
      viewBox={`0 0 ${size * 1.38} ${size * 1.38}`}
      style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', pointerEvents: 'none' }}
    >
      <circle
        cx={size * 0.69} cy={size * 0.69} r={size * 0.62}
        fill="none"
        stroke="rgba(99,102,241,0.25)"
        strokeWidth="1.2"
        strokeDasharray="8 6"
        style={{ animation: 'ringRotate 18s linear infinite' }}
      />
      <circle
        cx={size * 0.69} cy={size * 0.69} r={size * 0.55}
        fill="none"
        stroke="rgba(59,130,246,0.18)"
        strokeWidth="0.8"
        strokeDasharray="4 10"
        style={{ animation: 'ringRotate 24s linear infinite reverse' }}
      />
      <path
        d={`M ${size * 0.69 + size * 0.62 * Math.cos(-0.4)} ${size * 0.69 + size * 0.62 * Math.sin(-0.4)}
            A ${size * 0.62} ${size * 0.62} 0 0 1
            ${size * 0.69 + size * 0.62 * Math.cos(0.4)} ${size * 0.69 + size * 0.62 * Math.sin(0.4)}`}
        fill="none" stroke="#818cf8" strokeWidth="3" strokeLinecap="round"
      />
      <path
        d={`M ${size * 0.69 + size * 0.62 * Math.cos(Math.PI + 0.6)} ${size * 0.69 + size * 0.62 * Math.sin(Math.PI + 0.6)}
            A ${size * 0.62} ${size * 0.62} 0 0 1
            ${size * 0.69 + size * 0.62 * Math.cos(Math.PI + 1.1)} ${size * 0.69 + size * 0.62 * Math.sin(Math.PI + 1.1)}`}
        fill="none" stroke="#6366f1" strokeWidth="3" strokeLinecap="round"
      />
      {[0.15, 0.72, 1.3, 2.0, 2.8, 4.2, 5.1, 5.7].map((angle, i) => {
        const r1 = size * 0.62, r2 = size * 0.66
        const cos = Math.cos(angle), sin = Math.sin(angle)
        const cx = size * 0.69, cy = size * 0.69
        return (
          <line key={i}
            x1={cx + r1 * cos} y1={cy + r1 * sin}
            x2={cx + r2 * cos} y2={cy + r2 * sin}
            stroke="rgba(99,102,241,0.5)" strokeWidth="1.5" strokeLinecap="round"
          />
        )
      })}
    </svg>
  )
}

/* ─────────────────────────────────────────────
   ANIMATED FEATURE CARDS
───────────────────────────────────────────── */
const FEATURES = [
  {
    iconName: 'cpu',
    title: 'AI-Powered Reading',
    desc: 'Automatically reads PDFs, scanned images, and complex documents with high precision.',
    color: '#e84545',
  },
  {
    iconName: 'bar-chart',
    title: 'Instant Structuring',
    desc: 'Converts unstructured content into clean Excel, CSV, or database-ready formats.',
    color: '#f07b1c',
  },
  {
    iconName: 'link',
    title: 'ERP Integration',
    desc: 'Push extracted data directly into your ERP, CRM, or analytics platforms.',
    color: '#3b82f6',
  },
  {
    iconName: 'trending-up',
    title: 'Sales Analytics',
    desc: 'Track performance, trends, and KPIs with interactive United Rubber dashboards.',
    color: '#8b5cf6',
  },
]

function FeatureCards({ theme }) {
  const sectionRef = useRef(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true) },
      { threshold: 0.15 }
    )
    if (sectionRef.current) observer.observe(sectionRef.current)
    return () => observer.disconnect()
  }, [])

  return (
    <section
      ref={sectionRef}
      style={{
        padding: '88px 48px',
        background: theme.featureSectionBg,
        borderTop: `1px solid ${theme.featureSectionBorder}`,
        overflow: 'hidden',
        transition: 'background 0.4s ease',
      }}
    >
      <style>{`
        @keyframes cardFadeUp {
          from { opacity: 0; transform: translateY(48px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0)    scale(1); }
        }
        @keyframes iconSpin {
          from { transform: rotateY(0deg); }
          to   { transform: rotateY(360deg); }
        }
        @keyframes titleUnderline {
          from { width: 0; }
          to   { width: 100%; }
        }
        .feat-card:hover .feat-icon {
          animation: iconSpin 0.6s ease forwards;
        }
        .feat-card:hover .feat-underline {
          animation: titleUnderline 0.35s ease forwards;
        }
      `}</style>

      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        {/* Section header */}
        <div style={{
          textAlign: 'center', marginBottom: 56,
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(24px)',
          transition: 'opacity 0.7s ease, transform 0.7s ease',
        }}>
          <div style={{
            display: 'inline-block',
            padding: '5px 18px', borderRadius: 999,
            background: theme.offerBadgeBg,
            border: `1px solid ${theme.offerBadgeBorder}`,
            fontSize: 11, fontWeight: 700, color: theme.offerBadgeText,
            letterSpacing: 2, textTransform: 'uppercase',
            marginBottom: 16,
            transition: 'background 0.4s ease, border-color 0.4s ease, color 0.4s ease',
          }}>
            What We Offer
          </div>
          <h2 style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontSize: 36, fontWeight: 800, color: theme.featureH2,
            lineHeight: 1.2, margin: 0,
            transition: 'color 0.4s ease',
          }}>
            Everything you need to<br />
            <span style={{
              backgroundImage: theme.accentGradient,
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              color: 'transparent',
              display: 'inline-block',
            }}>
              extract &amp; analyze data
            </span>
          </h2>
        </div>

        {/* Cards grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 24,
        }}>
          {FEATURES.map((f, i) => (
            <div
              key={i}
              className="feat-card"
              style={{
                padding: '32px 28px',
                background: theme.cardBg,
                border: `1px solid ${theme.cardBorder}`,
                borderRadius: 18,
                cursor: 'default',
                position: 'relative',
                overflow: 'hidden',
                opacity: visible ? 1 : 0,
                animation: visible
                  ? `cardFadeUp 0.65s cubic-bezier(0.22,1,0.36,1) ${i * 0.12}s both`
                  : 'none',
                transition: 'border-color 0.3s, box-shadow 0.3s, transform 0.3s, background 0.4s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = `${f.color}55`
                e.currentTarget.style.transform = 'translateY(-6px)'
                e.currentTarget.style.boxShadow = `0 20px 48px rgba(0,0,0,0.12), 0 0 0 1px ${f.color}22`
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = theme.cardBorder
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              {/* Top glow accent */}
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: 2,
                background: `linear-gradient(90deg, transparent, ${f.color}, transparent)`,
                opacity: 0,
                transition: 'opacity 0.3s',
              }}
                ref={el => {
                  if (el) {
                    el.parentElement.addEventListener('mouseenter', () => el.style.opacity = '1')
                    el.parentElement.addEventListener('mouseleave', () => el.style.opacity = '0')
                  }
                }}
              />

              {/* Icon */}
              <div
                className="feat-icon"
                style={{
                  width: 54, height: 54, borderRadius: 14,
                  background: `linear-gradient(135deg, ${f.color}22, ${f.color}0d)`,
                  border: `1px solid ${f.color}33`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 24, marginBottom: 20,
                  boxShadow: `0 4px 16px ${f.color}18`,
                }}
              >
                <Icon name={f.iconName} size={24} color={f.color} />
              </div>

              {/* Title with animated underline */}
              <div style={{ marginBottom: 12, position: 'relative', display: 'inline-block' }}>
                <h3 style={{
                  color: theme.cardTextTitle, fontSize: 15.5, fontWeight: 700,
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  margin: 0,
                  transition: 'color 0.4s ease',
                }}>
                  {f.title}
                </h3>
                <div
                  className="feat-underline"
                  style={{
                    position: 'absolute', bottom: -3, left: 0,
                    height: 2, width: 0, borderRadius: 1,
                    background: `linear-gradient(90deg, ${f.color}, transparent)`,
                  }}
                />
              </div>

              <p style={{
                color: theme.cardTextDesc,
                fontSize: 13.5, lineHeight: 1.68,
                margin: 0,
                transition: 'color 0.4s ease',
              }}>
                {f.desc}
              </p>

              {/* Corner arrow */}
              <div style={{
                position: 'absolute', bottom: 20, right: 22,
                color: f.color, opacity: 0,
                transition: 'opacity 0.25s, transform 0.25s',
                fontSize: 18,
              }}
                ref={el => {
                  if (el) {
                    el.parentElement.addEventListener('mouseenter', () => {
                      el.style.opacity = '0.7'
                      el.style.transform = 'translate(2px,-2px)'
                    })
                    el.parentElement.addEventListener('mouseleave', () => {
                      el.style.opacity = '0'
                      el.style.transform = 'translate(0,0)'
                    })
                  }
                }}
              >
                ↗
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ─────────────────────────────────────────────
   MAIN LANDING PAGE
───────────────────────────────────────────── */
export default function LandingPage() {
  const navigate = useNavigate()
  const [mounted, setMounted] = useState(false)
  const [statsVisible, setStatsVisible] = useState(false)
  const [isDark, setIsDark] = useState(true)
  const statsRef = useRef(null)

  const theme = isDark ? DARK : LIGHT

  useEffect(() => { setTimeout(() => setMounted(true), 80) }, [])

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setStatsVisible(true) },
      { threshold: 0.3 }
    )
    if (statsRef.current) observer.observe(statsRef.current)
    return () => observer.disconnect()
  }, [])

  const CIRCLE_SIZE = 360

  return (
    <div style={{
      minHeight: '100vh',
      background: theme.pageBg,
      fontFamily: "'Inter', 'Plus Jakarta Sans', sans-serif",
      overflowX: 'hidden',
      transition: 'background 0.4s ease',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Plus+Jakarta+Sans:wght@700;800;900&display=swap');

        * { margin: 0; padding: 0; box-sizing: border-box; }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(32px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeLeft {
          from { opacity: 0; transform: translateX(40px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes circleFloat {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-18px); }
        }
        @keyframes ringRotate {
          from { transform-origin: 50% 50%; transform: rotate(0deg); }
          to   { transform-origin: 50% 50%; transform: rotate(360deg); }
        }
        @keyframes glowPulse {
          0%, 100% { opacity: 0.6; }
          50%       { opacity: 1; }
        }
        @keyframes lineScan {
          0%   { opacity: 0; top: 5%; }
          10%  { opacity: 0.6; }
          90%  { opacity: 0.6; }
          100% { opacity: 0; top: 95%; }
        }
        @keyframes badgeSlide {
          from { opacity: 0; transform: translateX(-20px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes toggleSpin {
          from { transform: rotate(0deg) scale(0.8); opacity: 0; }
          to   { transform: rotate(360deg) scale(1); opacity: 1; }
        }

        .cta-btn {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 15px 36px;
          background: linear-gradient(135deg, #1A5EA8 0%, #3b82f6 100%);
          color: #fff;
          border: none;
          border-radius: 10px;
          font-size: 15px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 8px 32px rgba(26,94,168,0.35);
          font-family: 'Plus Jakarta Sans', sans-serif;
          letter-spacing: 0.3px;
        }
        .cta-btn:hover {
          transform: translateY(-3px);
          box-shadow: 0 14px 42px rgba(26,94,168,0.48);
        }
        .login-btn-nav {
          padding: 9px 26px;
          background: linear-gradient(135deg, #F07621, #f59e0b);
          color: #fff;
          border: none;
          border-radius: 9px;
          font-size: 13.5px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.25s ease;
          box-shadow: 0 4px 16px rgba(240,118,33,0.3);
          font-family: 'Plus Jakarta Sans', sans-serif;
          letter-spacing: 0.2px;
        }
        .login-btn-nav:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 24px rgba(240,118,33,0.45);
        }
        .theme-toggle {
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 8px 16px;
          border-radius: 999px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          font-family: 'Plus Jakarta Sans', sans-serif;
          letter-spacing: 0.2px;
          white-space: nowrap;
        }
        .theme-toggle:hover {
          transform: translateY(-1px);
        }
        .theme-icon {
          font-size: 15px;
          display: inline-block;
          animation: toggleSpin 0.4s ease both;
        }
      `}</style>

      {/* ══════════════════════════════════════
          NAVBAR
      ══════════════════════════════════════ */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        height: 68,
        background: theme.navBg,
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: `1px solid ${theme.navBorder}`,
        boxShadow: theme.navShadow,
        display: 'flex', alignItems: 'center',
        padding: '0 48px',
        gap: 32,
        transition: 'background 0.4s ease, border-color 0.4s ease, box-shadow 0.4s ease',
      }}>
        {/* Logo */}
        <div style={{ flexShrink: 0, cursor: 'pointer' }} onClick={() => navigate('/')}>
          <Logo size={58} light={isDark} />
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Right side: Theme Toggle + Login */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>

          {/* Theme Toggle Button */}
          <button
            className="theme-toggle"
            onClick={() => setIsDark(prev => !prev)}
            style={{
              background: theme.toggleBg,
              border: `1px solid ${theme.toggleBorder}`,
              color: theme.toggleColor,
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = theme.toggleHoverBg
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = theme.toggleBg
            }}
            title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            <span key={isDark ? 'sun' : 'moon'} className="theme-icon" style={{ display: 'inline-flex' }}>
              {isDark ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f8fafc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0f172a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </span>
            {isDark ? 'Light' : 'Dark'}
          </button>

          {/* Login button */}
          <button className="login-btn-nav" onClick={() => navigate('/login')}>
            Login
          </button>
        </div>
      </nav>

      {/* ══════════════════════════════════════
          HERO SECTION
      ══════════════════════════════════════ */}
      <section style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        padding: '100px 48px 60px',
        position: 'relative',
        overflow: 'hidden',
        background: theme.pageBg,
        transition: 'background 0.4s ease',
      }}>

        {/* Background dot grid */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: theme.dotGrid,
          backgroundSize: '32px 32px',
          transition: 'background-image 0.4s ease',
        }} />

        {/* Subtle left glow */}
        <div style={{
          position: 'absolute', top: '20%', left: '-10%',
          width: 500, height: 500,
          background: 'radial-gradient(circle, rgba(99,102,241,0.07) 0%, transparent 65%)',
          borderRadius: '50%', filter: 'blur(70px)', pointerEvents: 'none',
          animation: 'glowPulse 6s ease-in-out infinite',
        }} />

        {/* ── LEFT CONTENT ── */}
        <div style={{
          flex: 1, maxWidth: 620, position: 'relative', zIndex: 2,
          opacity: mounted ? 1 : 0,
          animation: mounted ? 'fadeUp 0.9s cubic-bezier(0.22,1,0.36,1) both' : 'none',
        }}>

          {/* Eyebrow badge */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '6px 16px', borderRadius: 999,
            background: theme.badgeBg,
            border: `1px solid ${theme.badgeBorder}`,
            marginBottom: 28,
            animation: mounted ? 'badgeSlide 0.7s ease both 0.1s' : 'none',
            transition: 'background 0.4s ease, border-color 0.4s ease',
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: theme.badgeDot,
              boxShadow: `0 0 8px ${theme.badgeDot}`,
              animation: 'glowPulse 2s ease-in-out infinite',
            }} />
            <span style={{
              fontSize: 11.5, fontWeight: 700, color: theme.badgeText,
              letterSpacing: 1.8, textTransform: 'uppercase',
              transition: 'color 0.4s ease',
            }}>
              AI-Powered Intelligence Platform
            </span>
          </div>

          {/* Main headline */}
          <h1 style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontWeight: 900,
            lineHeight: 1.05,
            marginBottom: 6,
            color: theme.h1Color,
            transition: 'color 0.4s ease',
          }}>
            <span style={{ fontSize: 'clamp(46px, 6vw, 72px)', display: 'block' }}>
              AI DATA
            </span>
            <span style={{ fontSize: 'clamp(46px, 6vw, 72px)', display: 'block' }}>
              EXTRACTOR
            </span>
          </h1>

          {/* Accent underline */}
          <div style={{
            width: 72, height: 4, borderRadius: 2,
            background: theme.accentLine,
            marginBottom: 28,
            marginTop: 12,
          }} />

          {/* Description */}
          <p style={{
            fontSize: 16, color: theme.descColor,
            lineHeight: 1.78, maxWidth: 500,
            marginBottom: 42,
            transition: 'color 0.4s ease',
          }}>
            DataCaffé AI Extractor automatically reads business documents and
            engineering drawings, extracts key information, and converts it into
            structured data — ready for Excel, databases, ERP systems, or
            analytics platforms.
          </p>

          {/* CTA Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <button className="cta-btn" onClick={() => navigate('/login')}>
              Get Started
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </button>
          </div>

          {/* Stats row */}
          <div
            ref={statsRef}
            style={{
              display: 'flex', gap: 40, marginTop: 56,
              paddingTop: 32,
              borderTop: `1px solid ${theme.statBorder}`,
              transition: 'border-color 0.4s ease',
            }}
          >
            {STATS.map((s, i) => (
              <StatItem key={i} stat={s} animate={statsVisible} theme={theme} />
            ))}
          </div>
        </div>

        {/* ── RIGHT: GRADIENT CIRCLE ── */}
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative', zIndex: 2,
          marginTop: -60,
          opacity: mounted ? 1 : 0,
          animation: mounted ? 'fadeLeft 1s cubic-bezier(0.22,1,0.36,1) 0.15s both' : 'none',
        }}>
          {/* Outer glow halo */}
          <div style={{
            position: 'absolute',
            width: CIRCLE_SIZE * 1.15, height: CIRCLE_SIZE * 1.15,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(99,102,241,0.2) 0%, rgba(59,130,246,0.1) 40%, transparent 70%)',
            filter: 'blur(40px)',
            animation: 'glowPulse 4s ease-in-out infinite',
          }} />

          {/* Ring arcs */}
          <RingArcs size={CIRCLE_SIZE} />

          {/* Main gradient circle */}
          <div style={{
            width: CIRCLE_SIZE, height: CIRCLE_SIZE,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #6366f1 0%, #818cf8 30%, #3b82f6 60%, #60a5fa 100%)',
            boxShadow: '0 24px 80px rgba(99,102,241,0.4), 0 0 120px rgba(59,130,246,0.25)',
            position: 'relative',
            animation: 'circleFloat 5s ease-in-out infinite',
            overflow: 'hidden',
            flexShrink: 0,
          }}>
            {/* Scanning line animation */}
            <div style={{
              position: 'absolute', left: 0, right: 0, height: 1,
              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)',
              animation: 'lineScan 3.5s ease-in-out infinite',
            }} />

            {/* Grid overlay inside circle */}
            <div style={{
              position: 'absolute', inset: 0,
              backgroundImage: 'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)',
              backgroundSize: '32px 32px',
              borderRadius: '50%',
            }} />

            {/* Center icon / data visualization */}
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: 12,
            }}>
              <div style={{
                width: 56, height: 56,
                background: 'rgba(255,255,255,0.15)',
                borderRadius: 14,
                backdropFilter: 'blur(8px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
              }}>
                <Icon name="brain" size={28} color="#fff" />
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  color: '#fff', fontSize: 16, fontWeight: 800,
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  textShadow: '0 2px 8px rgba(0,0,0,0.3)',
                }}>
                  AI Extraction
                </div>
                <div style={{
                  color: 'rgba(255,255,255,0.7)', fontSize: 11.5,
                  letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 500,
                  marginTop: 4,
                }}>
                  Real-time Processing
                </div>
              </div>
            </div>
          </div>

          {/* Floating data chips */}
          {[
            { icon: 'bar-chart', label: 'Analytics',    iconColor: '#3b82f6', top: '12%', left: '-4%',  delay: '0s' },
            { icon: 'file',      label: 'Documents',    iconColor: '#f07b1c', top: '72%', left: '-8%',  delay: '0.4s' },
            { icon: 'zap',       label: 'Instant Data', iconColor: '#eab308', top: '18%', right: '-6%', delay: '0.2s' },
            { icon: 'lock',      label: 'Secure',       iconColor: '#10b981', top: '76%', right: '-4%', delay: '0.6s' },
          ].map((chip, i) => (
            <div key={i} style={{
              position: 'absolute',
              top: chip.top, left: chip.left, right: chip.right,
              padding: '8px 16px',
              background: theme.chipBg,
              backdropFilter: 'blur(12px)',
              border: `1px solid ${theme.chipBorder}`,
              borderRadius: 10,
              color: theme.chipColor,
              fontSize: 12.5,
              fontWeight: 600,
              whiteSpace: 'nowrap',
              display: 'flex', alignItems: 'center', gap: 8,
              boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
              animation: `circleFloat ${4 + i * 0.5}s ease-in-out ${chip.delay} infinite`,
              transition: 'background 0.4s ease, color 0.4s ease, border-color 0.4s ease',
            }}>
              <Icon name={chip.icon} size={15} color={chip.iconColor} />
              {chip.label}
            </div>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════════
          FEATURES STRIP
      ══════════════════════════════════════ */}
      <FeatureCards theme={theme} />

      {/* ══════════════════════════════════════
          CTA BANNER
      ══════════════════════════════════════ */}
      <section style={{
        padding: '72px 48px',
        background: theme.ctaSectionBg,
        borderTop: `1px solid ${theme.ctaSectionBorder}`,
        transition: 'background 0.4s ease',
      }}>
        <div style={{
          maxWidth: 860, margin: '0 auto', textAlign: 'center',
          padding: '56px 48px',
          background: theme.ctaCardBg,
          border: `1px solid ${theme.ctaCardBorder}`,
          borderRadius: 24,
          position: 'relative', overflow: 'hidden',
          transition: 'background 0.4s ease, border-color 0.4s ease',
        }}>
          <div style={{
            position: 'absolute', top: -60, right: -60,
            width: 200, height: 200, borderRadius: '50%',
            background: theme.ctaGlowOrb,
            filter: 'blur(30px)',
          }} />
          <h2 style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontSize: 34, fontWeight: 800, color: theme.ctaH2,
            marginBottom: 14, lineHeight: 1.2,
            transition: 'color 0.4s ease',
          }}>
            Ready to transform your data workflow?
          </h2>
          <p style={{
            color: theme.ctaP, fontSize: 15, marginBottom: 32,
            maxWidth: 480, margin: '0 auto 32px',
            transition: 'color 0.4s ease',
          }}>
            Join leading enterprises already using DataCaffé AI Extractor to accelerate their intelligence pipeline.
          </p>
          <button className="cta-btn" onClick={() => navigate('/login')}>
            Start Now — It's Free
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </button>
        </div>
      </section>

      {/* ══════════════════════════════════════
          FOOTER
      ══════════════════════════════════════ */}
      <Footer light={!isDark} />

    </div>
  )
}
