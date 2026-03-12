import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'

/* Decorative floating icons for the hero section */
const DECO_ICONS = [
  { icon: '☁️', top: '15%', left: '8%', size: 38, opacity: 0.25 },
  { icon: '📊', top: '22%', right: '12%', size: 32, opacity: 0.2 },
  { icon: '🔍', top: '60%', left: '6%', size: 28, opacity: 0.2 },
  { icon: '☁️', top: '30%', right: '5%', size: 44, opacity: 0.18 },
  { icon: '📈', top: '65%', right: '10%', size: 30, opacity: 0.22 },
  { icon: '⚙️', top: '12%', left: '25%', size: 24, opacity: 0.15 },
  { icon: '☁️', top: '55%', left: '18%', size: 36, opacity: 0.2 },
  { icon: '🧠', top: '18%', right: '28%', size: 26, opacity: 0.18 },
  { icon: '✈️', top: '70%', left: '55%', size: 34, opacity: 0.25 },
  { icon: '☁️', top: '40%', right: '22%', size: 30, opacity: 0.15 },
]

const HIGHLIGHTS = [
  { icon: '🏭', label: 'Manufacturing', detail: 'State-of-the-art rubber compounding and molding facilities serving diverse industrial sectors.' },
  { icon: '🌍', label: 'Global Reach', detail: 'Supplying rubber components to clients across North America, Europe, and Asia-Pacific.' },
  { icon: '🔬', label: 'R&D Focus', detail: 'Dedicated research teams continuously advancing material formulations for performance and durability.' },
  { icon: '✅', label: 'Quality First', detail: 'ISO-certified processes ensuring every product meets rigorous industry standards.' },
]

export default function AppHomePage() {
  const { isDark } = useOutletContext()
  const [hoverIdx, setHoverIdx] = useState(null)

  return (
    <div style={{ background: isDark ? '#0f172a' : '#ffffff', minHeight: '100vh' }}>
      {/* ── Hero Section ── */}
      <div
        style={{
          position: 'relative',
          minHeight: 420,
          background: isDark
            ? 'linear-gradient(135deg, #1a1040 0%, #0f172a 50%, #1a1040 100%)'
            : 'linear-gradient(135deg, #c77d0a 0%, #e8a317 30%, #f5c342 60%, #d4930a 100%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '80px 40px',
          overflow: 'hidden',
        }}
      >
        {/* Decorative floating icons */}
        {DECO_ICONS.map((d, i) => (
          <span
            key={i}
            style={{
              position: 'absolute',
              top: d.top,
              left: d.left,
              right: d.right,
              fontSize: d.size,
              opacity: isDark ? d.opacity * 0.6 : d.opacity,
              filter: isDark ? 'grayscale(0.5) brightness(0.7)' : 'grayscale(0.3)',
              pointerEvents: 'none',
              userSelect: 'none',
            }}
          >
            {d.icon}
          </span>
        ))}

        {/* Ambient glow orbs for dark mode */}
        {isDark && (
          <>
            <div style={{
              position: 'absolute', top: -100, left: -100,
              width: 400, height: 400, borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(124, 58, 237, 0.15), transparent 70%)',
              pointerEvents: 'none',
            }} />
            <div style={{
              position: 'absolute', bottom: -80, right: -80,
              width: 350, height: 350, borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(59, 130, 246, 0.12), transparent 70%)',
              pointerEvents: 'none',
            }} />
          </>
        )}

        {/* Animated CSS keyframes injected inline */}
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@300;700;900&family=Raleway:wght@300;800&display=swap');

          @keyframes fadeSlideUp {
            0%   { opacity: 0; transform: translateY(30px); }
            100% { opacity: 1; transform: translateY(0); }
          }
          @keyframes shimmer {
            0%   { background-position: -400px 0; }
            100% { background-position: 400px 0; }
          }
          @keyframes subtitleFade {
            0%   { opacity: 0; transform: translateY(14px); }
            100% { opacity: 1; transform: translateY(0); }
          }
          @keyframes badgePop {
            0%   { opacity: 0; transform: scale(0.8); }
            100% { opacity: 1; transform: scale(1); }
          }
          .ur-badge {
            display: inline-block;
            padding: 4px 14px;
            border-radius: 999px;
            font-family: 'Montserrat', sans-serif;
            font-size: 12px;
            font-weight: 700;
            letter-spacing: 3px;
            text-transform: uppercase;
            margin-bottom: 18px;
            animation: badgePop 0.6s ease both;
            animation-delay: 0.1s;
          }
          .ur-heading {
            font-family: 'Raleway', sans-serif;
            font-weight: 300;
            font-size: 56px;
            letter-spacing: -1px;
            text-align: center;
            margin: 0 0 6px;
            line-height: 1.1;
            animation: fadeSlideUp 0.8s cubic-bezier(0.22,1,0.36,1) both;
            animation-delay: 0.25s;
            position: relative;
            z-index: 2;
          }
          .ur-heading strong {
            font-weight: 900;
            letter-spacing: -2px;
          }
          .ur-shimmer-text {
            background: linear-gradient(
              90deg,
              #fff 0%,
              #ffe0a0 30%,
              #fff 50%,
              #ffe0a0 70%,
              #fff 100%
            );
            background-size: 800px 100%;
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            animation: shimmer 2.8s linear infinite, fadeSlideUp 0.8s cubic-bezier(0.22,1,0.36,1) both;
            animation-delay: 0s, 0.25s;
          }
          .ur-subtitle {
            font-family: 'Montserrat', sans-serif;
            font-weight: 300;
            font-size: 16px;
            letter-spacing: 1.5px;
            text-align: center;
            line-height: 1.7;
            animation: subtitleFade 0.9s ease both;
            animation-delay: 0.55s;
            position: relative;
            z-index: 2;
            max-width: 520px;
          }
          .ur-divider {
            width: 60px;
            height: 3px;
            border-radius: 2px;
            margin: 16px auto 20px;
            animation: badgePop 0.7s ease both;
            animation-delay: 0.45s;
          }
        `}</style>

        {/* Badge */}
        <div
          className="ur-badge"
          style={{
            background: isDark ? 'rgba(124,58,237,0.25)' : 'rgba(255,255,255,0.25)',
            color: isDark ? '#F5924A' : '#fff',
            border: isDark ? '1px solid rgba(124,58,237,0.4)' : '1px solid rgba(255,255,255,0.45)',
          }}
        >
          Est. Since 1976
        </div>

        {/* Main heading */}
        <h1 className="ur-heading" style={{ color: isDark ? '#f1f5f9' : '#1a1a1a' }}>
          Welcome to{' '}
          <strong
            className={isDark ? '' : 'ur-shimmer-text'}
            style={isDark ? {
              background: 'linear-gradient(135deg, #a78bfa, #60a5fa, #F5924A)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            } : {}}
          >
            United Rubber
          </strong>
        </h1>

        {/* Animated divider */}
        <div
          className="ur-divider"
          style={{
            background: isDark
              ? 'linear-gradient(90deg, #1A5EA8, #3b82f6)'
              : 'rgba(255,255,255,0.7)',
          }}
        />

        {/* Subtitle */}
        <p
          className="ur-subtitle"
          style={{ color: isDark ? '#94a3b8' : 'rgba(255,255,255,0.88)' }}
        >
          Precision rubber solutions engineered for the world&apos;s most demanding industries.
        </p>
      </div>

      {/* ── What is United Rubber Section ── */}
      <div
        style={{
          maxWidth: 960,
          margin: '0 auto',
          padding: '60px 40px 80px',
        }}
      >
        {/* Section heading */}
        <h2
          style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: 32,
            fontWeight: 700,
            color: isDark ? '#f1f5f9' : '#111827',
            textAlign: 'center',
            marginBottom: 16,
          }}
        >
          What is United Rubber?
        </h2>

        {/* Intro paragraph */}
        <p
          style={{
            fontSize: 16,
            color: isDark ? '#94a3b8' : '#4b5563',
            textAlign: 'center',
            maxWidth: 680,
            lineHeight: 1.75,
            margin: '0 auto 48px',
          }}
        >
          United Rubber is a leading manufacturer and distributor of precision rubber components,
          serving industries ranging from automotive and aerospace to construction and consumer goods.
          With decades of expertise, United Rubber delivers high-performance seals, gaskets, hoses,
          and custom-molded parts engineered to exact specifications — built to withstand the most
          demanding environments.
        </p>

        {/* Highlight cards grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 20,
          }}
        >
          {HIGHLIGHTS.map((h, i) => (
            <div
              key={h.label}
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
                alignItems: 'flex-start',
                padding: '24px 20px',
                borderRadius: 14,
                background: isDark
                  ? (hoverIdx === i ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.03)')
                  : (hoverIdx === i ? '#fef9f0' : '#ffffff'),
                border: isDark
                  ? `1px solid ${hoverIdx === i ? 'rgba(139,92,246,0.3)' : 'rgba(139,92,246,0.1)'}`
                  : `1px solid ${hoverIdx === i ? '#f5a623' : '#e5e7eb'}`,
                transition: 'all 0.3s ease',
                boxShadow: hoverIdx === i
                  ? (isDark ? '0 12px 36px rgba(124,58,237,0.2)' : '0 10px 30px rgba(240,123,28,0.1)')
                  : '0 2px 10px rgba(0,0,0,0.05)',
                transform: hoverIdx === i ? 'translateY(-3px)' : 'none',
              }}
            >
              {/* Icon bubble */}
              <div
                style={{
                  flexShrink: 0,
                  width: 52,
                  height: 52,
                  borderRadius: 12,
                  background: isDark
                    ? 'linear-gradient(135deg, #1A5EA8, #F07621)'
                    : 'linear-gradient(135deg, #f07b1c, #f5a623)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 24,
                  boxShadow: isDark
                    ? '0 6px 20px rgba(124,58,237,0.3)'
                    : '0 4px 14px rgba(240,123,28,0.2)',
                }}
              >
                {h.icon}
              </div>

              {/* Text */}
              <div>
                <h3
                  style={{
                    fontFamily: "'Playfair Display', serif",
                    fontSize: 18,
                    fontWeight: 700,
                    color: isDark ? '#f1f5f9' : '#111827',
                    margin: '0 0 6px',
                  }}
                >
                  {h.label}
                </h3>
                <p
                  style={{
                    fontSize: 14,
                    color: isDark ? '#94a3b8' : '#4b5563',
                    lineHeight: 1.65,
                    margin: 0,
                  }}
                >
                  {h.detail}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
