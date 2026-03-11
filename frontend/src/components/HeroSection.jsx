import React from 'react'
import WorkflowOrbit from './WorkflowOrbit'
import { STATS } from '../utils/constants'
import { useDelayedVisible, useMousePosition } from '../hooks/useAnimations'

export default function HeroSection({ onOpenWizard }) {
  const visible = useDelayedVisible(250)
  const mouse = useMousePosition()

  return (
    <section
      id="hero"
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        padding: '130px 60px 80px',
        position: 'relative',
        overflow: 'visible',
      }}
    >
      {/* Background glow orbs with parallax */}
      <div
        style={{
          position: 'absolute',
          top: '8%',
          left: '-8%',
          width: 550,
          height: 550,
          background: 'radial-gradient(circle, rgba(124, 58, 237, 0.1) 0%, transparent 65%)',
          borderRadius: '50%',
          filter: 'blur(70px)',
          pointerEvents: 'none',
          transform: `translate(${mouse.x * 15}px, ${mouse.y * 10}px)`,
          transition: 'transform 0.3s ease-out',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '5%',
          right: '0%',
          width: 420,
          height: 420,
          background: 'radial-gradient(circle, rgba(59, 130, 246, 0.07) 0%, transparent 65%)',
          borderRadius: '50%',
          filter: 'blur(70px)',
          pointerEvents: 'none',
          transform: `translate(${mouse.x * -10}px, ${mouse.y * -8}px)`,
          transition: 'transform 0.3s ease-out',
        }}
      />

      {/* ── Left Content ── */}
      <div style={{ flex: 1, maxWidth: 620, position: 'relative', zIndex: 2, marginLeft: 40 }}>
        {/* Floating Badge */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 24px',
            borderRadius: 50,
            background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.18), rgba(59, 130, 246, 0.12))',
            border: '1px solid rgba(139, 92, 246, 0.28)',
            marginBottom: 28,
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0)' : 'translateY(20px)',
            transition: 'all 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
            animation: visible ? 'heroTagFloat 4s ease-in-out infinite' : 'none',
          }}
        >
          <span style={{ fontSize: 16, animation: 'starTwinkle 2s ease-in-out infinite' }}>✨</span>
          <span
            style={{
              color: '#F5924A',
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: 0.5,
            }}
          >
            AI-Powered Accelerators for Every Industry
          </span>
        </div>

        {/* Main Title */}
        <h1
          style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: 64,
            fontWeight: 900,
            lineHeight: 1.06,
            marginBottom: 24,
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0)' : 'translateY(35px)',
            transition: 'all 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.15s',
          }}
        >
          <span style={{ color: '#fff' }}>AI </span>
          <span
            style={{
              background: 'linear-gradient(135deg, #1A5EA8, #3b82f6, #F07621)',
              backgroundSize: '200% 200%',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              animation: 'gradientShift 4s ease infinite',
            }}
          >
            Data Extractor
          </span>
        </h1>

        {/* Description */}
        <p
          style={{
            fontSize: 17,
            color: '#94a3b8',
            lineHeight: 1.75,
            maxWidth: 530,
            marginBottom: 38,
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0)' : 'translateY(35px)',
            transition: 'all 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.3s',
          }}
        >
          DataCaffé AI Extractor is an AI-powered tool that automatically reads
          business documents and engineering drawings, extracts key information,
          and converts it into structured data. The data can be stored in Excel,
          CSV, databases, ERP systems, or analytics platforms, helping
          organizations save time, reduce manual work, and improve accuracy.
        </p>

        {/* Stats Row */}
        <div
          style={{
            display: 'flex',
            gap: 40,
            marginBottom: 42,
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0)' : 'translateY(35px)',
            transition: 'all 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.45s',
          }}
        >
          {STATS.map((s, i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 24, marginBottom: 4 }}>{s.icon}</div>
              <div
                style={{
                  fontFamily: "'Playfair Display', serif",
                  fontSize: 30,
                  fontWeight: 900,
                  color: '#fff',
                  animation: `countUp 0.6s ease-out ${0.7 + i * 0.15}s both`,
                }}
              >
                {s.value}
              </div>
              <div style={{ fontSize: 12, color: '#64748b', fontWeight: 500, marginTop: 3 }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>

        {/* CTA Button */}
        <button
          onClick={onOpenWizard}
          style={{
            padding: '17px 40px',
            borderRadius: 14,
            border: 'none',
            background: 'linear-gradient(135deg, #1A5EA8, #1552A0)',
            color: '#fff',
            fontSize: 16,
            fontWeight: 700,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 12,
            boxShadow: '0 8px 36px rgba(124, 58, 237, 0.4), 0 0 60px rgba(124, 58, 237, 0.12)',
            transition: 'all 0.35s ease',
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0)' : 'translateY(35px)',
            position: 'relative',
            overflow: 'hidden',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-3px) scale(1.02)'
            e.currentTarget.style.boxShadow =
              '0 14px 44px rgba(124, 58, 237, 0.5), 0 0 80px rgba(124, 58, 237, 0.18)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0) scale(1)'
            e.currentTarget.style.boxShadow =
              '0 8px 36px rgba(124, 58, 237, 0.4), 0 0 60px rgba(124, 58, 237, 0.12)'
          }}
        >
          {/* Hover shimmer overlay */}
          <span
            style={{
              position: 'absolute',
              inset: 0,
              background:
                'linear-gradient(45deg, transparent 30%, rgba(255,255,255,0.1) 50%, transparent 70%)',
              animation: 'shimmer 3s ease-in-out infinite',
            }}
          />
          <span style={{ position: 'relative', zIndex: 1 }}>See it in Action</span>
          <span style={{ position: 'relative', zIndex: 1, fontSize: 20 }}>🌐</span>
          <span style={{ position: 'relative', zIndex: 1, fontSize: 18 }}>→</span>
        </button>
      </div>

      {/* ── Right: Orbit Diagram ── */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          paddingRight: 20,
          transform: `translate(${mouse.x * 8}px, ${mouse.y * 5}px)`,
          transition: 'transform 0.4s ease-out',
        }}
      >
        <WorkflowOrbit visible={visible} />
      </div>
    </section>
  )
}
