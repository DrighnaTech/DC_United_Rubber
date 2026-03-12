import React, { useState } from 'react'
import { WORKFLOW_STEPS } from '../utils/constants'
import Icon from './Icons'

const SIZE = 550
const CENTER = SIZE / 2
const RADIUS = 220

/**
 * Animated orbit workflow diagram with center hub, nodes, and traveling dots
 */
export default function WorkflowOrbit({ visible = true }) {
  const [hovered, setHovered] = useState(null)

  return (
    <div
      style={{
        position: 'relative',
        width: SIZE,
        height: SIZE,
        flexShrink: 0,
        opacity: visible ? 1 : 0,
        transform: visible ? 'scale(1)' : 'scale(0.75)',
        transition: 'all 1.2s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {/* ── Orbit Ring SVG ── */}
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        style={{
          position: 'absolute',
          inset: 0,
          animation: 'rotateOrbitRing 35s linear infinite',
        }}
      >
        <defs>
          <linearGradient id="orbitGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#1A5EA8" />
            <stop offset="50%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#1A5EA8" />
          </linearGradient>
        </defs>
        {/* Main orbit ring */}
        <circle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          fill="none"
          stroke="url(#orbitGrad)"
          strokeWidth="1.5"
          strokeDasharray="10 6"
          opacity="0.4"
        />
        {/* Inner ring */}
        <circle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS - 35}
          fill="none"
          stroke="rgba(139, 92, 246, 0.08)"
          strokeWidth="0.8"
          strokeDasharray="4 8"
        />
        {/* Outer subtle ring */}
        <circle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS + 20}
          fill="none"
          stroke="rgba(139, 92, 246, 0.04)"
          strokeWidth="0.5"
          strokeDasharray="6 10"
        />
      </svg>

      {/* ── Center Hub ── */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 160,
          height: 160,
          borderRadius: '50%',
          background: 'radial-gradient(circle at 30% 30%, #1e1b4b, #0f0a2e)',
          border: '2px solid rgba(139, 92, 246, 0.35)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          animation: 'centerPulse 4s ease-in-out infinite',
          zIndex: 5,
        }}
      >
        {/* Rotating gear icon */}
        <div style={{ marginBottom: 4, animation: 'rotateGear 8s linear infinite', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="settings" size={32} color="#a78bfa" />
        </div>
        <div
          style={{
            fontFamily: "'Playfair Display', serif",
            fontWeight: 800,
            fontSize: 17,
            color: '#fff',
            textAlign: 'center',
            lineHeight: 1.1,
          }}
        >
          AI Extract
          <span style={{ color: '#F07621', fontSize: 10, verticalAlign: 'super', marginLeft: 1 }}>
            ™
          </span>
        </div>
      </div>

      {/* ── Orbiting Nodes ── */}
      {WORKFLOW_STEPS.map((step, i) => {
        const rad = ((step.angle - 90) * Math.PI) / 180
        const x = CENTER + RADIUS * Math.cos(rad)
        const y = CENTER + RADIUS * Math.sin(rad)
        const isHov = hovered === i

        return (
          <div
            key={i}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              transform: `translate(-50%, -50%) scale(${isHov ? 1.18 : 1})`,
              textAlign: 'center',
              cursor: 'pointer',
              transition: 'transform 0.3s ease, filter 0.3s ease',
              zIndex: 10,
              animation: `fadeInNode 0.6s ease-out ${0.3 + i * 0.1}s both`,
              filter: hovered !== null && !isHov ? 'opacity(0.5)' : 'none',
            }}
          >
            {/* Node circle */}
            <div
              style={{
                width: 62,
                height: 62,
                borderRadius: '50%',
                background: isHov
                  ? 'rgba(139, 92, 246, 0.25)'
                  : 'rgba(15, 23, 42, 0.85)',
                border: `2px solid ${isHov ? '#F07621' : 'rgba(139, 92, 246, 0.25)'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 26,
                margin: '0 auto 8px',
                boxShadow: isHov ? '0 0 24px rgba(168, 85, 247, 0.45)' : '0 0 12px rgba(0,0,0,0.3)',
                transition: 'all 0.3s ease',
                backdropFilter: 'blur(8px)',
              }}
            >
              <Icon name={step.icon} size={24} color={isHov ? '#F07621' : '#94a3b8'} />
            </div>
            {/* Label */}
            <div
              style={{
                fontSize: 11,
                color: isHov ? '#e9d5ff' : '#94a3b8',
                fontWeight: 600,
                lineHeight: 1.35,
                whiteSpace: 'pre-line',
                transition: 'color 0.3s',
                maxWidth: 100,
              }}
            >
              {step.label}
            </div>
          </div>
        )
      })}

      {/* ── Traveling Dots ── */}
      {[0, 1, 2].map((d) => (
        <div
          key={`dot-${d}`}
          style={{
            position: 'absolute',
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: '#F07621',
            boxShadow: '0 0 12px #F07621, 0 0 24px rgba(168, 85, 247, 0.3)',
            top: '50%',
            left: '50%',
            transformOrigin: '0 0',
            animation: `orbitDot550 7s linear infinite`,
            animationDelay: `${d * -2.33}s`,
            zIndex: 4,
          }}
        />
      ))}
    </div>
  )
}
