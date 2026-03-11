import { useState, useEffect, useRef, useCallback } from 'react'
import { PIPELINE_STEPS } from '../utils/constants'
import { useInView } from '../hooks/useAnimations'

/* ── Floating sparkle particles around active card ── */
function CardSparkles({ color, active }) {
  if (!active) return null
  return (
    <>
      {[...Array(6)].map((_, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            width: 4,
            height: 4,
            borderRadius: '50%',
            background: color,
            top: `${15 + Math.random() * 70}%`,
            left: `${10 + Math.random() * 80}%`,
            animation: `sparkle ${1.5 + Math.random()}s ease-in-out infinite`,
            animationDelay: `${i * 0.3}s`,
            pointerEvents: 'none',
            zIndex: 5,
          }}
        />
      ))}
    </>
  )
}

/* ── Animated SVG checkmark for completed steps ── */
function AnimatedCheck() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ display: 'block' }}>
      <path
        d="M5 13l4 4L19 7"
        stroke="#fff"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="24"
        style={{ animation: 'checkmarkDraw 0.5s ease forwards' }}
      />
    </svg>
  )
}

/* ── Flowing data particles along the timeline ── */
function FlowingParticles({ active }) {
  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, overflow: 'hidden', pointerEvents: 'none' }}>
      {active && [0, 1, 2, 3, 4, 5, 6].map((i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            width: 24 + Math.random() * 20,
            height: 4,
            borderRadius: 2,
            background: `linear-gradient(90deg, transparent, ${['#F07621', '#3b82f6', '#06b6d4', '#10b981'][i % 4]}, transparent)`,
            animation: `particleStream ${2.5 + Math.random()}s linear infinite`,
            animationDelay: `${i * 0.4}s`,
            '--stream-distance': '100vw',
          }}
        />
      ))}
    </div>
  )
}

/* ── Animated SVG connection line between steps ── */
function TimelineConnector({ inView, activeStep, totalSteps }) {
  const progressPercent = ((activeStep + 1) / totalSteps) * 100

  return (
    <svg
      style={{
        position: 'absolute',
        top: 42,
        left: '10%',
        width: '80%',
        height: 8,
        zIndex: 0,
        overflow: 'visible',
      }}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#1A5EA8" />
          <stop offset="25%" stopColor="#6366f1" />
          <stop offset="50%" stopColor="#3b82f6" />
          <stop offset="75%" stopColor="#06b6d4" />
          <stop offset="100%" stopColor="#10b981" />
        </linearGradient>
        <linearGradient id="lineGradGlow" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#1A5EA8" stopOpacity="0.5" />
          <stop offset="50%" stopColor="#3b82f6" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0.5" />
        </linearGradient>
        <filter id="lineBlur">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>

      {/* Background track */}
      <line
        x1="0" y1="4" x2="100%" y2="4"
        stroke="rgba(226, 232, 240, 0.6)"
        strokeWidth="3"
        strokeLinecap="round"
        style={{
          opacity: inView ? 1 : 0,
          transition: 'opacity 0.5s ease 0.3s',
        }}
      />

      {/* Glow line behind */}
      <line
        x1="0" y1="4" x2="100%" y2="4"
        stroke="url(#lineGradGlow)"
        strokeWidth="8"
        strokeLinecap="round"
        filter="url(#lineBlur)"
        style={{
          opacity: inView ? 0.7 : 0,
          transition: 'opacity 1s ease 0.5s',
        }}
      />

      {/* Main animated line */}
      <line
        x1="0" y1="4" x2="100%" y2="4"
        stroke="url(#lineGrad)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="1000"
        style={{
          animation: inView ? 'timelineFlowLine 2s ease-out forwards' : 'none',
          strokeDashoffset: inView ? undefined : 1000,
        }}
      />

      {/* Animated dashes on top */}
      <line
        x1="0" y1="4" x2="100%" y2="4"
        stroke="rgba(255,255,255,0.7)"
        strokeWidth="1"
        strokeDasharray="4 14"
        style={{
          animation: inView ? 'dataFlowDash 0.8s linear infinite' : 'none',
          opacity: inView ? 0.5 : 0,
          transition: 'opacity 0.5s ease 1.5s',
        }}
      />

      {/* Active progress overlay */}
      <line
        x1="0" y1="4" x2={`${progressPercent}%`} y2="4"
        stroke="url(#lineGrad)"
        strokeWidth="4"
        strokeLinecap="round"
        style={{
          opacity: inView ? 0.3 : 0,
          transition: 'all 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
          filter: 'blur(2px)',
        }}
      />
    </svg>
  )
}

/* ── Single timeline step card ── */
function TimelineStep({ step, index, isHovered, onHover, onLeave, inView, activeStep }) {
  const isCompleted = index < activeStep
  const isCurrent = index === activeStep
  const cardRef = useRef(null)
  const [tilt, setTilt] = useState({ x: 0, y: 0 })

  /* 3D tilt effect on mouse move */
  const handleMouseMove = useCallback((e) => {
    if (!cardRef.current) return
    const rect = cardRef.current.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    setTilt({
      x: (y - 0.5) * -12,
      y: (x - 0.5) * 12,
    })
  }, [])

  const handleMouseLeave = useCallback(() => {
    setTilt({ x: 0, y: 0 })
    onLeave()
  }, [onLeave])

  return (
    <div
      onMouseEnter={onHover}
      onMouseLeave={handleMouseLeave}
      onMouseMove={handleMouseMove}
      style={{
        flex: '1 1 0%',
        minWidth: 0,
        maxWidth: 220,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        position: 'relative',
        zIndex: isHovered ? 10 : 2,
        opacity: inView ? 1 : 0,
        transform: inView ? 'none' : 'translateY(40px)',
        animation: inView ? `card3DEntrance 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${0.2 + index * 0.12}s both` : 'none',
      }}
    >
      {/* ── Node circle on the timeline ── */}
      <div style={{ position: 'relative', marginBottom: 20 }}>
        {/* Pulse rings for current step */}
        {isCurrent && (
          <>
            <div
              style={{
                position: 'absolute',
                inset: -6,
                borderRadius: '50%',
                border: `2px solid ${step.color}`,
                animation: 'ringPulse 2s ease-out infinite',
                '--ripple-color': step.color + '40',
              }}
            />
            <div
              style={{
                position: 'absolute',
                inset: -6,
                borderRadius: '50%',
                border: `2px solid ${step.color}`,
                animation: 'ringPulse 2s ease-out infinite 0.7s',
                '--ripple-color': step.color + '40',
              }}
            />
          </>
        )}

        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: isHovered || isCurrent
              ? step.gradient
              : isCompleted
                ? `linear-gradient(135deg, ${step.color}dd, ${step.color})`
                : 'linear-gradient(135deg, #f1f5f9, #e2e8f0)',
            border: `3px solid ${isHovered || isCurrent ? '#fff' : isCompleted ? step.color + '60' : '#e2e8f0'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            fontWeight: 800,
            color: isHovered || isCurrent || isCompleted ? '#fff' : '#94a3b8',
            transition: 'all 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
            boxShadow: isHovered || isCurrent
              ? `0 0 0 6px ${step.color}20, 0 8px 30px ${step.color}40, 0 0 20px ${step.color}25`
              : isCompleted
                ? `0 4px 15px ${step.color}20`
                : '0 2px 8px rgba(0,0,0,0.06)',
            cursor: 'pointer',
            position: 'relative',
            animation: inView ? `nodeExpand 0.6s cubic-bezier(0.16, 1, 0.3, 1) ${0.3 + index * 0.12}s both` : 'none',
          }}
        >
          {isCompleted ? (
            <AnimatedCheck />
          ) : (
            <span style={{
              animation: inView ? `numberCount 0.5s ease-out ${0.6 + index * 0.15}s both` : 'none',
            }}>
              {step.num}
            </span>
          )}
        </div>
      </div>

      {/* ── Card with 3D tilt ── */}
      <div
        ref={cardRef}
        style={{
          width: '100%',
          maxWidth: 220,
          minHeight: 220,
          padding: '30px 22px 28px',
          borderRadius: 20,
          background: isHovered
            ? 'rgba(255, 255, 255, 1)'
            : 'rgba(255, 255, 255, 0.9)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: `1.5px solid ${isHovered ? step.color + '50' : 'rgba(226, 232, 240, 0.8)'}`,
          position: 'relative',
          overflow: 'hidden',
          transition: 'all 0.45s cubic-bezier(0.16, 1, 0.3, 1)',
          transform: isHovered
            ? `perspective(600px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) translateY(-14px) scale(1.04)`
            : isCurrent
              ? 'translateY(-6px)'
              : 'translateY(0)',
          boxShadow: isHovered
            ? `0 25px 50px ${step.color}18, 0 12px 30px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.6)`
            : isCurrent
              ? `0 12px 35px ${step.color}12, 0 4px 15px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.5)`
              : '0 4px 20px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.5)',
          cursor: 'pointer',
          textAlign: 'center',
          willChange: 'transform',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start',
        }}
      >
        {/* Card sparkles */}
        <CardSparkles color={step.color} active={isHovered} />

        {/* Top gradient line with animation */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: isHovered ? 4 : 3,
            background: step.gradient,
            opacity: isHovered || isCurrent ? 1 : 0.4,
            transition: 'all 0.4s ease',
          }}
        />

        {/* Shine sweep effect on hover */}
        {isHovered && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: '-75%',
              width: '50%',
              height: '100%',
              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)',
              animation: 'cardShine 0.8s ease forwards',
              pointerEvents: 'none',
              zIndex: 3,
            }}
          />
        )}

        {/* Background glow */}
        <div
          style={{
            position: 'absolute',
            top: '-40%',
            left: '5%',
            width: '90%',
            height: '70%',
            background: `radial-gradient(ellipse, ${step.color}${isHovered ? '15' : '06'}, transparent 70%)`,
            pointerEvents: 'none',
            transition: 'all 0.4s ease',
          }}
        />

        {/* Icon with bounce entrance */}
        <div
          style={{
            fontSize: 42,
            marginBottom: 16,
            transition: 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
            transform: isHovered ? 'scale(1.15)' : 'scale(1)',
            animation: isHovered
              ? 'iconFloat 2s ease-in-out infinite'
              : inView
                ? `iconBounceIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) ${0.5 + index * 0.12}s both`
                : 'none',
            filter: isHovered ? `drop-shadow(0 4px 8px ${step.color}30)` : 'none',
          }}
        >
          {step.emoji}
        </div>

        {/* Title */}
        <div
          style={{
            fontWeight: 700,
            fontSize: 16,
            color: isHovered ? step.color : '#1e293b',
            marginBottom: 10,
            letterSpacing: -0.3,
            transition: 'color 0.3s ease',
          }}
        >
          {step.title}
        </div>

        {/* Description */}
        <div
          style={{
            fontSize: 13,
            color: '#64748b',
            lineHeight: 1.75,
            letterSpacing: 0.1,
            flex: 1,
            display: 'flex',
            alignItems: 'flex-start',
          }}
        >
          {step.desc}
        </div>

        {/* Step indicator dot */}
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: isCurrent || isHovered ? step.gradient : 'rgba(148, 163, 184, 0.3)',
            marginTop: 16,
            transition: 'all 0.4s ease',
            transform: isCurrent || isHovered ? 'scale(1)' : 'scale(0.6)',
            flexShrink: 0,
          }}
        />

        {/* Bottom gradient bar */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: isHovered ? '0%' : '20%',
            right: isHovered ? '0%' : '20%',
            height: isHovered ? 3 : 2,
            background: step.gradient,
            borderRadius: '3px 3px 0 0',
            opacity: isHovered ? 0.9 : isCurrent ? 0.5 : 0.15,
            transition: 'all 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        />
      </div>
    </div>
  )
}


export default function WhatIsPage() {
  const [titleRef, titleInView] = useInView({ threshold: 0.2 })
  const [cardsRef, cardsInView] = useInView({ threshold: 0.1 })
  const [hoveredCard, setHoveredCard] = useState(null)
  const [activeStep, setActiveStep] = useState(0)

  /* Auto-advance the active step highlight */
  useEffect(() => {
    if (!cardsInView) return
    const interval = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % PIPELINE_STEPS.length)
    }, 2500)
    return () => clearInterval(interval)
  }, [cardsInView])

  return (
    <section
      id="what-is"
      style={{
        minHeight: '100vh',
        padding: '80px 60px 100px',
        background: 'linear-gradient(180deg, #ffffff 0%, #f8faff 25%, #f0f2fa 50%, #f5f7ff 75%, #ffffff 100%)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* ── Ambient background shapes ── */}
      <div
        style={{
          position: 'absolute',
          top: '5%',
          right: '-8%',
          width: 650,
          height: 650,
          background: 'radial-gradient(circle, rgba(124, 58, 237, 0.05) 0%, transparent 55%)',
          borderRadius: '50%',
          pointerEvents: 'none',
          animation: 'glowBreath 6s ease-in-out infinite',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '-5%',
          left: '-8%',
          width: 550,
          height: 550,
          background: 'radial-gradient(circle, rgba(59, 130, 246, 0.05) 0%, transparent 55%)',
          borderRadius: '50%',
          pointerEvents: 'none',
          animation: 'glowBreath 8s ease-in-out infinite 2s',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: '35%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 900,
          height: 400,
          background: 'radial-gradient(ellipse, rgba(124, 58, 237, 0.025) 0%, transparent 60%)',
          pointerEvents: 'none',
        }}
      />
      {/* Decorative grid dots */}
      <div
        style={{
          position: 'absolute',
          top: '12%',
          left: '5%',
          width: 120,
          height: 120,
          backgroundImage: 'radial-gradient(circle, rgba(124, 58, 237, 0.1) 1px, transparent 1px)',
          backgroundSize: '16px 16px',
          pointerEvents: 'none',
          opacity: 0.5,
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '15%',
          right: '5%',
          width: 100,
          height: 100,
          backgroundImage: 'radial-gradient(circle, rgba(59, 130, 246, 0.1) 1px, transparent 1px)',
          backgroundSize: '16px 16px',
          pointerEvents: 'none',
          opacity: 0.5,
        }}
      />

      <div style={{ maxWidth: 1200, margin: '0 auto', position: 'relative', zIndex: 1 }}>
        {/* ═══ Title Block ═══ */}
        <div ref={titleRef} style={{ textAlign: 'center' }}>
          {/* Badge */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 26px',
              borderRadius: 50,
              background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.08), rgba(59, 130, 246, 0.05))',
              border: '1px solid rgba(124, 58, 237, 0.15)',
              marginBottom: 32,
              opacity: titleInView ? 1 : 0,
              transform: titleInView ? 'translateY(0)' : 'translateY(20px)',
              transition: 'all 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
              animation: titleInView ? 'badgeFloat 4s ease-in-out infinite 1s' : 'none',
              boxShadow: '0 2px 12px rgba(124, 58, 237, 0.06)',
            }}
          >
            <span style={{ fontSize: 15 }}>💡</span>
            <span
              style={{
                background: 'linear-gradient(135deg, #1A5EA8, #3b82f6)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: 0.5,
              }}
            >
              Understanding the Technology
            </span>
          </div>

          <h2
            style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: 50,
              fontWeight: 900,
              color: '#1e293b',
              marginBottom: 26,
              opacity: titleInView ? 1 : 0,
              animation: titleInView ? 'textReveal 0.9s cubic-bezier(0.16, 1, 0.3, 1) 0.15s both' : 'none',
            }}
          >
            What is{' '}
            <span
              style={{
                background: 'linear-gradient(135deg, #1A5EA8, #6366f1, #3b82f6)',
                backgroundSize: '200% 100%',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                animation: titleInView ? 'gradientShift 4s ease infinite' : 'none',
              }}
            >
              AI Data Extractor
            </span>
            ?
          </h2>

          <p
            style={{
              fontSize: 17,
              color: '#64748b',
              lineHeight: 1.9,
              maxWidth: 860,
              margin: '0 auto 70px',
              opacity: titleInView ? 1 : 0,
              animation: titleInView ? 'textReveal 0.8s ease 0.35s both' : 'none',
            }}
          >
            An AI Data Extractor is a{' '}
            <strong
              style={{
                color: '#334155',
                textDecoration: 'underline',
                textUnderlineOffset: 3,
                textDecorationColor: '#1A5EA8',
                textDecorationThickness: 2,
              }}
            >
              reusable, AI-enabled solution that automatically reads documents and extracts important
              information from them.
            </strong>{' '}
            It uses Artificial Intelligence (AI) to convert unstructured data—such as PDFs, images, emails,
            or scanned documents—into structured data that can be stored and used in databases, Excel files,
            ERP systems, or analytics platforms.
          </p>
        </div>

        {/* ═══ Core Components Title ═══ */}
        <div style={{ textAlign: 'center', marginTop: -10 }}>
          <h3
            style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: 36,
              fontWeight: 800,
              color: '#1e293b',
              marginBottom: 10,
              opacity: titleInView ? 1 : 0,
              animation: titleInView ? 'textReveal 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.4s both' : 'none',
            }}
          >
            Core Components
          </h3>
          <p
            style={{
              fontSize: 15,
              color: '#94a3b8',
              marginBottom: 8,
              opacity: titleInView ? 1 : 0,
              animation: titleInView ? 'subtitleSlide 0.8s ease 0.55s both' : 'none',
            }}
          >
            Our 5-step intelligent pipeline
          </p>

          {/* Animated divider */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              margin: '16px auto 50px',
              opacity: titleInView ? 1 : 0,
              transition: 'opacity 0.6s ease 0.6s',
            }}
          >
            <div
              style={{
                width: 20,
                height: 3,
                background: 'linear-gradient(90deg, transparent, #1A5EA8)',
                borderRadius: 3,
              }}
            />
            <div
              style={{
                width: 40,
                height: 4,
                background: 'linear-gradient(90deg, #1A5EA8, #3b82f6)',
                borderRadius: 3,
              }}
            />
            <div
              style={{
                width: 20,
                height: 3,
                background: 'linear-gradient(90deg, #3b82f6, transparent)',
                borderRadius: 3,
              }}
            />
          </div>

          {/* Step progress indicator */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              gap: 8,
              marginBottom: 40,
              opacity: cardsInView ? 1 : 0,
              transition: 'opacity 0.5s ease 0.8s',
            }}
          >
            {PIPELINE_STEPS.map((step, i) => (
              <div
                key={i}
                onClick={() => setActiveStep(i)}
                style={{
                  width: i === activeStep ? 28 : 8,
                  height: 8,
                  borderRadius: 4,
                  background: i === activeStep
                    ? step.gradient
                    : i < activeStep
                      ? step.color + '60'
                      : 'rgba(148, 163, 184, 0.2)',
                  transition: 'all 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
                  cursor: 'pointer',
                }}
              />
            ))}
          </div>
        </div>

        {/* ═══ Timeline ═══ */}
        <div
          ref={cardsRef}
          style={{
            position: 'relative',
            display: 'flex',
            gap: 16,
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            paddingTop: 0,
            marginTop: -10,
            maxWidth: 1100,
            marginLeft: 'auto',
            marginRight: 'auto',
          }}
        >
          {/* Animated connection line */}
          <TimelineConnector inView={cardsInView} activeStep={activeStep} totalSteps={PIPELINE_STEPS.length} />

          {/* Flowing particles */}
          <FlowingParticles active={cardsInView} />

          {/* Step cards */}
          {PIPELINE_STEPS.map((step, i) => (
            <TimelineStep
              key={i}
              step={step}
              index={i}
              isHovered={hoveredCard === i}
              onHover={() => { setHoveredCard(i); setActiveStep(i) }}
              onLeave={() => setHoveredCard(null)}
              inView={cardsInView}
              activeStep={activeStep}
            />
          ))}
        </div>

        {/* ═══ Bottom Summary ═══ */}
        <div
          style={{
            textAlign: 'center',
            marginTop: 60,
            opacity: cardsInView ? 1 : 0,
            transform: cardsInView ? 'translateY(0)' : 'translateY(25px)',
            transition: 'all 0.9s cubic-bezier(0.16, 1, 0.3, 1) 1s',
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 14,
              padding: '16px 36px',
              borderRadius: 16,
              background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.05), rgba(59, 130, 246, 0.04))',
              border: '1px solid rgba(124, 58, 237, 0.12)',
              boxShadow: '0 4px 20px rgba(124, 58, 237, 0.04)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              transition: 'all 0.3s ease',
            }}
          >
            <span style={{
              fontSize: 20,
              animation: cardsInView ? 'iconFloat 2s ease-in-out infinite' : 'none',
            }}>⚡</span>
            <span style={{ fontSize: 14, color: '#64748b', lineHeight: 1.7 }}>
              From document upload to structured data download — our AI pipeline handles
              the entire extraction workflow automatically,{' '}
              <strong style={{
                background: 'linear-gradient(135deg, #1A5EA8, #3b82f6)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                fontWeight: 700,
              }}>
                reducing hours of manual work to seconds
              </strong>.
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}
