import { useState } from 'react'
import Logo from './Logo'
import { COMPANY_LINKS, PRODUCTS, SOLUTIONS, SUPPORT_LINKS } from '../utils/constants'

function FooterLink({ children, style = {}, light = false }) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        color: hovered ? '#1A5EA8' : (light ? '#94a3b8' : '#64748b'),
        fontSize: 13,
        marginBottom: 11,
        cursor: 'pointer',
        transition: 'color 0.2s, transform 0.2s',
        transform: hovered ? 'translateX(3px)' : 'translateX(0)',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

function FooterHeading({ children, light = false }) {
  return (
    <h4
      style={{
        color: light ? '#1e293b' : '#fff',
        fontSize: 15,
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

function SocialIcon({ children, light = false }) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 38,
        height: 38,
        borderRadius: '50%',
        background: hovered
          ? 'rgba(139, 92, 246, 0.2)'
          : (light ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.04)'),
        border: `1px solid ${hovered ? '#1A5EA8' : (light ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.08)')}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: hovered ? '#1A5EA8' : (light ? '#64748b' : '#94a3b8'),
        fontSize: 15,
        cursor: 'pointer',
        transition: 'all 0.25s ease',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
      }}
    >
      {children}
    </div>
  )
}

export default function Footer({ light = false }) {
  return (
    <footer
      style={{
        padding: '64px 60px 32px',
        background: light
          ? 'linear-gradient(180deg, #f1f3f8, #e8eaf0)'
          : 'linear-gradient(180deg, #020617, #0a0920)',
        borderTop: light
          ? '1px solid rgba(0, 0, 0, 0.06)'
          : '1px solid rgba(139, 92, 246, 0.08)',
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
            <Logo size={58} animate={false} light={light} />
            <p
              style={{
                color: light ? '#94a3b8' : '#64748b',
                fontSize: 13,
                marginTop: 18,
                lineHeight: 1.65,
                maxWidth: 230,
              }}
            >
              Transforming unstructured data into actionable intelligence with
              AI-powered extraction technology.
            </p>
            <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
              <SocialIcon light={light}>💬</SocialIcon>
              <SocialIcon light={light}>in</SocialIcon>
              <SocialIcon light={light}>▶</SocialIcon>
            </div>
          </div>

          {/* ── Company ── */}
          <div>
            <FooterHeading light={light}>Company</FooterHeading>
            {COMPANY_LINKS.map((item, i) => (
              <FooterLink key={i} light={light}>{item}</FooterLink>
            ))}
          </div>

          {/* ── Products ── */}
          <div>
            <FooterHeading light={light}>Products</FooterHeading>
            {PRODUCTS.map((item, i) => (
              <FooterLink key={i} light={light}>{item}</FooterLink>
            ))}
          </div>

          {/* ── Solutions ── */}
          <div>
            <FooterHeading light={light}>Solutions</FooterHeading>
            {SOLUTIONS.map((item, i) => (
              <FooterLink key={i} light={light}>{item}</FooterLink>
            ))}
          </div>

          {/* ── Support ── */}
          <div>
            <FooterHeading light={light}>Support</FooterHeading>
            {SUPPORT_LINKS.map((item, i) => (
              <FooterLink key={i} light={light} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14, flexShrink: 0 }}>{item.icon}</span>
                {item.text}
              </FooterLink>
            ))}
          </div>
        </div>

        {/* ── Bottom Bar ── */}
        <div
          style={{
            borderTop: light ? '1px solid rgba(0, 0, 0, 0.06)' : '1px solid rgba(255, 255, 255, 0.05)',
            paddingTop: 24,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 16,
          }}
        >
          <span style={{ color: light ? '#94a3b8' : '#475569', fontSize: 13 }}>
            © 2026 DataCaffe. All rights reserved.
          </span>
          <div style={{ display: 'flex', gap: 28 }}>
            {['Privacy Policy', 'Terms and Conditions', 'Security'].map((item, i) => (
              <FooterLink key={i} light={light} style={{ marginBottom: 0 }}>
                {item}
              </FooterLink>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
