import React, { useMemo } from 'react'

/**
 * Animated floating particles background
 */
export default function ParticleField() {
  const particles = useMemo(() =>
    Array.from({ length: 35 }).map((_, i) => ({
      id: i,
      size: 2 + Math.random() * 5,
      r: 100 + Math.floor(Math.random() * 80),
      g: 80 + Math.floor(Math.random() * 120),
      b: 220 + Math.floor(Math.random() * 35),
      alpha: 0.12 + Math.random() * 0.28,
      left: Math.random() * 100,
      top: Math.random() * 100,
      duration: 8 + Math.random() * 14,
      delay: Math.random() * -12,
    })),
    []
  )

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 0,
        overflow: 'hidden',
      }}
      aria-hidden="true"
    >
      {particles.map((p) => (
        <div
          key={p.id}
          style={{
            position: 'absolute',
            width: p.size,
            height: p.size,
            borderRadius: '50%',
            background: `rgba(${p.r}, ${p.g}, ${p.b}, ${p.alpha})`,
            left: `${p.left}%`,
            top: `${p.top}%`,
            animation: `floatParticle ${p.duration}s ease-in-out infinite`,
            animationDelay: `${p.delay}s`,
            filter: p.size > 4 ? 'blur(1px)' : 'none',
          }}
        />
      ))}

      {/* Large ambient glow orbs */}
      <div
        style={{
          position: 'absolute',
          top: '15%',
          left: '-8%',
          width: 550,
          height: 550,
          background: 'radial-gradient(circle, rgba(124, 58, 237, 0.07) 0%, transparent 65%)',
          borderRadius: '50%',
          filter: 'blur(80px)',
          animation: 'pulse 8s ease-in-out infinite',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '10%',
          right: '-5%',
          width: 450,
          height: 450,
          background: 'radial-gradient(circle, rgba(59, 130, 246, 0.05) 0%, transparent 65%)',
          borderRadius: '50%',
          filter: 'blur(80px)',
          animation: 'pulse 10s ease-in-out infinite 3s',
        }}
      />
    </div>
  )
}
