import { useState } from 'react'
import Logo from './Logo'
import Icon from './Icons'
import { COMPANY_LINKS, PRODUCTS, SOLUTIONS, SUPPORT_LINKS, SOCIAL_LINKS, LEGAL_LINKS } from '../utils/constants'

function FooterLink({ children, href, style = {}, light = false }) {
  const [hovered, setHovered] = useState(false)

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        color: hovered ? '#1A5EA8' : (light ? '#64748b' : '#94a3b8'),
        fontSize: 14,
        marginBottom: 12,
        cursor: 'pointer',
        transition: 'color 0.2s, transform 0.2s',
        transform: hovered ? 'translateX(3px)' : 'translateX(0)',
        textDecoration: 'none',
        display: 'block',
        ...style,
      }}
    >
      {children}
    </a>
  )
}

function FooterHeading({ children, light = false }) {
  return (
    <h4
      style={{
        color: light ? '#111827' : '#f1f5f9',
        fontSize: 16,
        fontWeight: 700,
        marginBottom: 20,
        position: 'relative',
        display: 'inline-block',
      }}
    >
      {children}
      <span
        style={{
          position: 'absolute',
          bottom: -4,
          left: 0,
          width: '100%',
          height: 2,
          background: 'linear-gradient(90deg, #1A5EA8, transparent)',
          borderRadius: 1,
        }}
      />
    </h4>
  )
}

function SocialIcon({ children, href, light = false, label }) {
  const [hovered, setHovered] = useState(false)

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={label}
      style={{
        width: 38,
        height: 38,
        borderRadius: '50%',
        background: hovered
          ? 'rgba(26, 94, 168, 0.15)'
          : (light ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.06)'),
        border: `1px solid ${hovered ? '#1A5EA8' : (light ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.1)')}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        transition: 'all 0.25s ease',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        textDecoration: 'none',
      }}
    >
      {children}
    </a>
  )
}

const SOCIAL_ICONS = {
  twitter: (color) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4l11.733 16h4.267l-11.733 -16z" />
      <path d="M4 20l6.768 -6.768m2.46 -2.46l6.772 -6.772" />
    </svg>
  ),
  linkedin: (color) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
      <rect x="2" y="9" width="4" height="12" />
      <circle cx="4" cy="4" r="2" />
    </svg>
  ),
  youtube: (color) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19.1c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.43z" />
      <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" />
    </svg>
  ),
}

export default function Footer({ light = false }) {
  const iconColor = light ? '#475569' : '#94a3b8'

  return (
    <footer
      style={{
        padding: '64px 60px 32px',
        background: light
          ? 'linear-gradient(180deg, #f9fafb, #f3f4f6)'
          : 'linear-gradient(180deg, #0f172a, #020617)',
        borderTop: light
          ? '1px solid #e5e7eb'
          : '1px solid rgba(255, 255, 255, 0.06)',
        position: 'relative',
      }}
    >
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.6fr 1fr 1fr 1fr 1.1fr',
            gap: 40,
            marginBottom: 50,
          }}
        >
          {/* ── Brand Column ── */}
          <div>
            <a href="https://datacaffe.ai" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
              <Logo size={48} animate={false} light={!light} />
            </a>
            <p
              style={{
                color: light ? '#4b5563' : '#94a3b8',
                fontSize: 14,
                marginTop: 18,
                lineHeight: 1.7,
                maxWidth: 240,
              }}
            >
              Transforming unstructured data into actionable intelligence with
              AI-powered extraction technology.
            </p>
            <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
              {SOCIAL_LINKS.map((s) => (
                <SocialIcon key={s.platform} light={light} label={s.platform} href={s.href}>
                  {SOCIAL_ICONS[s.platform]?.(iconColor)}
                </SocialIcon>
              ))}
            </div>
          </div>

          {/* ── Company ── */}
          <div>
            <FooterHeading light={light}>Company</FooterHeading>
            {COMPANY_LINKS.map((item, i) => (
              <FooterLink key={i} light={light} href={item.href}>{item.label}</FooterLink>
            ))}
          </div>

          {/* ── Products ── */}
          <div>
            <FooterHeading light={light}>Products</FooterHeading>
            {PRODUCTS.map((item, i) => (
              <FooterLink key={i} light={light} href={item.href}>{item.label}</FooterLink>
            ))}
          </div>

          {/* ── Solutions ── */}
          <div>
            <FooterHeading light={light}>Solutions</FooterHeading>
            {SOLUTIONS.map((item, i) => (
              <FooterLink key={i} light={light} href={item.href}>{item.label}</FooterLink>
            ))}
          </div>

          {/* ── Support ── */}
          <div>
            <FooterHeading light={light}>Support</FooterHeading>
            {SUPPORT_LINKS.map((item, i) => (
              <FooterLink key={i} light={light} href={item.href} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name={item.icon} size={15} color={light ? '#475569' : '#94a3b8'} />
                {item.text}
              </FooterLink>
            ))}
          </div>
        </div>

        {/* ── Bottom Bar ── */}
        <div
          style={{
            borderTop: light ? '1px solid #e5e7eb' : '1px solid rgba(255, 255, 255, 0.06)',
            paddingTop: 24,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 16,
          }}
        >
          <span style={{ color: light ? '#6b7280' : '#475569', fontSize: 14 }}>
            © 2025 DataCaffé. All rights reserved.
          </span>
          <div style={{ display: 'flex', gap: 28 }}>
            {LEGAL_LINKS.map((item, i) => (
              <FooterLink key={i} light={light} href={item.href} style={{ marginBottom: 0 }}>
                {item.label}
              </FooterLink>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
