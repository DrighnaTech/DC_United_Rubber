import React, { useState } from 'react'
import { PIPELINE_STEPS } from '../utils/constants'
import { useInView } from '../hooks/useAnimations'

export default function WhatIsSection() {
  const [titleRef, titleInView] = useInView({ threshold: 0.2 })
  const [cardsRef, cardsInView] = useInView({ threshold: 0.1 })
  const [hoveredCard, setHoveredCard] = useState(null)

  return (
    <section
      id="extract"
      style={{
        padding: '110px 60px',
        background: 'linear-gradient(180deg, #020617 0%, #0a0f2e 50%, #020617 100%)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Background decorative elements */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 800,
          height: 800,
          background: 'radial-gradient(circle, rgba(124, 58, 237, 0.03) 0%, transparent 60%)',
          borderRadius: '50%',
          pointerEvents: 'none',
        }}
      />

      <div style={{ maxWidth: 1140, margin: '0 auto', textAlign: 'center', position: 'relative', zIndex: 1 }}>
        {/* Title */}
        <div ref={titleRef}>
          <h2
            style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: 46,
              fontWeight: 900,
              color: '#fff',
              marginBottom: 22,
              opacity: titleInView ? 1 : 0,
              transform: titleInView ? 'translateY(0)' : 'translateY(35px)',
              transition: 'all 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            What is{' '}
            <span
              style={{
                background: 'linear-gradient(135deg, #3b82f6, #1A5EA8)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              AI Data Extractor
            </span>
            ?
          </h2>

          <p
            style={{
              fontSize: 16,
              color: '#94a3b8',
              lineHeight: 1.8,
              maxWidth: 820,
              margin: '0 auto 64px',
              opacity: titleInView ? 1 : 0,
              transition: 'opacity 0.8s ease 0.25s',
            }}
          >
            An AI Data Extractor is a{' '}
            <strong style={{ color: '#e2e8f0', textDecoration: 'underline', textUnderlineOffset: 3, textDecorationColor: '#1A5EA8' }}>
              reusable, AI-enabled solution that automatically reads documents and extracts important information from them.
            </strong>{' '}
            It uses Artificial Intelligence (AI) to convert unstructured data—such as PDFs, images, emails,
            or scanned documents—into structured data that can be stored and used in databases, Excel files,
            ERP systems, or analytics platforms. This helps organizations automate data processing, reduce
            manual effort, and improve accuracy.
          </p>
        </div>

        {/* Core Components Title */}
        <h3
          style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: 32,
            fontWeight: 800,
            color: '#fff',
            marginBottom: 14,
          }}
        >
          Core Components
        </h3>
        <div
          style={{
            width: 50,
            height: 4,
            background: 'linear-gradient(90deg, #1A5EA8, #3b82f6)',
            borderRadius: 2,
            margin: '0 auto 52px',
          }}
        />

        {/* Pipeline Cards */}
        <div ref={cardsRef} style={{ display: 'flex', gap: 18, justifyContent: 'center', flexWrap: 'wrap' }}>
          {PIPELINE_STEPS.map((step, i) => {
            const isHov = hoveredCard === i

            return (
              <div
                key={i}
                onMouseEnter={() => setHoveredCard(i)}
                onMouseLeave={() => setHoveredCard(null)}
                style={{
                  flex: '0 0 200px',
                  padding: '36px 20px 32px',
                  borderRadius: 22,
                  background: isHov
                    ? `linear-gradient(165deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))`
                    : 'rgba(255, 255, 255, 0.025)',
                  border: `1px solid ${isHov ? step.color : 'rgba(255, 255, 255, 0.06)'}`,
                  position: 'relative',
                  opacity: cardsInView ? 1 : 0,
                  transform: cardsInView
                    ? isHov ? 'translateY(-8px)' : 'translateY(0)'
                    : 'translateY(40px)',
                  transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
                  transitionDelay: cardsInView ? `${i * 0.08}s` : '0s',
                  cursor: 'default',
                  overflow: 'hidden',
                  boxShadow: isHov ? `0 20px 50px ${step.color}18` : 'none',
                }}
              >
                {/* Step number badge */}
                <div
                  style={{
                    position: 'absolute',
                    top: -1,
                    right: 18,
                    width: 30,
                    height: 30,
                    borderRadius: '50%',
                    background: step.gradient,
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transform: 'translateY(-50%)',
                    boxShadow: `0 4px 14px ${step.color}55`,
                  }}
                >
                  {step.num}
                </div>

                {/* Emoji */}
                <div
                  style={{
                    fontSize: 44,
                    marginBottom: 18,
                    transition: 'transform 0.3s ease',
                    transform: isHov ? 'scale(1.15)' : 'scale(1)',
                  }}
                >
                  {step.emoji}
                </div>

                {/* Title */}
                <div
                  style={{
                    fontWeight: 700,
                    color: '#fff',
                    fontSize: 16,
                    marginBottom: 10,
                  }}
                >
                  {step.title}
                </div>

                {/* Description */}
                <div style={{ color: '#94a3b8', fontSize: 12, lineHeight: 1.65 }}>
                  {step.desc}
                </div>

                {/* Bottom accent bar */}
                <div
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: '10%',
                    right: '10%',
                    height: 3,
                    background: step.gradient,
                    borderRadius: '3px 3px 0 0',
                    opacity: isHov ? 0.8 : 0.4,
                    transition: 'opacity 0.3s',
                  }}
                />

                {/* Connector arrow (except last) */}
                {i < PIPELINE_STEPS.length - 1 && (
                  <div
                    style={{
                      position: 'absolute',
                      right: -14,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: '#475569',
                      fontSize: 12,
                      zIndex: 5,
                      letterSpacing: 2,
                    }}
                  >
                    ‒‒→
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
